"use client";

import { Fragment, useState } from "react";
import { useApi } from "@/lib/api/use-api";
import { apiPost, apiPut, apiPatch, apiDelete } from "@/lib/api/client";
import { useRowReorder } from "@/lib/api/use-reorder";
import {
  DataTable,
  THead,
  TBody,
  TR,
  TH,
  TD,
  DragTH,
  SortTH,
  useTableSort,
  sortRows,
} from "@/components/leads/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AU_STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];

const TABS = [
  { key: "solar", label: "Solar" },
  { key: "battery", label: "Battery" },
  { key: "inverter", label: "Inverter" },
  { key: "extras", label: "Extras" },
  { key: "compatibility", label: "Compatibility" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

type FieldKind = "text" | "number" | "date" | "select";
interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: string[];
}
interface ColumnDef {
  label: string;
  align?: "right";
  render: (r: Row) => React.ReactNode;
  /** Row field used to sort this column. Omit to make the header non-sortable. */
  sortKey?: string;
}
interface CatalogueConfig {
  type: "solar" | "battery" | "inverter" | "extras";
  hasStatus: boolean;
  hasStates: boolean;
  allowDelete: boolean;
  hasPrices: boolean;
  form: FieldDef[];
  columns: ColumnDef[];
  /** Row key to group + filter the catalogue by (e.g. "category"). */
  groupBy?: string;
}

function money(n: string | number | null | undefined) {
  if (n == null || n === "") return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(Number(n));
}

const num = (r: Row, k: string) => (r[k] == null ? "—" : String(r[k]));

const CONFIGS: Record<CatalogueConfig["type"], CatalogueConfig> = {
  solar: {
    type: "solar",
    hasStatus: true,
    hasStates: true,
    allowDelete: false,
    hasPrices: false,
    form: [
      { key: "productName", label: "Name", kind: "text", required: true },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "panelModel", label: "Panel model", kind: "text" },
      { key: "panelWatt", label: "Panel watt", kind: "number" },
      { key: "systemSize", label: "System size (kW)", kind: "number" },
      { key: "solarStc", label: "STC", kind: "number" },
      { key: "solarRrp", label: "RRP", kind: "number" },
      { key: "solarCommission", label: "Commission", kind: "number" },
      { key: "profit", label: "Profit", kind: "number" },
      { key: "effectiveDate", label: "Effective date", kind: "date" },
      { key: "notes", label: "Notes", kind: "text" },
    ],
    columns: [
      { label: "Name", sortKey: "productName", render: (r) => r.productName },
      { label: "Model", sortKey: "panelModel", render: (r) => r.panelModel ?? "—" },
      { label: "Size", align: "right", sortKey: "systemSize", render: (r) => num(r, "systemSize") },
      { label: "Panels", align: "right", sortKey: "numOfPanels", render: (r) => num(r, "numOfPanels") },
      { label: "RRP", align: "right", sortKey: "solarRrp", render: (r) => money(r.solarRrp) },
      {
        label: "Commission",
        align: "right",
        sortKey: "solarCommission",
        render: (r) => money(r.solarCommission),
      },
    ],
  },
  battery: {
    type: "battery",
    hasStatus: true,
    hasStates: true,
    allowDelete: false,
    hasPrices: true,
    form: [
      { key: "productName", label: "Name", kind: "text", required: true },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "batteryModel", label: "Model", kind: "text" },
      { key: "batterySize", label: "Size (kWh)", kind: "number" },
      { key: "modules", label: "Modules", kind: "number" },
      { key: "batteryStc", label: "STC", kind: "number" },
      { key: "phase", label: "Phase", kind: "select", options: ["1", "3"] },
      { key: "grossPrice", label: "Gross price", kind: "number" },
      { key: "batteryCommission", label: "Commission", kind: "number" },
      { key: "profit", label: "Profit", kind: "number" },
      { key: "effectiveDate", label: "Effective date", kind: "date" },
      { key: "notes", label: "Notes", kind: "text" },
    ],
    columns: [
      { label: "Name", sortKey: "productName", render: (r) => r.productName },
      { label: "Model", sortKey: "batteryModel", render: (r) => r.batteryModel ?? "—" },
      { label: "Size", align: "right", sortKey: "batterySize", render: (r) => num(r, "batterySize") },
      {
        label: "Commission",
        align: "right",
        sortKey: "batteryCommission",
        render: (r) => money(r.batteryCommission),
      },
      { label: "Profit", align: "right", sortKey: "profit", render: (r) => money(r.profit) },
    ],
  },
  inverter: {
    type: "inverter",
    hasStatus: true,
    hasStates: true,
    allowDelete: false,
    hasPrices: false,
    form: [
      { key: "productName", label: "Name", kind: "text", required: true },
      { key: "brand", label: "Brand", kind: "text" },
      { key: "inverterModel", label: "Model", kind: "text" },
      { key: "type", label: "Type", kind: "text" },
      { key: "phase", label: "Phase", kind: "select", options: ["1", "3"] },
      { key: "systemSize", label: "System size (kW)", kind: "number" },
      { key: "maxPVArray", label: "Max PV array (kW)", kind: "number" },
      { key: "mppt", label: "MPPT", kind: "number" },
      { key: "strings", label: "Strings", kind: "number" },
      { key: "notes", label: "Notes", kind: "text" },
    ],
    columns: [
      { label: "Name", sortKey: "productName", render: (r) => r.productName },
      { label: "Brand", sortKey: "brand", render: (r) => r.brand ?? "—" },
      { label: "Model", sortKey: "inverterModel", render: (r) => r.inverterModel ?? "—" },
      { label: "Type", sortKey: "type", render: (r) => r.type ?? "—" },
      { label: "Phase", sortKey: "phase", render: (r) => (r.phase == null ? "Both" : r.phase) },
      { label: "Max PV", align: "right", sortKey: "maxPVArray", render: (r) => num(r, "maxPVArray") },
      { label: "MPPT", align: "right", sortKey: "mppt", render: (r) => num(r, "mppt") },
      { label: "Strings", align: "right", sortKey: "strings", render: (r) => num(r, "strings") },
    ],
  },
  extras: {
    type: "extras",
    hasStatus: false,
    hasStates: false,
    allowDelete: true,
    hasPrices: false,
    groupBy: "category",
    form: [
      { key: "itemName", label: "Name", kind: "text", required: true },
      { key: "category", label: "Category", kind: "text" },
      { key: "unit", label: "Unit", kind: "text" },
      { key: "unitPrice", label: "Unit price", kind: "number" },
      { key: "notes", label: "Notes", kind: "text" },
    ],
    columns: [
      { label: "Name", sortKey: "itemName", render: (r) => r.itemName },
      { label: "Category", sortKey: "category", render: (r) => r.category ?? "—" },
      { label: "Unit", sortKey: "unit", render: (r) => r.unit ?? "—" },
      {
        label: "Unit price",
        align: "right",
        sortKey: "unitPrice",
        render: (r) => money(r.unitPrice),
      },
    ],
  },
};

