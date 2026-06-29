import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import { SendSmsDto } from './dto';
import {
  INTEGRATION_SETTING_KEYS,
  IntegrationSettingsService,
} from '../integrations/integration-settings.service';

/**
 * ClickSend SMS integration (outbound send + delivery-receipt webhook).
 *
 * - Sender ID resolution mirrors the legacy app: per-consultant override from
 *   `ConsultantContact` (Astra / DC brand), falling back to the system default
 *   sender ID env. The number is normalised to E.164 for ClickSend.
 * - Every send persists a queryable `SmsMessage` row, writes an `Activity`
 *   (human feed) when tied to a lead, and an `AuditLog` (security trail).
 * - The delivery receipt advances the row to DELIVERED / FAILED.
 *
 * Following the project's pre-`prisma generate` convention (see
 * notifications.service.ts), the new delegates are referenced through narrow
 * interfaces so this compiles before the client is regenerated. After
 * `prisma generate`, `prisma.smsMessage` exists at runtime and satisfies it.
 */

export interface SmsMessageRecord {
  id: string;
  status: string;
  toNumber: string;
  body: string;
  leadId: string | null;
  providerMessageId: string | null;
}

interface SmsMessageDelegate {
  create(args: { data: Record<string, unknown> }): Promise<SmsMessageRecord>;
  update(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<SmsMessageRecord>;
  findFirst(args: {
    where: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
  }): Promise<SmsMessageRecord | null>;
}

const CLICKSEND_BASE = 'https://rest.clicksend.com/v3';

@Injectable()
export class ClickSendService {
  private readonly logger = new Logger(ClickSendService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly integrations: IntegrationSettingsService,
  ) {}

  private get sms(): SmsMessageDelegate {
    return (this.prisma as unknown as { smsMessage: SmsMessageDelegate })
      .smsMessage;
  }

  // ---- public API -----------------------------------------------------------

  async sendSms(user: AuthUser, dto: SendSmsDto) {
    const lead = dto.leadId
      ? await this.prisma.lead.findUnique({
          where: { id: dto.leadId },
          select: { id: true, phone: true, company: true },
        })
      : null;

    if (dto.leadId && !lead) {
      throw new BadRequestException('Unknown lead.');
    }

    const rawTo = dto.to ?? lead?.phone ?? '';
    const toNumber = this.toE164(rawTo);
    if (!toNumber) {
      throw new BadRequestException(
        'No valid recipient number (provide `to`, or a lead with a phone).',
      );
    }

    const brand = (dto.brand ?? lead?.company ?? 'ASTRA') as 'ASTRA' | 'DC';
    const senderId = await this.resolveSenderId(user.id, brand);

    // 1. Persist a QUEUED row first so nothing is lost if the API call fails.
    const row = await this.sms.create({
      data: {
        direction: 'OUTBOUND',
        status: 'QUEUED',
        toNumber,
        fromNumber: senderId,
        body: dto.body,
        leadId: lead?.id ?? null,
        sentById: user.id,
        brand,
        senderId,
      },
    });

    // 2. Call ClickSend.
    const result = await this.dispatch({
      to: toNumber,
      from: senderId,
      body: dto.body,
      customString: row.id,
    });

    // 3. Update the row with the provider response.
    const ok = result.status === 'SUCCESS';
    await this.sms.update({
      where: { id: row.id },
      data: {
        status: ok ? 'SENT' : 'FAILED',
        providerMessageId: result.messageId ?? null,
        messagePrice: result.messagePrice ?? null,
        errorCode: ok ? null : result.status ?? null,
        errorText: ok ? null : result.statusText ?? null,
        sentAt: ok ? new Date() : null,
      },
    });

    // 4. Activity (human feed) + AuditLog (security trail).
    if (lead) {
      await this.prisma.activity.create({
        data: {
          type: 'sms',
          content: `SMS ${ok ? 'sent' : 'FAILED'} to ${toNumber}: ${dto.body}`,
          leadId: lead.id,
          userId: user.id,
        },
      });
    }
    await this.audit.record({
      userId: user.id,
      action: ok ? 'SMS_SENT' : 'SMS_SEND_FAILED',
      entity: 'SmsMessage',
      entityId: row.id,
      metadata: {
        toNumber,
        brand,
        senderId,
        leadId: lead?.id ?? null,
        providerMessageId: result.messageId ?? null,
      },
    });

    if (!ok) {
      throw new ServiceUnavailableException(
        `ClickSend rejected the message: ${result.statusText ?? result.status}`,
      );
    }

    return {
      ok: true,
      id: row.id,
      status: 'SENT',
      providerMessageId: result.messageId ?? null,
      to: toNumber,
      senderId,
    };
  }

