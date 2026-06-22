import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LeadSource, SaleStatus } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';
import {
  baselineCostFor,
  BLOOME_COST_LABELS,
  BLOOME_LEAD_COST,
  stateBucket,
} from './financials.constants';

// ----------------------------------------------------------------------------
// Financials dashboard — port of the v1 CEO "Financials" widget family.
//
// Differences from v1 (Firebase) by design:
//   - Per-sale profit comes from the catalogue products referenced by the
//     sale's SystemDetails / SaleExtras snapshots (Product.profit), not from
//     the v1 in-memory product table lookups.
//   - "Bloome leads" = Lead rows with source BLOOM_ASTRA (the Bloome sheet
//     import), bucketed ACT/NSW vs TAS by the lead's state.
//   - The v1 team-lead override deduction is not modelled in v2 yet.
// ----------------------------------------------------------------------------

export type WeeklySalesRange =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'last_30'
  | 'last_90'
  | 'all_time';

export interface BreakdownRow {
  saleId: string;
  date: string | null;
  consultant: string;
  product: string;
  solarProfit: number;
  batteryProfit: number;
  extrasProfit: number;
  totalProfit: number;
  revenue: number;
  state: 'ACT' | 'TAS';
  leadSource: string;
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class FinancialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Week helpers (all date-only, ISO YYYY-MM-DD)
  // -------------------------------------------------------------------------

  private mondayOf(d: Date): string {
    const day = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    const mon = new Date(d);
    mon.setUTCDate(mon.getUTCDate() - day);
    return mon.toISOString().slice(0, 10);
  }

  private addDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private assertWeek(week?: string): string {
    if (!week || !WEEK_RE.test(week)) {
      throw new BadRequestException('week must be a Monday in YYYY-MM-DD form');
    }
    return this.mondayOf(new Date(`${week}T00:00:00Z`));
  }

  // -------------------------------------------------------------------------
  // Week list for the selector — every week from the first sale to today.
  // -------------------------------------------------------------------------

  async weeks(user: AuthUser) {
    const where = await this.scope.saleWhere(user);
    const first = await this.prisma.sale.findFirst({
      where: { ...where, saleDate: { not: null } },
      orderBy: { saleDate: 'asc' },
      select: { saleDate: true },
    });
    const current = this.mondayOf(new Date());
    const weeks: string[] = [];
    let wk = first?.saleDate ? this.mondayOf(first.saleDate) : current;
    while (wk <= current) {
      weeks.push(wk);
      wk = this.addDays(wk, 7);
    }
    return { weeks: weeks.reverse(), current };
  }

  // -------------------------------------------------------------------------
  // Core: per-sale profit rows for a date window
  // -------------------------------------------------------------------------

