"use client";

import * as React from "react";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";

interface ApprovalRow {
  saleId: string;
  saleRef: string | null;
  customerName: string;
  consultantName: string | null;
  company: string;
  soldPrice: number;
  totalRRP: number;
  discount: number;
  discountPct: number;
  saleDate: string | null;
  createdAt: string;
}

export function ApprovalsTab() {
  const res = useApi<ApprovalRow[]>("/dashboards/approvals");
  const rows = res.data ?? [];

  const flagged = rows.filter((r) => r.discountPct >= 0.1).length;
  const totalValue = rows.reduce((a, r) => a + r.soldPrice, 0);

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Awaiting Approval"
          value={rows.length}
          tone="warning"
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        <Kpi label="High Discount (≥10%)" value={flagged} tone="danger" />
        <Kpi label="Pipeline Value" value={money0(totalValue)} tone="primary" />
      </KpiRow>

      <Section
        title="Pending Sale Approvals"
        description="Sales in negotiation awaiting manager sign-off."
      >
        {res.error ? (
          <p className="text-sm text-destructive">{res.error}</p>
        ) : res.loading ? (
          <p className="text-sm text-muted-foreground">Loading approvals…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing awaiting approval 🎉
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <ApprovalCard key={r.saleId} row={r} onDone={res.reload} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function ApprovalCard({
  row,
  onDone,
}: {
  row: ApprovalRow;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const highDiscount = row.discountPct >= 0.1;

  const decide = async (decision: "APPROVE" | "HOLD" | "REJECT") => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/dashboards/approvals/${row.saleId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <strong className="text-sm">{row.customerName || "Unknown"}</strong>
            {row.saleRef && (
              <span className="font-mono text-xs text-muted-foreground">
                {row.saleRef}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {row.consultantName ?? "—"} · {row.company} ·{" "}
            {shortDate(row.saleDate)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{money0(row.soldPrice)}</div>
          {row.totalRRP > 0 && (
            <div
              className={`text-xs ${highDiscount ? "font-semibold text-red-600" : "text-muted-foreground"}`}
            >
              {money0(row.discount)} off ({Math.round(row.discountPct * 100)}%)
            </div>
          )}
        </div>
      </div>

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => decide("APPROVE")}
          disabled={busy}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide("HOLD")}
          disabled={busy}
          className="rounded-md border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
        >
          Hold
        </button>
        <button
          type="button"
          onClick={() => decide("REJECT")}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
