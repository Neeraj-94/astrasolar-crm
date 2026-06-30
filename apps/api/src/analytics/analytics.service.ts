import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { LeadStage, SaleStatus } from '@astra/shared';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';

export interface DashboardFilters {
  userId?: string;
  from?: string;
  to?: string;
}

/**
 * Analytics computed over the SAME scoped data the user can see. Every figure
 * is filtered through getVisibilityScope() — a manager sees their branch, a
 * consultant only themselves. The optional scope-selector userId is re-validated
 * server-side (intersected with scope, never broadening it).
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  /** Records a DASHBOARD_VIEW audit when viewing another user's data. */
  async auditScopeView(user: AuthUser, viewedUserId?: string) {
    if (viewedUserId && viewedUserId !== user.id) {
      await this.audit.record({
        userId: user.id,
        action: 'DASHBOARD_VIEW',
        entity: 'User',
        entityId: viewedUserId,
        metadata: { viewedBy: user.id },
      });
    }
  }

  async summary(user: AuthUser, filters: DashboardFilters) {
    await this.auditScopeView(user, filters.userId);

    const leadWhere = await this.scope.leadWhere(user, filters.userId);
    const saleWhere = await this.scope.saleWhere(user, filters.userId);
    this.applyDateRange(leadWhere, filters, 'timestamp');
    this.applyDateRange(saleWhere, filters, 'saleDate');

    const [leads, sales, byStageRows, bySourceRows, pipeline] =
      await Promise.all([
        this.prisma.lead.count({ where: leadWhere }),
        this.prisma.sale.count({ where: saleWhere }),
        this.prisma.lead.groupBy({
          by: ['stage'],
          where: leadWhere,
          _count: { _all: true },
        }),
        this.prisma.lead.groupBy({
          by: ['source'],
          where: leadWhere,
          _count: { _all: true },
        }),
        this.prisma.sale.aggregate({
          where: saleWhere,
          _sum: { soldPrice: true },
        }),
      ]);

    const converted =
      byStageRows.find((r) => r.stage === LeadStage.CONVERTED)?._count._all ?? 0;
    const completed = await this.prisma.sale.count({
      where: { ...saleWhere, status: SaleStatus.COMPLETED },
    });

    return {
      totalLeads: leads,
      totalSales: sales,
      conversionRate: leads > 0 ? converted / leads : 0,
      pipelineValue: Number(pipeline._sum.soldPrice ?? 0),
      byStage: this.toRecord(byStageRows, 'stage'),
      bySource: this.toRecord(bySourceRows, 'source'),
      winRate: sales > 0 ? completed / sales : 0,
    };
  }

  /** Lead funnel by stage + disposition for the conversion view. */
  async leadFunnel(user: AuthUser, filters: DashboardFilters) {
    const where = await this.scope.leadWhere(user, filters.userId);
    this.applyDateRange(where, filters, 'timestamp');
    const [byStage, byDisposition, byOutcome] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['stage'], where, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['disposition'], where, _count: { _all: true } }),
      this.prisma.lead.groupBy({ by: ['outcome'], where, _count: { _all: true } }),
    ]);
    return {
      byStage: this.toRecord(byStage, 'stage'),
      byDisposition: this.toRecord(byDisposition, 'disposition'),
      byOutcome: this.toRecord(byOutcome, 'outcome'),
    };
  }

  /** Install / payment / commissioning funnel from sale status details. */
  async fulfilmentFunnel(user: AuthUser, filters: DashboardFilters) {
    const saleWhere = await this.scope.saleWhere(user, filters.userId);
    const sales = await this.prisma.sale.findMany({
      where: saleWhere,
      select: { statusDetails: true },
    });
    const tally = (pick: (s: any) => string | undefined) => {
      const out: Record<string, number> = {};
      for (const s of sales) {
        const v = pick(s.statusDetails) ?? 'NONE';
        out[v] = (out[v] ?? 0) + 1;
      }
      return out;
    };
    return {
      install: tally((d) => d?.installStatus),
      payment: tally((d) => d?.paymentStatus),
      commissioning: tally((d) => d?.commissioningStatus),
    };
  }

  /** Commission totals grouped by owning consultant (finance view). */
  async commissionSummary(user: AuthUser, filters: DashboardFilters) {
    const where = await this.scope.saleWhere(user, filters.userId);
    const rows = await this.prisma.sale.groupBy({
      by: ['ownerId'],
      where,
      _sum: { totalCommission: true, soldPrice: true },
      _count: { _all: true },
    });
    const owners = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.ownerId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(owners.map((o) => [o.id, o.name]));
    return rows.map((r) => ({
      ownerId: r.ownerId,
      ownerName: nameOf.get(r.ownerId) ?? null,
      sales: r._count._all,
      totalSold: Number(r._sum.soldPrice ?? 0),
      totalCommission: Number(r._sum.totalCommission ?? 0),
    }));
  }

  /**
   * Commission Payout Report (ported from v1 "Commission Payout Report").
   * Per-sale commission rows for COMPLETED sales, scoped + filtered by date
   * range (on saleDate) and optional consultant. Powers the finance
   * Commissions tab's detail table, per-consultant summary cards and CSV
   * export. Finance-sensitive — controller gates it to finance:read:all.
   */
  async commissionPayout(user: AuthUser, filters: DashboardFilters) {
    await this.auditScopeView(user, filters.userId);
    const where = await this.scope.saleWhere(user, filters.userId);
    this.applyDateRange(where, filters, 'saleDate');
    where.status = SaleStatus.COMPLETED;

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        lead: { select: { firstName: true, surName: true } },
        statusDetails: {
          select: { paymentStatus: true, installStatus: true },
        },
      },
      orderBy: { saleDate: 'desc' },
    });

    const paidStatusOf = (stage?: string): 'Paid' | 'Ready' | 'Pending' => {
      if (stage === 'COMPLETED') return 'Paid';
      if (stage === 'IN_PROGRESS') return 'Ready';
      return 'Pending';
    };

    const rows = sales.map((s) => ({
      saleId: s.id,
      saleRef: s.saleRef,
      customerName: `${s.lead?.firstName ?? ''} ${s.lead?.surName ?? ''}`.trim(),
      consultantId: s.owner?.id ?? null,
      consultantName: s.owner?.name ?? null,
      company: s.company,
      product: s.saleType,
      soldPrice: Number(s.soldPrice ?? 0),
      commission: Number(s.totalCommission ?? 0),
      saleDate: s.saleDate ? s.saleDate.toISOString().slice(0, 10) : null,
      paidStatus: paidStatusOf(s.statusDetails?.paymentStatus),
    }));

    const totalCommission = rows.reduce((a, r) => a + r.commission, 0);
    const totalSold = rows.reduce((a, r) => a + r.soldPrice, 0);

    const byConsultant = new Map<
      string,
      { consultantName: string; count: number; commission: number }
    >();
    for (const r of rows) {
      const name = r.consultantName ?? 'Unknown';
      const c = byConsultant.get(name) ?? {
        consultantName: name,
        count: 0,
        commission: 0,
      };
      c.count += 1;
      c.commission += r.commission;
      byConsultant.set(name, c);
    }

    return {
      rows,
      totals: { count: rows.length, totalCommission, totalSold },
      byConsultant: [...byConsultant.values()].sort((a, b) =>
        a.consultantName.localeCompare(b.consultantName),
      ),
    };
  }

  // ==========================================================================
  //  CEO dashboard — Revenue, Growth, Operations
  //  All computed over the SAME scoped rows. Revenue is money-sensitive
  //  (controller gates it to finance:read:all); growth/operations use the
  //  viewer's record scope.
  // ==========================================================================

  /** Revenue tab: monthly series + by company, with headline totals. */
  async revenue(user: AuthUser, filters: DashboardFilters) {
    await this.auditScopeView(user, filters.userId);
    const where = await this.scope.saleWhere(user, filters.userId);
    this.applyDateRange(where, filters, 'saleDate');

    const sales = await this.prisma.sale.findMany({
      where,
      select: {
        soldPrice: true,
        totalCommission: true,
        totalRRP: true,
        difference: true,
        totalProfit: true,
        company: true,
        status: true,
        saleDate: true,
      },
    });

    const months = new Map<
      string,
      { revenue: number; commission: number; sales: number }
    >();
    const byCompany = new Map<string, { revenue: number; sales: number }>();
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalRrp = 0;
    let totalProfit = 0;
    let totalDifference = 0;

    for (const s of sales) {
      const revenue = Number(s.soldPrice ?? 0);
      const commission = Number(s.totalCommission ?? 0);
      totalRevenue += revenue;
      totalCommission += commission;
      totalRrp += Number(s.totalRRP ?? 0);
      totalProfit += Number(s.totalProfit ?? 0);
      totalDifference += Number(s.difference ?? 0);

      const key = s.saleDate ? this.monthKey(s.saleDate) : 'unknown';
      const m = months.get(key) ?? { revenue: 0, commission: 0, sales: 0 };
      m.revenue += revenue;
      m.commission += commission;
      m.sales += 1;
      months.set(key, m);

      const c = byCompany.get(s.company) ?? { revenue: 0, sales: 0 };
      c.revenue += revenue;
      c.sales += 1;
      byCompany.set(s.company, c);
    }

    const series = [...months.entries()]
      .filter(([k]) => k !== 'unknown')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return {
      totalRevenue,
      totalCommission,
      totalRrp,
      totalProfit,
      totalDifference,
      totalSales: sales.length,
      avgSaleValue: sales.length ? totalRevenue / sales.length : 0,
      grossMargin: totalRevenue > 0 ? (totalRevenue - totalCommission) / totalRevenue : 0,
      series,
      byCompany: [...byCompany.entries()].map(([company, v]) => ({
        company,
        ...v,
      })),
    };
  }

  /** Growth tab: monthly leads vs sales, conversion + MoM growth trend. */
  async growth(user: AuthUser, filters: DashboardFilters) {
    await this.auditScopeView(user, filters.userId);
    const leadWhere = await this.scope.leadWhere(user, filters.userId);
    const saleWhere = await this.scope.saleWhere(user, filters.userId);
    this.applyDateRange(leadWhere, filters, 'timestamp');
    this.applyDateRange(saleWhere, filters, 'saleDate');

    const [leads, sales] = await Promise.all([
      this.prisma.lead.findMany({ where: leadWhere, select: { timestamp: true } }),
      this.prisma.sale.findMany({
        where: saleWhere,
        select: { saleDate: true, soldPrice: true },
      }),
    ]);

    const buckets = new Map<
      string,
      { leads: number; sales: number; revenue: number }
    >();
    const bump = (
      d: Date | null,
      apply: (b: { leads: number; sales: number; revenue: number }) => void,
    ) => {
      if (!d) return;
      const key = this.monthKey(d);
      const b = buckets.get(key) ?? { leads: 0, sales: 0, revenue: 0 };
      apply(b);
      buckets.set(key, b);
    };
    for (const l of leads) bump(l.timestamp, (b) => (b.leads += 1));
    for (const s of sales)
      bump(s.saleDate, (b) => {
        b.sales += 1;
        b.revenue += Number(s.soldPrice ?? 0);
      });

    const series = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v], i, arr) => {
        const prev = i > 0 ? arr[i - 1][1] : null;
        const revGrowth =
          prev && prev.revenue > 0
            ? (v.revenue - prev.revenue) / prev.revenue
            : null;
        return {
          month,
          leads: v.leads,
          sales: v.sales,
          revenue: v.revenue,
          conversion: v.leads > 0 ? v.sales / v.leads : 0,
          revenueGrowth: revGrowth,
        };
      });

    const totalLeads = leads.length;
    const totalSales = sales.length;
    return {
      totalLeads,
      totalSales,
      conversionRate: totalLeads > 0 ? totalSales / totalLeads : 0,
      series,
    };
  }

  /** Operations tab: fulfilment pipeline health from installs + stage status. */
  async operations(user: AuthUser, filters: DashboardFilters) {
    await this.auditScopeView(user, filters.userId);
    const saleWhere = await this.scope.saleWhere(user, filters.userId);
    const installWhere = await this.scope.installationWhere(
      user,
      filters.userId,
    );

    const [byStatus, byInstall, sales] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['status'],
        where: saleWhere,
        _count: { _all: true },
      }),
      this.prisma.installation.groupBy({
        by: ['status'],
        where: installWhere,
        _count: { _all: true },
      }),
      this.prisma.sale.findMany({
        where: saleWhere,
        select: { statusDetails: true },
      }),
    ]);

    // Tally each of the 7 independent stage fields -> completion ratio.
    const stageFields = [
      'financeStatus',
      'preapprovalStatus',
      'meterChangeStatus',
      'installStatus',
      'paymentStatus',
      'commissioningStatus',
      'cesStatus',
    ] as const;
    const stages = stageFields.map((field) => {
      const counts: Record<string, number> = {};
      for (const s of sales) {
        const v = (s.statusDetails as any)?.[field] ?? 'PENDING';
        counts[v] = (counts[v] ?? 0) + 1;
      }
      const completed = counts['COMPLETED'] ?? 0;
      const relevant =
        sales.length - (counts['NOT_REQUIRED'] ?? 0);
      return {
        stage: field.replace(/Status$/, ''),
        counts,
        completionRate: relevant > 0 ? completed / relevant : 0,
      };
    });

    return {
      saleStatus: this.toRecord(byStatus, 'status'),
      installStatus: this.toRecord(byInstall, 'status'),
      stages,
    };
  }

  // ==========================================================================
  //  Sales Manager dashboard — Performance & Approvals
  // ==========================================================================

  /** Per-consultant performance leaderboard over the scoped sales. */
  async salesPerformance(user: AuthUser, userId?: string) {
    await this.auditScopeView(user, userId);
    const where = await this.scope.saleWhere(user, userId);

    const [grouped, completed] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['ownerId'],
        where,
        _sum: { soldPrice: true, totalCommission: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['ownerId'],
        where: { ...where, status: SaleStatus.COMPLETED },
        _count: { _all: true },
      }),
    ]);

    const owners = await this.prisma.user.findMany({
      where: { id: { in: grouped.map((g) => g.ownerId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(owners.map((o) => [o.id, o.name]));
    const completedOf = new Map(
      completed.map((c) => [c.ownerId, c._count._all]),
    );

    const rows = grouped
      .map((g) => {
        const sales = g._count._all;
        const totalSold = Number(g._sum.soldPrice ?? 0);
        const done = completedOf.get(g.ownerId) ?? 0;
        return {
          ownerId: g.ownerId,
          ownerName: nameOf.get(g.ownerId) ?? 'Unknown',
          sales,
          completed: done,
          totalSold,
          totalCommission: Number(g._sum.totalCommission ?? 0),
          avgSaleValue: sales > 0 ? totalSold / sales : 0,
          completionRate: sales > 0 ? done / sales : 0,
        };
      })
      .sort((a, b) => b.totalSold - a.totalSold);

    const totals = rows.reduce(
      (acc, r) => {
        acc.sales += r.sales;
        acc.totalSold += r.totalSold;
        acc.totalCommission += r.totalCommission;
        return acc;
      },
      { sales: 0, totalSold: 0, totalCommission: 0 },
    );

    return { rows, totals, consultants: rows.length };
  }

  /** Sales awaiting manager sign-off (still in NEGOTIATION), with discount. */
  async approvalsQueue(user: AuthUser, userId?: string) {
    const where = await this.scope.saleWhere(user, userId);
    const sales = await this.prisma.sale.findMany({
      where: { ...where, status: SaleStatus.NEGOTIATION },
      include: {
        owner: { select: { id: true, name: true } },
        lead: { select: { firstName: true, surName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sales.map((s) => {
      const sold = Number(s.soldPrice ?? 0);
      const rrp = Number(s.totalRRP ?? 0);
      const discount = rrp > 0 ? rrp - sold : 0;
      return {
        saleId: s.id,
        saleRef: s.saleRef,
        customerName: `${s.lead?.firstName ?? ''} ${s.lead?.surName ?? ''}`.trim(),
        consultantName: s.owner?.name ?? null,
        company: s.company,
        soldPrice: sold,
        totalRRP: rrp,
        discount,
        discountPct: rrp > 0 ? discount / rrp : 0,
        saleDate: s.saleDate ? s.saleDate.toISOString().slice(0, 10) : null,
        createdAt: s.createdAt,
      };
    });
  }

  /**
   * Manager decision on a pending sale: APPROVE -> CONTRACT, HOLD -> ON_HOLD,
   * REJECT -> CANCELLED. Writes SaleStageHistory + an audit row. Scope-checked
   * (the sale must be within the manager's visibility).
   */
  async decideApproval(
    user: AuthUser,
    saleId: string,
    decision: 'APPROVE' | 'HOLD' | 'REJECT',
    note?: string,
  ) {
    const where = await this.scope.saleWhere(user);
    const sale = await this.prisma.sale.findFirst({
      where: { ...where, id: saleId },
    });
    if (!sale) {
      throw new ForbiddenException('Sale not found or outside your scope');
    }

    const next: Record<string, SaleStatus> = {
      APPROVE: SaleStatus.CONTRACT,
      HOLD: SaleStatus.ON_HOLD,
      REJECT: SaleStatus.CANCELLED,
    };
    const toStatus = next[decision];
    if (!toStatus) throw new BadRequestException('invalid decision');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id: saleId },
        data: {
          status: toStatus,
          closedAt:
            toStatus === SaleStatus.CANCELLED ? new Date() : sale.closedAt,
        },
      });
      await tx.saleStageHistory.create({
        data: {
          saleId,
          fromStage: sale.status,
          toStage: toStatus,
          changedBy: user.id,
        },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'SALE_APPROVAL_DECISION',
          entity: 'Sale',
          entityId: saleId,
          metadata: { decision, toStatus, note: note ?? null },
        },
        tx,
      );
      return updated;
    });
  }

  // ---- helpers ----

  /** ISO month bucket key, e.g. "2026-06". */
  private monthKey(d: Date): string {
    return new Date(d).toISOString().slice(0, 7);
  }

  private applyDateRange(
    where: Record<string, any>,
    filters: DashboardFilters,
    field: string,
  ) {
    if (!filters.from && !filters.to) return;
    where[field] = {};
    if (filters.from) where[field].gte = new Date(filters.from);
    if (filters.to) where[field].lte = new Date(filters.to);
  }

  private toRecord<T extends Record<string, any>>(
    rows: T[],
    key: keyof T,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of rows) {
      out[String(r[key] ?? 'UNKNOWN')] = r._count._all;
    }
    return out;
  }
}
