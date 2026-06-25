"use client";

import * as React from "react";
import { RefreshCw, BarChart3, LineChart, Users, ListTree, Clock } from "lucide-react";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import {
  LEAD_METRICS,
  GRANULARITIES,
  CHART_TYPES,
  type ChartType,
  type Granularity,
  type LeadMetricKey,
  type LeadStatsResponse,
} from "@/lib/leads/statistics-shared";

/**
 * Leads Dashboard → Lead Statistics tab.
 *
 * Lead-gen performance overview built from the live Bloome leads. Renders:
 *   • Summary cards (aggregate totals + rates).
 *   • A trend chart bucketed by daily / weekly / monthly / yearly, with a
 *     custom date-range picker.
 *   • A per-agent comparison chart (the "individual performer" view).
 *   • A per-lead drill-down table (the "per individual lead" view).
 *
 * Every chart's type (bar / line) is switchable by the user at runtime, and the
 * metric legend doubles as a per-metric show/hide toggle. Charts are hand-built
 * SVG to match the existing Sales Statistics widget (no charting dependency).
 */

type View = "time" | "agent" | "lead";

const VIEWS: Array<{ key: View; label: string; icon: React.ReactNode }> = [
  { key: "time", label: "Over time", icon: <Clock className="h-3.5 w-3.5" /> },
  { key: "agent", label: "By agent", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "lead", label: "By lead", icon: <ListTree className="h-3.5 w-3.5" /> },
];

