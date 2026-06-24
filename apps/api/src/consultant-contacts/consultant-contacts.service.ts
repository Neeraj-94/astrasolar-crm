import { BadRequestException, Injectable } from '@nestjs/common';
import type { ConsultantContactDto } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import { UpsertConsultantContactDto } from './dto';

/**
 * Consultant Contacts — per-consultant callback number + ClickSend sender ID,
 * one pair per brand (Astra Solar / DC Solar). Ported from the astrasolar-app
 * Firebase node `/consultantContacts/{consultantId}`.
 *
 * Read is open to any staff member with record access (the SMS resolver and the
 * read-only tab need it); writes are gated by `leads:contacts:manage` at the
 * controller. An empty field means "fall back to the system default" for that
 * brand, so clearing all fields is equivalent to removing the override.
 */
@Injectable()
export class ConsultantContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- validation / normalisation (mirrors the legacy lgValidate* helpers) --

  /** Normalise an AU mobile to "04XX XXX XXX". Empty stays empty. */
  private normaliseMobile(raw?: string | null): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    let digits = s.replace(/[\s\-()]/g, '');
    if (digits.startsWith('+61')) digits = '0' + digits.slice(3);
    else if (digits.startsWith('61') && digits.length === 11)
      digits = '0' + digits.slice(2);
    if (!/^04\d{8}$/.test(digits)) {
      throw new BadRequestException(
        'Numbers must be a 10-digit Australian mobile starting with 04 (e.g. 0412 345 678).',
      );
    }
    return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }

  /** Sender IDs are stored upper-cased. Empty stays empty. */
  private normaliseSenderId(raw?: string | null): string {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    if (!/^[A-Za-z0-9]{3,11}$/.test(s)) {
      throw new BadRequestException(
        'Sender ID must be 3–11 letters/digits, no spaces (e.g. ASTRASOLAR).',
      );
    }
    return s.toUpperCase();
  }

  // ---- queries --------------------------------------------------------------

  /**
   * The full consultant directory joined with any saved override. Consultants
   * with no override still appear (so the tab lists everyone), with null
   * brand fields → the UI shows system-default placeholders.
   */
  async list(): Promise<ConsultantContactDto[]> {
    const consultants = await this.prisma.user.findMany({
      where: {
        isActive: true,
        roles: { some: { role: { name: 'sales_consultant' } } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        roles: { select: { role: { select: { name: true } } } },
        consultantContact: true,
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });

    return consultants.map((u) => {
      const c = u.consultantContact;
      return {
        consultantId: u.id,
        name: u.name,
        role: u.roles[0]?.role?.name ?? null,
        email: u.email,
        contactPhoneAstra: c?.contactPhoneAstra ?? null,
        senderIdAstra: c?.senderIdAstra ?? null,
        contactPhoneDc: c?.contactPhoneDc ?? null,
        senderIdDc: c?.senderIdDc ?? null,
        updatedAt: c?.updatedAt ? c.updatedAt.toISOString() : null,
        updatedByName: c?.updatedByName ?? null,
        hasOverride: !!c,
      };
    });
  }

  // ---- mutations ------------------------------------------------------------

  async upsert(
    user: AuthUser,
    consultantId: string,
    dto: UpsertConsultantContactDto,
  ) {
    // Guard against orphan overrides — the consultant must exist.
    const consultant = await this.prisma.user.findUnique({
      where: { id: consultantId },
      select: { id: true, name: true },
    });
    if (!consultant) {
      throw new BadRequestException('Unknown consultant.');
    }

    const data = {
      contactPhoneAstra: this.normaliseMobile(dto.contactPhoneAstra) || null,
      senderIdAstra: this.normaliseSenderId(dto.senderIdAstra) || null,
      contactPhoneDc: this.normaliseMobile(dto.contactPhoneDc) || null,
      senderIdDc: this.normaliseSenderId(dto.senderIdDc) || null,
    };

    // If everything is blank, treat as a remove so we don't leave an empty row.
    const allBlank =
      !data.contactPhoneAstra &&
      !data.senderIdAstra &&
      !data.contactPhoneDc &&
      !data.senderIdDc;
    if (allBlank) {
      await this.remove(user, consultantId);
      return { ok: true, removed: true };
    }

    const meta = { updatedById: user.id, updatedByName: user.name };

    const saved = await this.prisma.consultantContact.upsert({
      where: { consultantId },
      create: { consultantId, ...data, ...meta },
      update: { ...data, ...meta },
    });

    await this.audit.record({
      userId: user.id,
      action: 'CONSULTANT_CONTACT_UPDATED',
      entity: 'ConsultantContact',
      entityId: consultantId,
      metadata: { ...data },
    });

    return { ok: true, contact: saved };
  }

  async remove(user: AuthUser, consultantId: string) {
    await this.prisma.consultantContact
      .delete({ where: { consultantId } })
      // Deleting a non-existent override is a no-op (idempotent revert).
      .catch(() => undefined);

    await this.audit.record({
      userId: user.id,
      action: 'CONSULTANT_CONTACT_REMOVED',
      entity: 'ConsultantContact',
      entityId: consultantId,
    });

    return { ok: true };
  }
}
