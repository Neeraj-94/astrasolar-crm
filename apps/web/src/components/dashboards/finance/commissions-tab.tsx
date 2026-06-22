"use client";

import * as React from "react";
import { Coins, Wallet, Users, Download } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow, SearchInput } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";

// ---------------------------------------------------------------------------
// Commissions tab — ported from the v1 (astrasolar-app) CEO/Finance
// "💰 Commissions" tab (renderCeoInvoicing + renderCommissionPayoutReport).
//
// v1 was a Firebase/in-memory SPA; here the two halves are wired to the
// NestJS API over the SAME scoped sale data:
//   • Commissions Overview     -> GET /dashboards/commission-summary
//   • Commission Payout Report -> GET /dashboards/commission-payout
// Both endpoints are gated finance:read:all and scoped server-side.
// ---------------------------------------------------------------------------

interface SummaryRow {
  ownerId: string;
  ownerName: string | null;
  sales: number;
  totalSold: number;
  totalCommission: number;
}

interface PayoutRow {
  saleId: string;
  saleRef: string | null;
  customerName: string;
  consultantId: string | null;
  consultantName: string | null;
  company: string;
  product: string | null;
  soldPrice: number;
  commission: number;
  saleDate: string | null;
  paidStatus: "Paid" | "Ready" | "Pending";
}

interface PayoutResponse {
  rows: PayoutRow[];
  totals: { count: number; totalCommission: number; totalSold: number };
  byConsultant: { consultantName: string; count: number; commission: number }[];
}

const PAID_BADGE: Record<PayoutRow["paidStatus"], string> = {
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  Ready: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Pending: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

function csvCell(v: string | number | null): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function CommissionsTab() {
  // ---- Commissions Overview (portfolio aggregate) -------------------------
  const summary = useApi<SummaryRow[]>("/dashboards/commission-summary");

  // ---- Commission Payout Report (filterable detail) -----------------------
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [consultantId, setConsultantId] = React.useState("");
  const [search, setSearch] = React.useState("");

  const payoutPath = React.useMemo(() => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (consultantId) qs.set("userId", consultantId);
    const s = qs.toString();
    return `/dashboards/commission-payout${s ? `?${s}` : ""}`;
  }, [from, to, consultantId]);

  const payout = useApi<PayoutResponse>(payoutPath);

  // Consultant dropdown options come from the (unfiltered) overview summary.
  const consultants = React.useMemo(
    () =>
      (summary.data ?? [])
        .filter((r) => r.ownerName)
        .map((r) => ({ id: r.ownerId, name: r.ownerName as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [summary.data],
  );

  // Client-side text search over the fetched payout rows (v1 parity: search
  // by client / consultant / product).
  const rows = React.useMemo(() => {
    const all = payout.data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      [r.customerName, r.consultantName, r.product, r.saleRef]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [payout.data, search]);

  const overviewTotals = React.useMemo(() => {
    const data = summary.data ?? [];
    return {
      commission: data.reduce((a, r) => a + r.totalCommission, 0),
      sold: data.reduce((a, r) => a + r.totalSold, 0),
      sales: data.reduce((a, r) => a + r.sales, 0),
      consultants: data.filter((r) => r.totalCommission > 0).length,
    };
  }, [summary.data]);

  const clearFilters = () => {
    setFrom("");
    setTo("");
    setConsultantId("");
    setSearch("");
  };
  const anyFilter = !!(from || to || consultantId || search);

  const exportCsv = () => {
    const header = [
      "#",
      "Client",
      "Consultant",
      "Product",
      "Sold Price",
      "Sale Date",
      "Commission",
      "Status",
    ];
    const lines = rows.map((r, i) =>
      [
        i + 1,
        r.customerName,
        r.consultantName ?? "",
        r.product ?? "",
        r.soldPrice,
        r.saleDate ?? "",
        r.commission,
        r.paidStatus,
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-payout-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputCls =
    "rounded-md border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-6">
      {/* ---- Commissions Overview ------------------------------------- */}
      <KpiRow>
        <Kpi
          label="Total Commission"
          value={money0(overviewTotals.commission)}
          tone="primary"
          icon={<Coins className="h-4 w-4" />}
          hint={`${overviewTotals.sales} sales`}
        />
        <Kpi
          label="Total Sold"
          value={money0(overviewTotals.sold)}
          tone="info"
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Consultants"
          value={overviewTotals.consultants}
          tone="purple"
          icon={<Users className="h-4 w-4" />}
        />
      </KpiRow>

      <Section
        title="Commissions Overview"
        description="Commission earned per consultant across all visible sales."
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Consultant</th>
                <th className="px-5 py-2.5 text-right font-medium">Sales</th>
                <th className="px-5 py-2.5 text-right font-medium">Total Sold</th>
                <th className="px-5 py-2.5 text-right font-medium">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {summary.loading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : (summary.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-muted-foreground">
                    No commission data
                  </td>
                </tr>
              ) : (
                [...(summary.data ?? [])]
                  .sort((a, b) => b.totalCommission - a.totalCommission)
                  .map((r) => (
                    <tr key={r.ownerId} className="hover:bg-muted/30">
                      <td className="px-5 py-2.5 font-medium">
                        {r.ownerName ?? "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {r.sales}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {money0(r.totalSold)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                        {money0(r.totalCommission)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ---- Commission Payout Report --------------------------------- */}
      <Section
        title="Commission Payout Report"
        description="Filter completed sales by date range and consultant to process payouts."
        actions={
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      >
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Completed from
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Completed to
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Consultant
              <select
                value={consultantId}
                onChange={(e) => setConsultantId(e.target.value)}
                className={inputCls}
              >
                <option value="">All consultants</option>
                {consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-transparent">
                Search
              </span>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Client, consultant, product…"
              />
            </div>
            {anyFilter && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                ✕ Clear
              </button>
            )}
          </div>

          {/* Summary cards */}
          {payout.data && payout.data.rows.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Completed Sales
                </div>
                <div className="text-xl font-bold text-primary">
                  {payout.data.totals.count}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Total Commission
                </div>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                  {money0(payout.data.totals.totalCommission)}
                </div>
              </div>
              {payout.data.byConsultant.map((c) => (
                <div
                  key={c.consultantName}
                  className="rounded-xl border bg-card p-3 text-center"
                >
                  <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">
                    {c.consultantName}
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {money0(c.commission)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.count} sale{c.count !== 1 ? "s" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Detail table */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Consultant</th>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sold Price</th>
                  <th className="px-4 py-2.5 font-medium">Sale Date</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    Commission Payable
                  </th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payout.loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                      No completed sales for the selected filters.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={r.saleId} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium">{r.customerName}</td>
                      <td className="px-4 py-2.5">{r.consultantName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {r.product ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {money0(r.soldPrice)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {shortDate(r.saleDate)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                        {money0(r.commission)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PAID_BADGE[r.paidStatus]}`}
                        >
                          {r.paidStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  );
}
