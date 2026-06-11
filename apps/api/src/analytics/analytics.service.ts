import { Injectable } from '@nestjs/common';
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
    this.applyDateRange(leadWhere, filters, 'leadDate');
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
    this.applyDateRange(where, filters, 'leadDate');
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

  // ---- helpers ----

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