  private async salesWithProfit(
    user: AuthUser,
    from: string,
    to: string | null,
  ): Promise<BreakdownRow[]> {
    const where = await this.scope.saleWhere(user);
    const sales = await this.prisma.sale.findMany({
      where: {
        ...where,
        status: { not: SaleStatus.CANCELLED },
        ...(to
          ? { saleDate: { gte: new Date(from), lte: new Date(to) } }
          : {}),
      },
      include: {
        owner: { select: { name: true } },
        lead: { select: { source: true, firstName: true, surName: true, state: true } },
        systemDetails: true,
        extras: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    return sales.map((s) => {
      const sd = s.systemDetails;
      const hasSolar = Number(sd?.systemSize ?? 0) > 0;
      const hasBattery = !!sd?.batteryModel;

      // Profit = POS profit snapshots copied onto the sale at sale time.
      const solarProfit = Number(sd?.solarProfit ?? 0);
      const batteryProfit = Number(sd?.batteryProfit ?? 0);
      const extrasProfit = s.extras.reduce(
        (a, e) => a + Number(e.profit ?? 0),
        0,
      );

      const productParts: string[] = [];
      if (hasSolar) productParts.push(`${Number(sd?.systemSize)}kW Solar`);
      if (hasBattery) productParts.push('Battery');
      for (const e of s.extras) {
        productParts.push(e.itemName);
      }

      return {
        saleId: s.id,
        date: s.saleDate ? s.saleDate.toISOString().slice(0, 10) : null,
        consultant: s.owner?.name ?? s.ownerId,
        product: productParts.join(' + ') || 'Solar System',
        solarProfit,
        batteryProfit,
        extrasProfit,
        totalProfit: solarProfit + batteryProfit + extrasProfit,
        revenue: Number(s.soldPrice ?? 0),
        state: stateBucket(s.lead?.state),
        leadSource: s.lead?.source ?? '',
      };
    });
  }

  /** Bloome lead counts for a week, bucketed ACT (incl. NSW) vs TAS. */
  private async bloomeLeadCounts(from: string, to: string) {
    const leads = await this.prisma.lead.findMany({
      where: {
        source: LeadSource.BLOOM_ASTRA,
        timestamp: { gte: new Date(from), lte: new Date(to) },
      },
      select: { state: true },
    });
    const counts = { ACT: 0, TAS: 0 };
    for (const l of leads) counts[stateBucket(l.state)]++;
    return counts;
  }

  // -------------------------------------------------------------------------
  // GET /dashboards/financials?week=YYYY-MM-DD
  // -------------------------------------------------------------------------

  async weekly(user: AuthUser, weekParam?: string) {
    const week = this.assertWeek(weekParam ?? this.mondayOf(new Date()));
    const weekEnd = this.addDays(week, 6);

    const [breakdown, costs, bloomeLeads] = await Promise.all([
      this.salesWithProfit(user, week, weekEnd),
      this.prisma.operatingCost.findMany({
        where: { weekStart: new Date(week) },
        orderBy: { createdAt: 'asc' },
      }),
      this.bloomeLeadCounts(week, weekEnd),
    ]);

    const grossProfit = breakdown.reduce((a, r) => a + r.totalProfit, 0);
    const totalRevenue = breakdown.reduce((a, r) => a + r.revenue, 0);

    // Fixed = baseline + manual extras (excluding 'bloome' labelled entries).
    const baselineCost = baselineCostFor(week);
    let extraFixedCosts = 0;
    const operatingCosts = costs.map((c) => {
      const isBloome = BLOOME_COST_LABELS.has(c.label.trim().toLowerCase());
      if (!isBloome) extraFixedCosts += Number(c.amount);
      return {
        id: c.id,
        label: c.label,
        amount: Number(c.amount),
        isBloome,
        createdAt: c.createdAt,
      };
    });
    const fixedCosts = baselineCost + extraFixedCosts;

    // Variable = Bloome lead count × per-lead cost, per region.
    const leadSpend = {
      ACT: bloomeLeads.ACT * BLOOME_LEAD_COST.ACT,
      TAS: bloomeLeads.TAS * BLOOME_LEAD_COST.TAS,
    };
    const variableLeadCosts = leadSpend.ACT + leadSpend.TAS;

    // P&L by state (ACT bucket includes NSW — v1 parity).
    const statePnl = (['ACT', 'TAS'] as const).map((bucket) => {
      const rows = breakdown.filter((r) => r.state === bucket);
      const profit = rows.reduce((a, r) => a + r.totalProfit, 0);
      const bloomeSales = rows.filter((r) =>
        r.leadSource.toLowerCase().includes('sheet'),
      ).length;
      return {
        state: bucket,
        sales: rows.length,
        revenue: rows.reduce((a, r) => a + r.revenue, 0),
        grossProfit: profit,
        bloomeSales,
        bloomeLeads: bloomeLeads[bucket],
        leadSpend: leadSpend[bucket],
        netProfit: profit - leadSpend[bucket],
      };
    });

    return {
      week,
      weekEnd,
      summary: {
        grossProfit,
        baselineCost,
        extraFixedCosts,
        fixedCosts,
        variableLeadCosts,
        netProfit: grossProfit - fixedCosts - variableLeadCosts,
        totalSales: breakdown.length,
        totalRevenue,
      },
      breakdown,
      operatingCosts,
      statePnl,
    };
  }

  // -------------------------------------------------------------------------
  // GET /dashboards/financials/yearly?year=2026
  // -------------------------------------------------------------------------

  async yearly(user: AuthUser, yearParam?: string) {
    const year = Number(yearParam ?? new Date().getUTCFullYear());
    if (!Number.isInteger(year) || year < 2020 || year > 2100) {
      throw new BadRequestException('invalid year');
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const firstMonday = this.mondayOf(new Date(`${yearStart}T00:00:00Z`));
    const lastWeek = this.mondayOf(new Date());

    const [rows, costs] = await Promise.all([
      this.salesWithProfit(user, yearStart, yearEnd),
      this.prisma.operatingCost.findMany({
        where: {
          weekStart: { gte: new Date(firstMonday), lte: new Date(yearEnd) },
        },
      }),
    ]);

    // Bloome lead counts for the whole year, grouped by week + region.
    const leads = await this.prisma.lead.findMany({
      where: {
        source: LeadSource.BLOOM_ASTRA,
        timestamp: { gte: new Date(yearStart), lte: new Date(yearEnd) },
      },
      select: { timestamp: true, state: true },
    });

    type WeekAgg = {
      sales: number;
      revenue: number;
      grossProfit: number;
      extraFixed: number;
      bloomeLeads: number;
      leadSpend: number;
    };
    const byWeek = new Map<string, WeekAgg>();
    const agg = (wk: string): WeekAgg => {
      let a = byWeek.get(wk);
      if (!a) {
        a = {
          sales: 0,
          revenue: 0,
          grossProfit: 0,
          extraFixed: 0,
          bloomeLeads: 0,
          leadSpend: 0,
        };
        byWeek.set(wk, a);
      }
      return a;
    };

    for (const r of rows) {
      if (!r.date) continue;
      const a = agg(this.mondayOf(new Date(`${r.date}T00:00:00Z`)));
      a.sales++;
      a.revenue += r.revenue;
      a.grossProfit += r.totalProfit;
    }
    for (const c of costs) {
      if (BLOOME_COST_LABELS.has(c.label.trim().toLowerCase())) continue;
      agg(c.weekStart.toISOString().slice(0, 10)).extraFixed += Number(
        c.amount,
      );
    }
    for (const l of leads) {
      const wk = this.mondayOf(l.timestamp);
      const bucket = stateBucket(l.state);
      const a = agg(wk);
      a.bloomeLeads++;
      a.leadSpend += BLOOME_LEAD_COST[bucket];
    }

    const weekKeys = [...byWeek.keys()]
      .filter((wk) => wk <= lastWeek)
      .sort()
      .reverse();
    const result = weekKeys.map((wk) => {
      const a = byWeek.get(wk)!;
      const fixedCosts = baselineCostFor(wk) + a.extraFixed;
      return {
        week: wk,
        sales: a.sales,
        revenue: a.revenue,
        grossProfit: a.grossProfit,
        fixedCosts,
        bloomeLeads: a.bloomeLeads,
        leadSpend: a.leadSpend,
        netProfit: a.grossProfit - fixedCosts - a.leadSpend,
      };
    });

    const totals = result.reduce(
      (t, r) => ({
        sales: t.sales + r.sales,
        revenue: t.revenue + r.revenue,
        grossProfit: t.grossProfit + r.grossProfit,
        fixedCosts: t.fixedCosts + r.fixedCosts,
        bloomeLeads: t.bloomeLeads + r.bloomeLeads,
        leadSpend: t.leadSpend + r.leadSpend,
        netProfit: t.netProfit + r.netProfit,
      }),
      {
        sales: 0,
        revenue: 0,
        grossProfit: 0,
        fixedCosts: 0,
        bloomeLeads: 0,
        leadSpend: 0,
        netProfit: 0,
      },
    );

    return { year, rows: result, totals };
  }

  // -------------------------------------------------------------------------
  // GET /dashboards/financials/weekly-sales?range=…
  // -------------------------------------------------------------------------

  async weeklySales(user: AuthUser, range: WeeklySalesRange) {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    const thisMonday = this.mondayOf(today);

    let from: string | null = null;
    let to: string | null = null;
    switch (range) {
      case 'this_week':
        from = thisMonday;
        to = this.addDays(thisMonday, 6);
        break;
      case 'last_week':
        from = this.addDays(thisMonday, -7);
        to = this.addDays(thisMonday, -1);
        break;
      case 'this_month':
        from = todayIso.slice(0, 8) + '01';
        to = todayIso;
        break;
      case 'last_month': {
        const d = new Date(today);
        d.setUTCDate(1);
        d.setUTCDate(0); // last day of previous month
        to = d.toISOString().slice(0, 10);
        from = to.slice(0, 8) + '01';
        break;
      }
      case 'last_30':
        from = this.addDays(todayIso, -30);
        to = todayIso;
        break;
      case 'last_90':
        from = this.addDays(todayIso, -90);
        to = todayIso;
        break;
      case 'all_time':
        break;
      default:
        throw new BadRequestException('invalid range');
    }

    const where = await this.scope.saleWhere(user);
    const sales = await this.prisma.sale.findMany({
      where: {
        ...where,
        status: { not: SaleStatus.CANCELLED },
        ...(from && to
          ? { saleDate: { gte: new Date(from), lte: new Date(to) } }
          : {}),
      },
      include: {
        owner: { select: { name: true } },
        lead: {
          select: {
            source: true,
            firstName: true,
            surName: true,
            state: true,
            leadGen: { select: { name: true } },
          },
        },
        statusDetails: { select: { financeStatus: true } },
        finance: { select: { id: true } },
      },
      orderBy: [{ saleDate: 'desc' }, { createdAt: 'desc' }],
    });

    const rows = sales.map((s) => {
      const soldPrice = Number(s.soldPrice ?? 0);
      const totalRRP = s.totalRRP == null ? null : Number(s.totalRRP);
      return {
        id: s.id,
        saleRef: s.saleRef,
        date: s.saleDate ? s.saleDate.toISOString().slice(0, 10) : null,
        createdAt: s.createdAt,
        consultant: s.owner?.name ?? s.ownerId,
        leadGen: s.lead?.leadGen?.name ?? null,
        customer: `${s.lead?.firstName ?? ''} ${s.lead?.surName ?? ''}`.trim(),
        state: s.lead?.state ?? '',
        leadSource: s.lead?.source ?? '',
        soldPrice,
        commission: Number(s.totalCommission ?? 0),
        // Oversell/undersell vs the catalogue RRP (v1: soldPrice − totalRRP).
        oversell: totalRRP == null ? null : soldPrice - totalRRP,
        // CASH when the sale has no finance application rows (v1 parity).
        financeMethod: s.finance.length > 0 ? 'FINANCE' : 'CASH',
        financeStatus: s.statusDetails?.financeStatus ?? 'PENDING',
      };
    });

    const totals = {
      count: rows.length,
      soldPrice: rows.reduce((a, r) => a + r.soldPrice, 0),
      commission: rows.reduce((a, r) => a + r.commission, 0),
      oversell: rows.reduce((a, r) => a + (r.oversell ?? 0), 0),
    };

    return { range, from, to, rows, totals };
  }

  // -------------------------------------------------------------------------
  // Operating costs (extra weekly fixed costs)
  // -------------------------------------------------------------------------

  async addOperatingCost(
    user: AuthUser,
    body: { week?: string; label?: string; amount?: number },
  ) {
    const week = this.assertWeek(body.week);
    const label = (body.label ?? '').trim();
    const amount = Number(body.amount);
    if (!label) throw new BadRequestException('label is required');
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    const row = await this.prisma.operatingCost.create({
      data: {
        weekStart: new Date(week),
        label,
        amount,
        createdById: user.id,
      },
    });
    return { ...row, amount: Number(row.amount) };
  }

  async removeOperatingCost(id: string) {
    const row = await this.prisma.operatingCost.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('operating cost not found');
    await this.prisma.operatingCost.delete({ where: { id } });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Pending RRP requests
  // -------------------------------------------------------------------------

  async listRrpRequests(status?: string) {
    const valid = ['PENDING', 'COMPLETED', 'DISMISSED'];
    const st = (status ?? 'PENDING').toUpperCase();
    if (!valid.includes(st)) throw new BadRequestException('invalid status');

    const reqs = await this.prisma.rrpRequest.findMany({
      where: { status: st as any },
      include: {
        sale: {
          select: {
            id: true,
            saleRef: true,
            saleDate: true,
            soldPrice: true,
            owner: { select: { name: true } },
            lead: { select: { firstName: true, surName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reqs.map((r) => ({
      id: r.id,
      saleId: r.saleId,
      saleRef: r.sale.saleRef,
      customerName:
        `${r.sale.lead?.firstName ?? ''} ${r.sale.lead?.surName ?? ''}`.trim(),
      consultantName: r.sale.owner?.name ?? null,
      saleDate: r.sale.saleDate
        ? r.sale.saleDate.toISOString().slice(0, 10)
        : null,
      soldPrice: Number(r.sale.soldPrice ?? 0),
      items: r.items as { type: string; product: string; rrp?: number }[],
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    }));
  }

  /**
   * Complete a request: every item must have an RRP. Stores the priced items
   * and rolls the total into Sale.totalRRP when it isn't set yet (v1 wrote
   * `customRrpTotal` onto the pipeline entry).
   */
  async completeRrpRequest(
    user: AuthUser,
    id: string,
    body: { items?: { type: string; product: string; rrp: number }[] },
  ) {
    const req = await this.prisma.rrpRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('request not found');
    if (req.status !== 'PENDING') {
      throw new BadRequestException('request is not pending');
    }

    const items = body.items ?? [];
    const original = req.items as { type: string; product: string }[];
    if (
      items.length !== original.length ||
      items.some((i) => !Number.isFinite(Number(i.rrp)) || Number(i.rrp) <= 0)
    ) {
      throw new BadRequestException('an RRP is required for every item');
    }

    const totalRrp = items.reduce((a, i) => a + Number(i.rrp), 0);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: req.saleId },
        select: { totalRRP: true },
      });
      if (sale && sale.totalRRP == null) {
        await tx.sale.update({
          where: { id: req.saleId },
          data: { totalRRP: totalRrp },
        });
      }
      return tx.rrpRequest.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          items: items as any,
          completedById: user.id,
          completedAt: new Date(),
        },
      });
    });
  }

  async dismissRrpRequest(id: string) {
    const req = await this.prisma.rrpRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('request not found');
    return this.prisma.rrpRequest.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });
  }

  // -------------------------------------------------------------------------
  // Invoices — derived from sales (there is no separate Invoice model). Each
  // sale is one invoice; its "invoice status" is the sale's paymentStatus
  // fulfilment stage. Money-sensitive, so the controller gates finance:read:all.
  // -------------------------------------------------------------------------

  private invoiceStateOf(stage?: string): 'DRAFT' | 'ISSUED' | 'PAID' | 'OVERDUE' {
    switch (stage) {
      case 'COMPLETED':
        return 'PAID';
      case 'IN_PROGRESS':
        return 'ISSUED';
      default:
        return 'DRAFT';
    }
  }

  async invoices(user: AuthUser, userId?: string) {
    const where = await this.scope.saleWhere(user, userId);
    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        owner: { select: { name: true } },
        lead: { select: { firstName: true, surName: true } },
        statusDetails: { select: { paymentStatus: true, financeStatus: true } },
        paymentDetails: { select: { paymentDate: true } },
      },
      orderBy: { saleDate: 'desc' },
    });

