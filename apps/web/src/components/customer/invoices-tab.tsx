"use client";

import { Receipt } from "lucide-react";
import { useApi } from "@/lib/api/use-api";
import { Section, Kpi, KpiRow } from "@/components/leads/shared";
import { money0, shortDate } from "@/components/dashboards/financials/format";

interface InvoiceResponse {
  hasSale: boolean;
  invoice: {
    saleRef: string | null;
    amount: number;
    saleDate: string | null;
    paymentStatus: string;
    invoiceState: "PAID" | "PART-PAID" | "DUE";
    paymentDate: string | null;
    paymentNotes: string | null;
  } | null;
}

const STATE_BADGE: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "PART-PAID": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  DUE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export function CustomerInvoicesTab() {
  const res = useApi<InvoiceResponse>("/customer/invoices");
  const d = res.data;

  if (res.error)
    return <p className="text-sm text-muted-foreground">{res.error}</p>;
  if (res.loading || !d)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!d.hasSale || !d.invoice)
    return (
      <Section title="Invoices">
        <p className="py-6 text-center text-sm text-muted-foreground">
          You don&apos;t have any invoices yet.
        </p>
      </Section>
    );

  const inv = d.invoice;

  return (
    <div className="space-y-6">
      <KpiRow>
        <Kpi
          label="Invoice Total"
          value={money0(inv.amount)}
          tone="primary"
          icon={<Receipt className="h-4 w-4" />}
        />
        <Kpi
          label="Status"
          value={inv.invoiceState}
          tone={inv.invoiceState === "PAID" ? "success" : "warning"}
        />
        <Kpi
          label="Paid On"
          value={inv.paymentDate ? shortDate(inv.paymentDate) : "—"}
          tone="default"
        />
      </KpiRow>

      <Section title="Invoice Detail" flush>
        <div className="divide-y">
          <Row label="Invoice / Sale Ref" value={inv.saleRef ?? "—"} />
          <Row label="Date" value={shortDate(inv.saleDate)} />
          <Row label="Amount" value={money0(inv.amount)} />
          <Row
            label="Status"
            value={
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE[inv.invoiceState]}`}
              >
                {inv.invoiceState}
              </span>
            }
          />
          {inv.paymentNotes && <Row label="Notes" value={inv.paymentNotes} />}
        </div>
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
