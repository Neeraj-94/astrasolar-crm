"use client";

import * as React from "react";
import { FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";

interface InvoiceRow {
  saleId: string;
  saleRef: string | null;
  customerName: string;
  consultantName: string | null;
  company: string;
  amount: number;
  saleDate: string | null;
  paymentStatus: string;
  financeStatus: string;
  invoiceState: "DRAFT" | "ISSUED" | "PAID" | "OVERDUE";
  paymentDate: string | null;
}

interface InvoicesResponse {
  rows: InvoiceRow[];
  totals: { total: number; paid: number; outstanding: number };
  count: number;
}

// invoice state -> the stage enum we persist
const STATE_TO_STAGE: Record<string, string> = {
  DRAFT: "PENDING",
  ISSUED: "IN_PROGRESS",
  PAID: "COMPLETED",
};

const STATE_BADGE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  ISSUED: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function InvoicesTab() {
  const res = useApi<InvoicesResponse>("/dashboards/financials/invoices");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const d = res.data;

  const setState = async (saleId: string, state: string) => {
    setSavingId(saleId);
    try {
      await api(`/dashboards/financials/invoices/${saleId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: STATE_TO_STAGE[state] }),
      });
      await res.reload();
    } finally {
      setSavingId(null);
    }
  };

  if (res.error)
    return <p className="text-sm text-destructive">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading invoices…</p>;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Invoiced Total"
          value={money0(d.totals.total)}
          tone="primary"
          icon={<FileText className="h-4 w-4" />}
          hint={`${d.count} invoices`}
        />
        <Kpi
          label="Paid"
          value={money0(d.totals.paid)}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <Kpi
          label="Outstanding"
          value={money0(d.totals.outstanding)}
          tone="warning"
          icon={<AlertCircle className="h-4 w-4" />}
        />
      </KpiRow>

      <Section title="Invoices" description="One invoice per sale." flush>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Invoice</th>
                <th className="px-5 py-2.5 font-medium">Customer</th>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Set</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {d.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">
                    No invoices
                  </td>
                </tr>
              ) : (
                d.rows.map((r) => (
                  <tr key={r.saleId} className="hover:bg-muted/30">
                    <td className="px-5 py-2.5 font-mono text-xs">
                      {r.saleRef ?? r.saleId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="font-medium">{r.customerName || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.company}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-muted-foreground">
                      {shortDate(r.saleDate)}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                      {money0(r.amount)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[r.invoiceState]}`}
                      >
                        {r.invoiceState}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      <select
                        value={r.invoiceState}
                        disabled={savingId === r.saleId}
                        onChange={(e) => setState(r.saleId, e.target.value)}
                        className="rounded-md border bg-card px-2 py-1 text-xs disabled:opacity-50"
                        aria-label="Set invoice status"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="ISSUED">Issued</option>
                        <option value="PAID">Paid</option>
                      </select>
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
