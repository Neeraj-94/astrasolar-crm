/**
 * Shared config + mock seed data for the Admin Sales Pipeline and Installation
 * Calendar tabs, ported from astrasolar-app.
 *
 * NOTE (degraded-wiring plan): these tabs currently run on the in-memory seed
 * data below so the full UI/interactions match astrasolar-app exactly. The
 * follow-up pass swaps `seedPipeline()` / `seedInstallations()` for live calls
 * to the v2 API (`/sales`, `/installations`) — the component logic and the
 * status/option vocabularies stay identical.
 */

// ───────────────────────────── Regions / installers ─────────────────────────
export interface Installer {
  id: string;
  name: string;
}
export interface Region {
  id: string;
  name: string;
  state: string;
  installers: Installer[];
}

/** Verbatim from astrasolar-app `INSTALL_REGIONS` (index.html ~44883). */
export const INSTALL_REGIONS: Region[] = [
  {
    id: "tas-south",
    name: "TAS - South (Hobart)",
    state: "TAS",
    installers: [
      { id: "liam", name: "Liam" },
      { id: "sunnyboy", name: "Sunny Boy Solar" },
      { id: "woolnough", name: "Woolnough" },
    ],
  },
  {
    id: "tas-north",
    name: "TAS - North (Launceston)",
    state: "TAS",
    installers: [{ id: "alistair", name: "Alistair" }],
  },
  {
    id: "act",
    name: "ACT",
    state: "ACT",
    installers: [
      { id: "dan", name: "Dan" },
      { id: "jeremy", name: "Jeremy" },
      { id: "charlie", name: "Charlie" },
      { id: "summit-shore", name: "Summit & Shore" },
      { id: "colin", name: "Colin" },
    ],
  },
  {
    id: "nsw",
    name: "NSW",
    state: "NSW",
    installers: [
      { id: "dan", name: "Dan" },
      { id: "jeremy", name: "Jeremy" },
      { id: "charlie", name: "Charlie" },
      { id: "summit-shore", name: "Summit & Shore" },
      { id: "colin", name: "Colin" },
    ],
  },
];

/** Region depot origins for drive-time (astrasolar-app `REGION_DEPOTS` ~50302). */
export const REGION_DEPOTS: Record<string, string> = {
  "tas-south": "3/22 Maxwells Rd, Cambridge, TAS, 7170",
  "tas-north": "3 Trotters Lane, Prospect, TAS, 7250",
  act: "44 Grimwade Street, Mitchell, ACT, 2911",
  nsw: "44 Grimwade Street, Mitchell, ACT, 2911",
};

export const REGION_TABS: { id: string; label: string }[] = [
  { id: "all", label: "🌏 All Regions" },
  { id: "tas-south", label: "TAS South" },
  { id: "tas-north", label: "TAS North" },
  { id: "act", label: "ACT" },
  { id: "nsw", label: "NSW" },
];

export const TIME_SLOTS = ["am", "pm"] as const;
export type TimeSlot = (typeof TIME_SLOTS)[number];

// ───────────────────────────── Pipeline option maps ─────────────────────────
// Value → human label, verbatim from astrasolar-app `PIPE_FILTER_LABELS`
// and the dropdown builders.

export const FINANCE_STATUS: Record<string, string> = {
  applied: "Applied",
  finance_docs_submitted: "Docs Submitted",
  finance_approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  under_review: "Under Review",
  pending_acceptance: "Pending Acceptance",
  not_applied: "Not Applied",
  awaiting_docs: "Awaiting Docs",
};

export const PREAPPROVAL_STATUS: Record<string, string> = {
  needs_applying: "Needs Applying",
  submitted: "Submitted",
  pre_approval_submitted: "Submitted",
  pre_approval_approved: "Approved",
  awaiting_payment_preapproval: "Awaiting Payment",
  awaiting_info: "Awaiting Info",
  incomplete_info: "Incomplete Information",
  on_hold: "On Hold",
  cancelled: "Cancelled",
};

export const METER_CHANGE: Record<string, string> = {
  not_required: "Not Required",
  needs_submitting: "Needs Submitting",
  in_progress: "In Progress",
  completed: "Completed",
};

