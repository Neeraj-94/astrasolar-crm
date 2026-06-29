"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { SaleType } from "@astra/shared";
import { Button } from "@/components/ui/button";
import { useApi } from "@/lib/api/use-api";
import { apiPatch } from "@/lib/api/client";
import { SalesFormDialog } from "./sales-form/sales-form-dialog";

/**
 * Sale Details modal — structural port of astrasolar-app's `#sale-details-modal`.
 * Products (system size / inverter / battery / extras) are loaded from the DB
 * catalogue, and RRP + commission auto-calculate from the catalogue prices
 * (context- and combo-aware, +2% for DCNT) exactly like the legacy
 * `saleRecalcRRP`. Saving passes the chosen product ids to the API, which
 * snapshots the authoritative prices onto the sale.
 */
interface Props {
  saleId: string;
  onClose: () => void;
  onSaved?: () => void;
}

const COMPANY_TYPES = [
  { value: "", label: "Astra" },
  { value: "dcnt", label: "DCNT (+2%)" },
];
const BATTERY_OPTIONS = [
  { value: "no", label: "No Battery" },
  { value: "solar_battery", label: "Solar & Battery Bundle" },
  { value: "battery_only", label: "Battery Only (no solar)" },
];
const PHASES = [
  { value: "1", label: "1-Phase" },
  { value: "3", label: "3-Phase" },
];
const PAYMENTS = [
  { value: "", label: "— Select —" },
  { value: "cash", label: "Cash" },
  { value: "finance", label: "Finance" },
  { value: "contract", label: "Contract Signed" },
];

// ── Catalogue response shapes (Decimals arrive as strings) ──────────────────
type Dec = string | number | null | undefined;
interface SolarP {
  id: string;
  productName: string;
  brand?: string | null;
  panelModel?: string | null;
  systemSize?: Dec;
  solarRrp?: Dec;
  solarCommission?: Dec;
  states?: string[] | null;
}
interface InverterP {
  id: string;
  productName: string;
  inverterModel?: string | null;
  phase?: number | null;
  states?: string[] | null;
}
interface ComboPrice {
  context: string;
  batteryRrp: number | null;
}
interface BatteryCombo {
  inverterId: string;
  prices: ComboPrice[];
}
interface PricedBattery {
  id: string;
  productName: string;
  batteryModel?: string | null;
  batterySize?: number | null;
  phase?: number | null;
  batteryCommission?: number | null;
  states?: string[] | null;
  contextPrices: ComboPrice[];
  combos: BatteryCombo[];
}
interface ExtraP {
  id: string;
  itemName: string;
  unit?: string | null;
  unitPrice?: Dec;
}
interface ApiSale {
  saleType?: string | null;
  soldPrice?: Dec;
  company?: string | null;
  systemDetails?: {
    panelModel?: string | null;
    inverterModel?: string | null;
    batteryModel?: string | null;
    phase?: string | null;
  } | null;
  paymentDetails?: { paymentDate?: string | null; paymentNotes?: string | null } | null;
}

const n = (v: Dec): number => {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const money = (v: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(v);

const ALL_STATES = ["ACT", "NSW", "VIC", "QLD", "SA", "TAS", "WA", "NT"];
/** De-dupe + drop empty labels. */
function uniqStr(vals: Array<string | null | undefined>): string[] {
  return [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))];
}
/** A product applies to a state when its `states` is empty (all) or includes it. */
function inState(states: string[] | null | undefined, state: string): boolean {
  if (!state) return true;
  if (!states || states.length === 0) return true;
  return states.includes(state);
}

function batteryOptionFromType(t?: string | null): string {
  if (t === SaleType.BATTERY_ONLY) return "battery_only";
  if (t === SaleType.SOLAR_BATTERY) return "solar_battery";
  return "no";
}
function saleTypeFromBattery(opt: string): SaleType {
  if (opt === "battery_only") return SaleType.BATTERY_ONLY;
  if (opt === "solar_battery") return SaleType.SOLAR_BATTERY;
  return SaleType.SOLAR_ONLY;
}

