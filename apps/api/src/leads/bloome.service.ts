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
import type {
  BookBloomeLeadDto,
  BulkAllocateBloomeDto,
  RedistributeBloomeDto,
  UpdateBloomeLeadDto,
} from './dto';

export interface BloomeListQuery {
  region?: string;
  q?: string;
  // Multi-select facets. Each may carry several values; `outcome` accepts the
  // special "none" sentinel to match rows with a blank outcome.
  outcome?: string | string[];
  agent?: string | string[];
  // `dials` carries integer values; `company` accepts "Astra" | "DCsolar"
  // ("Astra" also matches rows with no company set, the default).
  dials?: string | string[];
  company?: string | string[];
  // 'dials_desc' surfaces the highest-dial rows first (used by Redistribute).
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** Normalise a query param that may arrive as a single value or a list. */
function toList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : v.split(',');
  return arr.map((s) => s.trim()).filter(Boolean);
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
    const and: Prisma.BloomeLeadWhereInput[] = [];
    if (query.region) where.region = query.region;

    const agents = toList(query.agent);
    if (agents.length === 1) {
      where.agent = { equals: agents[0], mode: 'insensitive' };
    } else if (agents.length > 1) {
      and.push({
        OR: agents.map((a) => ({
          agent: { equals: a, mode: 'insensitive' as const },
        })),
      });
    }

    const outcomes = toList(query.outcome);
    if (outcomes.length > 0) {
      const concrete = outcomes.filter((o) => o !== 'none');
      const wantsNone = outcomes.includes('none');
      const or: Prisma.BloomeLeadWhereInput[] = [];
      if (concrete.length) or.push({ outcome: { in: concrete } });
      if (wantsNone) or.push({ outcome: null });
      and.push(or.length === 1 ? or[0] : { OR: or });
    }

    const dials = toList(query.dials)
      .map((d) => Number.parseInt(d, 10))
      .filter((n) => Number.isFinite(n));
    if (dials.length) and.push({ dials: { in: dials } });

    const companies = toList(query.company);
    if (companies.length) {
      // NOTE: the `company` column is new; the `as unknown as ...` casts can be
      // dropped once the Prisma client is regenerated (`prisma generate`).
      const or: Prisma.BloomeLeadWhereInput[] = [];
      const concrete = companies.filter((c) => c !== 'Astra');
      if (concrete.length)
        or.push({ company: { in: concrete } } as unknown as Prisma.BloomeLeadWhereInput);
      // "Astra" is the default, so it also matches rows with no company set.
      if (companies.includes('Astra'))
        or.push(
          { company: 'Astra' } as unknown as Prisma.BloomeLeadWhereInput,
          { company: null } as unknown as Prisma.BloomeLeadWhereInput,
        );
      if (or.length) and.push(or.length === 1 ? or[0] : { OR: or });
    }

    if (and.length) where.AND = and;

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

  /** Default newest-first ordering; `dials_desc` surfaces high-dial rows. */
  private orderBy(
    sort?: string,
  ): Prisma.BloomeLeadOrderByWithRelationInput[] {
    if (sort === 'dials_desc')
      return [
        { dials: 'desc' },
        { timestamp: { sort: 'desc', nulls: 'last' } },
        { rowNum: 'desc' },
      ];
    return [{ timestamp: { sort: 'desc', nulls: 'last' } }, { rowNum: 'desc' }];
  }