export const INSTALLATION_STATE: Record<string, string> = {
  ready_to_book: "Ready to Book",
  installation_booked: "Installation Booked",
};

export const INSTALL_ADMIN_STATUS: Record<string, string> = {
  install_details_checked: "Install Details Checked",
  on_hold: "On Hold",
  awaiting_stock: "Awaiting Stock",
  stock_ordered: "Stock Ordered",
  issues: "Issues",
  roof_structure_issue: "Roof Structure Issue",
  pending_install_after_cutoff: "Pending Install After Cutoff",
};

export const INSTALL_STATUS: Record<string, string> = {
  installation_due: "Installation Due",
  installation_started: "Installation Started",
  installation_complete: "Installation Complete",
};

export const FINALISATIONS: Record<string, string> = {
  ces_not_uploaded: "CES Not Uploaded",
  cec_uploaded: "CES Uploaded",
};

export const PAYMENT_STATUS: Record<string, string> = {
  payment_due: "Payment Due",
  part_payment_received: "Part Payment Received",
  full_payment_received: "Full Payment Received",
};

/** Stage-gating: each returns an error string (blocking) or null (ok). */
export const STAGE_REQUIREMENTS: Record<
  string,
  (s: PipelineStatus) => string | null
> = {
  installation: (s) =>
    s.adminStatus ? null : "Admin Status must be set before booking installation",
  installAdminStatus: (s) =>
    s.installation ? null : "Installation Ready must be selected first",
  installDate: (s) =>
    s.installation ? null : "Installation Ready must be selected first",
  installStatus: (s) =>
    s.installDate ? null : "Installation date must be set first",
  finalisations: (s) =>
    s.installStatus === "installation_complete"
      ? null
      : "Installation must be marked complete first",
  paymentStatus: (s) =>
    s.finalisations === "cec_uploaded"
      ? null
      : "CES must be uploaded before setting payment status",
};

// ───────────────────────────── Types ────────────────────────────────────────
export interface PipelineStatus {
  openSolarId?: string;
  leadGen?: string;
  discount?: number;
  paymentMethods?: string; // 'cash' | 'finance' | 'hesp'
  financeStatus?: string;
  adminStatus?: string; // pre-approvals
  meterChange?: string;
  installation?: string;
  installAdminStatus?: string; // Status column
  installDate?: string;
  installStatus?: string;
  finalisations?: string;
  paymentStatus?: string;
}

export interface PipelineSale {
  key: string;
  leadId?: string;
  consultantId: string;
  consultantName: string;
  company: string;
  companyType: string; // 'astra' | 'dcnt'
  firstName: string;
  surname: string;
  phone: string;
  email?: string;
  address?: string;
  suburb?: string;
  postcode?: string;
  state: string;
  leadGen: string;
  solar?: string;
  battery?: string;
  extrasTotal?: number;
  soldPrice: number;
  paymentMethod: string;
  paymentDate?: string;
  // System specs (for the booking modal autofill)
  systemType?: string;
  systemSize?: string;
  numPanels?: string;
  panelModel?: string;
  inverterModel?: string;
  phase?: string;
  batteryModel?: string;
  hotWater?: string;
  switchboard?: string;
  backup?: string;
  roofType?: string;
  storeys?: string;
  installNotes?: string;
  // Extra detail-panel fields (editable in the expandable row).
  saleStatus?: string; // SaleStatus enum value
  saleType?: string; // SaleType enum value
  systemTypeCode?: string; // SystemType enum value
  totalRRP?: number;
  totalCommission?: number;
  saleDate?: string;
  energyProvider?: string;
  nmi?: string;
  referral?: string;
  paymentNotes?: string;
  aircon?: string;
  tilts?: string;
  status: PipelineStatus;
}