export function SaleDetailModal({ saleId, onClose, onSaved }: Props) {
  const { data: sale, loading: saleLoading } = useApi<ApiSale>(`/sales/${saleId}`);
  const solar = useApi<SolarP[]>("/products/solar");
  const inverters = useApi<InverterP[]>("/products/inverter");
  const batteries = useApi<PricedBattery[]>("/products/battery-priced");
  const extras = useApi<ExtraP[]>("/products/extras");

  const [batteryOption, setBatteryOption] = React.useState("no");
  const [pricing, setPricing] = React.useState(""); // solar product brand / price line
  const [location, setLocation] = React.useState(""); // AU state
  const [solarId, setSolarId] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [phase, setPhase] = React.useState("1");
  const [inverterId, setInverterId] = React.useState("");
  const [batteryId, setBatteryId] = React.useState("");
  const [extraIds, setExtraIds] = React.useState<Set<string>>(new Set());
  const [extrasOpen, setExtrasOpen] = React.useState(false);
  const [manualExtras, setManualExtras] = React.useState("0");
  // null = follow auto-calc; string = manual override.
  const [rrpManual, setRrpManual] = React.useState<string | null>(null);
  const [commManual, setCommManual] = React.useState<string | null>(null);
  const [soldPrice, setSoldPrice] = React.useState("");
  const [payment, setPayment] = React.useState("");
  const [paymentDate, setPaymentDate] = React.useState("");
  const [financeNotes, setFinanceNotes] = React.useState("");
  const [announced, setAnnounced] = React.useState(false);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const hydrated = React.useRef(false);

  const isBatteryOnly = batteryOption === "battery_only";
  const showBatteryConfig = batteryOption !== "no";
  const context = isBatteryOnly ? "BATTERY_ONLY" : "SOLAR_BATTERY";

  // Hydrate once sale + catalogues are loaded (match snapshots back to products).
  React.useEffect(() => {
    if (
      hydrated.current ||
      !sale ||
      !solar.data ||
      !inverters.data ||
      !batteries.data
    )
      return;
    hydrated.current = true;
    setBatteryOption(batteryOptionFromType(sale.saleType));
    setCompany(sale.company === "DC" ? "dcnt" : "");
    setPhase(sale.systemDetails?.phase === "3" ? "3" : "1");
    setSoldPrice(sale.soldPrice != null ? String(sale.soldPrice) : "");
    setPaymentDate((sale.paymentDetails?.paymentDate ?? "").slice(0, 10));
    setFinanceNotes(sale.paymentDetails?.paymentNotes ?? "");
    const sm = sale.systemDetails;
    if (sm?.panelModel) {
      const sp = solar.data.find((s) => s.panelModel === sm.panelModel);
      if (sp) {
        setSolarId(sp.id);
        setPricing(sp.brand ?? "");
        setLocation((sp.states ?? [])[0] ?? "");
      }
    }
    if (sm?.inverterModel)
      setInverterId(
        inverters.data.find((i) => i.inverterModel === sm.inverterModel)?.id ?? "",
      );
    if (sm?.batteryModel)
      setBatteryId(
        batteries.data.find((b) => b.batteryModel === sm.batteryModel)?.id ?? "",
      );
  }, [sale, solar.data, inverters.data, batteries.data]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Pricing = solar product brand / price line; states come from the products.
  const pricingOpts = React.useMemo(
    () => uniqStr((solar.data ?? []).map((s) => s.brand)),
    [solar.data],
  );
  const stateOpts = React.useMemo(() => {
    const pool = (solar.data ?? []).filter((s) => !pricing || s.brand === pricing);
    const states = uniqStr(pool.flatMap((s) => s.states ?? []));
    return states.length ? states : ALL_STATES;
  }, [solar.data, pricing]);
  // System sizes available for the chosen pricing + state.
  const solarSizeOpts = React.useMemo(
    () =>
      (solar.data ?? []).filter(
        (s) => (!pricing || s.brand === pricing) && inState(s.states, location),
      ),
    [solar.data, pricing, location],
  );

  // Phase + state filtered; batteries also filtered by inverter compatibility.
  const inverterOpts = React.useMemo(
    () =>
      (inverters.data ?? []).filter(
        (i) =>
          (i.phase == null || String(i.phase) === phase) &&
          inState(i.states, location),
      ),
    [inverters.data, phase, location],
  );
  const batteryOpts = React.useMemo(
    () =>
      (batteries.data ?? []).filter((b) => {
        if (b.phase != null && String(b.phase) !== phase) return false;
        if (!inState(b.states, location)) return false;
        if (inverterId && !b.combos.some((c) => c.inverterId === inverterId))
          return false;
        return true;
      }),
    [batteries.data, phase, location, inverterId],
  );

  // ── Auto-calc (mirrors saleRecalcRRP) ──
  const calc = React.useMemo(() => {
    const solarP = (solar.data ?? []).find((s) => s.id === solarId);
    const batteryP = (batteries.data ?? []).find((b) => b.id === batteryId);
    const solarRrp = !isBatteryOnly && solarP ? n(solarP.solarRrp) : 0;
    const solarComm = !isBatteryOnly && solarP ? n(solarP.solarCommission) : 0;
    let batteryRrp = 0;
    let batteryComm = 0;
    if (showBatteryConfig && batteryP) {
      batteryComm = n(batteryP.batteryCommission);
      const combo = inverterId
        ? batteryP.combos.find((c) => c.inverterId === inverterId)
        : null;
      const comboRrp = combo?.prices.find((p) => p.context === context)?.batteryRrp;
      const ctxRrp = batteryP.contextPrices.find((p) => p.context === context)?.batteryRrp;
      batteryRrp = comboRrp ?? ctxRrp ?? 0;
    }
    const extrasSum =
      (extras.data ?? [])
        .filter((e) => extraIds.has(e.id))
        .reduce((sum, e) => sum + n(e.unitPrice), 0) + (Number(manualExtras) || 0);
    let rrp = solarRrp + batteryRrp + extrasSum;
    if (company === "dcnt") rrp = rrp * 1.02;
    return {
      rrp: Math.round(rrp * 100) / 100,
      commission: Math.round((solarComm + batteryComm) * 100) / 100,
      systemSize: solarP?.systemSize ?? null,
    };
  }, [
    solar.data, batteries.data, extras.data, solarId, batteryId, inverterId,
    isBatteryOnly, showBatteryConfig, context, extraIds, manualExtras, company,
  ]);

  const rrpValue = rrpManual ?? String(calc.rrp);
  const commValue = commManual ?? String(calc.commission);
  const diff = React.useMemo(() => {
    const sp = parseFloat(soldPrice);
    const r = parseFloat(rrpValue);
    if (!Number.isFinite(sp) || !Number.isFinite(r) || r === 0) return null;
    return { delta: sp - r, under: sp - r < 0 };
  }, [soldPrice, rrpValue]);

  const cataloguesLoading =
    saleLoading || solar.loading || inverters.loading || batteries.loading;

  async function save() {
    setSaving(true);
    setError(null);
    const toNum = (v: string) => (v.trim() === "" ? undefined : Number(v));
    try {
      await apiPatch(`/sales/${saleId}/core`, {
        saleType: saleTypeFromBattery(batteryOption),
        soldPrice: toNum(soldPrice),
        totalRRP: toNum(rrpValue),
        totalCommission: toNum(commValue),
      });
      await apiPatch(`/sales/${saleId}/system-details`, {
        panelProductId: isBatteryOnly ? undefined : solarId || undefined,
        inverterProductId: inverterId || undefined,
        batteryProductId: showBatteryConfig ? batteryId || undefined : undefined,
        phase: phase || undefined,
      });
      await apiPatch(`/sales/${saleId}/payment-details`, {
        paymentDate: paymentDate || undefined,
        paymentNotes:
          [payment ? `Method: ${payment}` : "", financeNotes]
            .filter(Boolean)
            .join("\n") || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save sale details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Sale details"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[480px] max-h-[88vh] overflow-y-auto rounded-xl border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Sale Details</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Record the product details for this sale. RRP auto-calculates from the
          product catalogue based on your selections.
        </p>

        {cataloguesLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Solar section */}
            <div className="relative">
              {isBatteryOnly && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md bg-black/40">
                  <span className="rounded-md bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                    Battery Only — no solar
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pricing">
                  <Sel
                    value={pricing}
                    onChange={(v) => { setPricing(v); setLocation(""); setSolarId(""); setRrpManual(null); setCommManual(null); }}
                    options={[
                      { value: "", label: "— Select —" },
                      ...pricingOpts.map((p) => ({ value: p, label: p })),
                    ]}
                  />
                </Field>
                <Field label="State">
                  <Sel
                    value={location}
                    onChange={(v) => { setLocation(v); setSolarId(""); setRrpManual(null); }}
                    options={[
                      { value: "", label: "— Select —" },
                      ...stateOpts.map((s) => ({ value: s, label: s })),
                    ]}
                  />
                </Field>
                <Field label="System Size">
                  <Sel
                    value={solarId}
                    onChange={(v) => { setSolarId(v); setRrpManual(null); setCommManual(null); }}
                    options={[
                      { value: "", label: "— Select —" },
                      ...solarSizeOpts.map((s) => ({
                        value: s.id,
                        label: `${n(s.systemSize)} kW`,
                      })),
                    ]}
                  />
                </Field>
                <Field label="Company">
                  <Sel value={company} onChange={(v) => { setCompany(v); setRrpManual(null); }} options={COMPANY_TYPES} />
                </Field>
              </div>
            </div>

            {/* Battery section */}
            <div className="border-t pt-3">
              <div className="mb-1.5 text-xs font-bold text-primary">🔋 Battery</div>
              <Field label="Battery Option">
                <Sel value={batteryOption} onChange={(v) => { setBatteryOption(v); setRrpManual(null); setCommManual(null); }} options={BATTERY_OPTIONS} />
              </Field>
              {showBatteryConfig && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Phase">
                      <Sel value={phase} onChange={(v) => { setPhase(v); setInverterId(""); setBatteryId(""); }} options={PHASES} />
                    </Field>
                    <Field label="Inverter">
                      <Sel
                        value={inverterId}
                        onChange={(v) => { setInverterId(v); setBatteryId(""); setRrpManual(null); }}
                        options={[
                          { value: "", label: "— Select —" },
                          ...inverterOpts.map((i) => ({ value: i.id, label: i.inverterModel || i.productName })),
                        ]}
                      />
                    </Field>
                  </div>
                  <Field label="Battery Model">
                    <Sel
                      value={batteryId}
                      onChange={(v) => { setBatteryId(v); setRrpManual(null); setCommManual(null); }}
                      options={[
                        { value: "", label: "— Select —" },
                        ...batteryOpts.map((b) => ({ value: b.id, label: b.batteryModel || b.productName })),
                      ]}
                    />
                  </Field>
                </div>
              )}
            </div>

            {/* Extra charges (catalogue picker + manual) */}
            <Field
              label={
                <button type="button" onClick={() => setExtrasOpen((o) => !o)} className="cursor-pointer text-left">
                  Extra Charges ($){" "}
                  <span className="text-[11px] text-muted-foreground/70">(click to expand picker)</span>
                </button>
              }
            >
              {extrasOpen && (
                <div className="mb-1 max-h-44 overflow-y-auto rounded-md border bg-background p-2">
                  {(extras.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No catalogue extras configured.</p>
                  ) : (
                    (extras.data ?? []).map((e) => (
                      <label key={e.id} className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={extraIds.has(e.id)}
                            onChange={(ev) => {
                              setRrpManual(null);
                              setExtraIds((prev) => {
                                const next = new Set(prev);
                                ev.target.checked ? next.add(e.id) : next.delete(e.id);
                                return next;
                              });
                            }}
                          />
                          {e.itemName}{e.unit ? ` (${e.unit})` : ""}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{money(n(e.unitPrice))}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground/70">or enter manually:</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={manualExtras}
                  onChange={(e) => { setManualExtras(e.target.value); setRrpManual(null); }}
                  className="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
                />
              </div>
            </Field>

            {/* RRP + commission (auto, with override) */}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label={
                  <span className="flex items-center gap-2">
                    RRP (auto)
                    {rrpManual !== null && (
                      <button type="button" onClick={() => setRrpManual(null)} className="text-[10px] font-normal text-amber-600 underline">
                        overridden — reset
                      </button>
                    )}
                  </span>
                }
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rrpValue}
                  onChange={(e) => setRrpManual(e.target.value)}
                  className="h-9 w-full rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                />
              </Field>
              <Field
                label={
                  <span className="flex items-center gap-2">
                    Base Commission
                    {commManual !== null && (
                      <button type="button" onClick={() => setCommManual(null)} className="text-[10px] font-normal text-amber-600 underline">
                        overridden — reset
                      </button>
                    )}
                  </span>
                }
              >
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={commValue}
                  onChange={(e) => setCommManual(e.target.value)}
                  className="h-9 w-full rounded-md border border-primary/40 bg-primary/5 px-3 text-sm font-semibold text-primary"
                />
              </Field>
            </div>

            {/* Sold price + payment method */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold Price ($)">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={soldPrice}
                  onChange={(e) => setSoldPrice(e.target.value)}
                  placeholder="0.00"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </Field>
              <Field label="Payment Method">
                <Sel value={payment} onChange={setPayment} options={PAYMENTS} />
              </Field>
            </div>

            {/* Payment date + finance notes */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Date">
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Date the customer paid (leave blank if not yet paid)
                </p>
              </Field>
              <Field label="Finance Notes">
                <textarea
                  rows={3}
                  value={financeNotes}
                  onChange={(e) => setFinanceNotes(e.target.value)}
                  placeholder="Finance-related notes (lender, deposit, settlement)…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

            {diff && (
              <div
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  diff.under
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {diff.under ? "Under RRP by " : "Over RRP by "}
                {money(Math.abs(diff.delta))}
              </div>
            )}

            {/* Sale announcement */}
            <div className="rounded-lg border bg-muted/30 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold">Sale Announcement</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Has this sale been announced and approved?
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={announced}
                  onClick={() => setAnnounced((a) => !a)}
                  className={`relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors ${
                    announced ? "border-emerald-500/50 bg-emerald-500/30" : "border-destructive/40 bg-destructive/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      announced ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <div
                className={`mt-2 rounded-md px-3 py-1.5 text-center text-[11px] font-bold ${
                  announced
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {announced ? "Announced & Approved" : "Not Yet Announced or Approved"}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving}>Skip</Button>
              <Button onClick={save} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Sale Details
              </Button>
            </div>

            <div className="border-t pt-3.5 text-center">
              <Button
                variant="outline"
                className="w-full border-amber-400/40 bg-amber-400/10 text-amber-700 hover:bg-amber-400/20"
                onClick={() => setFormOpen(true)}
              >
                Complete Sales Form
              </Button>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Opens the full sales form pre-filled with the details above
              </p>
            </div>
          </div>
        )}
      </div>

      {formOpen && (
        <SalesFormDialog onClose={() => setFormOpen(false)} onCreated={onSaved} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Sel({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
