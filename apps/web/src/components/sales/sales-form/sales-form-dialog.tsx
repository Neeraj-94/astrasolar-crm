"use client";

import * as React from "react";
import { Check, Loader2, X } from "lucide-react";
import { Company, LeadSource, SaleType, SystemType } from "@astra/shared";
import { Button } from "@/components/ui/button";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { apiPost } from "@/lib/api/client";
import { useApi } from "@/lib/api/use-api";

// ── Field validators ─────────────────────────────────────────────────────────
/** Australian mobile (04…) or landline (02/03/07/08), with optional +61/61. */
function isValidAuPhone(raw: string): boolean {
  const s = raw.replace(/[\s()-]/g, "");
  return /^(?:\+?61|0)[2-478]\d{8}$/.test(s);
}
function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/**
 * Generate Sales Form — a 5-step wizard ported from astrasolar-app
 * (`openSalesFormModal`). Captures sale info, customer, property, system and
 * extras, then POSTs to /sales which creates the Lead + Sale records.
 */

interface Props {
  onClose: () => void;
  /** Called after a sale is created so the page can refresh. */
  onCreated?: () => void;
  /** Optional prefill (e.g. opened from a specific lead row). */
  initial?: Partial<FormState>;
}

type OptGroup = { group: string; options: Opt[] };
type Opt = { value: string; label: string; disabled?: boolean };
interface StaffUser {
  id: string;
  name: string;
  roleKeys: string[];
}
interface DbProduct {
  id: string;
  productName: string;
  panelModel?: string | null;
  inverterModel?: string | null;
  batteryModel?: string | null;
}
interface DbExtra {
  id: string;
  itemName: string;
  unit?: string | null;
  unitPrice?: string | number | null;
}
const OTHER = "__other_option__";