    const rows = sales.map((s) => {
      const stage = s.statusDetails?.paymentStatus ?? 'PENDING';
      return {
        saleId: s.id,
        saleRef: s.saleRef,
        customerName: `${s.lead?.firstName ?? ''} ${s.lead?.surName ?? ''}`.trim(),
        consultantName: s.owner?.name ?? null,
        company: s.company,
        amount: Number(s.soldPrice ?? 0),
        saleDate: s.saleDate ? s.saleDate.toISOString().slice(0, 10) : null,
        paymentStatus: stage,
        financeStatus: s.statusDetails?.financeStatus ?? 'PENDING',
        invoiceState: this.invoiceStateOf(stage),
        paymentDate: s.paymentDetails?.paymentDate
          ? s.paymentDetails.paymentDate.toISOString().slice(0, 10)
          : null,
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.total += r.amount;
        if (r.invoiceState === 'PAID') acc.paid += r.amount;
        else acc.outstanding += r.amount;
        return acc;
      },
      { total: 0, paid: 0, outstanding: 0 },
    );

    return { rows, totals, count: rows.length };
  }

  /** Update an invoice's payment stage (DRAFT/ISSUED/PAID -> stage enum). */
  async setInvoiceStatus(user: AuthUser, saleId: string, status?: string) {
    const valid = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'];
    const st = (status ?? '').toUpperCase();
    if (!valid.includes(st)) throw new BadRequestException('invalid status');

    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('sale not found');

    await this.prisma.saleStatusDetails.upsert({
      where: { saleId },
      create: { saleId, paymentStatus: st as any },
      update: { paymentStatus: st as any },
    });
    await this.audit.record({
      userId: user.id,
      action: 'INVOICE_STATUS_SET',
      entity: 'Sale',
      entityId: saleId,
      metadata: { paymentStatus: st },
    });
    return { ok: true, saleId, paymentStatus: st };
  }

