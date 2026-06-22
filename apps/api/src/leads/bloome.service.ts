import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { AvailabilityService } from '../scheduling/availability.service';
import type { AuthUser } from '../common/auth-user';
import type { BookBloomeLeadDto, UpdateBloomeLeadDto } from './dto';

export interface BloomeListQuery {
  region?: string;
  q?: string;
  outcome?: string; // raw label, or the special "none" for blank outcomes
  agent?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Read-side service for the raw Bloome appointment-setter leads imported
 * from the "ASTRA - MASTER BLASTER" Google Sheet (see prisma `BloomeLead`).
 *
 * These rows are a shared pool (no per-user ownership), so there is no
 * visibility-scope filtering — access is gated by permission alone at the
 * controller, and tab access is enforced by the web dashboard shell.
 */
@Injectable()
export class BloomeLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly availability: AvailabilityService,
  ) {}

  private buildWhere(query: BloomeListQuery): Prisma.BloomeLeadWhereInput {
    const where: Prisma.BloomeLeadWhereInput = {};
    if (query.region) where.region = query.region;
    if (query.agent) where.agent = { equals: query.agent, mode: 'insensitive' };
    if (query.outcome === 'none') where.outcome = null;
    else if (query.outcome) where.outcome = query.outcome;

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { suburb: { contains: q, mode: 'insensitive' } },
        { postcode: { contains: q } },
      ];
    }
    return where;
  }

  async list(query: BloomeListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(250, Math.max(1, query.pageSize ?? 50));
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bloomeLead.count({ where }),
      this.prisma.bloomeLead.findMany({
        where,
        orderBy: [{ timestamp: { sort: 'desc', nulls: 'last' } }, { rowNum: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, rows };
  }

  async getOne(id: string) {
    const row = await this.prisma.bloomeLead.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Bloome lead not found');
    return row;
  }

  /**
   * Inline edit — only the fields present in the payload are written.
   * Audited with a before/after snapshot of the changed fields.
   */
  async update(user: AuthUser, id: string, dto: UpdateBloomeLeadDto) {
    const existing = await this.getOne(id);

    type Editable = string | number | null;
    const data: Prisma.BloomeLeadUpdateInput = {};
    const changes: Record<string, { from: Editable; to: Editable }> = {};
    for (const field of ['agent', 'dials', 'outcome', 'notes'] as const) {
      const incoming = dto[field];
      if (incoming === undefined) continue;
      const next: Editable = field === 'dials' ? (incoming as number) : (incoming || null);
      if (existing[field] === next) continue;
      (data as Record<string, unknown>)[field] = next;
      changes[field] = { from: existing[field], to: next };
    }

    if (Object.keys(changes).length === 0) return existing;

    // A fresh dial attempt also stamps Last Called (sheet keeps free text).
    if (changes.dials) {
      data.lastCalled = new Date().toLocaleDateString('en-AU');
    }

    const updated = await this.prisma.bloomeLead.update({ where: { id }, data });
    await this.audit.record({
      userId: user.id,
      action: 'BLOOME_LEAD_UPDATED',
      entity: 'BloomeLead',
      entityId: id,
      metadata: { changes },
    });
    return updated;
  }

  /**
   * Book the lead into a consultant's Leads Schedule slot: validates the
   * consultant's availability (same guard as the schedule), rejects occupied
   * cells, writes the `Appointment` with a contact snapshot and stamps the
   * Bloome row (outcome → Appointment, appDate/appTime).
   */
  async book(user: AuthUser, id: string, dto: BookBloomeLeadDto) {
    const lead = await this.getOne(id);

    const startsAt = new Date(
      `${dto.date}T${String(dto.hour).padStart(2, '0')}:${String(dto.minute).padStart(2, '0')}:00`,
    );
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const check = await this.availability.canBook({
      consultantId: dto.consultantId,
      startsAt,
      endsAt,
    });
    if (!check.ok) {
      throw new BadRequestException(
        `Consultant is not available at that time: ${check.conflicts
          .map((c) => c.reason)
          .join('; ')}`,
      );
    }

    const dbDate = new Date(`${dto.date}T00:00:00.000Z`);
    const taken = await this.prisma.appointment.findFirst({
      where: {
        consultantId: dto.consultantId,
        date: dbDate,
        hour: dto.hour,
        minute: dto.minute,
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('That timeslot is already booked.');
    }

    const customerName =
      [lead.firstName, lead.lastName].filter(Boolean).join(' ').trim() || null;
    const appTime = `${String(dto.hour).padStart(2, '0')}:${dto.minute === 0 ? '00' : '30'}`;
    const [y, m, d] = dto.date.split('-');
    const appDate = `${d}/${m}/${y}`;

    const [appointment] = await this.prisma.$transaction([
      this.prisma.appointment.create({
        data: {
          consultantId: dto.consultantId,
          date: dbDate,
          hour: dto.hour,
          minute: dto.minute,
          durationMinutes: 30,
          bookedByUserId: user.id,
          bookedByName: user.name,
          source: 'Bloome',
          bills: lead.billSpend,
          notes: lead.notes,
          customerName,
          firstName: lead.firstName,
          lastName: lead.lastName,
          phone: lead.mobile,
          email: lead.email,
          address: lead.address,
          suburb: lead.suburb,
          state: lead.region,
          postcode: lead.postcode,
        },
      }),
      this.prisma.bloomeLead.update({
        where: { id },
        data: { outcome: 'Appointment', appDate, appTime },
      }),
    ]);

    await this.audit.record({
      userId: user.id,
      action: 'BLOOME_LEAD_BOOKED',
      entity: 'BloomeLead',
      entityId: id,
      metadata: {
        appointmentId: appointment.id,
        consultantId: dto.consultantId,
        date: dto.date,
        hour: dto.hour,
        minute: dto.minute,
      },
    });

    return { ok: true, appointment };
  }

  /** KPI + facet payload for the tab header and filter dropdowns. */
  async summary(region?: string) {
    const where: Prisma.BloomeLeadWhereInput = region ? { region } : {};

    const [total, byOutcome, byAgent, regions, latest] =
      await this.prisma.$transaction([
        this.prisma.bloomeLead.count({ where }),
        this.prisma.bloomeLead.groupBy({
          by: ['outcome'],
          where,
          orderBy: { outcome: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.bloomeLead.groupBy({
          by: ['agent'],
          where: { ...where, agent: { not: null } },
          orderBy: { agent: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.bloomeLead.groupBy({
          by: ['region'],
          orderBy: { region: 'asc' },
          _count: { _all: true },
        }),
        this.prisma.bloomeLead.findFirst({
          where,
          orderBy: { timestamp: { sort: 'desc', nulls: 'last' } },
          select: { timestamp: true },
        }),
      ]);

    // Inside a $transaction tuple TS widens groupBy's `_count` payload to a
    // loose union, so narrow it explicitly before reading `_all`.
    const countAll = (c: true | { _all?: number } | null | undefined): number =>
      typeof c === 'object' && c !== null ? (c._all ?? 0) : 0;

    return {
      total,
      latestTimestamp: latest?.timestamp ?? null,
      outcomes: byOutcome
        .map((o) => ({ outcome: o.outcome, count: countAll(o._count) }))
        .sort((a, b) => b.count - a.count),
      agents: byAgent
        .map((a) => ({ agent: a.agent as string, count: countAll(a._count) }))
        .sort((a, b) => b.count - a.count),
      regions: regions
        .map((r) => ({ region: r.region, count: countAll(r._count) }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