// ── Detail-panel select option lists ──────────────────────────────────────
export const SALE_STATUS_OPTS: Record<string, string> = {
  NEGOTIATION: "Negotiation",
  CONTRACT: "Contract",
  ON_HOLD: "On Hold",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export const SALE_TYPE_OPTS: Record<string, string> = {
  SOLAR_ONLY: "Solar Only",
  BATTERY_ONLY: "Battery Only",
  SOLAR_BATTERY: "Solar + Battery",
};
export const SYSTEM_TYPE_OPTS: Record<string, string> = {
  NEW: "New",
  REPLACEMENT: "Replacement",
  ADDITIONAL: "Additional",
  ADDITIONAL_REPLACEMENT: "Additional + Replacement",
};
export const STATE_OPTS = ["ACT", "NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT"];
export const COMPANY_OPTS: Record<string, string> = { astra: "Astra", dcnt: "DC ELEC" };
export const ROOF_TYPE_OPTS = ["Tile", "Tin", "Kliplock", "Terracotta", "Other"];
export const STOREYS_OPTS = ["1", "2", "3+"];
export const PHASE_OPTS = ["1 Phase", "2 Phase", "3 Phase"];
export const SWITCHBOARD_OPTS = ["Yes Full", "Yes Minor", "No"];
export const BACKUP_OPTS = ["Full", "Partial", "None", "Other"];
export const HOTWATER_OPTS = ["Apricus", "Reclaim", "None", "Other"];
export const AIRCON_OPTS = ["None", "Other"];
export const PAYMENT_OPTS: Record<string, string> = { cash: "Cash", finance: "Finance", hesp: "HESP" };

// ── Extras catalogues (verbatim from astrasolar-app) ──────────────────────
export interface ExtraItem {
  id: string;
  name: string;
  price: number;
  perUnit: string;
  note?: string;
}

export const EXTRAS_CATALOGUE: ExtraItem[] = [
  { id: "tilt", name: "Tilt Panel", price: 40, perUnit: "Per Panel", note: "+$200 for extra labour & material" },
  { id: "cliplock", name: "Clip Lock Roof", price: 22, perUnit: "Per Panel" },
  { id: "split", name: "Split Array", price: 150, perUnit: "Per Split", note: "No free split" },
  { id: "optimiser", name: "Optimiser", price: 95, perUnit: "Per Panel" },
  { id: "removal", name: "System Removal", price: 80, perUnit: "Per Panel" },
  { id: "hwremoval", name: "Hot Water / Pool System Removal", price: 500, perUnit: "Per System" },
  { id: "terracotta", name: "Terracotta Tiles", price: 250, perUnit: "Per Job" },
  { id: "doublestory", name: "Double Story", price: 350, perUnit: "Per Unit" },
  { id: "mainswitch", name: "Main Switch", price: 200, perUnit: "Per Unit" },
  { id: "steeproof", name: "Steep Roof", price: 1000, perUnit: "Per Job", note: "Unless advised otherwise" },
  { id: "sbmajor", name: "Switchboard Upgrade (Major)", price: 2000, perUnit: "Per Meter", note: "Unless advised otherwise" },
  { id: "sbminor", name: "Switchboard Upgrade (Minor)", price: 1000, perUnit: "Per Meter", note: "Unless advised otherwise" },
  { id: "extrainv", name: "Goodwe 5kW Extra Inverter (1ph)", price: 1000, perUnit: "Per System" },
  { id: "invcanopy", name: "Inverter Canopy", price: 200, perUnit: "Per Unit", note: "If no shed available" },
  { id: "bdcert", name: "Technical Assessment / BD Certificate", price: 1350, perUnit: "Per Install" },
  { id: "smartmeter", name: "Smart Meter / Export Limiter (1ph)", price: 350, perUnit: "Per Unit" },
  { id: "ctmeter2ph", name: "CT Meter (2 Phase)", price: 220, perUnit: "Per Unit" },
  { id: "ctmeter3ph", name: "CT Meter (3 Phase)", price: 340, perUnit: "Per Unit" },
  { id: "landscape", name: "Landscape Panel", price: 20, perUnit: "Per Panel" },
  { id: "scissorlift", name: "Scissor Lift", price: 700, perUnit: "Per Day", note: "Plus travel — quote per job" },
  { id: "travelkm", name: "Travel (per km)", price: 1.5, perUnit: "Per KM", note: "ACT: after 70km from CBD. TAS: all km. Both ways." },
  { id: "3phase", name: "3 Phase Extra", price: 1000, perUnit: "Per Install" },
  { id: "3stringinv", name: "3 String 5kW Inverter Add", price: 200, perUnit: "Per Unit" },
  { id: "sungrow5", name: "Sungrow 1ph Upgrade — 5kW", price: 671, perUnit: "Per Unit" },
  { id: "sungrow8", name: "Sungrow 1ph Upgrade — 8kW", price: 431, perUnit: "Per Unit" },
  { id: "sungrow10", name: "Sungrow 1ph Upgrade — 10kW", price: 550, perUnit: "Per Unit" },
];

export const EXTRAS_COUNTRY: ExtraItem[] = [
  { id: "country_small", name: "Country Job ≤ 6.6kW", price: 80, perUnit: "Per kW", note: "$80/kW extra" },
  { id: "country_mid", name: "Country Job 7–11kW", price: 80, perUnit: "Per kW", note: "$80/kW + $250 accommodation" },
  { id: "country_large", name: "Country Job > 11kW", price: 80, perUnit: "Per kW", note: "$80/kW + $500 accommodation" },
  { id: "accommodation", name: "Accommodation", price: 500, perUnit: "Per Day" },
];

export const BATTERY_EXTRAS_CATALOGUE: ExtraItem[] = [
  { id: "batt_cable_10_20", name: "Battery Cabling 10–20m", price: 380, perUnit: "Per Install" },
  { id: "batt_cable_20_30", name: "Battery Cabling 20–30m", price: 480, perUnit: "Per Install" },
  { id: "batt_fireproof", name: "Supply & Install Fireproofing", price: 475, perUnit: "Per Install" },
  { id: "batt_smoke_alarm", name: "Supply & Install Smoke Alarm", price: 300, perUnit: "Per Install" },
  { id: "batt_bollard", name: "Supply & Install Bollard", price: 150, perUnit: "Per Install" },
  { id: "batt_paver", name: "Supply & Install Paver", price: 150, perUnit: "Per Install" },
  { id: "batt_existing_hybrid", name: "Existing Hybrid Inverter On-site", price: 250, perUnit: "Per Install" },
  { id: "batt_covers", name: "Battery Covers", price: 1000, perUnit: "Per Install" },
  { id: "batt_junction_box", name: "Junction Box (Hybrid Swap)", price: 250, perUnit: "Per Install", note: "Required when swapping inverter for hybrid" },
  { id: "batt_country_150", name: "Battery Country Surcharge (150km+)", price: 600, perUnit: "Per Install" },
];

/** Oversell/undersell adjustment, ported from astrasolar-app calcCommissionAdjustment. */
export function commissionAdjustment(effectiveRRP: number, soldPrice: number): { type: "oversell" | "undersell" | "even"; amount: number } {
  if (soldPrice > effectiveRRP) return { type: "oversell", amount: 0.25 * (soldPrice - effectiveRRP) };
  if (soldPrice < effectiveRRP) return { type: "undersell", amount: -0.6 * (effectiveRRP - soldPrice) };
  return { type: "even", amount: 0 };
}

export interface Booking {
  customerName: string;
  phone?: string;
  address?: string;
  suburb?: string;
  postcode?: string;
  consultant?: string;
  systemType?: string;
  backup?: string;
  systemSize?: string;
  numPanels?: string;
  panel?: string;
  inverter?: string;
  phases?: string;
  hotWater?: string;
  battery?: string;
  product?: string;
  roofType?: string;
  storey?: string;
  switchboard?: string;
  status: string; // 'needs_booking' | 'booked'
  company?: string; // 'astra' | 'dcnt'
  notes?: string;
  saleKey?: string;
  regionId: string;
  date: string; // YYYY-MM-DD
  installerId: string;
  timeSlot: TimeSlot;
}

/** Booking store key, matching legacy `installations/{region}/{date}/{installer}_{slot}`. */
export function bookingKey(
  regionId: string,
  date: string,
  installerId: string,
  slot: TimeSlot,
): string {
  return `${regionId}/${date}/${installerId}_${slot}`;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOf(d: Date): Date {
  const x = new Date(d);
  const dow = x.getDay(); // 0 Sun … 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
