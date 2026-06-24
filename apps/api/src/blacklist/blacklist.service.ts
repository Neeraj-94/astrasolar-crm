import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  BlacklistEntryDto,
  BlacklistLogDto,
  BlacklistSweepResult,
} from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import { CreateBlacklistEntryDto } from './dto';

// ---- normalisation (mirrors the legacy _norm* helpers) ---------------------

const normName = (v?: string | null) =>
  (v ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
const normEmail = (v?: string | null) =>
  (v ?? '').toString().toLowerCase().trim();
const normAddr = (v?: string | null) =>
  (v ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
const normPhone = (v?: string | null) => {
  let d = (v ?? '').toString().replace(/[^\d+]/g, '');
  if (d.startsWith('+61')) d = '0' + d.slice(3);
  else if (d.startsWith('61') && d.length === 11) d = '0' + d.slice(2);
  return d.replace(/\D/g, '');
};

interface NormEntry {
  id: string;
  fn: string;
  ln: string;
  ph: string;
  em: string;
  ad: string;
}

interface Candidate {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

/**
 * Blacklist Leads — block individuals from Bloome / No Answers / Leads
 * Schedule. Ported from astrasolar-app's Firebase `/blacklistLeads`.
 *
 * A record is blacklisted when it matches an entry on >=2 normalised fields
 * (phone / email / name / address — name counts once and needs first AND last).
 * The sweep flags matches (soft-delete) and writes a removal-log row; the three
 * source list queries filter `blacklisted = false`.
 */
@Injectable()
export class BlacklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---- queries -------------------------------------------------------------

  async listEntries(): Promise<BlacklistEntryDto[]> {
    const rows = await this.prisma.blacklistEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((e) => ({
      id: e.id,
      firstName: e.firstName,
      lastName: e.lastName,
      phone: e.phone,
      email: e.email,
      address: e.address,
      addedByName: e.addedByName,
      addedAt: e.createdAt.toISOString(),
    }));
  }

  async listLog(): Promise<BlacklistLogDto[]> {
    const rows = await this.prisma.blacklistRemovalLog.findMany({
      orderBy: { detectedAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      detectedAt: r.detectedAt.toISOString(),
      removedAt: r.removedAt.toISOString(),
      source: r.source,
      matchedFirstName: r.matchedFirstName,
      matchedLastName: r.matchedLastName,
      matchedPhone: r.matchedPhone,
      matchedEmail: r.matchedEmail,
      matchedAddress: r.matchedAddress,
      matchedOn: r.matchedOn,
      entryId: r.entryId,
      removedByName: r.removedByName,
    }));
  }

  // ---- mutations -----------------------------------------------------------

  async addEntry(user: AuthUser, dto: CreateBlacklistEntryDto) {
    const fields = [
      dto.firstName,
      dto.lastName,
      dto.phone,
      dto.email,
      dto.address,
    ].map((v) => (v ?? '').trim());
    const filled = fields.filter(Boolean).length;
    if (filled < 2) {
      throw new BadRequestException(
        'Fill at least 2 fields — matches need >=2 fields to align.',
      );
    }

    const entry = await this.prisma.blacklistEntry.create({
      data: {
        firstName: fields[0] || null,
        lastName: fields[1] || null,
        phone: fields[2] || null,
        email: fields[3] || null,
        address: fields[4] || null,
        addedById: user.id,
        addedByName: user.name,
      },
    });

    await this.audit.record({
      userId: user.id,
      action: 'BLACKLIST_ENTRY_ADDED',
      entity: 'BlacklistEntry',
      entityId: entry.id,
      metadata: { firstName: entry.firstName, lastName: entry.lastName },
    });

    // Immediately sweep so matching leads disappear from the source tabs.
    const sweep = await this.runSweep(user);
    return { ok: true, entry, sweep };
  }

  async removeEntry(user: AuthUser, id: string) {
    await this.prisma.blacklistEntry
      .delete({ where: { id } })
      .catch(() => undefined); // idempotent

    await this.audit.record({
      userId: user.id,
      action: 'BLACKLIST_ENTRY_REMOVED',
      entity: 'BlacklistEntry',
      entityId: id,
    });
    // Existing log rows are kept for audit; future matches simply stop.
    return { ok: true };
  }

  // ---- matching + sweep ----------------------------------------------------

  /** Returns the matched entry + the field labels that aligned, or null. */
  private match(c: Candidate, entries: NormEntry[]): { entry: NormEntry; on: string[] } | null {
    const fn = normName(c.firstName);
    const ln = normName(c.lastName);
    const ph = normPhone(c.phone);
    const em = normEmail(c.email);
    const ad = normAddr(c.address);
    if (!fn && !ln && !ph && !em && !ad) return null;

    let best: { entry: NormEntry; on: string[] } | null = null;
    for (const e of entries) {
      const on: string[] = [];
      if (e.ph && ph && e.ph === ph) on.push('phone');
      if (e.em && em && e.em === em) on.push('email');
      if (e.fn && e.ln && fn && ln && e.fn === fn && e.ln === ln) on.push('name');
      if (e.ad && ad && e.ad === ad) on.push('address');
      if (on.length >= 2 && (!best || on.length > best.on.length)) {
        best = { entry: e, on };
        if (on.length >= 4) break;
      }
    }
    return best;
  }

  /**
   * Re-scan Bloome / No Answers (Lead) / Leads Schedule (Appointment) for
   * records matching any blacklist entry. Flags matches and logs each removal.
   */
  async runSweep(user?: AuthUser): Promise<BlacklistSweepResult> {
    const rawEntries = await this.prisma.blacklistEntry.findMany();
    const entries: NormEntry[] = rawEntries.map((e) => ({
      id: e.id,
      fn: normName(e.firstName),
      ln: normName(e.lastName),
      ph: normPhone(e.phone),
      em: normEmail(e.email),
      ad: normAddr(e.address),
    }));

    const result: BlacklistSweepResult = {
      scanned: 0,
      removed: 0,
      bySource: { bloome: 0, noAnswers: 0, leadsSchedule: 0 },
    };
    if (entries.length === 0) return result;

    const now = new Date();
    const removedBy = user?.name ?? 'system';
    const removedById = user?.id ?? null;
    const logs: any[] = [];

    // --- Bloome --------------------------------------------------------------
    const bloome = await this.prisma.bloomeLead.findMany({
      where: { blacklisted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        email: true,
        address: true,
      },
    });
    result.scanned += bloome.length;
    for (const r of bloome) {
      const m = this.match(
        { firstName: r.firstName, lastName: r.lastName, phone: r.mobile, email: r.email, address: r.address },
        entries,
      );
      if (!m) continue;
      await this.prisma.bloomeLead.update({
        where: { id: r.id },
        data: { blacklisted: true, blacklistedAt: now, blacklistEntryId: m.entry.id },
      });
      logs.push(this.logRow('Bloome', r, m, removedById, removedBy));
      result.removed++;
      result.bySource.bloome++;
    }

    // --- No Answers (Lead) ---------------------------------------------------
    const leads = await this.prisma.lead.findMany({
      where: { blacklisted: false },
      select: {
        id: true,
        firstName: true,
        surName: true,
        phone: true,
        email: true,
        address: true,
      },
    });
    result.scanned += leads.length;
    for (const r of leads) {
      const m = this.match(
        { firstName: r.firstName, lastName: r.surName, phone: r.phone, email: r.email, address: r.address },
        entries,
      );
      if (!m) continue;
      await this.prisma.lead.update({
        where: { id: r.id },
        data: { blacklisted: true, blacklistedAt: now, blacklistEntryId: m.entry.id },
      });
      logs.push(
        this.logRow('No Answers', { firstName: r.firstName, lastName: r.surName, mobile: r.phone, email: r.email, address: r.address }, m, removedById, removedBy),
      );
      result.removed++;
      result.bySource.noAnswers++;
    }

    // --- Leads Schedule (Appointment) ---------------------------------------
    const appts = await this.prisma.appointment.findMany({
      where: { blacklisted: false },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        address: true,
      },
    });
    result.scanned += appts.length;
    for (const r of appts) {
      const m = this.match(
        { firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email, address: r.address },
        entries,
      );
      if (!m) continue;
      await this.prisma.appointment.update({
        where: { id: r.id },
        data: { blacklisted: true, blacklistedAt: now, blacklistEntryId: m.entry.id },
      });
      logs.push(
        this.logRow('Leads Schedule', { firstName: r.firstName, lastName: r.lastName, mobile: r.phone, email: r.email, address: r.address }, m, removedById, removedBy),
      );
      result.removed++;
      result.bySource.leadsSchedule++;
    }

    if (logs.length > 0) {
      await this.prisma.blacklistRemovalLog.createMany({ data: logs });
    }
    return result;
  }

  private logRow(
    source: string,
    r: { firstName?: string | null; lastName?: string | null; mobile?: string | null; email?: string | null; address?: string | null },
    m: { entry: NormEntry; on: string[] },
    removedById: string | null,
    removedByName: string,
  ) {
    return {
      detectedAt: new Date(),
      removedAt: new Date(),
      source,
      matchedFirstName: r.firstName ?? null,
      matchedLastName: r.lastName ?? null,
      matchedPhone: r.mobile ?? null,
      matchedEmail: r.email ?? null,
      matchedAddress: r.address ?? null,
      matchedOn: m.on.join(', '),
      entryId: m.entry.id,
      removedById,
      removedByName,
    };
  }
}
