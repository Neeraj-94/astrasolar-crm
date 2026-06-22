"use client";

import * as React from "react";
import { api } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";
import { Section } from "@/components/leads/shared";
import { Badge } from "@/components/ui/badge";
import { money0, shortDate } from "./format";

// ----------------------------------------------------------------------------
// Pending RRP Requests — port of the v1 finance widget. Consultants flag
// custom (non-catalogue) products; finance enters an RRP for each item so
// oversell/commission can be computed. PATCH …/complete | …/dismiss.
// ----------------------------------------------------------------------------

interface RrpItem {
  type: string;
  product: string;
  rrp?: number;
}

interface RrpRequest {
  id: string;
  saleId: string;
  saleRef: string | null;
  customerName: string;
  consultantName: string | null;
  saleDate: string | null;
  soldPrice: number;
  items: RrpItem[];
  createdAt: string;
}

export function RrpRequestsWidget() {
  const res = useApi<RrpRequest[]>(
    "/dashboards/financials/rrp-requests?status=PENDING",
  );
  const pending = res.data ?? [];

  return (
    <Section
      title="Pending RRP Requests"
      description="Custom products awaiting an RRP from finance."
      actions={
        pending.length > 0 ? (
          <Badge variant="warning">{pending.length}</Badge>
        ) : undefined
      }
    >
      {res.error ? (
        <p className="text-sm text-destructive">{res.error}</p>
      ) : res.loading ? (
        <p className="text-sm text-muted-foreground">Loading requests…</p>
      ) : pending.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No pending RRP requests
        </p>
      ) : (
        <div className="space-y-3">
          {pending.map((r) => (
            <RequestCard key={r.id} req={r} onDone={res.reload} />
          ))}
        </div>
      )}
    </Section>
  );
}

function RequestCard({
  req,
  onDone,
}: {
  req: RrpRequest;
  onDone: () => void;
}) {
  const [values, setValues] = React.useState<string[]>(
    req.items.map(() => ""),
  );
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const allFilled = values.every((v) => Number(v) > 0);

  const complete = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api(`/dashboards/financials/rrp-requests/${req.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({
          items: req.items.map((it, i) => ({
            type: it.type,
            product: it.product,
            rrp: Number(values[i]),
          })),
        }),
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save RRP");
      setBusy(false);
    }
  };

  const dismiss = async () => {
    setErr(null);
    setBusy(true);
    try {
      await api(`/dashboards/financials/rrp-requests/${req.id}/dismiss`, {
        method: "PATCH",
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to dismiss");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <strong className="text-sm">{req.customerName || "Unknown"}</strong>
          <span className="ml-2 text-xs text-muted-foreground">
            {shortDate(req.saleDate)}
            {req.saleRef ? ` · ${req.saleRef}` : ""}
          </span>
        </div>
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
          {money0(req.soldPrice)} sold
        </span>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">
        Consultant: {req.consultantName ?? "—"}
      </div>

      <div className="space-y-2">
        {req.items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <label className="min-w-28 text-xs text-muted-foreground">
              {it.type}: <strong className="text-foreground">{it.product || "—"}</strong>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={values[i]}
              onChange={(e) =>
                setValues((prev) =>
                  prev.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
              placeholder="Enter RRP $"
              className="w-36 rounded-md border bg-card px-2 py-1.5 text-xs"
              aria-label={`${it.type} RRP`}
            />
          </div>
        ))}
      </div>

      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={complete}
          disabled={busy || !allFilled}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          Save RRP &amp; Complete
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={busy}
          className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