/** De-dupe + drop empties from a list of catalogue labels. */
function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ""))];
}
function extraPrice(v?: string | number | null): number {
  if (v === null || v === undefined || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// ── Option lists ────────────────────────────────────────────────────────────
// Company / Sale Type / System Type / Lead Source are driven by the shared
// domain enums (mirrors the database); Sales Consultant + Lead Gen are loaded
// from the user directory (/users/by-role) at runtime.
const COMPANY_OPTS: Opt[] = [
  { value: Company.ASTRA, label: "Astra" },
  { value: Company.DC, label: "DC" },
];
const SALE_TYPE_OPTS: Opt[] = [
  { value: SaleType.SOLAR_ONLY, label: "Solar Only" },
  { value: SaleType.BATTERY_ONLY, label: "Battery Only" },
  { value: SaleType.SOLAR_BATTERY, label: "Solar + Battery" },
];
const SYSTEM_TYPE_OPTS: Opt[] = [
  { value: SystemType.NEW, label: "New" },
  { value: SystemType.REPLACEMENT, label: "Replacement" },
  { value: SystemType.ADDITIONAL, label: "Additional" },
  { value: SystemType.ADDITIONAL_REPLACEMENT, label: "Additional + Replacement" },
];
const LEAD_SOURCE_OPTS: Opt[] = [
  { value: LeadSource.BLOOM_ASTRA, label: "Bloom Astra" },
  { value: LeadSource.REFERRAL, label: "Referral" },
  { value: LeadSource.INBOUND, label: "Inbound" },
  { value: LeadSource.WEBSITE, label: "Astra Web" },
  { value: LeadSource.BRIGHTE, label: "Brighte" },
];
const STATES = ["ACT", "NSW", "TAS", "VIC", "SA"];
const STOREYS = ["1", "2", "3+"];
const ROOF_TYPES = ["Tile", "Tin", "Kliplok", "Terracotta", "Other"];
const PHASES = ["1 Phase", "2 Phase", "3 Phase"];
const ENERGY_PROVIDERS = ["Actew", "Origin", "Energy Australia", "Red Energy", "Aurora", "1st energy"];
const SWITCHBOARD = ["Yes Full", "Yes Minor", "No"];
const BACKUP = ["Full", "Partial", "None"];
const HOT_WATER = ["Apricus", "Reclaim", "None"];
const AIRCON = ["None"];
const FINANCE_OPTIONS = ["Cash", "Brighte HEUF", "Brighte 0% (5 Year)", "Brighte 0% (3 Year)", "Brighte Green Loan"];

const INVERTERS: OptGroup[] = [
  {
    group: "GoodWe — 1-Phase Hybrid (EHA) ★",
    options: [
      { value: "GW5K-EHA-G20", label: "GW5K-EHA-G20 (5kW 1P)" },
      { value: "GW6K-EHA-G20", label: "GW6K-EHA-G20 (6kW 1P)" },
      { value: "GW8K-EHA-G20", label: "GW8K-EHA-G20 (8kW 1P)" },
      { value: "GW9.999KEHA-G20", label: "GW9.999K-EHA-G20 (10kW 1P)" },
    ],
  },
  {
    group: "GoodWe — 3-Phase Hybrid (ETA) ★",
    options: [
      { value: "GW5K-ETA-G20", label: "GW5K-ETA-G20 (5kW 3P)" },
      { value: "GW10K-ETA-G20", label: "GW10K-ETA-G20 (10kW 3P)" },
      { value: "GW15K-ETA-G20", label: "GW15K-ETA-G20 (15kW 3P)" },
    ],
  },
  {
    group: "Solax — 1-Phase ★",
    options: [
      { value: "SOLAX-X1-HYBRID-5.0D", label: "Solax X1 Hybrid 5.0D (5kW 1P)" },
      { value: "SOLAX-X1-Hybrid-7.5D", label: "Solax X1 Hybrid 7.5D (7.5kW 1P)" },
      { value: "Solax X1-VAST-8K", label: "Solax X1 VAST 8K (8kW 1P)" },
      { value: "Solax X1-VAST-10K", label: "Solax X1 VAST 10K (10kW 1P)" },
    ],
  },
  {
    group: "Solax — 3-Phase ★",
    options: [
      { value: "SOLAX-X3-HYBRID-5.0D", label: "Solax X3 Hybrid 5.0D (5kW 3P)" },
      { value: "SOLAX-X3-HYBRID-8.0D 3", label: "Solax X3 Hybrid 8.0D (8kW 3P)" },
      { value: "SOLAX-X3-HYBRID-10.0D", label: "Solax X3 Hybrid 10.0D (10kW 3P)" },
      { value: "SOLAX-X3-HYBRID-15.0D", label: "Solax X3 Hybrid 15.0D (15kW 3P)" },
      { value: "SOLAX-X3-ULT-20KP", label: "Solax X3 Ultra 20KP (20kW 3P)" },
    ],
  },
  {
    group: "Fox ESS ★",
    options: [
      { value: "H1-5.0-E-G2", label: "Fox ESS H1-5.0-E-G2 (5kW 1P)" },
      { value: "KH8", label: "Fox ESS KH8 (8kW 1P)" },
      { value: "KH10", label: "Fox ESS KH10 (10kW 1P)" },
      { value: "H3-5.0-Smart", label: "Fox ESS H3-5.0-Smart (5kW 3P)" },
      { value: "H3-10.0-Smart", label: "Fox ESS H3-10.0-Smart (10kW 3P)" },
      { value: "H3-15.0-Smart", label: "Fox ESS H3-15.0-Smart (15kW 3P)" },
    ],
  },
  { group: "Other", options: [{ value: "None", label: "None (Solar Only)" }] },
];

const BATTERIES: OptGroup[] = [
  {
    group: "GoodWe GW8.3 Stacking ★",
    options: [
      { value: "GW8.3-BAT-D-G20 x2 (16.6kWh)", label: "GW8.3 x2 — 16.6kWh" },
      { value: "GW8.3-BAT-D-G20 x3 (24.9kWh)", label: "GW8.3 x3 — 24.9kWh" },
      { value: "GW8.3-BAT-D-G20 x4 (33.2kWh)", label: "GW8.3 x4 — 33.2kWh" },
      { value: "GW8.3-BAT-D-G20 x5 (41.5kWh)", label: "GW8.3 x5 — 41.5kWh" },
      { value: "GW8.3-BAT-D-G20 x6 (49.8kWh)", label: "GW8.3 x6 — 49.8kWh" },
    ],
  },
  {
    group: "Solax T-BAT HS ★",
    options: [
      { value: "SOLAX-T-BAT-HS10.8", label: "Solax T-BAT HS 10.8kWh" },
      { value: "SOLAX-T-BAT-HS14.4", label: "Solax T-BAT HS 14.4kWh" },
      { value: "SOLAX-T-BAT-HS18.0", label: "Solax T-BAT HS 18.0kWh" },
      { value: "SOLAX-T-BAT-HS21.6", label: "Solax T-BAT HS 21.6kWh" },
      { value: "SOLAX-T-BAT-HS25.2", label: "Solax T-BAT HS 25.2kWh" },
      { value: "SOLAX-T-BAT-HS28.8", label: "Solax T-BAT HS 28.8kWh" },
    ],
  },
  {
    group: "FoxESS EQ4800 ★",
    options: [
      { value: "EQ4800-L3 (13.98 kWh)", label: "Fox ESS EQ4800-L3 — 13.98kWh" },
      { value: "EQ4800-L4 (18.64 kWh)", label: "Fox ESS EQ4800-L4 — 18.64kWh" },
      { value: "EQ4800-L5 (23.30 kWh)", label: "Fox ESS EQ4800-L5 — 23.30kWh" },
      { value: "EQ4800-L6 (27.96 kWh)", label: "Fox ESS EQ4800-L6 — 27.96kWh" },
      { value: "EQ4800-L7 (32.61 kWh)", label: "Fox ESS EQ4800-L7 — 32.61kWh" },
    ],
  },
  { group: "Other", options: [{ value: "None", label: "None" }] },
];

// ── Form state ──────────────────────────────────────────────────────────────
interface FormState {
  company: string; consultantId: string; state: string; saleType: string;
  systemType: string; saleDate: string; leadGenId: string; leadSource: string;
  firstName: string; surName: string; phone: string; email: string;
  soldPrice: string; batteryStc: string; solarStc: string;
  storeys: string; roofType: string; phase: string; address: string;
  suburb: string; postcode: string; energyProvider: string; energyProviderOther: string; nmi: string;
  panelModel: string; panelModelOther: string; numPanels: string; systemSize: string;
  tilts: string; optimisers: string; inverter: string; inverterOther: string;
  batteryBrand: string; batteryBrandOther: string; switchboard: string;
  backup: string; backupOther: string; hotWater: string; hotWaterOther: string;
  aircon: string; airconOther: string; installNotes: string; referral: string;
  financeOptions: string[];
  extraIds: string[];
}

const EMPTY: FormState = {
  company: "", consultantId: "", state: "", saleType: "", systemType: "",
  saleDate: new Date().toISOString().slice(0, 10), leadGenId: "", leadSource: "",
  firstName: "", surName: "", phone: "", email: "", soldPrice: "", batteryStc: "", solarStc: "",
  storeys: "", roofType: "", phase: "", address: "", suburb: "", postcode: "",
  energyProvider: "", energyProviderOther: "", nmi: "",
  panelModel: "", panelModelOther: "", numPanels: "", systemSize: "", tilts: "", optimisers: "",
  inverter: "", inverterOther: "", batteryBrand: "", batteryBrandOther: "", switchboard: "",
  backup: "", backupOther: "", hotWater: "", hotWaterOther: "", aircon: "", airconOther: "",
  installNotes: "", referral: "", financeOptions: [], extraIds: [],
};

const STEPS = ["Sale Info", "Customer", "Property", "System", "Extras"];

// Required fields per step (mirrors the asterisks in the app form).
const REQUIRED: Record<number, (keyof FormState)[]> = {
  1: ["company", "consultantId", "state", "saleType", "systemType", "saleDate", "leadGenId", "leadSource"],
  2: ["firstName", "surName", "phone", "email", "soldPrice", "batteryStc", "solarStc"],
  3: ["storeys", "roofType", "phase", "address", "suburb", "postcode", "energyProvider"],
  4: ["panelModel", "numPanels", "systemSize", "tilts", "optimisers", "inverter", "switchboard"],
  5: ["installNotes"],
};

function resolveOther(value: string, other: string): string {
  return value === OTHER ? other.trim() : value;
}

export function SalesFormDialog({ onClose, onCreated, initial }: Props) {
  const [step, setStep] = React.useState(1);
  const [form, setForm] = React.useState<FormState>({ ...EMPTY, ...initial });
  const [errors, setErrors] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  // Sales consultants + lead-gen reps from the user directory (DB-driven).
  const { data: staff } = useApi<StaffUser[]>(
    "/users/by-role?roles=sales_consultant,lead_gen",
  );
  const consultantOpts = React.useMemo<Opt[]>(
    () =>
      (staff ?? [])
        .filter((u) => u.roleKeys.includes("sales_consultant"))
        .map((u) => ({ value: u.id, label: u.name })),
    [staff],
  );
  const leadGenOpts = React.useMemo<Opt[]>(
    () =>
      (staff ?? [])
        .filter((u) => u.roleKeys.includes("lead_gen"))
        .map((u) => ({ value: u.id, label: u.name })),
    [staff],
  );

  // Product catalogues (DB-driven) for the System step + Extras picker.
  const solarProducts = useApi<DbProduct[]>("/products/solar");
  const inverterProducts = useApi<DbProduct[]>("/products/inverter");
  const batteryProducts = useApi<DbProduct[]>("/products/battery");
  const extraProducts = useApi<DbExtra[]>("/products/extras");

  const panelOpts = React.useMemo(
    () => uniq((solarProducts.data ?? []).map((p) => p.panelModel || p.productName)),
    [solarProducts.data],
  );
  const inverterOpts = React.useMemo(
    () => uniq((inverterProducts.data ?? []).map((p) => p.inverterModel || p.productName)),
    [inverterProducts.data],
  );
  const batteryOpts = React.useMemo(
    () => uniq((batteryProducts.data ?? []).map((p) => p.batteryModel || p.productName)),
    [batteryProducts.data],
  );

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Step 4 fields shown depend on the Type of Sale: solar inputs are hidden for
  // Battery Only; the battery brand is hidden for Solar Only.
  const showSolar = form.saleType !== SaleType.BATTERY_ONLY;
  const showBattery = form.saleType !== SaleType.SOLAR_ONLY;

  function requiredFor(s: number): (keyof FormState)[] {
    const base = REQUIRED[s] ?? [];
    if (s !== 4) return base;
    const SOLAR_FIELDS = ["panelModel", "numPanels", "systemSize", "tilts", "optimisers"];
    return base.filter((f) => (SOLAR_FIELDS.includes(f as string) ? showSolar : true));
  }

  function validateStep(s: number): boolean {
    const missing = new Set<string>();
    const req = requiredFor(s);
    for (const f of req) {
      const v = form[f];
      if (Array.isArray(v) ? v.length === 0 : !String(v).trim()) missing.add(f);
    }
    // "Other" selections need their companion text.
    const otherPairs: [keyof FormState, keyof FormState][] = [
      ["panelModel", "panelModelOther"], ["inverter", "inverterOther"],
      ["batteryBrand", "batteryBrandOther"], ["energyProvider", "energyProviderOther"],
    ];
    for (const [sel, oth] of otherPairs) {
      if (req.includes(sel) && form[sel] === OTHER && !String(form[oth]).trim())
        missing.add(oth);
    }
    // Format checks (only when the field has a value — emptiness is caught above).
    if (s === 2) {
      if (form.phone.trim() && !isValidAuPhone(form.phone)) missing.add("phone");
      if (form.email.trim() && !isValidEmail(form.email)) missing.add("email");
    }
    if (s === 5 && form.financeOptions.length === 0) missing.add("financeOptions");
    setErrors(missing);
    return missing.size === 0;
  }

  function next() {
    if (!validateStep(step)) return;
    if (step < 5) setStep(step + 1);
    else submit();
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    const numOrUndef = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const intOrUndef = (v: string) => (v.trim() === "" ? undefined : parseInt(v, 10));
    try {
      const sale = await apiPost<{ saleRef?: string }>("/sales", {
        company: form.company, consultantId: form.consultantId, state: form.state,
        saleType: form.saleType, systemType: form.systemType, saleDate: form.saleDate,
        leadGenId: form.leadGenId, leadSource: form.leadSource,
        firstName: form.firstName.trim(), surName: form.surName.trim(),
        phone: form.phone || undefined, email: form.email || undefined,
        soldPrice: numOrUndef(form.soldPrice), batteryStc: numOrUndef(form.batteryStc),
        solarStc: numOrUndef(form.solarStc),
        storeys: form.storeys || undefined, roofType: form.roofType || undefined,
        phase: form.phase || undefined, address: form.address || undefined,
        suburb: form.suburb || undefined, postcode: form.postcode || undefined,
        energyProvider: resolveOther(form.energyProvider, form.energyProviderOther) || undefined,
        nmi: form.nmi || undefined,
        panelModel: resolveOther(form.panelModel, form.panelModelOther) || undefined,
        numPanels: intOrUndef(form.numPanels), systemSize: numOrUndef(form.systemSize),
        tilts: intOrUndef(form.tilts), optimisers: intOrUndef(form.optimisers),
        inverter: resolveOther(form.inverter, form.inverterOther) || undefined,
        batteryBrand: resolveOther(form.batteryBrand, form.batteryBrandOther) || undefined,
        switchboard: form.switchboard || undefined,
        backup: resolveOther(form.backup, form.backupOther) || undefined,
        hotWater: resolveOther(form.hotWater, form.hotWaterOther) || undefined,
        aircon: resolveOther(form.aircon, form.airconOther) || undefined,
        installNotes: form.installNotes || undefined,
        referral: form.referral || undefined,
        financeOptions: form.financeOptions,
        extraIds: form.extraIds,
      });
      setDone(sale?.saleRef ?? "created");
      onCreated?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not create the sale.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Generate Sales Form"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-xl border bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Generate Sales Form</h2>
            <p className="text-xs text-muted-foreground">Complete the sale details to create a sale record.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold">Sale created</h3>
            <p className="text-sm text-muted-foreground">
              {done === "created" ? "The sale record was saved." : `Sale ${done} was saved.`}
            </p>
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex gap-1.5 border-b px-6 py-3">
              {STEPS.map((label, i) => {
                const n = i + 1;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => n < step && setStep(n)}
                    className={`flex-1 border-b-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors ${
                      n === step
                        ? "border-primary text-primary"
                        : n < step
                          ? "border-emerald-400/50 text-emerald-600"
                          : "border-transparent text-muted-foreground"
                    }`}
                  >
                    {n}. {label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {errors.size > 0 && (
                <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  Please complete the required (*) fields before continuing.
                </p>
              )}

              {step === 1 && (
                <Grid>
                  <OptionSelectField label="Company *" value={form.company} onChange={(v) => set("company", v)} options={COMPANY_OPTS} err={errors.has("company")} />
                  <OptionSelectField label="Sales Consultant *" value={form.consultantId} onChange={(v) => set("consultantId", v)} options={consultantOpts} placeholder={consultantOpts.length ? undefined : "No consultants found"} err={errors.has("consultantId")} />
                  <SelectField label="State of Sale *" value={form.state} onChange={(v) => set("state", v)} options={STATES} err={errors.has("state")} />
                  <OptionSelectField label="Type of Sale *" value={form.saleType} onChange={(v) => set("saleType", v)} options={SALE_TYPE_OPTS} err={errors.has("saleType")} />
                  <OptionSelectField label="System Type *" value={form.systemType} onChange={(v) => set("systemType", v)} options={SYSTEM_TYPE_OPTS} err={errors.has("systemType")} />
                  <TextField label="Sale Date *" type="date" value={form.saleDate} onChange={(v) => set("saleDate", v)} err={errors.has("saleDate")} />
                  <OptionSelectField label="Lead Gen *" value={form.leadGenId} onChange={(v) => set("leadGenId", v)} options={leadGenOpts} placeholder={leadGenOpts.length ? undefined : "No lead-gen reps found"} err={errors.has("leadGenId")} />
                  <OptionSelectField label="Lead Source *" value={form.leadSource} onChange={(v) => set("leadSource", v)} options={LEAD_SOURCE_OPTS} err={errors.has("leadSource")} />
                </Grid>
              )}

              {step === 2 && (
                <Grid>
                  <TextField label="Customer First Name *" value={form.firstName} onChange={(v) => set("firstName", v)} err={errors.has("firstName")} />
                  <TextField label="Customer Surname *" value={form.surName} onChange={(v) => set("surName", v)} err={errors.has("surName")} />
                  <TextField label="Phone (with 61) *" value={form.phone} onChange={(v) => set("phone", v)} placeholder="61400000000" err={errors.has("phone")} errorText={form.phone.trim() && !isValidAuPhone(form.phone) ? "Enter a valid Australian phone number" : undefined} />
                  <TextField label="Email Address *" type="email" value={form.email} onChange={(v) => set("email", v)} placeholder="customer@email.com" err={errors.has("email")} errorText={form.email.trim() && !isValidEmail(form.email) ? "Enter a valid email address" : undefined} />
                  <TextField label="Sold Price ($) *" value={form.soldPrice} onChange={(v) => set("soldPrice", v)} placeholder="8500" err={errors.has("soldPrice")} />
                  <TextField label="Battery STC ($) *" value={form.batteryStc} onChange={(v) => set("batteryStc", v)} placeholder="0" err={errors.has("batteryStc")} />
                  <TextField label="Solar STC ($) *" value={form.solarStc} onChange={(v) => set("solarStc", v)} placeholder="2800" err={errors.has("solarStc")} />
                </Grid>
              )}

              {step === 3 && (
                <Grid>
                  <SelectField label="No. of Storeys *" value={form.storeys} onChange={(v) => set("storeys", v)} options={STOREYS} err={errors.has("storeys")} />
                  <SelectField label="Roof Type *" value={form.roofType} onChange={(v) => set("roofType", v)} options={ROOF_TYPES} err={errors.has("roofType")} />
                  <SelectField label="Property Phase *" value={form.phase} onChange={(v) => set("phase", v)} options={PHASES} err={errors.has("phase")} />
                  <div className="sm:col-span-2">
                    <Label>Street Address *</Label>
                    <AddressAutocomplete
                      value={form.address}
                      onChange={(v) => set("address", v)}
                      onSelect={(a) =>
                        setForm((f) => ({
                          ...f,
                          address: a.addressLine1 || a.formatted,
                          suburb: a.suburb || f.suburb,
                          postcode: a.postcode || f.postcode,
                          state: (STATES as string[]).includes(a.state) ? a.state : f.state,
                        }))
                      }
                      placeholder="Start typing an address…"
                      className={`h-9 ${errors.has("address") ? "border-destructive" : ""}`}
                    />
                  </div>
                  <TextField label="Suburb *" value={form.suburb} onChange={(v) => set("suburb", v)} err={errors.has("suburb")} />
                  <TextField label="Postcode *" value={form.postcode} onChange={(v) => set("postcode", v)} placeholder="2600" err={errors.has("postcode")} />
                  <SelectField label="Energy Provider *" value={form.energyProvider} onChange={(v) => set("energyProvider", v)} options={ENERGY_PROVIDERS} allowOther otherValue={form.energyProviderOther} onOther={(v) => set("energyProviderOther", v)} err={errors.has("energyProvider") || errors.has("energyProviderOther")} />
                  <TextField label="NMI (optional)" value={form.nmi} onChange={(v) => set("nmi", v)} />
                </Grid>
              )}

              {step === 4 && (
                <Grid>
                  {showSolar && (
                    <>
                      <SelectField label="Panel Model *" value={form.panelModel} onChange={(v) => set("panelModel", v)} options={panelOpts} allowOther otherValue={form.panelModelOther} onOther={(v) => set("panelModelOther", v)} err={errors.has("panelModel") || errors.has("panelModelOther")} />
                      <TextField label="Number of Panels *" value={form.numPanels} onChange={(v) => set("numPanels", v)} placeholder="12" err={errors.has("numPanels")} />
                      <TextField label="System Size (kW) *" value={form.systemSize} onChange={(v) => set("systemSize", v)} placeholder="6.6" err={errors.has("systemSize")} />
                      <TextField label="Tilts *" value={form.tilts} onChange={(v) => set("tilts", v)} placeholder="20" err={errors.has("tilts")} />
                      <TextField label="Optimisers *" value={form.optimisers} onChange={(v) => set("optimisers", v)} placeholder="0" err={errors.has("optimisers")} />
                    </>
                  )}
                  <SelectField label="Inverter *" value={form.inverter} onChange={(v) => set("inverter", v)} options={inverterOpts} allowOther otherValue={form.inverterOther} onOther={(v) => set("inverterOther", v)} err={errors.has("inverter") || errors.has("inverterOther")} full />
                  {showBattery && (
                    <SelectField label="Battery Brand" value={form.batteryBrand} onChange={(v) => set("batteryBrand", v)} options={batteryOpts} allowOther otherValue={form.batteryBrandOther} onOther={(v) => set("batteryBrandOther", v)} />
                  )}
                  <SelectField label="Switchboard Upgrade *" value={form.switchboard} onChange={(v) => set("switchboard", v)} options={SWITCHBOARD} err={errors.has("switchboard")} />
                </Grid>
              )}

              {step === 5 && (
                <div className="space-y-4">
                  <Grid>
                    <SelectField label="Back up" value={form.backup} onChange={(v) => set("backup", v)} options={BACKUP} allowOther otherValue={form.backupOther} onOther={(v) => set("backupOther", v)} />
                    <SelectField label="Hot Water" value={form.hotWater} onChange={(v) => set("hotWater", v)} options={HOT_WATER} allowOther otherValue={form.hotWaterOther} onOther={(v) => set("hotWaterOther", v)} />
                    <SelectField label="Aircon" value={form.aircon} onChange={(v) => set("aircon", v)} options={AIRCON} allowOther otherValue={form.airconOther} onOther={(v) => set("airconOther", v)} />
                  </Grid>
                  <div className="space-y-1">
                    <Label>Extra Charges</Label>
                    <div className="max-h-44 overflow-y-auto rounded-md border bg-background p-2">
                      {(extraProducts.data ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No catalogue extras configured.</p>
                      ) : (
                        (extraProducts.data ?? []).map((e) => (
                          <label key={e.id} className="flex items-center justify-between gap-2 px-1 py-1 text-xs">
                            <span className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={form.extraIds.includes(e.id)}
                                onChange={(ev) =>
                                  set(
                                    "extraIds",
                                    ev.target.checked
                                      ? [...form.extraIds, e.id]
                                      : form.extraIds.filter((x) => x !== e.id),
                                  )
                                }
                              />
                              {e.itemName}{e.unit ? ` (${e.unit})` : ""}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              ${extraPrice(e.unitPrice).toLocaleString()}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Install Notes *</Label>
                    <textarea
                      value={form.installNotes}
                      onChange={(e) => set("installNotes", e.target.value)}
                      placeholder="Install notes, roof conditions, access issues, etc."
                      className={`min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm ${errors.has("installNotes") ? "border-destructive" : "border-input"}`}
                    />
                  </div>
                  <Grid>
                    <TextField label="Referral Sale" value={form.referral} onChange={(v) => set("referral", v)} placeholder="Optional — referral name" />
                    <div className="space-y-1">
                      <Label>Finance Option *</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {FINANCE_OPTIONS.map((opt) => {
                          const on = form.financeOptions.includes(opt);
                          return (
                            <button
                              type="button"
                              key={opt}
                              onClick={() =>
                                set(
                                  "financeOptions",
                                  on ? form.financeOptions.filter((x) => x !== opt) : [...form.financeOptions, opt],
                                )
                              }
                              className={`rounded-md border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                      {errors.has("financeOptions") && (
                        <p className="text-xs text-destructive">Select at least one finance option.</p>
                      )}
                    </div>
                  </Grid>
                </div>
              )}

              {submitError && <p className="mt-4 text-sm text-destructive">{submitError}</p>}
            </div>

            {/* Nav */}
            <div className="flex items-center justify-between gap-2 border-t px-6 py-4">
              <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || submitting}>
                Back
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                <Button onClick={next} disabled={submitting} className="min-w-[130px] gap-2">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {step < 5 ? "Next Step" : submitting ? "Saving…" : "Submit Sale"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Field primitives ─────────────────────────────────────────────────────────
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}

const inputCls = (err?: boolean) =>
  `h-9 w-full rounded-md border bg-background px-3 text-sm ${err ? "border-destructive" : "border-input"}`;

function TextField({
  label, value, onChange, placeholder, type = "text", err, full, errorText,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; err?: boolean; full?: boolean; errorText?: string;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls(err || !!errorText)} />
      {errorText && <p className="mt-1 text-xs text-destructive">{errorText}</p>}
    </div>
  );
}

function SelectField({
  label, value, onChange, options, err, allowOther, otherValue, onOther, full,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
  err?: boolean; allowOther?: boolean; otherValue?: string; onOther?: (v: string) => void; full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls(err)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        {allowOther && <option value={OTHER}>Other</option>}
      </select>
      {allowOther && value === OTHER && (
        <input
          value={otherValue ?? ""}
          onChange={(e) => onOther?.(e.target.value)}
          placeholder="Enter custom value…"
          className={`mt-1.5 ${inputCls(err)}`}
        />
      )}
    </div>
  );
}

function OptionSelectField({
  label, value, onChange, options, err, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[];
  err?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls(err)}>
        <option value="">{placeholder ?? "— Select —"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function GroupSelectField({
  label, value, onChange, groups, err, allowOther, otherValue, onOther, full,
}: {
  label: string; value: string; onChange: (v: string) => void; groups: OptGroup[];
  err?: boolean; allowOther?: boolean; otherValue?: string; onOther?: (v: string) => void; full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls(err)}>
        <option value="">— Select —</option>
        {groups.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        {allowOther && <option value={OTHER}>Other</option>}
      </select>
      {allowOther && value === OTHER && (
        <input
          value={otherValue ?? ""}
          onChange={(e) => onOther?.(e.target.value)}
          placeholder="Enter custom value…"
          className={`mt-1.5 ${inputCls(err)}`}
        />
      )}
    </div>
  );
}
