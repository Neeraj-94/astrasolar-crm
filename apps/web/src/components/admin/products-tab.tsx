"use client";

import { useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPost } from "@/lib/api/client";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Product {
  id: string;
  productRef: string | null;
  name: string;
  model: string | null;
  category: string;
  status: string;
  rrp: string | number | null;
  commission: string | number | null;
  stc: number | null;
  panelWatt: number | null;
  batterySize: string | number | null;
}

const CATEGORIES = ["BATTERIES", "INVERTER", "SOLAR", "EXTRAS"];

function money(n: string | number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

export function AdminProductsTab() {
  const products = useApi<Product[]>("/products?all=true");
  const sortable = useRowReorder(products, (p) => p.id, "/products/reorder");
  const [form, setForm] = useState({
    name: "",
    model: "",
    category: "SOLAR",
    rrp: "",
    commission: "",
    stc: "",
    panelWatt: "",
    batterySize: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        model: form.model || undefined,
        category: form.category,
        rrp: form.rrp ? Number(form.rrp) : undefined,
        commission: form.commission ? Number(form.commission) : undefined,
        stc: form.stc ? Number(form.stc) : undefined,
      };
      if (form.category === "SOLAR" && form.panelWatt)
        body.panelWatt = Number(form.panelWatt);
      if (form.category === "BATTERIES" && form.batterySize)
        body.batterySize = Number(form.batterySize);
      await apiPost("/products", body);
      setForm({ ...form, name: "", model: "", rrp: "", commission: "", stc: "", panelWatt: "", batterySize: "" });
      products.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create product");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, action: "archive" | "discontinue" | "reactivate") {
    setErr(null);
    try {
      await apiPost(`/products/${id}/${action}`, {});
      products.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not ${action}`);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">Add product</h3>
        <form onSubmit={create} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <div className="space-y-1">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-model">Model</Label>
            <Input id="p-model" value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-cat">Category</Label>
            <select id="p-cat"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-rrp">RRP</Label>
            <Input id="p-rrp" type="number" value={form.rrp}
              onChange={(e) => setForm({ ...form, rrp: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-comm">Commission</Label>
            <Input id="p-comm" type="number" value={form.commission}
              onChange={(e) => setForm({ ...form, commission: e.target.value })} />
          </div>
          {form.category === "SOLAR" ? (
            <div className="space-y-1">
              <Label htmlFor="p-watt">Panel watt</Label>
              <Input id="p-watt" type="number" value={form.panelWatt}
                onChange={(e) => setForm({ ...form, panelWatt: e.target.value })} />
            </div>
          ) : form.category === "BATTERIES" ? (
            <div className="space-y-1">
              <Label htmlFor="p-size">Size (kWh)</Label>
              <Input id="p-size" type="number" value={form.batterySize}
                onChange={(e) => setForm({ ...form, batterySize: e.target.value })} />
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="p-stc">STC</Label>
              <Input id="p-stc" type="number" value={form.stc}
                onChange={(e) => setForm({ ...form, stc: e.target.value })} />
            </div>
          )}
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </form>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">
          Catalogue {products.data ? `(${products.data.length})` : ""}
        </h3>
        {products.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : products.error ? (
          <p className="text-sm text-destructive">{products.error}</p>
        ) : (products.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No products yet.</p>
        ) : (
          <DataTable sortable={sortable}>
            <THead>
              <tr>
                <DragTH />
                <TH>Name</TH>
                <TH>Category</TH>
                <TH>Model</TH>
                <TH align="right">RRP</TH>
                <TH align="right">Commission</TH>
                <TH>Status</TH>
                <TH>Action</TH>
              </tr>
            </THead>
            <TBody>
              {(products.data ?? []).map((p) => (
                <TR key={p.id} sortableId={p.id}>
                  <TD>{p.name}</TD>
                  <TD>{p.category}</TD>
                  <TD className="text-muted-foreground">{p.model ?? "—"}</TD>
                  <TD align="right" className="tabular-nums">{money(p.rrp)}</TD>
                  <TD align="right" className="tabular-nums">{money(p.commission)}</TD>
                  <TD>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${
                      p.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}>
                      {p.status}
                    </span>
                  </TD>
                  <TD>
                    {p.status === "ACTIVE" ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "discontinue")}>
                          Discontinue
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "archive")}>
                          Archive
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(p.id, "reactivate")}>
                        Reactivate
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