export function AdminProductsTab() {
  const [tab, setTab] = useState<TabKey>("solar");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "compatibility" ? (
        <CompatibilitySection />
      ) : (
        <CatalogueSection key={tab} config={CONFIGS[tab as CatalogueConfig["type"]]} />
      )}
    </div>
  );
}

function CatalogueSection({ config }: { config: CatalogueConfig }) {
  const list = useApi<Row[]>(`/products/${config.type}?all=true`);
  const sortable = useRowReorder(
    list,
    (p) => p.id,
    `/products/${config.type}/reorder`,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [states, setStates] = useState<string[]>([]);
  const [openPrices, setOpenPrices] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const { sort, toggle } = useTableSort();
  const sortActive = sort.key != null;

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  function startEdit(p: Row) {
    setErr(null);
    setEditingId(p.id);
    const v: Record<string, string> = {};
    for (const f of config.form) {
      const raw = p[f.key];
      if (raw == null) v[f.key] = "";
      else if (f.kind === "date") v[f.key] = String(raw).slice(0, 10);
      else v[f.key] = String(raw);
    }
    setValues(v);
    setStates(config.hasStates && Array.isArray(p.states) ? p.states : []);
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setValues({});
    setStates([]);
    setErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of config.form) {
        const v = values[f.key];
        if (v == null || v === "") {
          // When editing, blank a non-required field to clear it (sends null).
          // When creating, just omit it.
          if (editingId && !f.required) body[f.key] = null;
          continue;
        }
        body[f.key] =
          f.kind === "number" || f.key === "phase" ? Number(v) : v;
      }
      // States: send on edit (so they can be cleared); on create only if set.
      if (config.hasStates && (editingId || states.length)) body.states = states;
      if (editingId) {
        await apiPatch(`/products/${config.type}/${editingId}`, body);
      } else {
        await apiPost(`/products/${config.type}`, body);
      }
      setValues({});
      setStates([]);
      setEditingId(null);
      list.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: string) {
    setErr(null);
    try {
      await apiPost(`/products/${config.type}/${id}/${action}`, {});
      list.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not ${action}`);
    }
  }

  async function remove(id: string) {
    setErr(null);
    try {
      await apiDelete(`/products/${config.type}/${id}`);
      list.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete");
    }
  }

  function toggleState(s: string) {
    setStates((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );
  }

  const rows = list.data ?? [];
  const groupBy = config.groupBy;
  const groupVal = (r: Row) =>
    groupBy ? (r[groupBy] == null || r[groupBy] === "" ? "—" : String(r[groupBy])) : "";
  // Distinct group values in their current display order.
  const groups = groupBy
    ? rows.reduce<string[]>((acc, r) => {
        const g = groupVal(r);
        if (!acc.includes(g)) acc.push(g);
        return acc;
      }, [])
    : [];
  const filteredRows =
    groupBy && filter !== "all"
      ? rows.filter((r) => groupVal(r) === filter)
      : rows;
  // Coerce a row field to a sortable primitive (numeric strings -> numbers).
  const sortAccessor = (r: Row, key: string) => {
    const v = r[key];
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = Number(v);
      return v.trim() !== "" && !Number.isNaN(n) ? n : v;
    }
    return String(v);
  };
  // When a column sort is active, show a flat sorted list (no grouping / drag).
  const visibleRows = sortActive
    ? sortRows(filteredRows, sort, sortAccessor)
    : filteredRows;
  // Total table columns, for full-width group-header rows.
  const totalCols =
    1 +
    config.columns.length +
    (config.hasStates ? 1 : 0) +
    (config.hasStatus ? 1 : 0) +
    1;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold capitalize">
          {editingId ? `Edit ${config.type}` : `Add ${config.type}`}
        </h3>
        <form
          onSubmit={submit}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
        >
          {config.form.map((f) => (
            <div key={f.key} className="space-y-1">
              <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
              {f.kind === "select" ? (
                <select
                  id={`f-${f.key}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                >
                  <option value="">—</option>
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id={`f-${f.key}`}
                  required={f.required}
                  type={
                    f.kind === "number"
                      ? "number"
                      : f.kind === "date"
                        ? "date"
                        : "text"
                  }
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="flex items-end gap-2">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy
                ? editingId
                  ? "Saving…"
                  : "Adding…"
                : editingId
                  ? "Save"
                  : "Add"}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                onClick={cancelEdit}
                disabled={busy}
              >
                Cancel
              </Button>
            )}
          </div>
          {config.hasStates && (
            <div className="col-span-2 space-y-1 sm:col-span-3 lg:col-span-4">
              <Label>States (none = all)</Label>
              <div className="flex flex-wrap gap-1.5">
                {AU_STATES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleState(s)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${
                      states.includes(s)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">
            Catalogue{" "}
            {list.data
              ? `(${
                  groupBy && filter !== "all"
                    ? `${visibleRows.length} of ${list.data.length}`
                    : list.data.length
                })`
              : ""}
          </h3>
          {groupBy && groups.length > 1 && (
            <select
              aria-label="Filter by category"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
        </div>
        {list.loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.error ? (
          <p className="text-sm text-destructive">{list.error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet.</p>
        ) : (
          <DataTable sortable={sortActive ? undefined : sortable}>
            <THead>
              <tr>
                {!sortActive && <DragTH />}
                {config.columns.map((c) =>
                  c.sortKey ? (
                    <SortTH
                      key={c.label}
                      align={c.align}
                      sortKey={c.sortKey}
                      sort={sort}
                      onSort={toggle}
                    >
                      {c.label}
                    </SortTH>
                  ) : (
                    <TH key={c.label} align={c.align}>
                      {c.label}
                    </TH>
                  ),
                )}
                {config.hasStates && (
                  <SortTH sortKey="states" sort={sort} onSort={toggle}>
                    States
                  </SortTH>
                )}
                {config.hasStatus && (
                  <SortTH sortKey="status" sort={sort} onSort={toggle}>
                    Status
                  </SortTH>
                )}
                <TH>Action</TH>
              </tr>
            </THead>
            <TBody>
              {visibleRows.map((p, i) => (
                <Fragment key={p.id}>
                  {groupBy &&
                    !sortActive &&
                    filter === "all" &&
                    (i === 0 ||
                      groupVal(visibleRows[i - 1]) !== groupVal(p)) && (
                      <tr>
                        <td
                          colSpan={totalCols}
                          className="bg-muted/40 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b"
                        >
                          {groupVal(p)}
                        </td>
                      </tr>
                    )}
                  <TR sortableId={sortActive ? undefined : p.id}>
                    {config.columns.map((c) => (
                      <TD
                        key={c.label}
                        align={c.align}
                        className={c.align ? "tabular-nums" : undefined}
                      >
                        {c.render(p)}
                      </TD>
                    ))}
                    {config.hasStates && (
                      <TD className="text-muted-foreground">
                        {p.states?.length ? p.states.join(", ") : "All"}
                      </TD>
                    )}
                    {config.hasStatus && (
                      <TD>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            p.status === "ACTIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-zinc-100 text-zinc-600"
                          }`}
                        >
                          {p.status}
                        </span>
                      </TD>
                    )}
                    <TD>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(p)}
                        >
                          Edit
                        </Button>
                        {config.hasPrices && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setOpenPrices(openPrices === p.id ? null : p.id)
                            }
                          >
                            Prices
                          </Button>
                        )}
                        {config.hasStatus &&
                          (p.status === "ACTIVE" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(p.id, "discontinue")}
                              >
                                Discontinue
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(p.id, "archive")}
                              >
                                Archive
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => act(p.id, "reactivate")}
                            >
                              Reactivate
                            </Button>
                          ))}
                        {config.allowDelete && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => remove(p.id)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                  {config.hasPrices && openPrices === p.id && (
                    <tr key={`${p.id}-prices`}>
                      <td colSpan={config.columns.length + 4} className="p-0">
                        <BatteryPrices batteryId={p.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </TBody>
          </DataTable>
        )}
      </section>
    </div>
  );
}

const CONTEXTS = [
  { key: "BATTERY_ONLY", label: "Battery only" },
  { key: "SOLAR_BATTERY", label: "Solar + battery" },
];

type ComboDraft = { gross: string; rrp: string; eff: string };

function BatteryPrices({ batteryId }: { batteryId: string }) {
  // Each row is a BatteryInverterCompat combo with its inverter + comboPrices.
  const combos = useApi<Row[]>(`/products/battery/${batteryId}/combos`);
  const [draft, setDraft] = useState<Record<string, ComboDraft>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const priceFor = (combo: Row, ctx: string) =>
    (combo.comboPrices ?? []).find((p: Row) => p.context === ctx);

  const draftFor = (combo: Row, ctx: string): ComboDraft => {
    const cur = priceFor(combo, ctx);
    return (
      draft[`${combo.id}:${ctx}`] ?? {
        gross: cur?.grossPrice != null ? String(cur.grossPrice) : "",
        rrp: cur?.batteryRrp != null ? String(cur.batteryRrp) : "",
        eff: cur?.effectiveDate ? String(cur.effectiveDate).slice(0, 10) : "",
      }
    );
  };

  async function save(combo: Row, ctx: string) {
    const key = `${combo.id}:${ctx}`;
    const d = draftFor(combo, ctx);
    setSavingKey(key);
    setErr(null);
    try {
      await apiPut(`/products/combo/${combo.id}/prices`, {
        context: ctx,
        grossPrice: d.gross === "" ? null : Number(d.gross),
        batteryRrp: d.rrp === "" ? null : Number(d.rrp),
        effectiveDate: d.eff || null,
      });
      combos.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save price");
    } finally {
      setSavingKey(null);
    }
  }

  const rows = combos.data ?? [];

  return (
    <div className="m-3 rounded-lg border bg-muted/30 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
        Combo pricing (per inverter)
      </h4>
      {combos.loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No compatible inverters yet. Add a pairing in the Compatibility tab to
          price this battery.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((combo) => (
            <div key={combo.id} className="rounded-md border bg-background p-3">
              <p className="mb-2 text-sm font-medium">
                {combo.inverter?.productName}
                {combo.inverter?.inverterModel
                  ? ` (${combo.inverter.inverterModel})`
                  : ""}
                {!combo.isActive && (
                  <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                    disabled
                  </span>
                )}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {CONTEXTS.map((c) => {
                  const key = `${combo.id}:${c.key}`;
                  const d = draftFor(combo, c.key);
                  const upd = (patch: Partial<ComboDraft>) =>
                    setDraft((p) => ({ ...p, [key]: { ...d, ...patch } }));
                  return (
                    <div
                      key={c.key}
                      className="rounded-md border bg-muted/20 p-3"
                    >
                      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        {c.label}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label>Gross</Label>
                          <Input
                            type="number"
                            value={d.gross}
                            onChange={(e) => upd({ gross: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>RRP</Label>
                          <Input
                            type="number"
                            value={d.rrp}
                            onChange={(e) => upd({ rrp: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Effective</Label>
                          <Input
                            type="date"
                            value={d.eff}
                            onChange={(e) => upd({ eff: e.target.value })}
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            className="w-full"
                            disabled={savingKey === key}
                            onClick={() => save(combo, c.key)}
                          >
                            {savingKey === key ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      {err && <p className="mt-2 text-sm text-destructive">{err}</p>}
    </div>
  );
}

function CompatibilitySection() {
  const inverters = useApi<Row[]>("/products/inverter?all=true");
  const batteries = useApi<Row[]>("/products/battery?all=true");
  const [inverterId, setInverterId] = useState("");
  const compat = useApi<Row[]>(
    inverterId ? `/compatibility?inverterId=${inverterId}` : null,
  );
  const [batteryId, setBatteryId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!inverterId || !batteryId) return;
    setErr(null);
    try {
      await apiPost("/compatibility", { inverterId, batteryId });
      setBatteryId("");
      compat.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add pairing");
    }
  }

  async function toggle(id: string, isActive: boolean) {
    setErr(null);
    try {
      await apiPatch(`/compatibility/${id}`, { isActive });
      compat.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update pairing");
    }
  }

  async function remove(id: string) {
    setErr(null);
    try {
      await apiDelete(`/compatibility/${id}`);
      compat.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove pairing");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-semibold">
          Battery ↔ inverter compatibility
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Inverter</Label>
            <select
              className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm"
              value={inverterId}
              onChange={(e) => setInverterId(e.target.value)}
            >
              <option value="">Select inverter…</option>
              {(inverters.data ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.productName}
                  {i.inverterModel ? ` (${i.inverterModel})` : ""}
                </option>
              ))}
            </select>
          </div>
          {inverterId && (
            <>
              <div className="space-y-1">
                <Label>Add battery</Label>
                <select
                  className="h-9 min-w-56 rounded-md border bg-background px-2 text-sm"
                  value={batteryId}
                  onChange={(e) => setBatteryId(e.target.value)}
                >
                  <option value="">Select battery…</option>
                  {(batteries.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.productName}
                      {b.batteryModel ? ` (${b.batteryModel})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={add} disabled={!batteryId}>
                Add pairing
              </Button>
            </>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </section>

      {inverterId && (
        <section className="rounded-xl border bg-card p-5">
          <h3 className="mb-4 text-sm font-semibold">
            Compatible batteries{" "}
            {compat.data ? `(${compat.data.length})` : ""}
          </h3>
          {compat.loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (compat.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No batteries paired with this inverter yet.
            </p>
          ) : (
            <ul className="divide-y">
              {(compat.data ?? []).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm">
                    {c.battery?.productName}
                    {c.battery?.batteryModel
                      ? ` (${c.battery.batteryModel})`
                      : ""}
                    {!c.isActive && (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                        disabled
                      </span>
                    )}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggle(c.id, !c.isActive)}
                    >
                      {c.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(c.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
