"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import type { SaleListItem } from "@astra/shared";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/leads/shared/data-table";
import {
  downloadCsv,
  fmtDate,
  money,
  titleCase,
  toISODate,
  weekBounds,
} from "./shared";

/** Commission payout lands this many days after the sale date. */
const PAYOUT_DAYS = 15;

type PayoutFilter = "all" | "pending" | "due";

function payoutDate(saleDate: string | null): Date | null {
  if (!saleDate) return null;
  const d = new Date(saleDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + PAYOUT_DAYS);
  return d;
}

function payoutStatus(saleDate: string | null): "pending" | "due" | null {
  const p = payoutDate(saleDate);
  if (!p) return null;
  return p.getTime() <= Date.now() ? "due" : "pending";
}

export function RepResultsTab() {
  const sales = useApi<SaleListItem[]>("/sales");
  // Default to the previous full calendar week (Mon–Sun), matching the
  // commission cycle, with arrows to move between weeks.
  const [weekOffset, setWeekOffset] = useState(-1);
  const [allWeeks, setAllWeeks] = useState(false);
  const [filter, setFilter] = useState<PayoutFilter>("all");

  const { start, end } = weekBounds(weekOffset);

  const rows = useMemo(() => {
    let r = (sales.data ?? []).filter((s) => s.status !== "CANCELLED");
    if (!allWeeks) {
      const from = toISODate(start);
      const to = toISODate(end);
      r = r.filter((s) => {
        const d = s.saleDate?.slice(0, 10);
        return d != null && d >= from && d <= to;
      });
    }
    if (filter !== "all") r = r.filter((s) => payoutStatus(s.saleDate) === filter);
    return r;
  }, [sales.data, allWeeks, filter, start, end]);

  const perRep = useMemo(() => {
    const map = new Map<string, { count: number; commission: number }>();
    for (const s of rows) {
      const key = s.ownerName ?? "Unassigned";
      const r = map.get(key) ?? { count: 0, commission: 0 };
      r.count += 1;
      r.commission += Number(s.totalCommission ?? 0);
      map.set(key, r);
    }
    return [...map.entries()]
      .map(([name, r]) => ({ name, ...r }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const counts = useMemo(() => {
    const base = (sales.data ?? []).filter((s) => s.status !== "CANCELLED");
    const inWeek = allWeeks
      ? base
      : base.filter((s) => {
          const d = s.saleDate?.slice(0, 10);
          return d != null && d >= toISODate(start) && d <= toISODate(end);
        });
    return {
      all: inWeek.length,
      pending: inWeek.filter((s) => payoutStatus(s.saleDate) === "pending").length,
      due: inWeek.filter((s) => payoutStatus(s.saleDate) === "due").length,
    };
  }, [sales.data, allWeeks, start, end]);

  function exportCsv() {
    downloadCsv(
      `rep-results_${toISODate(start)}_${toISODate(end)}.csv`,
      ["Sale Ref", "Customer", "Company", "Rep", "Sale Date", "Status", "Sold Price", "Commission", "Payout Date", "Payout Status"],
      rows.map((s) => [
        s.saleRef ?? "",
        `${s.lead?.firstName ?? ""} ${s.lead?.surName ?? ""}`.trim(),
        s.company,
        s.ownerName ?? "",
        fmtDate(s.saleDate),
        titleCase(s.status),
        s.soldPrice ?? "",
        s.totalCommission ?? "",
        fmtDate(payoutDate(s.saleDate)),
        titleCase(payoutStatus(s.saleDate)),
      ]),
    );
  }

  const filterBtn = (key: PayoutFilter, label: string, count: number) => (
    <button
      onClick={() => setFilter(key)}
      className={`rounded-full border px-3 py-1 text-xs ${
        filter === key
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground hover:bg-muted"
      }`}>
      {label} ({count})
    </button>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={allWeeks}
              onClick={() => setWeekOffset((w) => w - 1)}>‹</Button>
            <span className="min-w-[200px] text-center text-sm font-medium">
              {allWeeks ? "All weeks" : `${fmtDate(start)} – ${fmtDate(end)}`}
            </span>
            <Button variant="outline" size="sm" disabled={allWeeks || weekOffset >= 0}
              onClick={() => setWeekOffset((w) => w + 1)}>›</Button>
            <Button variant="outline" size="sm" disabled={allWeeks}
              onClick={() => setWeekOffset(-1)}>Last Week</Button>
            <Button variant={allWeeks ? "default" : "outline"} size="sm"
              onClick={() => setAllWeeks((v) => !v)}>
              {allWeeks ? "Showing all" : "All weeks"}
            </Button>
          </div>
          <div className="ml-auto flex gap-2">
            {filterBtn("all", "All", counts.all)}
            {filterBtn("pending", "Pending Payout", counts.pending)}
            {filterBtn("due", "Due Now", counts.due)}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Payout date = sale date + {PAYOUT_DAYS} days.
        </p>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Per-rep results</h3>
        {perRep.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {perRep.map((r) => (
              <div key={r.name} className="rounded-xl border bg-background p-4">
                <p className="truncate text-xs text-muted-foreground" title={r.name}>{r.name}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{r.count}</p>
                <p className="text-xs text-muted-foreground">
                  {money(r.commission)} commission
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Sales ({rows.length})</h3>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Button>
        </div>
        {sales.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sales.error ? (
          <p className="text-sm text-destructive">{sales.error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales match the current filters.</p>
        ) : (
          <DataTable>
            <THead>
              <tr>
                <TH>Ref</TH>
                <TH>Customer</TH>
                <TH>Company</TH>
                <TH>Rep</TH>
                <TH>Sale Date</TH>
                <TH>Status</TH>
                <TH align="right">Sold Price</TH>
                <TH align="right">Commission</TH>
                <TH>Payout Date</TH>
                <TH>Payout</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((s) => {
                const status = payoutStatus(s.saleDate);
                return (
                  <TR key={s.id}>
                    <TD className="text-muted-foreground">{s.saleRef ?? "—"}</TD>
                    <TD>{`${s.lead?.firstName ?? ""} ${s.lead?.surName ?? ""}`.trim() || "—"}</TD>
                    <TD className="text-muted-foreground">{s.company}</TD>
                    <TD>{s.ownerName ?? "—"}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(s.saleDate)}</TD>
                    <TD className="text-muted-foreground">{titleCase(s.status)}</TD>
                    <TD align="right" className="tabular-nums">{money(s.soldPrice)}</TD>
                    <TD align="right" className="tabular-nums">{money(s.totalCommission)}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(payoutDate(s.saleDate))}</TD>
                    <TD>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                        status === "due"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}>
                        {titleCase(status)}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
