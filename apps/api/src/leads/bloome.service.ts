import { Injectable } from '@nestjs/common';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
