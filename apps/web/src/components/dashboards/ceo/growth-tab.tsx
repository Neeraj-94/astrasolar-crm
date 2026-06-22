"use client";

import { Users, ShoppingCart, Percent } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { GroupedBars, monthLabel } from "@/components/dashboards/charts";
import { money0 } from "@/components/dashboards/financials/format";

interface GrowthResponse {
  totalLeads: number;
  totalSales: number;
  conversionRate: number;
  series: {
    month: string;
    leads: number;
    sales: number;
    revenue: number;
    conversion: number;
    revenueGrowth: number | null;
  }[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function GrowthTab() {
  const res = useApi<GrowthResponse>("/dashboards/growth");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading growth…</p>;

  const latest = d.series[d.series.length - 1];

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Total Leads"
          value={d.totalLeads}
          tone="primary"
          icon={<Users className="h-4 w-4" />}
        />
        <Kpi
          label="Total Sales"
          value={d.totalSales}
          tone="success"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <Kpi
          label="Conversion Rate"
          value={pct(d.conversionRate)}
          tone="info"
          icon={<Percent className="h-4 w-4" />}
        />
        <Kpi
          label="Latest MoM Revenue"
          value={
            latest?.revenueGrowth == null ? "—" : pct(latest.revenueGrowth)
          }
          tone={
            (latest?.revenueGrowth ?? 0) >= 0 ? "success" : "danger"
          }
          delta={
            latest?.revenueGrowth == null
              ? undefined
              : {
                  value: pct(Math.abs(latest.revenueGrowth)),
                  direction: latest.revenueGrowth >= 0 ? "up" : "down",
                }
          }
        />
      </KpiRow>

      <Section
        title="Leads vs Sales by Month"
        description="Volume trend across the pipeline."
      >
        <GroupedBars
          data={d.series.map((s) => ({
            label: monthLabel(s.month),
            a: s.leads,
            b: s.sales,
          }))}
          series={{ a: "Leads", b: "Sales" }}
        />
      </Section>

      <Section title="Monthly Detail" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Month</th>
                <th className="px-5 py-2.5 text-right font-medium">Leads</th>
                <th className="px-5 py-2.5 text-right font-medium">Sales</th>
                <th className="px-5 py-2.5 text-right font-medium">Conversion</th>
                <th className="px-5 py-2.5 text-right font-medium">Revenue</th>
                <th className="px-5 py-2.5 text-right font-medium">MoM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.series.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-6 text-center text-muted-foreground"
                  >
                    No data yet
                  </td>
                </tr>
              ) : (
                d.series.map((s) => (
                  <tr key={s.month}>
                    <td className="px-5 py-2.5 font-medium">
                      {monthLabel(s.month)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {s.leads}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {s.sales}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {pct(s.conversion)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {money0(s.revenue)}
                    </td>
                    <td
                      className={`px-5 py-2.5 text-right tabular-nums ${
                        s.revenueGrowth == null
                          ? "text-muted-foreground"
                          : s.revenueGrowth >= 0
                            ? "text-emerald-600"
                            : "text-red-600"
                      }`}
                    >
                      {s.revenueGrowth == null ? "—" : pct(s.revenueGrowth)}
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
