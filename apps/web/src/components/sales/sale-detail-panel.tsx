"use client";

import { useEffect, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const SALE_STATUS = ["NEGOTIATION", "CONTRACT", "ON_HOLD", "COMPLETED", "CANCELLED"];
const SALE_TYPE = ["SOLAR_ONLY", "BATTERY_ONLY", "SOLAR_BATTERY"];
const SYSTEM_TYPE = ["NEW", "REPLACEMENT", "ADDITIONAL", "ADDITIONAL_REPLACEMENT"];
const STAGE_STATE = ["PENDING", "IN_PROGRESS", "COMPLETED", "NOT_REQUIRED"];
const STATUS_FIELDS: { key: string; label: string }[] = [
  { key: "financeStatus", label: "Finance" },
  { key: "preapprovalStatus", label: "Pre-approval" },
  { key: "meterChangeStatus", label: "Meter change" },
  { key: "installStatus", label: "Install" },
  { key: "paymentStatus", label: "Payment" },
  { key: "commissioningStatus", label: "Commissioning" },
  { key: "cesStatus", label: "CES" },
];

interface Product {
  id: string;
  name: string;
  category: string;
}

export function SaleDetailPanel({
  saleId,
  onSaved,
  onClose,
}: {
  saleId: string;
  onSaved?: () => void;
  onClose?: () => void;
}) {
  const sale = useApi<any>(`/sales/${saleId}`);
  const products = useApi<Product[]>("/products");

  const [core, setCore] = useState({
    status: "NEGOTIATION",
    saleType: "",
    systemType: "",
    soldPrice: "",
    totalRRP: "",
    totalCommission: "",
    energyProvider: "",
  });
  const [system, setSystem] = useState({
    batteryProductId: "",
    panelProductId: "",
    inverterProductId: "",
    numPanels: "",
    systemSize: "",
  });
  const [status, setStatus] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sale.data) return;
    const s = sale.data;
    setCore({
      status: s.status ?? "NEGOTIATION",
      saleType: s.saleType ?? "",
      systemType: s.systemType ?? "",
      soldPrice: s.soldPrice ?? "",
      totalRRP: s.totalRRP ?? "",
      totalCommission: s.totalCommission ?? "",
      energyProvider: s.energyProvider ?? "",
    });
    if (s.systemDetails) {
      setSystem({
        batteryProductId: s.systemDetails.batteryProductId ?? "",
        panelProductId: s.systemDetails.panelProductId ?? "",
        inverterProductId: s.systemDetails.inverterProductId ?? "",
        numPanels: s.systemDetails.numPanels ?? "",
        systemSize: s.systemDetails.systemSize ?? "",
      });
    }
    if (s.statusDetails) {
      const sd: Record<string, string> = {};
      for (const f of STATUS_FIELDS) sd[f.key] = s.statusDetails[f.key] ?? "PENDING";
      setStatus(sd);
    } else {
      const sd: Record<string, string> = {};
      for (const f of STATUS_FIELDS) sd[f.key] = "PENDING";
      setStatus(sd);
    }
  }, [sale.data]);

  const byCat = (cat: string) =>
    (products.data ?? []).filter((p) => p.category === cat);

  async function save(section: "core" | "status" | "system-details" | "status-details", body: unknown) {
    setErr(null);
    setMsg(null);
    try {
      await apiPatch(`/sales/${saleId}/${section}`, body);
      setMsg("Saved");
      sale.reload();
      onSaved?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  }

  const num = (v: string) => (v === "" ? undefined : Number(v));

  if (sale.loading)
    return <p className="text-sm text-muted-foreground">Loading sale…</p>;
  if (sale.error)
    return <p className="text-sm text-destructive">{sale.error}</p>;

  const s = sale.data;

  return (
    <div className="space-y-5 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            Sale {s.saleRef ?? s.id.slice(0, 8)} —{" "}
            {s.contact ? `${s.contact.firstName} ${s.contact.surname}` : ""}
          </h3>
          <p className="text-xs text-muted-foreground">
            Owner: {s.owner?.name ?? "—"} · {s.company}
          </p>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {msg && <p className="text-sm text-emerald-600">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {/* Core / pricing */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
          Pricing &amp; lifecycle
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Status">
            <select className="sel" value={core.status}
              onChange={(e) => setCore({ ...core, status: e.target.value })}>
              {SALE_STATUS.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Sale type">
            <select className="sel" value={core.saleType}
              onChange={(e) => setCore({ ...core, saleType: e.target.value })}>
              <option value="">—</option>
              {SALE_TYPE.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="System type">
            <select className="sel" value={core.systemType}
              onChange={(e) => setCore({ ...core, systemType: e.target.value })}>
              <option value="">—</option>
              {SYSTEM_TYPE.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Energy provider">
            <Input value={core.energyProvider}
              onChange={(e) => setCore({ ...core, energyProvider: e.target.value })} />
          </Field>
          <Field label="Sold price">
            <Input type="number" value={core.soldPrice}
              onChange={(e) => setCore({ ...core, soldPrice: e.target.value })} />
          </Field>
          <Field label="Total RRP">
            <Input type="number" value={core.totalRRP}
              onChange={(e) => setCore({ ...core, totalRRP: e.target.value })} />
          </Field>
          <Field label="Total commission">
            <Input type="number" value={core.totalCommission}
              onChange={(e) => setCore({ ...core, totalCommission: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => save("status", { status: core.status })}>
            Save status
          </Button>
          <Button size="sm" variant="outline"
            onClick={() =>
              save("core", {
                saleType: core.saleType || undefined,
                systemType: core.systemType || undefined,
                energyProvider: core.energyProvider || undefined,
                soldPrice: num(core.soldPrice),
                totalRRP: num(core.totalRRP),
                totalCommission: num(core.totalCommission),
              })
            }>
            Save pricing
          </Button>
        </div>
      </div>

      {/* System details */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
          System (specs snapshot from catalogue)
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Battery">
            <select className="sel" value={system.batteryProductId}
              onChange={(e) => setSystem({ ...system, batteryProductId: e.target.value })}>
              <option value="">—</option>
              {byCat("BATTERIES").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Panel">
            <select className="sel" value={system.panelProductId}
              onChange={(e) => setSystem({ ...system, panelProductId: e.target.value })}>
              <option value="">—</option>
              {byCat("SOLAR").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Inverter">
            <select className="sel" value={system.inverterProductId}
              onChange={(e) => setSystem({ ...system, inverterProductId: e.target.value })}>
              <option value="">—</option>
              {byCat("INVERTER").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="No. panels">
            <Input type="number" value={system.numPanels}
              onChange={(e) => setSystem({ ...system, numPanels: e.target.value })} />
          </Field>
          <Field label="System size (kW)">
            <Input type="number" value={system.systemSize}
              onChange={(e) => setSystem({ ...system, systemSize: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline"
            onClick={() =>
              save("system-details", {
                batteryProductId: system.batteryProductId || undefined,
                panelProductId: system.panelProductId || undefined,
                inverterProductId: system.inverterProductId || undefined,
                numPanels: num(system.numPanels),
                systemSize: num(system.systemSize),
              })
            }>
            Save system
          </Button>
        </div>
      </div>

      {/* 7 status stages */}
      <div className="rounded-lg border p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
          Fulfilment status
        </h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <select className="sel" value={status[f.key] ?? "PENDING"}
                onChange={(e) => setStatus({ ...status, [f.key]: e.target.value })}>
                {STAGE_STATE.map((x) => <option key={x}>{x}</option>)}
              </select>
            </Field>
          ))}
        </div>
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => save("status-details", status)}>
            Save fulfilment
          </Button>
        </div>
      </div>

      <style jsx>{`
        :global(.sel) {
          height: 2.25rem;
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.5rem;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
