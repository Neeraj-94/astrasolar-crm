"use client";

import * as React from "react";
import { Wallet, Clock } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { titleCase } from "@/lib/utils";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";

interface PaymentRow {
  saleId: string;
  saleRef: string | null;
  customerName: string;
  consultantName: string | null;
  amount: number;
  paymentStatus: string;
  paymentDate: string | null;
  paymentNotes: string | null;
}

interface PaymentsResponse {
  rows: PaymentRow[];
  totals: { received: number; pending: number; count: number };
}

const STAGE_BADGE: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  NOT_REQUIRED: "bg-zinc-100 text-zinc-500",
};

export function PaymentsTab() {
  const res = useApi<PaymentsResponse>("/dashboards/financials/payments");
  const [openId, setOpenId] = React.useState<string | null>(null);
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading payments…</p>;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Received"
          value={money0(d.totals.received)}
          tone="success"
          icon={<Wallet className="h-4 w-4" />}
        />
        <Kpi
          label="Pending"
          value={money0(d.totals.pending)}
          tone="warning"
          icon={<Clock className="h-4 w-4" />}
        />
        <Kpi label="Sales" value={d.totals.count} tone="primary" />
      </KpiRow>

      <Section title="Payments" description="Record payments against each sale." flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Sale</th>
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Paid On</th>
                <th className="px-5 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
                    No sales
                  </td>
                </tr>
              ) : (
                d.rows.map((r) => (
                  <React.Fragment key={r.saleId}>
                    <tr className="hover:bg-muted/30">
                      <td className="px-5 py-2.5 font-mono text-xs">
                        {r.saleRef ?? r.saleId.slice(0, 8)}
                      </td>
                      <td className="px-5 py-2.5 font-medium">
                        {r.customerName || "—"}
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                        {money0(r.amount)}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_BADGE[r.paymentStatus] ?? ""}`}
                        >
                          {titleCase(r.paymentStatus)}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {shortDate(r.paymentDate)}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setOpenId(openId === r.saleId ? null : r.saleId)
                          }
                          className="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
                        >
                          {openId === r.saleId ? "Close" : "Record"}
                        </button>
                      </td>
                    </tr>
                    {openId === r.saleId && (
                      <tr>
                        <td colSpan={6} className="bg-muted/20 px-5 py-4">
                          <RecordForm
                            row={r}
                            onDone={() => {
                              setOpenId(null);
                              res.reload();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function RecordForm({
  row,
  onDone,
}: {
  row: PaymentRow;
  onDone: () => void;
}) {
  const [date, setDate] = React.useState(
    row.paymentDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState(row.paymentNotes ?? "");
  const [markPaid, setMarkPaid] = React.useState(
    row.paymentStatus === "COMPLETED",
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/dashboards/financials/payments/${row.saleId}`, {
        method: "POST",
        body: JSON.stringify({
          paymentDate: date || undefined,
          paymentNotes: notes || undefined,
          markPaid,
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record payment");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Payment date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border bg-card px-2 py-1.5 text-xs"
        />
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Reference, method…"
          className="rounded-md border bg-card px-2 py-1.5 text-xs"
        />
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={markPaid}
          onChange={(e) => setMarkPaid(e.target.checked)}
        />
        Mark fully paid
      </label>
      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
      >
        Save
      </button>
      {err && <p className="w-full text-xs text-destructive">{err}</p>}
    </div>
  );
}
