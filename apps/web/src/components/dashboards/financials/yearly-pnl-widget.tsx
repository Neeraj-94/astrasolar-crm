"use client";

import * as React from "react";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { cn } from "@/lib/utils";
import { money0, weekLabel } from "./format";

// ----------------------------------------------------------------------------
// Yearly P&L — port of the v1 "📊 Yearly P&L" modal: one row per week.
// GET /dashboards/financials/yearly?year=…
// ----------------------------------------------------------------------------

interface WeekRow {
  week: string;
  sales: number;
  revenue: number;
  grossProfit: number;
  fixedCosts: number;
  bloomeLeads: number;
  leadSpend: number;
  netProfit: number;
}

interface Response {
  year: number;
  rows: WeekRow[];
  totals: Omit<WeekRow, "week">;
}

export function YearlyPnlWidget() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState(thisYear);
  const res = useApi<Response>(`/dashboards/financials/yearly?year=${year}`);
  const rows = res.data?.rows ?? [];
  const t = res.data?.totals;

  const num = (v: number, cls?: string) => (
    <td className={cn("px-3 py-1.5 text-right tabular-nums", cls)}>
      {money0(v)}
    </td>
  );

  return (
    <Section
      title={`Yearly P&L — ${year}`}
      description="Week-by-week profit and loss: gross profit less fixed costs and Bloome lead spend."
      flush
      actions={
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded-md border bg-card px-2 py-1 text-xs"
          aria-label="Select year"
        >
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      }
    >
      {res.error ? (
        <p className="p-4 text-sm text-destructive">{res.error}</p>
      ) : res.loading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading yearly P&L…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No financial data for {year} yet.
        </p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full whitespace-nowrap text-xs">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Week</th>
                <th className="px-3 py-2 text-right font-medium">Sales</th>
                <th className="px-3 py-2 text-right font-medium">Revenue</th>
                <th className="px-3 py-2 text-right font-medium">
                  Gross Profit
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Fixed Costs
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  Bloome Leads
                </th>
                <th className="px-3 py-2 text-right font-medium">Lead Spend</th>
                <th className="px-3 py-2 text-right font-medium">Net P&L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.week} className="border-t">
                  <td className="px-3 py-1.5">{weekLabel(r.week)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.sales}
                  </td>
                  {num(r.revenue)}
                  {num(r.grossProfit, "text-emerald-600 dark:text-emerald-400")}
                  {num(r.fixedCosts, "text-red-500")}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {r.bloomeLeads}
                  </td>
                  {num(r.leadSpend, "text-red-500")}
                  {num(
                    r.netProfit,
                    cn(
                      "font-semibold",
                      r.netProfit >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-500",
                    ),
                  )}
                </tr>
              ))}
              {t && (
                <tr className="sticky bottom-0 border-t-2 bg-muted font-bold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.sales}
                  </td>
                  {num(t.revenue)}
                  {num(t.grossProfit, "text-emerald-600 dark:text-emerald-400")}
                  {num(t.fixedCosts, "text-red-500")}
                  <td className="px-3 py-2 text-right tabular-nums">
                    {t.bloomeLeads}
                  </td>
                  {num(t.leadSpend, "text-red-500")}
                  {num(
                    t.netProfit,
                    t.netProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500",
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
