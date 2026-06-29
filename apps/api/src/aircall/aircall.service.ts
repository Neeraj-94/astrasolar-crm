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
import { ClickToDialDto } from './dto';
import {
  INTEGRATION_SETTING_KEYS,
  IntegrationSettingsService,
} from '../integrations/integration-settings.service';

/**
 * Aircall integration (inbound webhook ingestion + outbound click-to-dial).
 *
 * Inbound: Aircall POSTs call lifecycle events (call.created → answered →
 * hungup, plus voicemail). We upsert a queryable `CallLog` row keyed on the
 * Aircall call id, match it to a `Lead` by the external party's phone, map the
 * Aircall agent to a CRM user by email, and on the terminal event write an
 * `Activity` (human feed) + `AuditLog` (security trail).
 *
 * Outbound: place a call via the Aircall REST API on behalf of an agent.
 *
 * New Prisma delegates are referenced through a narrow interface (same
 * convention as notifications.service.ts) so this compiles before the client
 * is regenerated. After `prisma generate`, `prisma.callLog` satisfies it.
 */

export interface CallLogRecord {
  id: string;
  status: string;
  direction: string;
  leadId: string | null;
  agentId: string | null;
  providerCallId: string;
}

interface CallLogDelegate {
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<CallLogRecord>;
  findUnique(args: {
    where: Record<string, unknown>;
  }): Promise<CallLogRecord | null>;
  update(args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<CallLogRecord>;
}

const AIRCALL_BASE = 'https://api.aircall.io/v1';

@Injectable()
export class AircallService {
  private readonly logger = new Logger(AircallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly integrations: IntegrationSettingsService,
  ) {}

  private get calls(): CallLogDelegate {
    return (this.prisma as unknown as { callLog: CallLogDelegate }).callLog;
  }

  // ---- inbound webhook ------------------------------------------------------

  async handleWebhook(payload: AircallWebhook) {
    const event = payload.event ?? '';
    const call = payload.data;
    if (payload.resource !== 'call' || !call?.id) {
      // Aircall also pings non-call events (e.g. webhook validation). Ack them.
      return { ok: true, ignored: true, event };
    }

    const providerCallId = String(call.id);
    const direction = call.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND';

    // The external party's number: callee for outbound, caller for inbound.
    const externalNumber = call.raw_digits ?? call.contact?.phone_number ?? null;
    const ourNumber = call.number?.digits ?? null;
    const fromNumber = direction === 'INBOUND' ? externalNumber : ourNumber;
    const toNumber = direction === 'INBOUND' ? ourNumber : externalNumber;

    const [lead, agentId] = await Promise.all([
      this.matchLeadByPhone(externalNumber),
      this.matchAgentByEmail(call.user?.email),
    ]);

    const status = this.mapStatus(event, call);

    const base = {
      direction,
      status,
      fromNumber,
      toNumber,
      leadId: lead?.id ?? null,
      agentId,
      aircallUserEmail: call.user?.email ?? null,
      aircallNumberId: call.number?.id != null ? String(call.number.id) : null,
      durationSeconds: call.duration ?? null,
      recordingUrl: call.recording ?? null,
      voicemailUrl: call.voicemail ?? null,
      startedAt: this.ts(call.started_at),
      answeredAt: this.ts(call.answered_at),
      endedAt: this.ts(call.ended_at),
    };

    const row = await this.calls.upsert({
      where: { providerCallId },
      create: { providerCallId, ...base },
      update: this.pruneUndefined(base),
    });

    // On terminal events, surface the call in the lead feed + audit trail.
    if (this.isTerminal(status) && lead) {
      const verb =
        status === 'MISSED'
          ? 'Missed call'
          : status === 'VOICEMAIL'
            ? 'Voicemail'
            : `${direction === 'INBOUND' ? 'Inbound' : 'Outbound'} call`;
      const mins = base.durationSeconds
        ? ` (${base.durationSeconds}s)`
        : '';
      await this.prisma.activity.create({
        data: {
          type: 'call',
          content: `${verb}${mins} via Aircall${
            base.recordingUrl ? ` — recording: ${base.recordingUrl}` : ''
          }`,
          leadId: lead.id,
          userId: agentId ?? lead.leadGenId,
        },
      });
      await this.audit.record({
        userId: agentId ?? lead.leadGenId,
        action: 'CALL_LOGGED',
        entity: 'CallLog',
        entityId: row.id,
        source: 'aircall',
        metadata: {
          providerCallId,
          direction,
          status,
          leadId: lead.id,
          durationSeconds: base.durationSeconds,
        },
      });
    }

    return { ok: true, id: row.id, status, matchedLead: lead?.id ?? null };
  }

  // ---- outbound click-to-dial ----------------------------------------------

  async clickToDial(user: AuthUser, dto: ClickToDialDto) {
    const lead = dto.leadId
      ? await this.prisma.lead.findUnique({
          where: { id: dto.leadId },
          select: { id: true, phone: true },
        })
      : null;
    if (dto.leadId && !lead) throw new BadRequestException('Unknown lead.');

    const to = this.toE164(dto.to ?? lead?.phone ?? '');
    if (!to) {
      throw new BadRequestException(
        'No valid number to dial (provide `to`, or a lead with a phone).',
      );
    }

    const aircallUserId =
      dto.aircallUserId ?? (await this.resolveAircallUserId(user.email));
    if (!aircallUserId) {
      throw new BadRequestException(
        'No Aircall agent found for you. Pass `aircallUserId`, or ensure your CRM email matches an Aircall user.',
      );
    }

    const numberId =
      dto.numberId ?? this.config.get<string>('AIRCALL_DEFAULT_NUMBER_ID');
    if (!numberId) {
      throw new BadRequestException(
        'No outbound line configured (set AIRCALL_DEFAULT_NUMBER_ID or pass `numberId`).',
      );
    }

    await this.aircallFetch(`/users/${aircallUserId}/calls`, {
      method: 'POST',
      body: JSON.stringify({ number_id: Number(numberId), to }),
    });

    await this.audit.record({
      userId: user.id,
      action: 'CALL_INITIATED',
      entity: 'Lead',
      entityId: lead?.id ?? 'adhoc',
      source: 'aircall',
      metadata: { to, aircallUserId, numberId, leadId: lead?.id ?? null },
    });

    return { ok: true, dialing: to, aircallUserId, numberId };
  }