  async list(query: BloomeListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(250, Math.max(1, query.pageSize ?? 50));
    const where = this.buildWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.bloomeLead.count({ where }),
      this.prisma.bloomeLead.findMany({
        where,
        orderBy: this.orderBy(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, rows };
  }

  /** Map a bulk-action filter payload onto the list query shape. */
  private filterToQuery(f: {
    region?: string;
    q?: string;
    outcomes?: string[];
    agents?: string[];
    dials?: string[];
    companies?: string[];
  }): BloomeListQuery {
    return {
      region: f.region,
      q: f.q,
      outcome: f.outcomes,
      agent: f.agents,
      dials: f.dials,
      company: f.companies,
    };
  }

  /**
   * Bulk-allocate `agent` to the first `count` *unallocated* leads matching the
   * current filters, ordered the same way the table renders them. Leads that
   * already have a setter are left untouched.
   */
  async bulkAllocate(user: AuthUser, dto: BulkAllocateBloomeDto) {
    const base = this.buildWhere(this.filterToQuery(dto));
    const unallocated: Prisma.BloomeLeadWhereInput = {
      AND: [base, { OR: [{ agent: null }, { agent: '' }] }],
    };

    const candidates = await this.prisma.bloomeLead.findMany({
      where: unallocated,
      orderBy: this.orderBy(),
      take: dto.count,
      select: { id: true },
    });
    if (candidates.length === 0)
      return { allocated: 0, remaining: 0, agent: dto.agent };

    const ids = candidates.map((c) => c.id);
    await this.prisma.bloomeLead.updateMany({
      where: { id: { in: ids } },
      data: { agent: dto.agent },
    });
    const remaining = await this.prisma.bloomeLead.count({ where: unallocated });

    await this.audit.record({
      userId: user.id,
      action: 'BLOOME_BULK_ALLOCATE',
      entity: 'BloomeLead',
      entityId: ids.join(','),
      metadata: { agent: dto.agent, allocated: ids.length, region: dto.region },
    });

    return { allocated: ids.length, remaining, agent: dto.agent };
  }

  /**
   * Redistribute the top `count` "No Answer" leads (highest dials first)
   * matching the current filters to `agent`, overwriting whoever is currently
   * assigned. Rows already on `agent` are skipped (no-op).
   */
  async redistribute(user: AuthUser, dto: RedistributeBloomeDto) {
    // Force the outcome to "No Answer" regardless of the inbound facet.
    const base = this.buildWhere({
      ...this.filterToQuery(dto),
      outcome: ['No Answer'],
    });
    const where: Prisma.BloomeLeadWhereInput = {
      AND: [
        base,
        { NOT: { agent: { equals: dto.agent, mode: 'insensitive' } } },
      ],
    };

    const candidates = await this.prisma.bloomeLead.findMany({
      where,
      orderBy: this.orderBy('dials_desc'),
      take: dto.count,
      select: { id: true },
    });
    if (candidates.length === 0)
      return { redistributed: 0, remaining: 0, agent: dto.agent };

    const ids = candidates.map((c) => c.id);
    await this.prisma.bloomeLead.updateMany({
      where: { id: { in: ids } },
      data: { agent: dto.agent },
    });
    const remaining = await this.prisma.bloomeLead.count({ where });

    await this.audit.record({
      userId: user.id,
      action: 'BLOOME_REDISTRIBUTE',
      entity: 'BloomeLead',
      entityId: ids.join(','),
      metadata: {
        agent: dto.agent,
        redistributed: ids.length,
        region: dto.region,
      },
    });

    return { redistributed: ids.length, remaining, agent: dto.agent };
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
    const EDITABLE_FIELDS = [
      'firstName', 'lastName', 'mobile', 'email', 'address', 'postcode',
      'suburb', 'billSpend', 'code', 'agent', 'dials', 'outcome', 'company',
      'notes', 'lastCalled', 'appDate', 'appTime', 'existingSystem',
    ] as const;
    // Read through a record view so the new `company` column resolves before
    // the Prisma client is regenerated.
    const existingRec = existing as unknown as Record<string, Editable>;
    for (const field of EDITABLE_FIELDS) {
      const incoming = dto[field];
      if (incoming === undefined) continue;
      const next: Editable = field === 'dials' ? (incoming as number) : (incoming || null);
      if (existingRec[field] === next) continue;
      (data as Record<string, unknown>)[field] = next;
      changes[field] = { from: existingRec[field], to: next };
    }

    if (Object.keys(changes).length === 0) return existing;

    // A fresh dial attempt also stamps Last Called (sheet keeps free text),
    // unless the caller edited Last Called explicitly in the same payload.
    if (changes.dials && dto.lastCalled === undefined) {
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

    const [total, byOutcome, byAgent, byDials, regions, latest] =
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
          by: ['dials'],
          where,
          orderBy: { dials: 'asc' },
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

    // Company facet — counts assigned companies, treating a blank/unset company
    // as the default "Astra". Run outside the typed tuple with a localised cast
    // because the `company` column is new; drop the cast after `prisma generate`.
    const groupByCompany = this.prisma.bloomeLead.groupBy as unknown as (
      args: unknown,
    ) => Promise<{ company: string | null; _count: { _all: number } | null }[]>;
    const byCompany = await groupByCompany({
      by: ['company'],
      where,
      orderBy: { company: 'asc' },
      _count: { _all: true },
    });

    // Inside a $transaction tuple TS widens groupBy's `_count` payload to a
    // loose union, so narrow it explicitly before reading `_all`.
    const countAll = (c: true | { _all?: number } | null | undefined): number =>
      typeof c === 'object' && c !== null ? (c._all ?? 0) : 0;

    // Fold blank/unset company counts into "Astra" (the default).
    const companyCounts = new Map<string, number>();
    for (const c of byCompany) {
      const key = (c.company || 'Astra').trim() || 'Astra';
      companyCounts.set(key, (companyCounts.get(key) ?? 0) + countAll(c._count));
    }

    return {
      total,
      latestTimestamp: latest?.timestamp ?? null,
      outcomes: byOutcome
        .map((o) => ({ outcome: o.outcome, count: countAll(o._count) }))
        .sort((a, b) => b.count - a.count),
      agents: byAgent
        .map((a) => ({ agent: a.agent as string, count: countAll(a._count) }))
        .sort((a, b) => b.count - a.count),
      dials: byDials
        .map((d) => ({ dials: d.dials, count: countAll(d._count) }))
        .sort((a, b) => a.dials - b.dials),
      companies: Array.from(companyCounts.entries())
        .map(([company, count]) => ({ company, count }))
        .sort((a, b) => b.count - a.count),
      regions: regions
        .map((r) => ({ region: r.region, count: countAll(r._count) }))
        .sort((a, b) => b.count - a.count),
    };
  }
}
