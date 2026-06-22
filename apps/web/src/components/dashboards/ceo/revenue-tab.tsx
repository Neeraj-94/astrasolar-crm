"use client";

import { DollarSign, TrendingUp, Percent, Receipt } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { BarChart, monthLabel } from "@/components/dashboards/charts";
import { money0 } from "@/components/dashboards/financials/format";

interface RevenueResponse {
  totalRevenue: number;
  totalCommission: number;
  totalRrp: number;
  totalSales: number;
  avgSaleValue: number;
  grossMargin: number;
  series: { month: string; revenue: number; commission: number; sales: number }[];
  byCompany: { company: string; revenue: number; sales: number }[];
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function RevenueTab() {
  const res = useApi<RevenueResponse>("/dashboards/revenue");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading revenue…</p>;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Total Revenue"
          value={money0(d.totalRevenue)}
          tone="success"
          icon={<DollarSign className="h-4 w-4" />}
          hint={`${d.totalSales} sales`}
        />
        <Kpi
          label="Avg Sale Value"
          value={money0(d.avgSaleValue)}
          tone="primary"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <Kpi
          label="Gross Margin"
          value={pct(d.grossMargin)}
          tone="info"
          icon={<Percent className="h-4 w-4" />}
          hint={`${money0(d.totalCommission)} commission`}
        />
        <Kpi
          label="Total RRP"
          value={money0(d.totalRrp)}
          tone="purple"
          icon={<Receipt className="h-4 w-4" />}
        />
      </KpiRow>

      <Section title="Revenue by Month" description="Sold price by sale month.">
        <BarChart
          data={d.series.map((s) => ({
            label: monthLabel(s.month),
            value: s.revenue,
          }))}
          format={money0}
          barClassName="fill-emerald-500"
          emptyText="No sales with a sale date yet"
        />
      </Section>

      <Section title="Revenue by Company">
        {d.byCompany.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No revenue recorded
          </p>
        ) : (
          <div className="divide-y">
            {d.byCompany
              .slice()
              .sort((a, b) => b.revenue - a.revenue)
              .map((c) => (
                <div
                  key={c.company}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium">{c.company}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {c.sales} sales
                    </span>
                    <span className="font-semibold tabular-nums">
                      {money0(c.revenue)}
                    </span>
                  </span>
                </div>
              ))}
          </div>
        )}
      </Section>
    </div>
  );
}
