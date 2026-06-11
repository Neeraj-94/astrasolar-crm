"use client";

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

interface Row {
  ownerId: string;
  ownerName: string | null;
  sales: number;
  totalSold: number;
  totalCommission: number;
}

function money(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

/**
 * Commission summary by consultant — backed by GET /dashboards/commission-summary
 * (finance:read:all). Scoped server-side.
 */
export function CommissionSummary() {
  const summary = useApi<Row[]>("/dashboards/commission-summary");
  // Session-only reorder — rows are aggregates with no stored position.
  const sortable = useRowReorder(summary, (r) => r.ownerId);

  if (summary.loading)
    return <p className="text-sm text-muted-foreground">Loading commissions…</p>;
  if (summary.error)
    return <p className="text-sm text-destructive">{summary.error}</p>;

  const rows = summary.data ?? [];
  const totalSold = rows.reduce((a, r) => a + r.totalSold, 0);
  const totalComm = rows.reduce((a, r) => a + r.totalCommission, 0);

  return (
    <section className="rounded-xl border bg-card p-5">
      <h3 className="mb-4 text-sm font-semibold">Commission by consultant</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sales in scope yet.</p>
      ) : (
        <DataTable sortable={sortable}>
          <THead>
            <tr>
              <DragTH />
              <TH>Consultant</TH>
              <TH align="right">Sales</TH>
              <TH align="right">Total sold</TH>
              <TH align="right">Commission</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.ownerId} sortableId={r.ownerId}>
                <TD>{r.ownerName ?? r.ownerId.slice(0, 8)}</TD>
                <TD align="right" className="tabular-nums">{r.sales}</TD>
                <TD align="right" className="tabular-nums">{money(r.totalSold)}</TD>
                <TD align="right" className="tabular-nums">{money(r.totalCommission)}</TD>
              </TR>
            ))}
            <TR className="font-semibold">
              {/* Leading empty cell lines up with the drag-handle column. */}
              <TD>{null}</TD>
              <TD>Total</TD>
              <TD align="right" className="tabular-nums">
                {rows.reduce((a, r) => a + r.sales, 0)}
              </TD>
              <TD align="right" className="tabular-nums">{money(totalSold)}</TD>
              <TD align="right" className="tabular-nums">{money(totalComm)}</TD>
            </TR>
          </TBody>
        </DataTable>
      )}
    </section>
  );
}