  // -------------------------------------------------------------------------
  // Payments — the PaymentDetails block per sale + the paymentStatus stage.
  // -------------------------------------------------------------------------

  async payments(user: AuthUser, userId?: string) {
    const where = await this.scope.saleWhere(user, userId);
    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        lead: { select: { firstName: true, surName: true } },
        owner: { select: { name: true } },
        statusDetails: { select: { paymentStatus: true } },
        paymentDetails: true,
      },
      orderBy: { saleDate: 'desc' },
    });

    const rows = sales.map((s) => ({
      saleId: s.id,
      saleRef: s.saleRef,
      customerName: `${s.lead?.firstName ?? ''} ${s.lead?.surName ?? ''}`.trim(),
      consultantName: s.owner?.name ?? null,
      amount: Number(s.soldPrice ?? 0),
      paymentStatus: s.statusDetails?.paymentStatus ?? 'PENDING',
      paymentDate: s.paymentDetails?.paymentDate
        ? s.paymentDetails.paymentDate.toISOString().slice(0, 10)
        : null,
      paymentNotes: s.paymentDetails?.paymentNotes ?? null,
    }));

    const received = rows
      .filter((r) => r.paymentStatus === 'COMPLETED')
      .reduce((a, r) => a + r.amount, 0);
    const pending = rows
      .filter((r) => r.paymentStatus !== 'COMPLETED')
      .reduce((a, r) => a + r.amount, 0);

    return {
      rows,
      totals: { received, pending, count: rows.length },
    };
  }

  /** Record / update a payment against a sale and advance its payment stage. */
  async recordPayment(
    user: AuthUser,
    saleId: string,
    body: { paymentDate?: string; paymentNotes?: string; markPaid?: boolean },
  ) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new NotFoundException('sale not found');

    const paymentDate = body.paymentDate ? new Date(body.paymentDate) : null;
    if (body.paymentDate && Number.isNaN(paymentDate!.getTime())) {
      throw new BadRequestException('invalid paymentDate');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.paymentDetails.upsert({
        where: { saleId },
        create: {
          saleId,
          paymentDate: paymentDate ?? undefined,
          paymentNotes: body.paymentNotes ?? undefined,
        },
        update: {
          paymentDate: paymentDate ?? undefined,
          paymentNotes: body.paymentNotes ?? undefined,
        },
      });
      const nextStage = body.markPaid ? 'COMPLETED' : 'IN_PROGRESS';
      await tx.saleStatusDetails.upsert({
        where: { saleId },
        create: { saleId, paymentStatus: nextStage as any },
        update: { paymentStatus: nextStage as any },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'PAYMENT_RECORDED',
          entity: 'Sale',
          entityId: saleId,
          metadata: { markPaid: !!body.markPaid },
        },
        tx,
      );
    });

    return { ok: true, saleId };
  }
}
