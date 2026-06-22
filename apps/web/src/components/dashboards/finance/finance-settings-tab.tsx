"use client";

import * as React from "react";
import { Pencil, RotateCcw, Plus, Trash2, Info } from "lucide-react";
import { Section } from "@/components/leads/shared";
import { SubTabs, type SubTab } from "@/components/leads/shared/sub-tabs";
import { money } from "@/components/dashboards/financials/format";
import { EditDialog, type EditField } from "./finance-settings/edit-dialog";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";
import {
  useTableSort,
  sortRows,
  SortTH,
} from "@/components/leads/shared/data-table";
import {
  SOLAR_OVERSIZE_RRP_PER_KW,
  SOLAR_OVERSIZE_COMM_PER_KW,
  BATT_STC_CUTOFF,
  BATT_STC_CUTOFF_2,
  BATTERY_PRODUCTS,
  FINANCE_OPTIONS,
  EXTRAS_COMMISSION,
  EXTRAS_PROFIT,
  TEAM_LEAD_OVERRIDES,
  type SolarRow,
  type BatteryRow,
  type FinanceOption,
} from "./finance-settings/config-data";

// Live solar catalogue row (from GET /products/solar). Decimal columns arrive
// as strings over JSON, so values are coerced with Number() before use.
interface SolarProduct {
  id: string;
  productName: string;
  brand: string | null;
  systemSize: number | string | null;
  solarRrp: number | string | null;
  solarCommission: number | string | null;
  profit: number | string | null;
  states: string[];
  status: string;
}

interface SolarGroupRow {
  id: string;
  size: number;
  rrp: number;
  profit: number;
  commission: number;
}
interface SolarGroup {
  key: string;
  title: string;
  rows: SolarGroupRow[];
}

/** Group catalogue solar products by brand (tier) and states (location). */
function groupSolar(products: SolarProduct[]): SolarGroup[] {
  const map = new Map<string, SolarGroup>();
  for (const p of products) {
    const states = p.states ?? [];
    const loc = states.length ? states.join(", ") : "All states";
    const brand = p.brand ?? "—";
    const key = `${brand}||${loc}`;
    let g = map.get(key);
    if (!g) {
      g = { key, title: `${brand} — ${loc}`, rows: [] };
      map.set(key, g);
    }
    g.rows.push({
      id: p.id,
      size: Number(p.systemSize),
      rrp: Number(p.solarRrp),
      profit: Number(p.profit),
      commission: Number(p.solarCommission),
    });
  }
  const groups = [...map.values()];
  for (const g of groups) g.rows.sort((a, b) => a.size - b.size);
  // Standard tier first, then by title (puts ACT/NSW before TAS).
  const rank = (g: SolarGroup) => (g.title.startsWith("Standard") ? 0 : 1);
  groups.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  return groups;
}

// ---------------------------------------------------------------------------
// Finance Settings tab — ported from v1 astrasolar-app (fs* function family:
// fsRenderFullUI / fsRenderTab / fsEdit*). v1 persisted overrides to Firebase
// `financeSettings`; this port keeps edits in local component state and
// surfaces a "not yet persisted" notice. Wiring a financeSettings API/table
// is the remaining backend step (see notice banner).
// ---------------------------------------------------------------------------

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const num = (s: string) => parseFloat(s) || 0;

const SUB_TABS: SubTab[] = [
  { key: "pricing", label: "Product Pricing" },
  { key: "stc", label: "STC Settings" },
  { key: "rebates", label: "Rebates" },
  { key: "finance", label: "Finance Products" },
  { key: "commissions", label: "Commissions" },
  { key: "overrides", label: "Sale Overrides" },
];

const ratePct = (rate: string | number): string =>
  typeof rate === "number"
    ? `${(rate * 100).toFixed(2)}%`
    : String(rate); // v1 defaults are display strings like "6.99%"

interface SaleOverride {
  id: string;
  customer: string;
  consultant: string;
  originalComm: number;
  overrideComm: number;
  reason: string;
}

