"use client";

import { useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { useRowReorder } from "@/lib/api/use-reorder";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DragTH,
} from "@/components/leads/shared/data-table";
import { SaleDetailPanel } from "./sale-detail-panel";

interface SaleRow {
  id: string;
  saleRef: string | null;
  company: string;
  status: string;
  soldPrice: string | number | null;
  totalCommission: string | number | null;
  saleDate: string | null;
  contact: { firstName: string; surname: string } | null;
  owner: { id: string; name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  NEGOTIATION: "bg-sky-100 text-sky-700",
  CONTRACT: "bg-indigo-100 text-indigo-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-zinc-100 text-zinc-600",
};

function money(n: string | number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

/**
 * Sales list backed by GET /sales — scoped server-side (consultants see their
 * own sales; managers/finance see team sales via the scope selector).
 */
export function SalesListTab() {
  const sales = useApi<SaleRow[]>("/sales");
  const sortable = useRowReorder(sales, (s) => s.id, "/sales/reorder");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
    <section className="rounded-xl border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">
        Sales {sales.data ? `(${sales.data.length})` : ""}
      </h3>
      {sales.loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sales.error ? (
        <p className="text-sm text-destructive">{sales.error}</p>
      ) : (sales.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No sales in your scope yet.</p>
      ) : (
        <DataTable sortable={sortable}>
          <THead>
            <tr>
              <DragTH />
              <TH>Ref</TH>
              <TH>Customer</TH>
              <TH>Brand</TH>
              <TH>Status</TH>
              <TH>Owner</TH>
              <TH align="right">Sold price</TH>
              <TH align="right">Commission</TH>
              <TH>Sale date</TH>
            </tr>
          </THead>
          <TBody>
            {(sales.data ?? []).map((s) => (
              <TR
                key={s.id}
                sortableId={s.id}
                onClick={() => setSelectedId(s.id)}
                selected={selectedId === s.id}
              >
                <TD className="font-mono text-xs">{s.saleRef ?? "—"}</TD>
                <TD>
                  {s.contact ? `${s.contact.firstName} ${s.contact.surname}` : "—"}
                </TD>
                <TD>{s.company}</TD>
                <TD>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_COLORS[s.status] ?? "bg-muted"}`}>
                    {s.status}
                  </span>
                </TD>
                <TD>{s.owner?.name ?? "—"}</TD>
                <TD align="right" className="tabular-nums">{money(s.soldPrice)}</TD>
                <TD align="right" className="tabular-nums">{money(s.totalCommission)}</TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {s.saleDate ? new Date(s.saleDate).toLocaleDateString() : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </DataTable>
      )}
    </section>

    {selectedId && (
      <SaleDetailPanel
        saleId={selectedId}
        onSaved={() => sales.reload()}
        onClose={() => setSelectedId(null)}
      />
    )}
    </div>
  );
}