  /**
   * Delivery-receipt webhook handler. ClickSend POSTs status updates here;
   * we match the local row by `message_id` (or our `custom_string` = row id)
   * and advance its status. Unknown messages are acknowledged (no-op) so
   * ClickSend doesn't retry forever.
   */
  async handleDeliveryReceipt(payload: ClickSendDeliveryReceipt) {
    const messageId = payload.message_id ?? payload.messageId;
    const customString = payload.custom_string ?? payload.customString;
    const statusRaw = String(payload.status ?? '').toLowerCase();

    const row = customString
      ? await this.sms.findFirst({ where: { id: customString } })
      : messageId
        ? await this.sms.findFirst({ where: { providerMessageId: messageId } })
        : null;

    if (!row) {
      this.logger.warn(
        `ClickSend DLR for unknown message (id=${messageId}, custom=${customString})`,
      );
      return { ok: true, matched: false };
    }

    const status = this.mapDeliveryStatus(statusRaw);
    await this.sms.update({
      where: { id: row.id },
      data: {
        status,
        deliveredAt: status === 'DELIVERED' ? new Date() : null,
        errorCode: status === 'FAILED' ? (payload.error_code ?? statusRaw) : null,
        errorText: status === 'FAILED' ? (payload.status ?? null) : null,
        ...(messageId && !row.providerMessageId
          ? { providerMessageId: messageId }
          : {}),
      },
    });

    return { ok: true, matched: true, id: row.id, status };
  }

  // ---- internals ------------------------------------------------------------

  /** Resolve the brand sender ID: per-consultant override → system default. */
  private async resolveSenderId(
    consultantId: string,
    brand: 'ASTRA' | 'DC',
  ): Promise<string> {
    const override = await this.prisma.consultantContact.findUnique({
      where: { consultantId },
      select: { senderIdAstra: true, senderIdDc: true },
    });
    const fromOverride =
      brand === 'DC' ? override?.senderIdDc : override?.senderIdAstra;
    const fallback =
      brand === 'DC'
        ? this.config.get<string>('CLICKSEND_SENDER_ID_DC')
        : this.config.get<string>('CLICKSEND_SENDER_ID_ASTRA');
    return (
      fromOverride ||
      fallback ||
      this.config.get<string>('CLICKSEND_SENDER_ID') ||
      'ASTRASOLAR'
    );
  }

  /** Low-level ClickSend submit. Uses native fetch (Node 20+). */
  private async dispatch(msg: {
    to: string;
    from: string;
    body: string;
    customString: string;
  }): Promise<{
    status: string;
    statusText?: string;
    messageId?: string;
    messagePrice?: string;
  }> {
    // Stored credentials (Integrations panel) override env; env is the fallback.
    const username = await this.integrations.resolve(
      INTEGRATION_SETTING_KEYS.CLICKSEND_USERNAME,
    );
    const apiKey = await this.integrations.resolve(
      INTEGRATION_SETTING_KEYS.CLICKSEND_API_KEY,
    );
    if (!username || !apiKey) {
      throw new ServiceUnavailableException(
        'ClickSend is not configured (set CLICKSEND_USERNAME / CLICKSEND_API_KEY).',
      );
    }

    const auth = Buffer.from(`${username}:${apiKey}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${CLICKSEND_BASE}/sms/send`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              source: 'astra-crm',
              from: msg.from,
              body: msg.body,
              to: msg.to,
              custom_string: msg.customString,
            },
          ],
        }),
      });
    } catch (err) {
      this.logger.error(`ClickSend request failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach ClickSend.');
    }

    const json = (await res.json().catch(() => ({}))) as ClickSendSendResponse;
    const m = json?.data?.messages?.[0];
    if (!res.ok || !m) {
      return {
        status: m?.status ?? 'HTTP_ERROR',
        statusText: json?.response_msg ?? `HTTP ${res.status}`,
      };
    }
    return {
      status: m.status ?? 'UNKNOWN',
      statusText: m.status,
      messageId: m.message_id,
      messagePrice: m.message_price != null ? String(m.message_price) : undefined,
    };
  }

  /** AU mobile / loose input → E.164 ("+61…"). Returns '' if not parseable. */
  private toE164(raw: string): string {
    let s = String(raw ?? '').replace(/[\s\-()]/g, '');
    if (!s) return '';
    if (s.startsWith('+')) return /^\+\d{6,15}$/.test(s) ? s : '';
    if (s.startsWith('0')) return `+61${s.slice(1)}`; // AU national → +61
    if (s.startsWith('61')) return `+${s}`;
    if (/^\d{6,15}$/.test(s)) return `+${s}`;
    return '';
  }

  private mapDeliveryStatus(raw: string): string {
    if (['delivered', 'success', 'completed'].includes(raw)) return 'DELIVERED';
    if (['sent', 'queued', 'enroute'].includes(raw)) return 'SENT';
    if (
      ['undelivered', 'failed', 'undeliverable', 'rejected', 'error'].includes(
        raw,
      )
    )
      return 'FAILED';
    return 'SENT';
  }
}

// ---- ClickSend wire shapes -------------------------------------------------

interface ClickSendSendResponse {
  response_code?: string;
  response_msg?: string;
  data?: {
    messages?: Array<{
      message_id?: string;
      status?: string;
      message_price?: number | string;
      to?: string;
    }>;
  };
}

export interface ClickSendDeliveryReceipt {
  message_id?: string;
  messageId?: string;
  custom_string?: string;
  customString?: string;
  status?: string;
  error_code?: string;
  timestamp?: string | number;
}
