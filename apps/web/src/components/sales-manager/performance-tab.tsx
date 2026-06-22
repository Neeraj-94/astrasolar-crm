"use client";

import { Trophy, DollarSign, Users } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0 } from "@/components/dashboards/financials/format";

interface PerfRow {
  ownerId: string;
  ownerName: string;
  sales: number;
  completed: number;
  totalSold: number;
  totalCommission: number;
  avgSaleValue: number;
  completionRate: number;
}

interface PerfResponse {
  rows: PerfRow[];
  totals: { sales: number; totalSold: number; totalCommission: number };
  consultants: number;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const RANK = ["🥇", "🥈", "🥉"];

export function PerformanceTab() {
  const res = useApi<PerfResponse>("/dashboards/sales-performance");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading performance…</p>;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Team Sales"
          value={d.totals.sales}
          tone="primary"
          icon={<Users className="h-4 w-4" />}
          hint={`${d.consultants} consultants`}
        />
        <Kpi
          label="Total Sold"
          value={money0(d.totals.totalSold)}
          tone="success"
          icon={<DollarSign className="h-4 w-4" />}
        />
        <Kpi
          label="Total Commission"
          value={money0(d.totals.totalCommission)}
          tone="info"
        />
      </KpiRow>

      <Section
        title="Consultant Leaderboard"
        description="Ranked by total sold across your team."
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">#</th>
                <th className="px-5 py-2.5 font-medium">Consultant</th>
                <th className="px-5 py-2.5 text-right font-medium">Sales</th>
                <th className="px-5 py-2.5 text-right font-medium">Completed</th>
                <th className="px-5 py-2.5 text-right font-medium">Total Sold</th>
                <th className="px-5 py-2.5 text-right font-medium">Avg Sale</th>
                <th className="px-5 py-2.5 text-right font-medium">Commission</th>
                <th className="px-5 py-2.5 text-right font-medium">Close %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-6 text-center text-muted-foreground">
                    No sales recorded
                  </td>
                </tr>
              ) : (
                d.rows.map((r, i) => (
                  <tr key={r.ownerId} className="hover:bg-muted/30">
                    <td className="px-5 py-2.5">{RANK[i] ?? i + 1}</td>
                    <td className="px-5 py-2.5 font-medium">{r.ownerName}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {r.sales}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {r.completed}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                      {money0(r.totalSold)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {money0(r.avgSaleValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {money0(r.totalCommission)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {pct(r.completionRate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
