"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Section } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import {
  SALES_METRICS,
  TIME_RANGES,
  type ConsultantStats,
  type SalesMetricKey,
  type TimeRange,
} from "@/lib/sales/statistics-shared";

interface ApiResponse {
  range: TimeRange;
  stats: ConsultantStats[];
  fetchedAt: string;
}

export function SalesStatisticsWidget() {
  const [range, setRange] = React.useState<TimeRange>("weekly");
  const [data, setData] = React.useState<ApiResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [hiddenMetrics, setHiddenMetrics] = React.useState<Set<SalesMetricKey>>(
    new Set(),
  );

  const fetchOnce = React.useCallback(
    async (r: TimeRange, signal?: AbortSignal) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/sales-manager/sales-stats?range=${r}`,
          { signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiResponse;
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
    fetchOnce(range, controller.signal);
    return () => controller.abort();
  }, [fetchOnce, range]);

  const toggleMetric = (key: SalesMetricKey) => {
    setHiddenMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleMetrics = SALES_METRICS.filter((m) => !hiddenMetrics.has(m.key));

  return (
    <Section
      title="Sales Statistics"
      description="Counts per consultant grouped by metric. Use the filters to switch the time window."
      actions={
        <div className="flex items-center gap-2">
          <RangeTabs value={range} onChange={setRange} />
          <button
            type="button"
            onClick={() => fetchOnce(range)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
            disabled={loading}
            aria-label="Refresh sales statistics"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      }
    >
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t load sales statistics: {error}
        </div>
      ) : (
        <div className="space-y-4">
          <Legend
            hidden={hiddenMetrics}
            onToggle={toggleMetric}
          />
          <BarChart
            stats={data?.stats ?? []}
            visibleMetrics={visibleMetrics.map((m) => m.key)}
          />
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Range tabs
// ---------------------------------------------------------------------------

function RangeTabs({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="inline-flex rounded-md border bg-card p-0.5"
    >
      {TIME_RANGES.map((r) => {
        const active = r.key === value;
        return (
          <button
            key={r.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(r.key)}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-[0.3rem] transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Legend (also serves as a per-metric toggle)
// ---------------------------------------------------------------------------

function Legend({
  hidden,
  onToggle,
}: {
  hidden: Set<SalesMetricKey>;
  onToggle: (k: SalesMetricKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {SALES_METRICS.map((m) => {
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
          >
            <span
              className={cn("h-2.5 w-2.5 rounded-sm", m.color)}
              aria-hidden
            />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grouped bar chart (pure SVG — no external charting lib).
//
// Layout: one group per consultant on the X-axis, one bar per visible metric
// inside the group. The Y-axis is the count with auto-rounded gridlines.
// ---------------------------------------------------------------------------

function BarChart({
  stats,
  visibleMetrics,
}: {
  stats: ConsultantStats[];
  visibleMetrics: SalesMetricKey[];
}) {
  if (stats.length === 0) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No data for the selected range.
      </div>
    );
  }

  const PADDING = { top: 12, right: 12, bottom: 56, left: 36 };
  const HEIGHT = 320;
  const GROUP_WIDTH = Math.max(72, visibleMetrics.length * 14 + 28);
  const WIDTH = PADDING.left + PADDING.right + stats.length * GROUP_WIDTH;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  // Compute Y scale.
  const maxRaw = stats.reduce((m, s) => {
    for (const key of visibleMetrics) m = Math.max(m, s.counts[key]);
    return m;
  }, 0);
  const maxY = niceCeil(Math.max(1, maxRaw));
  const ticks = makeTicks(maxY, 4);

  const y = (v: number) =>
    PADDING.top + chartH - (v / maxY) * chartH;

  // Bar geometry inside a group.
  const innerW = GROUP_WIDTH - 16; // 8 px padding each side
  const barW =
    visibleMetrics.length > 0
      ? Math.max(4, Math.floor(innerW / visibleMetrics.length) - 2)
      : 0;

  // Use Tailwind classes -> CSS color via SVG `fill="currentColor"`.
  const metricColor: Record<SalesMetricKey, string> = {
    sales:         "text-emerald-500",
    presentations: "text-sky-500",
    callbacks:     "text-violet-500",
    no_answers:    "text-amber-500",
    cancellations: "text-red-500",
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Sales statistics bar chart per consultant"
        className="block min-w-full text-foreground"
      >
        {/* Y-axis ticks + gridlines */}
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

        {/* Bars */}
        {stats.map((s, gi) => {
          const groupX = PADDING.left + gi * GROUP_WIDTH;
          return (
            <g key={s.consultantId}>
              {visibleMetrics.map((mk, mi) => {
                const v = s.counts[mk];
                const h = (v / maxY) * chartH;
                const x = groupX + 8 + mi * (barW + 2);
                const top = y(v);
                return (
                  <g key={mk} className={metricColor[mk]}>
                    <rect
                      x={x}
                      y={top}
                      width={barW}
                      height={Math.max(0, h)}
                      fill="currentColor"
                      rx={2}
                    >
                      <title>{`${s.name} — ${labelFor(mk)}: ${v}`}</title>
                    </rect>
                  </g>
                );
              })}

              {/* X-axis label — consultant name (truncated). */}
              <text
                x={groupX + GROUP_WIDTH / 2}
                y={HEIGHT - PADDING.bottom + 14}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={10}
                transform={`rotate(-35 ${groupX + GROUP_WIDTH / 2} ${HEIGHT - PADDING.bottom + 14})`}
              >
                {shorten(s.name, 16)}
              </text>
            </g>
          );
        })}

        {/* X-axis line */}
        <line
          x1={PADDING.left}
          x2={WIDTH - PADDING.right}
          y1={y(0)}
          y2={y(0)}
          className="stroke-border"
        />
      </svg>

      {/* Axis captions */}
      <div className="flex justify-between mt-1 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>X: Sales Consultant</span>
        <span>Y: Count</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function niceCeil(n: number): number {
  // Round up to a "nice" value (1, 2, 5, 10, 20, 50, 100, ...).
  if (n <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / pow;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * pow;
}

function makeTicks(max: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    out.push(Math.round((max / steps) * i));
  }
  return out;
}

function shorten(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function labelFor(k: SalesMetricKey): string {
  const m = SALES_METRICS.find((x) => x.key === k);
  return m?.label ?? k;
}
