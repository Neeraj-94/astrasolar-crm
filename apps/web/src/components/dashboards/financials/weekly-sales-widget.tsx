"use client";

import * as React from "react";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { money0, shortDate } from "./format";

// ----------------------------------------------------------------------------
// Weekly Sales table — port of the v1 CEO "Weekly Sales" widget.
// GET /dashboards/financials/weekly-sales?range=…
// ----------------------------------------------------------------------------

const RANGES = [
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_30", label: "Last 30 Days" },
  { key: "last_90", label: "Last 90 Days" },
  { key: "all_time", label: "All Time" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

interface SaleRow {
  id: string;
  saleRef: string | null;
  date: string | null;
  consultant: string;
  leadGen: string | null;
  customer: string;
  state: string;
  leadSource: string;
  soldPrice: number;
  commission: number;
  oversell: number | null;
  financeMethod: "CASH" | "FINANCE";
  financeStatus: string;
}

interface Response {
  range: RangeKey;
  rows: SaleRow[];
  totals: {
    count: number;
    soldPrice: number;
    commission: number;
    oversell: number;
  };
}

const STATUS_VARIANT: Record<
  string,
  "success" | "warning" | "info" | "secondary"
> = {
  COMPLETED: "success",
  IN_PROGRESS: "info",
  PENDING: "warning",
  NOT_REQUIRED: "secondary",
};

export function WeeklySalesWidget() {
  const [range, setRange] = React.useState<RangeKey>("this_week");
  const res = useApi<Response>(
    `/dashboards/financials/weekly-sales?range=${range}`,
  );
  const rows = res.data?.rows ?? [];
  const totals = res.data?.totals;

  return (
    <Section
      title="Weekly Sales"
      description="Every sale in the selected range with price, commission and finance status."
      flush
      actions={
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
          className="rounded-md border bg-card px-2 py-1 text-xs"
          aria-label="Select range"
        >
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
      }
    >
      {res.error ? (
        <p className="p-4 text-sm text-destructive">{res.error}</p>
      ) : res.loading ? (
        <p className="p-4 text-sm text-muted-foreground">Loading sales…</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-xs">
              <thead className="bg-muted/80 text-muted-foreground">
                <tr>
                  {[
                    "Date",
                    "Consultant",
                    "Lead Gen",
                    "Customer",
                    "State",
                    "Lead Source",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                  {["Sold Price", "Commission", "Oversell"].map((h) => (
                    <th key={h} className="px-3 py-2 text-right font-medium">
                      {h}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center font-medium">Finance</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No sales in this range.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-1.5">{shortDate(r.date)}</td>
                      <td className="px-3 py-1.5">{r.consultant}</td>
                      <td className="px-3 py-1.5">{r.leadGen ?? "—"}</td>
                      <td className="px-3 py-1.5">{r.customer}</td>
                      <td className="px-3 py-1.5">{r.state || "—"}</td>
                      <td className="px-3 py-1.5">{r.leadSource || "—"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {money0(r.soldPrice)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {money0(r.commission)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          r.oversell == null
                            ? "text-muted-foreground"
                            : r.oversell >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-red-500",
                        )}
                      >
                        {r.oversell == null ? "—" : money0(r.oversell)}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {r.financeMethod === "CASH" ? (
                          <Badge variant="outline">Cash</Badge>
                        ) : (
                          <Badge
                            variant={
                              STATUS_VARIANT[r.financeStatus] ?? "secondary"
                            }
                          >
                            {r.financeStatus.replace("_", " ").toLowerCase()}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totals && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 border-t px-4 py-2.5 text-xs">
              <span>
                <span className="text-muted-foreground">Sales:</span>{" "}
                <strong>{totals.count}</strong>
              </span>
              <span>
                <span className="text-muted-foreground">Revenue:</span>{" "}
                <strong className="tabular-nums">
                  {money0(totals.soldPrice)}
                </strong>
              </span>
              <span>
                <span className="text-muted-foreground">Commission:</span>{" "}
                <strong className="tabular-nums">
                  {money0(totals.commission)}
                </strong>
              </span>
              <span>
                <span className="text-muted-foreground">Oversell:</span>{" "}
                <strong
                  className={cn(
                    "tabular-nums",
                    totals.oversell >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-500",
                  )}
                >
                  {money0(totals.oversell)}
                </strong>
              </span>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