  // ---- internals ------------------------------------------------------------

  private async matchLeadByPhone(
    phone?: string | null,
  ): Promise<{ id: string; leadGenId: string } | null> {
    const e164 = this.toE164(phone ?? '');
    if (!e164) return null;
    // Match on the last 9 digits (AU mobile sans country/leading 0) so stored
    // formats like "0412 345 678" line up with Aircall's "+61412345678".
    const tail = e164.slice(-9);
    const lead = await this.prisma.lead.findFirst({
      where: { phone: { contains: tail } },
      select: { id: true, leadGenId: true },
      orderBy: { timestamp: 'desc' },
    });
    return lead;
  }

  private async matchAgentByEmail(
    email?: string | null,
  ): Promise<string | null> {
    if (!email) return null;
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /** Look up the Aircall user id for a CRM agent by email. */
  private async resolveAircallUserId(email: string): Promise<string | null> {
    try {
      const json = await this.aircallFetch(
        `/users?email=${encodeURIComponent(email)}`,
        { method: 'GET' },
      );
      const u = (json as AircallUsersResponse)?.users?.[0];
      return u?.id != null ? String(u.id) : null;
    } catch (err) {
      this.logger.warn(`Aircall user lookup failed: ${String(err)}`);
      return null;
    }
  }

  private async aircallFetch(
    path: string,
    init: { method: string; body?: string },
  ): Promise<unknown> {
    // Stored credentials (Integrations panel) override env; env is the fallback.
    const apiId = await this.integrations.resolve(
      INTEGRATION_SETTING_KEYS.AIRCALL_API_ID,
    );
    const apiToken = await this.integrations.resolve(
      INTEGRATION_SETTING_KEYS.AIRCALL_API_TOKEN,
    );
    if (!apiId || !apiToken) {
      throw new ServiceUnavailableException(
        'Aircall is not configured (set AIRCALL_API_ID / AIRCALL_API_TOKEN).',
      );
    }
    const auth = Buffer.from(`${apiId}:${apiToken}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`${AIRCALL_BASE}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: init.body,
      });
    } catch (err) {
      this.logger.error(`Aircall request failed: ${String(err)}`);
      throw new ServiceUnavailableException('Could not reach Aircall.');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ServiceUnavailableException(
        `Aircall API error (HTTP ${res.status}).`,
      );
    }
    return json;
  }

  private mapStatus(event: string, call: AircallCall): string {
    switch (event) {
      case 'call.created':
        return 'INITIAL';
      case 'call.ringing_on_agent':
        return 'RINGING';
      case 'call.answered':
        return 'ANSWERED';
      case 'call.voicemail_left':
        return 'VOICEMAIL';
      case 'call.hungup':
      case 'call.ended':
        // Ended without an answer time → missed (inbound) / unanswered.
        return call.answered_at ? 'ENDED' : 'MISSED';
      case 'call.agent_declined':
      case 'call.missed':
        return 'MISSED';
      default:
        // Fall back to the call's own status field if present.
        if (call.status === 'done') return call.answered_at ? 'ENDED' : 'MISSED';
        if (call.status === 'answered') return 'ANSWERED';
        return 'INITIAL';
    }
  }

  private isTerminal(status: string): boolean {
    return ['ENDED', 'MISSED', 'VOICEMAIL', 'FAILED'].includes(status);
  }

  private ts(epochSeconds?: number | null): Date | null {
    return epochSeconds ? new Date(epochSeconds * 1000) : null;
  }

  private pruneUndefined(obj: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined),
    );
  }

  private toE164(raw: string): string {
    let s = String(raw ?? '').replace(/[\s\-()]/g, '');
    if (!s) return '';
    if (s.startsWith('+')) return /^\+\d{6,15}$/.test(s) ? s : '';
    if (s.startsWith('0')) return `+61${s.slice(1)}`;
    if (s.startsWith('61')) return `+${s}`;
    if (/^\d{6,15}$/.test(s)) return `+${s}`;
    return '';
  }
}

// ---- Aircall wire shapes ---------------------------------------------------

export interface AircallCall {
  id: number | string;
  direction?: 'inbound' | 'outbound';
  status?: string;
  started_at?: number | null;
  answered_at?: number | null;
  ended_at?: number | null;
  duration?: number | null;
  raw_digits?: string | null;
  recording?: string | null;
  voicemail?: string | null;
  user?: { id?: number | string; email?: string; name?: string } | null;
  number?: { id?: number | string; name?: string; digits?: string } | null;
  contact?: { phone_number?: string } | null;
}

export interface AircallWebhook {
  resource?: string;
  event?: string;
  token?: string;
  timestamp?: number;
  data?: AircallCall;
}

interface AircallUsersResponse {
  users?: Array<{ id?: number | string; email?: string }>;
}
