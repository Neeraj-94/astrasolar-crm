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
  finance_docs_submitted: "Finance Docs Submitted",
  finance_approved: "Finance Approved",
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
  pre_approval_submitted: "Pre Approval Submitted",
  pre_approval_approved: "Pre Approval Approved",
  awaiting_payment_preapproval: "Awaiting Payment for PreApproval",
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
  status: PipelineStatus;
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
