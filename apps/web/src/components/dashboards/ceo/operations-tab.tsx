"use client";

import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { ProgressRow } from "@/components/dashboards/charts";

interface OperationsResponse {
  saleStatus: Record<string, number>;
  installStatus: Record<string, number>;
  stages: {
    stage: string;
    counts: Record<string, number>;
    completionRate: number;
  }[];
}

const STAGE_LABELS: Record<string, string> = {
  finance: "Finance",
  preapproval: "Pre-approval",
  meterChange: "Meter Change",
  install: "Install",
  payment: "Payment",
  commissioning: "Commissioning",
  ces: "CES / Council",
};

function sum(rec: Record<string, number>) {
  return Object.values(rec).reduce((a, b) => a + b, 0);
}

export function OperationsTab() {
  const res = useApi<OperationsResponse>("/dashboards/operations");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading operations…</p>;

  const totalSales = sum(d.saleStatus);
  const totalInstalls = sum(d.installStatus);

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi label="Sales in Pipeline" value={totalSales} tone="primary" />
        <Kpi
          label="Completed Sales"
          value={d.saleStatus["COMPLETED"] ?? 0}
          tone="success"
        />
        <Kpi
          label="On Hold"
          value={d.saleStatus["ON_HOLD"] ?? 0}
          tone="warning"
        />
        <Kpi label="Installations" value={totalInstalls} tone="info" />
      </KpiRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sales by Status">
          {totalSales === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No sales
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(d.saleStatus).map(([k, v]) => (
                <ProgressRow
                  key={k}
                  label={k.replace(/_/g, " ")}
                  value={v}
                  total={totalSales}
                  tone={k === "COMPLETED" ? "success" : k === "CANCELLED" ? "danger" : "primary"}
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Installations by Status">
          {totalInstalls === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No installations
            </p>
          ) : (
            <div className="space-y-3">
              {Object.entries(d.installStatus).map(([k, v]) => (
                <ProgressRow
                  key={k}
                  label={k.replace(/_/g, " ")}
                  value={v}
                  total={totalInstalls}
                  tone={k === "COMPLETED" ? "success" : "info"}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section
        title="Fulfilment Stage Completion"
        description="Completion rate across the 7 sale fulfilment stages (excludes not-required)."
      >
        <div className="space-y-4">
          {d.stages.map((s) => (
            <ProgressRow
              key={s.stage}
              label={STAGE_LABELS[s.stage] ?? s.stage}
              value={Math.round(s.completionRate * 100)}
              total={100}
              format={(n) => `${n}%`}
              tone={
                s.completionRate >= 0.66
                  ? "success"
                  : s.completionRate >= 0.33
                    ? "warning"
                    : "danger"
              }
            />
          ))}
        </div>
      </Section>
    </div>
  );
}