export function LeadStatisticsWidget() {
  const [granularity, setGranularity] = React.useState<Granularity>("daily");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");
  const [view, setView] = React.useState<View>("time");
  const [trendType, setTrendType] = React.useState<ChartType>("bar");
  const [agentType, setAgentType] = React.useState<ChartType>("bar");
  const [hidden, setHidden] = React.useState<Set<LeadMetricKey>>(new Set());

  const [data, setData] = React.useState<LeadStatsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const queryString = React.useMemo(() => {
    const p = new URLSearchParams({ granularity });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [granularity, from, to]);

  const fetchOnce = React.useCallback(
    async (qs: string, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leads/lead-stats?${qs}`, {
          signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as LeadStatsResponse;
        setData(json);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetchOnce(queryString, controller.signal);
    return () => controller.abort();
  }, [fetchOnce, queryString]);

  const toggleMetric = (key: LeadMetricKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visibleMetrics = LEAD_METRICS.filter((m) => !hidden.has(m.key)).map(
    (m) => m.key,
  );

  const summary = data?.summary;
  const resolvedWindow = data ? `${data.from} → ${data.to}` : "";

  return (
    <div className="space-y-6">
      {/* ---- Summary cards -------------------------------------------------- */}
      <Section
        title="Lead-Gen Performance"
        description={
          resolvedWindow
            ? `Window ${resolvedWindow}. Aggregated from live Bloome leads.`
            : "Aggregated from live Bloome leads."
        }
        actions={
          <button
            type="button"
            onClick={() => fetchOnce(queryString)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            disabled={loading}
            aria-label="Refresh lead statistics"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        }
      >
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <KpiRow>
            <Kpi
              label="Leads worked"
              value={fmt(summary?.totalLeads)}
              tone="default"
              hint="Total leads in the window"
            />
            <Kpi
              label="Dials made"
              value={fmt(summary?.dials)}
              tone="info"
              hint={`${num(summary?.avgDialsPerLead, 1)} avg per lead`}
            />
            <Kpi
              label="Call backs attended"
              value={fmt(summary?.callbacks)}
              tone="purple"
            />
            <Kpi
              label="Leads appointed"
              value={fmt(summary?.appointments)}
              tone="success"
              hint={`${pct(summary?.conversionRate)} conversion`}
            />
          </KpiRow>
        )}
      </Section>

      {/* ---- Charts --------------------------------------------------------- */}
      <Section
        title="Breakdown"
        description="Switch between an over-time trend, a per-agent comparison, and a per-lead drill-down. Toggle metrics in the legend and switch chart types on the fly."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              ariaLabel="Granularity"
              value={granularity}
              onChange={(g) => setGranularity(g as Granularity)}
              options={GRANULARITIES}
            />
            <DateRange
              from={from}
              to={to}
              onFrom={setFrom}
              onTo={setTo}
              onClear={() => {
                setFrom("");
                setTo("");
              }}
            />
          </div>
        }
      >
        {error ? (
          <ErrorBox message={error} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Segmented
                ariaLabel="View"
                value={view}
                onChange={(v) => setView(v as View)}
                options={VIEWS}
              />
              {view !== "lead" && (
                <Legend hidden={hidden} onToggle={toggleMetric} />
              )}
            </div>

            {view === "time" && (
              <ChartPanel
                type={trendType}
                onType={setTrendType}
                points={
                  data?.series.map((b) => ({
                    label: b.label,
                    counts: b.counts,
                  })) ?? []
                }
                visibleMetrics={visibleMetrics}
                xCaption="Time bucket"
                emptyLabel="No leads in the selected window."
              />
            )}

            {view === "agent" && (
              <ChartPanel
                type={agentType}
                onType={setAgentType}
                points={
                  data?.byAgent.map((a) => ({
                    label: a.agent,
                    counts: a.counts,
                  })) ?? []
                }
                visibleMetrics={visibleMetrics}
                xCaption="Lead-gen agent"
                emptyLabel="No agent activity in the selected window."
              />
            )}

            {view === "lead" && <LeadTable rows={data?.leads ?? []} />}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart panel — wraps a chart with its own type switcher.
// ---------------------------------------------------------------------------

interface Point {
  label: string;
  counts: Record<LeadMetricKey, number>;
}

function ChartPanel({
  type,
  onType,
  points,
  visibleMetrics,
  xCaption,
  emptyLabel,
}: {
  type: ChartType;
  onType: (t: ChartType) => void;
  points: Point[];
  visibleMetrics: LeadMetricKey[];
  xCaption: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Segmented
          ariaLabel="Chart type"
          value={type}
          onChange={(t) => onType(t as ChartType)}
          options={CHART_TYPES.map((c) => ({
            key: c.key,
            label: c.label,
            icon:
              c.key === "bar" ? (
                <BarChart3 className="h-3.5 w-3.5" />
              ) : (
                <LineChart className="h-3.5 w-3.5" />
              ),
          }))}
        />
      </div>
      <MetricChart
        type={type}
        points={points}
        visibleMetrics={visibleMetrics}
        xCaption={xCaption}
        emptyLabel={emptyLabel}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricChart — hand-built SVG, renders bar OR line for the same data.
// ---------------------------------------------------------------------------

const METRIC_COLOR: Record<LeadMetricKey, string> = {
  dials: "text-sky-500",
  callbacks: "text-violet-500",
  appointments: "text-emerald-500",
};

function MetricChart({
  type,
  points,
  visibleMetrics,
  xCaption,
  emptyLabel,
}: {
  type: ChartType;
  points: Point[];
  visibleMetrics: LeadMetricKey[];
  xCaption: string;
  emptyLabel: string;
}) {
  if (points.length === 0 || visibleMetrics.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        {visibleMetrics.length === 0
          ? "Select at least one metric to chart."
          : emptyLabel}
      </div>
    );
  }

  const PADDING = { top: 12, right: 14, bottom: 64, left: 40 };
  const HEIGHT = 340;
  const SLOT =
    type === "bar"
      ? Math.max(54, visibleMetrics.length * 16 + 24)
      : Math.max(40, 56);
  const WIDTH = PADDING.left + PADDING.right + points.length * SLOT;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;
  const chartW = WIDTH - PADDING.left - PADDING.right;

  const maxRaw = points.reduce((m, p) => {
    for (const k of visibleMetrics) m = Math.max(m, p.counts[k]);
    return m;
  }, 0);
  const maxY = niceCeil(Math.max(1, maxRaw));
  const ticks = makeTicks(maxY, 4);
  const y = (v: number) => PADDING.top + chartH - (v / maxY) * chartH;

  // x center of each slot.
  const slotCenter = (i: number) => PADDING.left + i * SLOT + SLOT / 2;

  // Bar geometry inside a slot.
  const innerW = SLOT - 16;
  const barW =
    visibleMetrics.length > 0
      ? Math.max(4, Math.floor(innerW / visibleMetrics.length) - 2)
      : 0;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label={`Lead statistics ${type} chart`}
        className="block min-w-full text-foreground"
      >
        {/* gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeDasharray={t === 0 ? "0" : "3 3"}
            />
            <text
              x={PADDING.left - 6}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={10}
            >
              {t}
            </text>
          </g>
        ))}

        {/* series */}
        {type === "bar"
          ? points.map((p, i) => {
              const slotX = PADDING.left + i * SLOT;
              return (
                <g key={i}>
                  {visibleMetrics.map((mk, mi) => {
                    const v = p.counts[mk];
                    const h = (v / maxY) * chartH;
                    const x = slotX + 8 + mi * (barW + 2);
                    return (
                      <g key={mk} className={METRIC_COLOR[mk]}>
                        <rect
                          x={x}
                          y={y(v)}
                          width={barW}
                          height={Math.max(0, h)}
                          fill="currentColor"
                          rx={2}
                        >
                          <title>{`${p.label} — ${labelFor(mk)}: ${v}`}</title>
                        </rect>
                      </g>
                    );
                  })}
                  <XLabel x={slotCenter(i)} yBase={HEIGHT - PADDING.bottom + 14} text={p.label} />
                </g>
              );
            })
          : visibleMetrics.map((mk) => {
              const path = points
                .map(
                  (p, i) =>
                    `${i === 0 ? "M" : "L"} ${slotCenter(i)} ${y(p.counts[mk])}`,
                )
                .join(" ");
              return (
                <g key={mk} className={METRIC_COLOR[mk]}>
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={slotCenter(i)}
                      cy={y(p.counts[mk])}
                      r={2.5}
                      fill="currentColor"
                    >
                      <title>{`${p.label} — ${labelFor(mk)}: ${p.counts[mk]}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}

        {/* x labels for line mode (bar mode draws them inline above) */}
        {type === "line" &&
          points.map((p, i) => (
            <XLabel
              key={i}
              x={slotCenter(i)}
              yBase={HEIGHT - PADDING.bottom + 14}
              text={p.label}
            />
          ))}

        {/* x-axis line */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
        />
      </svg>

      <div className="mt-1 flex justify-between px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>X: {xCaption}</span>
        <span>Y: Count</span>
      </div>
    </div>
  );
}

function XLabel({ x, yBase, text }: { x: number; yBase: number; text: string }) {
  return (
    <text
      x={x}
      y={yBase}
      textAnchor="end"
      className="fill-muted-foreground"
      fontSize={10}
      transform={`rotate(-35 ${x} ${yBase})`}
    >
      {shorten(text, 16)}
    </text>
  );
}

// ---------------------------------------------------------------------------
// Per-lead drill-down table
// ---------------------------------------------------------------------------

function LeadTable({
  rows,
}: {
  rows: LeadStatsResponse["leads"];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No leads in the selected window.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Lead</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Region</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Outcome</th>
            <th className="px-3 py-2 text-right font-medium">Dials</th>
            <th className="px-3 py-2 font-medium">Appt date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t hover:bg-accent/40">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{r.agent ?? "—"}</td>
              <td className="px-3 py-2">{r.region ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{r.date ?? "—"}</td>
              <td className="px-3 py-2">{r.outcome ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.dials}</td>
              <td className="px-3 py-2">{r.appDate ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length >= 1000 && (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing the first 1,000 leads. Narrow the date range to see fewer.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

interface SegOption {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

function Segmented({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: SegOption[];
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border bg-card p-0.5"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "inline-flex items-center gap-1 rounded-[0.3rem] px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DateRange({
  from,
  to,
  onFrom,
  onTo,
  onClear,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  onClear: () => void;
}) {
  const inputCls =
    "h-7 rounded-md border bg-card px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onFrom(e.target.value)}
        className={inputCls}
        aria-label="From date"
      />
      <span className="text-xs text-muted-foreground">→</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onTo(e.target.value)}
        className={inputCls}
        aria-label="To date"
      />
      {(from || to) && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function Legend({
  hidden,
  onToggle,
}: {
  hidden: Set<LeadMetricKey>;
  onToggle: (k: LeadMetricKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {LEAD_METRICS.map((m) => {
        const off = hidden.has(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onToggle(m.key)}
            className={cn(
              "inline-flex items-center gap-2 text-xs transition-opacity",
              off ? "opacity-40 hover:opacity-70" : "hover:opacity-80",
            )}
            aria-pressed={!off}
            title={m.description}
          >
            <span className={cn("h-2.5 w-2.5 rounded-sm", m.swatch)} aria-hidden />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
      Couldn&apos;t load lead statistics: {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function niceCeil(n: number): number {
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

function makeTicks(max: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(Math.round((max / steps) * i));
  return out;
}

function shorten(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function labelFor(k: LeadMetricKey): string {
  return LEAD_METRICS.find((m) => m.key === k)?.label ?? k;
}

function fmt(n: number | undefined): string {
  return n === undefined ? "—" : n.toLocaleString();
}

function num(n: number | undefined, dp: number): string {
  return n === undefined ? "—" : n.toFixed(dp);
}

function pct(n: number | undefined): string {
  return n === undefined ? "—" : `${(n * 100).toFixed(1)}%`;
}