export function FinanceSettingsTab() {
  const [tab, setTab] = React.useState("pricing");
  const [pricingType, setPricingType] = React.useState<"solar" | "battery">(
    "solar",
  );

  // Solar pricing is read from the live catalogue (not hardcoded).
  const solarApi = useApi<SolarProduct[]>("/products/solar?all=true");

  // Editable copies seeded from the v1 defaults.
  const [battery, setBattery] = React.useState(() => clone(BATTERY_PRODUCTS));
  const [oversize, setOversize] = React.useState({
    rrpPerKw: SOLAR_OVERSIZE_RRP_PER_KW,
    commPerKw: SOLAR_OVERSIZE_COMM_PER_KW,
  });
  const [stc, setStc] = React.useState({
    cutoff1: BATT_STC_CUTOFF,
    cutoff2: BATT_STC_CUTOFF_2,
  });
  const [finance, setFinance] = React.useState(() => clone(FINANCE_OPTIONS));
  const [extrasComm, setExtrasComm] = React.useState(() =>
    clone(EXTRAS_COMMISSION),
  );
  const [extrasProfit, setExtrasProfit] = React.useState(() =>
    clone(EXTRAS_PROFIT),
  );
  const [teamLeads, setTeamLeads] = React.useState(() =>
    clone(TEAM_LEAD_OVERRIDES),
  );
  const [overrides, setOverrides] = React.useState<SaleOverride[]>([]);

  // Single active edit dialog descriptor.
  const [dialog, setDialog] = React.useState<{
    title: string;
    fields: EditField[];
    onSave: (v: Record<string, string>) => void;
  } | null>(null);

  const closeDialog = () => setDialog(null);

  // ---- Edit launchers -----------------------------------------------------
  // Solar edits persist straight to the catalogue (PATCH /products/solar/:id).
  const editSolarProduct = (row: SolarGroupRow, title: string) => {
    setDialog({
      title: `Edit ${title} — ${row.size} kW`,
      fields: [
        { key: "rrp", label: "RRP", prefix: "$", value: row.rrp },
        { key: "profit", label: "Profit", prefix: "$", value: row.profit },
        { key: "commission", label: "Commission", prefix: "$", value: row.commission },
      ],
      onSave: (v) => {
        apiPatch(`/products/solar/${row.id}`, {
          solarRrp: num(v.rrp),
          profit: num(v.profit),
          solarCommission: num(v.commission),
        })
          .then(() => solarApi.reload())
          .finally(() => closeDialog());
      },
    });
  };

  const editOversize = () =>
    setDialog({
      title: "Oversize Pricing (>14.25 kW)",
      fields: [
        { key: "rrpPerKw", label: "RRP per extra kW", prefix: "$", value: oversize.rrpPerKw },
        { key: "commPerKw", label: "Commission per extra kW", prefix: "$", value: oversize.commPerKw },
      ],
      onSave: (v) => {
        setOversize({ rrpPerKw: num(v.rrpPerKw), commPerKw: num(v.commPerKw) });
        closeDialog();
      },
    });

  const editBattery = (cat: "solar_battery" | "battery_only", idx: number) => {
    const row = battery[cat][idx];
    setDialog({
      title: `Edit Battery — ${row.battery}`,
      fields: [
        { key: "grossPrice", label: "Gross Price", prefix: "$", value: row.grossPrice ?? 0 },
        { key: "profit", label: "Profit", prefix: "$", value: row.profit ?? 0 },
        { key: "commission", label: "Commission", prefix: "$", value: row.commission ?? 0 },
        { key: "stcBefore", label: `STC (Pre ${stc.cutoff1})`, prefix: "$", value: row.stcBefore ?? 0 },
        { key: "stcAfter", label: `STC (Post ${stc.cutoff1})`, prefix: "$", value: row.stcAfter ?? 0 },
      ],
      onSave: (v) => {
        setBattery((prev) => {
          const next = clone(prev);
          next[cat][idx] = {
            ...next[cat][idx],
            grossPrice: num(v.grossPrice),
            profit: num(v.profit),
            commission: num(v.commission),
            stcBefore: num(v.stcBefore),
            stcAfter: num(v.stcAfter),
          };
          return next;
        });
        closeDialog();
      },
    });
  };

  const editStc = (which: "cutoff1" | "cutoff2") =>
    setDialog({
      title: `Edit STC Cutoff ${which === "cutoff1" ? "1" : "2"}`,
      fields: [
        { key: "date", label: "Date (YYYY-MM-DD)", type: "date", value: stc[which] },
      ],
      onSave: (v) => {
        setStc((prev) => ({ ...prev, [which]: v.date }));
        closeDialog();
      },
    });

  const editFinance = (id: string) => {
    const fo = finance.find((f) => f.id === id);
    if (!fo) return;
    setDialog({
      title: `Edit ${fo.label}`,
      fields: [
        { key: "rate", label: "Interest Rate (%)", value: typeof fo.rate === "number" ? (fo.rate * 100).toFixed(2) : String(fo.rate).replace("%", "") },
        { key: "term", label: "Term (years)", value: fo.term },
        { key: "surcharge", label: "Surcharge multiplier", value: fo.surcharge },
        { key: "estFee", label: "Establishment Fee", prefix: "$", value: fo.estFee ?? 0 },
        { key: "feePerWeek", label: "Weekly Fee", prefix: "$", value: fo.feePerWeek ?? 0 },
        { key: "cap", label: "Borrowing Cap (blank = none)", prefix: "$", value: fo.cap ?? "" },
      ],
      onSave: (v) => {
        setFinance((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  rate: num(v.rate) / 100,
                  term: parseInt(v.term) || 0,
                  surcharge: num(v.surcharge),
                  estFee: num(v.estFee),
                  feePerWeek: num(v.feePerWeek),
                  cap: v.cap.trim() === "" ? null : num(v.cap),
                }
              : f,
          ),
        );
        closeDialog();
      },
    });
  };

  const toggleFinance = (id: string) =>
    setFinance((prev) =>
      prev.map((f) => (f.id === id ? { ...f, disabled: !f.disabled } : f)),
    );

  const editSimple = (
    title: string,
    label: string,
    value: number,
    apply: (n: number) => void,
  ) =>
    setDialog({
      title,
      fields: [{ key: "v", label, prefix: "$", value }],
      onSave: (v) => {
        apply(num(v.v));
        closeDialog();
      },
    });

  const editTeamLead = (lid: string) => {
    const tl = teamLeads[lid];
    setDialog({
      title: `Team Lead Override — ${lid}`,
      fields: [
        { key: "solar", label: "Solar Override", prefix: "$", value: tl.overrides.solar },
        { key: "battery_only", label: "Battery-Only Override", prefix: "$", value: tl.overrides.battery_only },
      ],
      onSave: (v) => {
        setTeamLeads((prev) => {
          const next = clone(prev);
          next[lid].overrides.solar = num(v.solar);
          next[lid].overrides.battery_only = num(v.battery_only);
          return next;
        });
        closeDialog();
      },
    });
  };

  const addOverride = () =>
    setDialog({
      title: "Add Commission Override",
      fields: [
        { key: "customer", label: "Customer", type: "text", value: "" },
        { key: "consultant", label: "Consultant", type: "text", value: "" },
        { key: "originalComm", label: "Original Commission", prefix: "$", value: 0 },
        { key: "overrideComm", label: "Override Commission", prefix: "$", value: 0 },
        { key: "reason", label: "Reason", type: "text", value: "" },
      ],
      onSave: (v) => {
        setOverrides((prev) => [
          ...prev,
          {
            id: `ov-${Date.now()}`,
            customer: v.customer,
            consultant: v.consultant,
            originalComm: num(v.originalComm),
            overrideComm: num(v.overrideComm),
            reason: v.reason,
          },
        ]);
        closeDialog();
      },
    });

  // ---- Shared bits --------------------------------------------------------
  const editBtn = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
    >
      <Pencil className="h-3 w-3" /> Edit
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Ported from v1 finance settings. Edits apply live in this session but
          are <strong>not yet persisted</strong> — connecting a{" "}
          <code>financeSettings</code> API/table is the remaining backend step.
        </span>
      </div>

      <SubTabs tabs={SUB_TABS} value={tab} onChange={setTab} />

      {/* ===== PRODUCT PRICING ===== */}
      {tab === "pricing" && (
        <div className="space-y-4">
          <SubTabs
            tabs={[
              { key: "solar", label: "Solar" },
              { key: "battery", label: "Battery" },
            ]}
            value={pricingType}
            onChange={(k) => setPricingType(k as "solar" | "battery")}
          />

          {pricingType === "solar" ? (
            <div className="space-y-5">
              {solarApi.loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : solarApi.error ? (
                <p className="text-sm text-destructive">{solarApi.error}</p>
              ) : (solarApi.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No solar products in the catalogue yet.
                </p>
              ) : (
                groupSolar(solarApi.data ?? []).map((g) => (
                  <Section key={g.key} title={g.title} flush>
                    <SolarTable
                      rows={g.rows}
                      isOverridden={() => false}
                      onEdit={(i) => editSolarProduct(g.rows[i], g.title)}
                      onReset={() => {}}
                    />
                  </Section>
                ))
              )}
              <Section title="Oversize Pricing (>14.25 kW)">
                <div className="flex flex-wrap gap-4">
                  <Stat label="RRP per extra kW" value={money(oversize.rrpPerKw, 0)} />
                  <Stat label="Commission per extra kW" value={money(oversize.commPerKw, 0)} />
                  {editBtn(editOversize)}
                </div>
              </Section>
            </div>
          ) : (
            <div className="space-y-5">
              {(["solar_battery", "battery_only"] as const).map((cat) => (
                <Section
                  key={cat}
                  title={cat === "solar_battery" ? "Solar + Battery" : "Battery Only"}
                  description={`${battery[cat].length} products`}
                  flush
                >
                  <BatteryTable
                    rows={battery[cat]}
                    onEdit={(i) => editBattery(cat, i)}
                  />
                </Section>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== STC SETTINGS ===== */}
      {tab === "stc" && (
        <Section
          title="Battery STC Cutoffs"
          description="Cutoff dates that switch battery STC (pre/post) values."
        >
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-3">
              <Stat label="STC Cutoff 1" value={stc.cutoff1} />
              {editBtn(() => editStc("cutoff1"))}
            </div>
            <div className="flex items-center gap-3">
              <Stat label="STC Cutoff 2" value={stc.cutoff2} />
              {editBtn(() => editStc("cutoff2"))}
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Per-product STC values are edited under Product Pricing → Battery.
          </p>
        </Section>
      )}

      {/* ===== REBATES ===== */}
      {tab === "rebates" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {finance
            .filter((f) => ["hesp", "shs", "heuf"].includes(f.id))
            .map((fo) => (
              <RebateCard key={fo.id} fo={fo} onEdit={() => editFinance(fo.id)} />
            ))}
        </div>
      )}

      {/* ===== FINANCE PRODUCTS ===== */}
      {tab === "finance" && (
        <Section title="Finance Products" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Product</th>
                  <th className="px-4 py-2.5 font-medium">Rate</th>
                  <th className="px-4 py-2.5 font-medium">Term</th>
                  <th className="px-4 py-2.5 font-medium">Surcharge</th>
                  <th className="px-4 py-2.5 text-right font-medium">Est Fee</th>
                  <th className="px-4 py-2.5 text-right font-medium">Weekly</th>
                  <th className="px-4 py-2.5 text-right font-medium">Cap</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {finance.map((fo) => (
                  <tr key={fo.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium">{fo.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{ratePct(fo.rate)}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fo.term ? `${fo.term}y` : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{fo.surcharge}×</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(fo.estFee ?? 0, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(fo.feePerWeek ?? 0, 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fo.cap ? money(fo.cap, 0) : "—"}</td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleFinance(fo.id)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          fo.disabled
                            ? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        }`}
                      >
                        {fo.disabled ? "OFF" : "ON"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">{editBtn(() => editFinance(fo.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ===== COMMISSIONS ===== */}
      {tab === "commissions" && (
        <div className="space-y-5">
          <Section title="Extras Commission & Profit">
            <div className="flex flex-wrap gap-4">
              <StatEdit label="Hot Water Commission" value={money(extrasComm.hotWater, 0)} onEdit={() => editSimple("Hot Water Commission", "Commission", extrasComm.hotWater, (n) => setExtrasComm((p) => ({ ...p, hotWater: n })))} />
              <StatEdit label="Aircon Commission" value={money(extrasComm.aircon, 0)} onEdit={() => editSimple("Aircon Commission", "Commission", extrasComm.aircon, (n) => setExtrasComm((p) => ({ ...p, aircon: n })))} />
              <StatEdit label="Aircon Profit" value={money(extrasProfit.aircon, 0)} onEdit={() => editSimple("Aircon Profit", "Profit", extrasProfit.aircon, (n) => setExtrasProfit((p) => ({ ...p, aircon: n })))} />
              <StatEdit label="HW Profit (Bundled)" value={money(extrasProfit.hotWaterBundled, 0)} onEdit={() => editSimple("Hot Water Profit (Bundled)", "Profit", extrasProfit.hotWaterBundled, (n) => setExtrasProfit((p) => ({ ...p, hotWaterBundled: n })))} />
              <StatEdit label="HW Profit (Standalone)" value={money(extrasProfit.hotWaterStandalone, 0)} onEdit={() => editSimple("Hot Water Profit (Standalone)", "Profit", extrasProfit.hotWaterStandalone, (n) => setExtrasProfit((p) => ({ ...p, hotWaterStandalone: n })))} />
            </div>
          </Section>

          <Section title="Team Lead Commission Overrides" flush>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Team Lead</th>
                    <th className="px-4 py-2.5 text-right font-medium">Solar</th>
                    <th className="px-4 py-2.5 text-right font-medium">Battery Only</th>
                    <th className="px-4 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(teamLeads).map(([lid, tl]) => (
                    <tr key={lid} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium capitalize">{lid}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(tl.overrides.solar, 0)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(tl.overrides.battery_only, 0)}</td>
                      <td className="px-4 py-2.5">{editBtn(() => editTeamLead(lid))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ===== SALE OVERRIDES ===== */}
      {tab === "overrides" && (
        <Section
          title="Sale Commission Overrides"
          description="Manually override the calculated commission for a specific sale."
          actions={
            <button
              type="button"
              onClick={addOverride}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Plus className="h-4 w-4" /> Add override
            </button>
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Consultant</th>
                  <th className="px-4 py-2.5 text-right font-medium">Original</th>
                  <th className="px-4 py-2.5 text-right font-medium">Override</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {overrides.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      No overrides — add one to override a sale&apos;s commission.
                    </td>
                  </tr>
                ) : (
                  overrides.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{o.customer}</td>
                      <td className="px-4 py-2.5">{o.consultant}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(o.originalComm, 0)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">{money(o.overrideComm, 0)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{o.reason || "—"}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setOverrides((p) => p.filter((x) => x.id !== o.id))}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="h-3 w-3" /> Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {dialog && (
        <EditDialog
          title={dialog.title}
          fields={dialog.fields}
          onCancel={closeDialog}
          onSave={dialog.onSave}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Presentational helpers
// --------------------------------------------------------------------------
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function StatEdit({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2.5">
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-base font-semibold tabular-nums">{value}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="rounded-md border p-1.5 hover:bg-muted"
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function SolarTable({
  rows,
  isOverridden,
  onEdit,
  onReset,
}: {
  rows: SolarRow[];
  isOverridden: (i: number) => boolean;
  onEdit: (i: number) => void;
  onReset: (i: number) => void;
}) {
  const { sort, toggle } = useTableSort();
  const ordered = sortRows(
    rows.map((r, i) => ({ r, i })),
    sort,
    (x, k) => (x.r as unknown as Record<string, number>)[k],
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <SortTH sortKey="size" sort={sort} onSort={toggle}>Size (kW)</SortTH>
            <SortTH sortKey="rrp" align="right" sort={sort} onSort={toggle}>RRP</SortTH>
            <SortTH sortKey="profit" align="right" sort={sort} onSort={toggle}>Profit</SortTH>
            <SortTH sortKey="commission" align="right" sort={sort} onSort={toggle}>Commission</SortTH>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {ordered.map(({ r, i }) => {
            const ov = isOverridden(i);
            return (
              <tr key={r.size} className={ov ? "bg-amber-50/60 dark:bg-amber-900/10" : "hover:bg-muted/30"}>
                <td className="px-4 py-2 tabular-nums">{r.size}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(r.rrp)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{money(r.profit, 0)}</td>
                <td className={`px-4 py-2 text-right font-medium tabular-nums ${ov ? "text-amber-600 dark:text-amber-400" : ""}`}>{money(r.commission, 0)}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onEdit(i)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    {ov && (
                      <button type="button" onClick={() => onReset(i)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
                        <RotateCcw className="h-3 w-3" /> Reset
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BatteryTable({
  rows,
  onEdit,
}: {
  rows: BatteryRow[];
  onEdit: (i: number) => void;
}) {
  const { sort, toggle } = useTableSort();
  const ordered = sortRows(
    rows.map((r, i) => ({ r, i })),
    sort,
    (x, k) => (x.r as unknown as Record<string, string | number | null>)[k],
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <SortTH sortKey="inverter" sort={sort} onSort={toggle}>Inverter</SortTH>
            <SortTH sortKey="battery" sort={sort} onSort={toggle}>Battery</SortTH>
            <SortTH sortKey="grossPrice" align="right" sort={sort} onSort={toggle}>Gross</SortTH>
            <SortTH sortKey="profit" align="right" sort={sort} onSort={toggle}>Profit</SortTH>
            <SortTH sortKey="commission" align="right" sort={sort} onSort={toggle}>Comm</SortTH>
            <SortTH sortKey="stcBefore" align="right" sort={sort} onSort={toggle}>STC Pre</SortTH>
            <SortTH sortKey="stcAfter" align="right" sort={sort} onSort={toggle}>STC Post</SortTH>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {ordered.map(({ r, i }) => (
            <tr key={`${r.inverter}__${r.battery}__${i}`} className="hover:bg-muted/30">
              <td className="px-4 py-2 text-xs text-muted-foreground">{r.inverter}</td>
              <td className="px-4 py-2 font-medium">{r.battery}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(r.grossPrice ?? 0, 0)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(r.profit ?? 0, 0)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{money(r.commission ?? 0, 0)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.stcBefore != null ? money(r.stcBefore, 0) : "—"}</td>
              <td className="px-4 py-2 text-right tabular-nums">{r.stcAfter != null ? money(r.stcAfter, 0) : "—"}</td>
              <td className="px-4 py-2">
                <button type="button" onClick={() => onEdit(i)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RebateCard({ fo, onEdit }: { fo: FinanceOption; onEdit: () => void }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="font-semibold leading-tight">{fo.label}</h4>
        {fo.disabled && (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800">DISABLED</span>
        )}
      </div>
      <dl className="space-y-1 text-sm">
        <Row k="Rate" v={ratePct(fo.rate)} />
        <Row k="Term" v={fo.term ? `${fo.term} yrs` : "—"} />
        <Row k="Cap" v={fo.cap ? money(fo.cap, 0) : "—"} />
        <Row k="States" v={(fo.states ?? []).join(", ") || "—"} />
      </dl>
      {fo.notes && <p className="mt-2 text-xs text-muted-foreground">{fo.notes}</p>}
      <button
        type="button"
        onClick={onEdit}
        className="mt-3 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium tabular-nums">{v}</dd>
    </div>
  );
}
