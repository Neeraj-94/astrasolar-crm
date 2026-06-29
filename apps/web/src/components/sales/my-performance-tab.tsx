"use client";

import * as React from "react";
import {
  Target,
  Percent,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import {
  PageHeader,
  Section,
  Kpi,
  KpiRow,
  Pagination,
  SubTabs,
} from "@/components/leads/shared";
import {
  DataTable,
  THead,
  TH,
  TBody,
  TR,
  TD,
} from "@/components/leads/shared/data-table";
import { BarChart, ProgressRow } from "@/components/dashboards/charts";
import { SaleDetailModal } from "./sale-detail-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/api/use-api";
import type {
  LeadFunnelResponse,
  InstallationListItem,
} from "@/lib/api/endpoints";
import type { SaleListItem } from "@astra/shared";
import {
  rangeFor,
  weekWindow,
  addWeeks,
  buildFunnel,
  buildMonthlyActivity,
  monthlySalesSeries,
  rankConsultants,
  useSaleDetails,
  money,
  num,
  type FunnelRangeKey,
  type RankPeriod,
  type MonthlyActivity,
} from "@/lib/sales/performance";

const SALE_STATUS_LABEL: Record<string, string> = {
  NEGOTIATION: "Negotiation",
  CONTRACT: "Contract",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ===========================================================================
// Tab
// ===========================================================================
export function MyPerformanceTab() {
  // Stable "now" so date ranges don't drift across re-renders.
  const now = React.useMemo(() => new Date(), []);

  // ---- shared data ----
  const { data: salesData, reload: reloadSales } =
    useApi<SaleListItem[]>("/sales");
  const sales = React.useMemo(() => salesData ?? [], [salesData]);

  const { data: installsData, error: installsError } =
    useApi<InstallationListItem[]>("/installations");
  const installs = React.useMemo(() => installsData ?? [], [installsData]);

  // All-time funnel powers the headline ratios (Section 1).
  const { data: funnelAll } = useApi<LeadFunnelResponse>(
    "/dashboards/lead-funnel",
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="My Performance"
        description="Your personal sales analytics — performance, pipeline, installs, and ranking."
      />

      <SalesPerformanceSection sales={sales} funnelAll={funnelAll} now={now} />

      <SalesReviewSection sales={sales} onSaved={reloadSales} />

      <div className="grid gap-6 lg:grid-cols-2">
        <BookedInstallsSection
          installs={installs}
          installsError={installsError}
          now={now}
        />
        <CompletedInstallsSection
          installs={installs}
          installsError={installsError}
          sales={sales}
        />
      </div>

      <MonthlySalesSection now={now} />

      <PipelineFunnelSection now={now} />

      <RankingSection sales={sales} now={now} />
    </div>
  );
}

// ===========================================================================
// 1. Sales Performance
// ===========================================================================
function SalesPerformanceSection({
  sales,
  funnelAll,
  now,
}: {
  sales: SaleListItem[];
  funnelAll: LeadFunnelResponse | null;
  now: Date;
}) {
  const series = React.useMemo(
    () => monthlySalesSeries(sales, 6, now),
    [sales, now],
  );
  const f = React.useMemo(() => buildFunnel(funnelAll), [funnelAll]);

  return (
    <Section
      title="Sales Performance"
      description="Monthly sales and your key conversion ratios."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Monthly sales (last 6 months)
          </p>
          <BarChart data={series} emptyText="No sales yet" />
        </div>
        <div className="space-y-4">
          <ProgressRow
            label="Sale-to-Presentation"
            value={f.sales}
            total={f.presentations}
            tone="success"
            format={(n) => `${n}/${f.presentations}`}
          />
          <ProgressRow
            label="Sale-to-Lead"
            value={f.sales}
            total={f.totalLeads}
            tone="primary"
            format={(n) => `${n}/${f.totalLeads}`}
          />
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Kpi
              label="Sale/Pres"
              value={`${f.closeRate}%`}
              tone="success"
              icon={<Target className="h-4 w-4" />}
            />
            <Kpi
              label="Sale/Lead"
              value={`${f.leadToSale}%`}
              tone="primary"
              icon={<Percent className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>
    </Section>
  );
}

// ===========================================================================
// 2. Sales Review
// ===========================================================================
const REVIEW_PAGE_SIZE = 10;

function SalesReviewSection({
  sales,
  onSaved,
}: {
  sales: SaleListItem[];
  onSaved?: () => void;
}) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(REVIEW_PAGE_SIZE);
  // Selected sale → opens the sale detail modal (matches astrasolar-app's
  // `openSaleDetailsModal`, triggered from the Status cell / row).
  const [selectedSaleId, setSelectedSaleId] = React.useState<string | null>(
    null,
  );

  const ordered = React.useMemo(
    () =>
      [...sales].sort(
        (a, b) =>
          new Date(b.saleDate ?? 0).getTime() -
          new Date(a.saleDate ?? 0).getTime(),
      ),
    [sales],
  );

  const total = ordered.length;
  const pageRows = React.useMemo(
    () => ordered.slice((page - 1) * pageSize, page * pageSize),
    [ordered, page, pageSize],
  );
  const pageIds = React.useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const { details } = useSaleDetails(pageIds);

  return (
    <Section
      title="Sales Review"
      description="Every sale you've written — products, pricing, and status."
      flush
    >
      <DataTable scroll>
        <THead>
          <TR>
            <TH>Date</TH>
            <TH>Customer</TH>
            <TH>Products Sold</TH>
            <TH align="right">Sold Price</TH>
            <TH align="right">Expected RRP</TH>
            <TH align="right">Difference</TH>
            <TH>Extras</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {pageRows.length === 0 ? (
            <TR>
              <TD colSpan={8}>
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No sales to review yet.
                </p>
              </TD>
            </TR>
          ) : (
            pageRows.map((s) => {
              const d = details[s.id];
              const sold = num(s.soldPrice);
              const rrp = d?.totalRRP ?? null;
              const diff = rrp != null ? sold - rrp : null;
              return (
                <TR key={s.id}>
                  <TD className="whitespace-nowrap">{fmtDate(s.saleDate)}</TD>
                  <TD className="whitespace-nowrap font-medium">
                    {s.lead
                      ? `${s.lead.firstName} ${s.lead.surName}`.trim()
                      : "—"}
                  </TD>
                  <TD className="max-w-[18rem] truncate text-muted-foreground">
                    {d?.products ?? "…"}
                  </TD>
                  <TD align="right" className="tabular-nums">
                    {s.soldPrice != null ? money(sold) : "—"}
                  </TD>
                  <TD align="right" className="tabular-nums text-muted-foreground">
                    {rrp != null ? money(rrp) : "…"}
                  </TD>
                  <TD
                    align="right"
                    className={cn(
                      "tabular-nums",
                      diff == null
                        ? "text-muted-foreground"
                        : diff >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {diff != null
                      ? `${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}`
                      : "…"}
                  </TD>
                  <TD className="max-w-[12rem] truncate text-muted-foreground">
                    {d?.extras ?? "…"}
                  </TD>
                  <TD>
                    <button
                      type="button"
                      onClick={() => setSelectedSaleId(s.id)}
                      className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="Open sale details"
                    >
                      <StatusBadge status={s.status} interactive />
                    </button>
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </DataTable>
      {total > 0 && (
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
          pageSizeOptions={[10, 20, 50]}
        />
      )}

      {selectedSaleId && (
        <SaleDetailModal
          saleId={selectedSaleId}
          onClose={() => setSelectedSaleId(null)}
          onSaved={onSaved}
        />
      )}
    </Section>
  );
}

function StatusBadge({
  status,
  interactive = false,
}: {
  status: string;
  interactive?: boolean;
}) {
  const tone: Record<string, string> = {
    COMPLETED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    CONTRACT: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    NEGOTIATION: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ON_HOLD: "bg-muted text-muted-foreground",
    CANCELLED: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        tone[status] ?? "bg-muted text-muted-foreground",
        interactive &&
          "cursor-pointer ring-1 ring-transparent transition hover:ring-current",
      )}
    >
      {SALE_STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ===========================================================================
// 3. Booked Installs (weekly selector)
// ===========================================================================
const BOOKED_STATUSES = new Set(["SCHEDULED", "IN_PROGRESS", "ON_HOLD"]);

function BookedInstallsSection({
  installs,
  installsError,
  now,
}: {
  installs: InstallationListItem[];
  installsError: string | null;
  now: Date;
}) {
  const [weekOffset, setWeekOffset] = React.useState(0);
  const win = React.useMemo(
    () => weekWindow(addWeeks(now, weekOffset)),
    [now, weekOffset],
  );

  const weekInstalls = React.useMemo(
    () =>
      installs.filter((i) => {
        if (!BOOKED_STATUSES.has(i.status)) return false;
        if (!i.scheduledAt) return false;
        const d = new Date(i.scheduledAt);
        return d >= win.start && d <= win.end;
      }),
    [installs, win],
  );

  return (
    <Section
      title="Booked Installs"
      description="Installs scheduled for the selected week."
      actions={
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setWeekOffset(0)}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <CalendarRange className="h-4 w-4" />
        <span>{win.label}</span>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tabular-nums">
          {weekInstalls.length}
        </span>
        <span className="text-sm text-muted-foreground">
          install{weekInstalls.length === 1 ? "" : "s"} booked
        </span>
      </div>

      {installsError ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Install scheduling isn&apos;t visible with your current access.
        </p>
      ) : weekInstalls.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {weekInstalls.slice(0, 6).map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm last:border-0"
            >
              <span className="truncate font-medium">
                {i.sale?.lead
                  ? `${i.sale.lead.firstName} ${i.sale.lead.surName}`.trim()
                  : (i.sale?.saleRef ?? "Install")}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtDate(i.scheduledAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          No installs booked for this week.
        </p>
      )}
    </Section>
  );
}

// ===========================================================================
// 4. Completed Installs (pagination)
// ===========================================================================
const COMPLETED_PAGE_SIZE = 8;

interface CompletedRow {
  id: string;
  customer: string;
  ref: string;
  date: string | null;
}

function CompletedInstallsSection({
  installs,
  installsError,
  sales,
}: {
  installs: InstallationListItem[];
  installsError: string | null;
  sales: SaleListItem[];
}) {
  const [page, setPage] = React.useState(1);

  // Prefer real installation records; fall back to COMPLETED sales when the
  // installs feed isn't accessible at the viewer's permission scope.
  const rows: CompletedRow[] = React.useMemo(() => {
    const fromInstalls = installs
      .filter((i) => i.status === "COMPLETED")
      .map((i) => ({
        id: i.id,
        customer: i.sale?.lead
          ? `${i.sale.lead.firstName} ${i.sale.lead.surName}`.trim()
          : (i.sale?.saleRef ?? "—"),
        ref: i.sale?.saleRef ?? "—",
        date: i.completedAt ?? i.scheduledAt ?? null,
      }));
    if (fromInstalls.length > 0 || !installsError) return fromInstalls;
    // Fallback path.
    return sales
      .filter((s) => s.status === "COMPLETED")
      .map((s) => ({
        id: s.id,
        customer: s.lead
          ? `${s.lead.firstName} ${s.lead.surName}`.trim()
          : "—",
        ref: s.saleRef ?? "—",
        date: s.saleDate,
      }));
  }, [installs, installsError, sales]);

  const ordered = React.useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
      ),
    [rows],
  );
  const total = ordered.length;
  const pageRows = ordered.slice(
    (page - 1) * COMPLETED_PAGE_SIZE,
    page * COMPLETED_PAGE_SIZE,
  );

  return (
    <Section
      title="Completed Installs"
      description="Your sales that have been installed to date."
    >
      <KpiRow>
        <Kpi
          label="Completed to date"
          value={total}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </KpiRow>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <DataTable scroll={false}>
          <THead>
            <TR>
              <TH>Customer</TH>
              <TH>Ref</TH>
              <TH align="right">Installed</TH>
            </TR>
          </THead>
          <TBody>
            {pageRows.length === 0 ? (
              <TR>
                <TD colSpan={3}>
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    No completed installs yet.
                  </p>
                </TD>
              </TR>
            ) : (
              pageRows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.customer}</TD>
                  <TD className="text-muted-foreground">{r.ref}</TD>
                  <TD align="right" className="whitespace-nowrap text-muted-foreground">
                    {fmtDate(r.date)}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </DataTable>
      </div>
      {total > COMPLETED_PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={COMPLETED_PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      )}
    </Section>
  );
}

// ===========================================================================
// 5. Monthly Sales (button group)
// ===========================================================================
type ActivityKey = keyof MonthlyActivity;
const ACTIVITY_BUTTONS: { key: ActivityKey; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "presentations", label: "Presentations" },
  { key: "callbacks", label: "Callbacks" },
  { key: "noAnswers", label: "No Answers" },
  { key: "cancels", label: "Cancels" },
];

function MonthlySalesSection({ now }: { now: Date }) {
  const range = React.useMemo(() => rangeFor("month", now), [now]);
  const path = `/dashboards/lead-funnel?from=${encodeURIComponent(
    range.from!,
  )}&to=${encodeURIComponent(range.to!)}`;
  const { data: funnelMonth } = useApi<LeadFunnelResponse>(path);
  const activity = React.useMemo(
    () => buildMonthlyActivity(funnelMonth),
    [funnelMonth],
  );
  const [active, setActive] = React.useState<ActivityKey>("sales");

  const activeLabel =
    ACTIVITY_BUTTONS.find((b) => b.key === active)?.label ?? "";

  return (
    <Section
      title="Monthly Sales"
      description={`Activity across all consultants this month — ${range.label}.`}
    >
      <div className="flex flex-wrap gap-2">
        {ACTIVITY_BUTTONS.map((b) => (
          <Button
            key={b.key}
            variant={active === b.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActive(b.key)}
            className="gap-2"
          >
            {b.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs tabular-nums",
                active === b.key
                  ? "bg-primary-foreground/20"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {activity[b.key]}
            </span>
          </Button>
        ))}
      </div>
      <div className="mt-6 flex items-baseline gap-3">
        <span className="text-5xl font-semibold tabular-nums">
          {activity[active]}
        </span>
        <span className="text-sm text-muted-foreground">
          {activeLabel} this month
        </span>
      </div>
    </Section>
  );
}

// ===========================================================================
// 6. Pipeline Funnel
// ===========================================================================
const RANGE_TABS: { key: FunnelRangeKey; label: string }[] = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All Time" },
];

const STATUS_DOT: Record<string, string> = {
  "No Answer": "bg-slate-400",
  Callback: "bg-amber-500",
  Reschedule: "bg-sky-500",
  "Been Rescheduled": "bg-violet-500",
  "Not Interested": "bg-red-500",
};

function PipelineFunnelSection({ now }: { now: Date }) {
  const [rangeKey, setRangeKey] = React.useState<FunnelRangeKey>("month");
  const range = React.useMemo(() => rangeFor(rangeKey, now), [rangeKey, now]);

  const path = React.useMemo(() => {
    if (!range.from || !range.to) return "/dashboards/lead-funnel";
    return `/dashboards/lead-funnel?from=${encodeURIComponent(
      range.from,
    )}&to=${encodeURIComponent(range.to)}`;
  }, [range]);

  const { data: funnel } = useApi<LeadFunnelResponse>(path);
  const f = React.useMemo(() => buildFunnel(funnel), [funnel]);

  const stages = [
    { label: "Total Leads", count: f.totalLeads, tone: "bg-primary" },
    {
      label: "Presentations",
      count: f.presentations,
      tone: "bg-violet-500",
      indicator: `${f.toPresentationRate}% to presentation`,
    },
    {
      label: "Sales",
      count: f.sales,
      tone: "bg-emerald-500",
      indicator: `${f.closeRate}% close rate`,
    },
  ];
  const max = Math.max(f.totalLeads, 1);

  return (
    <Section
      title="My Pipeline Funnel"
      description="Your lead progression through the pipeline."
      actions={
        <SubTabs
          tabs={RANGE_TABS.map((r) => ({ key: r.key, label: r.label }))}
          value={rangeKey}
          onChange={(k) => setRangeKey(k as FunnelRangeKey)}
        />
      }
    >
      <p className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {range.label}
      </p>

      {/* Funnel bars */}
      <div className="space-y-4">
        {stages.map((s) => {
          const widthPct = Math.max((s.count / max) * 100, 8);
          return (
            <div key={s.label}>
              {"indicator" in s && s.indicator && (
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {s.indicator}
                </p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div
                    className={cn(
                      "flex h-11 items-center justify-between rounded-lg px-4 text-white transition-all",
                      s.tone,
                    )}
                    style={{ width: `${widthPct}%`, minWidth: "8rem" }}
                  >
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-lg font-semibold tabular-nums">
                      {s.count}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status breakdown legend */}
      <div className="mt-6 border-t pt-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Status breakdown
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {f.status.map((s) => (
            <span key={s.key} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "inline-block h-2.5 w-2.5 rounded-full",
                  STATUS_DOT[s.label] ?? "bg-muted-foreground",
                )}
              />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold tabular-nums">{s.count}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Summary metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 border-t pt-4 md:grid-cols-4">
        <SummaryMetric label="Lead → Pres" value={`${f.toPresentationRate}%`} />
        <SummaryMetric label="Pres → Sale" value={`${f.closeRate}%`} />
        <SummaryMetric label="Overall Conversion" value={`${f.leadToSale}%`} />
        <SummaryMetric label="Lost / Pending" value={f.lostOrPending} />
      </div>
    </Section>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

// ===========================================================================
// 7. Consultant Statistics & Ranking
// ===========================================================================
const RANK_TABS: { key: RankPeriod; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

function RankingSection({
  sales,
  now,
}: {
  sales: SaleListItem[];
  now: Date;
}) {
  const [period, setPeriod] = React.useState<RankPeriod>("month");
  const rows = React.useMemo(
    () => rankConsultants(sales, period, now),
    [sales, period, now],
  );

  return (
    <Section
      title="Consultant Statistics & Ranking"
      description="How consultants rank by sales for the selected period."
      actions={
        <SubTabs
          tabs={RANK_TABS.map((r) => ({ key: r.key, label: r.label }))}
          value={period}
          onChange={(k) => setPeriod(k as RankPeriod)}
        />
      }
      flush
    >
      <DataTable scroll={false}>
        <THead>
          <TR>
            <TH className="w-16">Rank</TH>
            <TH>Consultant</TH>
            <TH align="right">Sales</TH>
            <TH align="right">Total Sold</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TR>
              <TD colSpan={4}>
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No sales recorded for this period.
                </p>
              </TD>
            </TR>
          ) : (
            rows.map((r) => (
              <TR key={r.ownerId}>
                <TD>
                  <RankBadge rank={r.rank} />
                </TD>
                <TD className="font-medium">{r.ownerName}</TD>
                <TD align="right" className="tabular-nums">
                  {r.sales}
                </TD>
                <TD align="right" className="tabular-nums">
                  {money(r.totalSold)}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </DataTable>
    </Section>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const tone = ["text-amber-500", "text-slate-400", "text-orange-600"][
      rank - 1
    ];
    return (
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
        <Trophy className={cn("h-4 w-4", tone)} />
        {rank}
      </span>
    );
  }
  return <span className="tabular-nums text-muted-foreground">{rank}</span>;
}
