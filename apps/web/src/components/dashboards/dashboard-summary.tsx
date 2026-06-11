"use client";

import { useApi } from "@/lib/api/use-api";

interface Summary {
  totalLeads: number;
  totalSales: number;
  conversionRate: number;
  pipelineValue: number;
  winRate: number;
  byStage: Record<string, number>;
  bySource: Record<string, number>;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function fmtPct(n: number) {
  return `${Math.round((n || 0) * 100)}%`;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Breakdown({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data ?? {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">
                {k}
              </span>
              <div className="h-2 flex-1 rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${(v / max) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs tabular-nums">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Role-scoped dashboard summary backed by GET /dashboards/summary. Every figure
 * is filtered server-side to what the viewer is allowed to see.
 */
export function DashboardSummary() {
  const { data, loading, error } = useApi<Summary>("/dashboards/summary");

  if (loading)
    return <p className="text-sm text-muted-foreground">Loading metrics…</p>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Leads" value={String(data.totalLeads)} />
        <Kpi label="Sales" value={String(data.totalSales)} />
        <Kpi label="Conversion" value={fmtPct(data.conversionRate)} />
        <Kpi label="Pipeline" value={fmtMoney(data.pipelineValue)} />
        <Kpi label="Win rate" value={fmtPct(data.winRate)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Breakdown title="Leads by stage" data={data.byStage} />
        <Breakdown title="Leads by source" data={data.bySource} />
      </div>
    </div>
  );
}
