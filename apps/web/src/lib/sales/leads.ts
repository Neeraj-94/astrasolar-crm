/**
 * Sales-dashboard lead data — backed by the live API (GET /leads).
 *
 * Holds the view types + display config the sales tabs share, plus the mapping
 * from the API's `Lead` shape into the flat `SalesLead` row the tables render,
 * and a `useSalesLeads()` hook that fetches + maps in one call. Replaces the
 * former synthetic mock generator: every row now comes from Postgres via the
 * scoped /leads endpoint.
 */
import * as React from "react";
import { useApi } from "@/lib/api/use-api";

// ---------------------------------------------------------------------------
// View types + display config (not data — kept here as the single source).
// ---------------------------------------------------------------------------
export type Disposition =
  | "set"
  | "presented"
  | "callback"
  | "still_deciding"
  | "maybe_future"
  | "resent_proposal"
  | "sold"
  | "not_interested"
  | "no_answer"
  | "cancel"
  | "reschedule"
  | "been_rescheduled"
  | "dnq";

export type LeadCompany = "astra" | "dc" | "bloome";

export interface SalesLead {
  id: string;
  consultantId: string;
  /** Display name of the assigned consultant (carried from the API join). */
  consultantName?: string;
  /** ISO date YYYY-MM-DD — the day the appointment was set for */
  date: string;
  /**
   * ISO date YYYY-MM-DD of the booked appointment (from the lead's booking).
   * Undefined when the lead has no appointment yet — used by My Leads to show
   * only real appointments for a day (vs. the `date` fallback to creation time).
   */
  bookingDate?: string;
  time: string; // e.g. "10:00 am"
  name: string;
  phone: string;
  email?: string;
  address: string;
  state: string;
  bills?: string;
  source: string;
  company: LeadCompany;
  lgNotes?: string;
  cbNotes?: string;
  followUpNotes?: string;
  attempts?: number;
  hot?: boolean;
  /** ISO date the lead was originally set on */
  dateSet: string;
  disposition: Disposition;
  /** Lead lifecycle stage (INTAKE | BOOKED | CONVERTED | CLOSED). */
  stage?: string;
  /** Checklist status if one exists for this lead ("DRAFT" | "COMPLETED"). */
  checklistStatus?: "DRAFT" | "COMPLETED" | null;
  /** Lead-gen rep who booked the lead (display name). */
  leadGenName?: string;
  /**
   * Sales-pipeline detail for a sold lead — merged in from GET /sales by leadId.
   * Undefined for leads that haven't converted to a sale yet.
   */
  pipeline?: SalePipeline;
}

/** Stage progression shared by every pipeline status column. */
export type StageState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "NOT_REQUIRED";

export const STAGE_LABEL: Record<StageState, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  NOT_REQUIRED: "Not Required",
};

/**
 * The slice of a Sale surfaced as extra columns on the My Leads table
 * (Open Solar ID, Product, Price, Payment, and the finance/pre-approval/
 * meter-change statuses). Mirrors the astrasolar-app "My Sales Pipeline".
 */
export interface SalePipeline {
  /** Sale id (GET /sales row) — used to open the sale detail modal. */
  saleId: string;
  openSolarId?: string;
  product?: string;
  price?: number;
  /** "Cash" or the finance lender label. */
  payment: string;
  financeStatus: StageState;
  preApprovals: StageState;
  meterChange: StageState;
  saleStatus?: string;
  installDate?: string;
}

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  set: "Set",
  presented: "Presented",
  callback: "Call Back",
  still_deciding: "Still Deciding",
  maybe_future: "Maybe in the Future",
  resent_proposal: "Resent Proposal",
  sold: "Sold",
  not_interested: "Not Interested",
  no_answer: "No Answer",
  cancel: "Cancel",
  reschedule: "Reschedule",
  been_rescheduled: "Been Rescheduled",
  dnq: "DNQ",
};

/**
 * Disposition options shared by the Call Back Sheet, Past Preso's and Not
 * Interested sheets. Mirrors the legacy astrasolar-app dropdown (the base
 * DISPOSITIONS list plus the Call Back-only extras) so a row on any of those
 * sheets can be revived / re-dispositioned in one click.
 */
export const SHEET_DISPOSITION_OPTIONS: Disposition[] = [
  "callback",
  "still_deciding",
  "maybe_future",
  "resent_proposal",
  "presented",
  "sold",
  "no_answer",
  "reschedule",
  "been_rescheduled",
  "not_interested",
  "dnq",
  "cancel",
];

export const STATE_OPTIONS = [
  "ACT",
  "TAS Hobart",
  "TAS Laun",
  "NSW",
  "VIC",
  "QLD",
  "SA",
] as const;

// ---------------------------------------------------------------------------
// API <-> view enum mapping.
// ---------------------------------------------------------------------------
/** API SalesDisposition (UPPER) -> view Disposition. */
const API_TO_DISPOSITION: Record<string, Disposition> = {
  SOLD: "sold",
  PRES_PROP_CREATED: "presented",
  CALL_BACK: "callback",
  RESCHEDULE: "reschedule",
  BEEN_RESCHEDULED: "been_rescheduled",
  NO_ANSWER: "no_answer",
  NOT_INTERESTED: "not_interested",
  DNQ: "dnq",
  CANCELLED: "cancel",
};

/** view Disposition -> API SalesDisposition (for filtering + writes). */
export const DISPOSITION_TO_API: Partial<Record<Disposition, string>> = {
  sold: "SOLD",
  presented: "PRES_PROP_CREATED",
  resent_proposal: "PRES_PROP_CREATED",
  callback: "CALL_BACK",
  still_deciding: "CALL_BACK",
  maybe_future: "CALL_BACK",
  reschedule: "RESCHEDULE",
  been_rescheduled: "BEEN_RESCHEDULED",
  no_answer: "NO_ANSWER",
  not_interested: "NOT_INTERESTED",
  dnq: "DNQ",
  cancel: "CANCELLED",
};

const SOURCE_LABEL: Record<string, string> = {
  BLOOM_ASTRA: "Bloome",
  REFERRAL: "Referral",
  INBOUND: "Inbound",
  WEBSITE: "Web",
  BRIGHTE: "Brighte",
};

// ---------------------------------------------------------------------------
// API shape (subset of GET /leads we consume) + mapping to SalesLead.
// ---------------------------------------------------------------------------
export interface ApiLead {
  id: string;
  firstName: string;
  surName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  postCode?: string | null;
  state?: string | null;
  billSpend?: string | null;
  source?: string | null;
  company?: string | null; // ASTRA | DC
  disposition?: string | null; // SalesDisposition
  outcome?: string | null; // LeadOutcome
  stage?: string | null;
  bookingDate?: string | null;
  bookingTime?: string | null;
  dials?: number | null;
  timestamp?: string | null;
  leadGenNotes?: string | null;
  consultantNotes?: string | null;
  consultant?: { id: string; name: string } | null;
  leadGen?: { id: string; name: string } | null;
  checklist?: { status: "DRAFT" | "COMPLETED" } | null;
}

function isoDate(v?: string | null): string {
  if (!v) return "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function mapCompany(c?: string | null): LeadCompany {
  return String(c).toUpperCase() === "DC" ? "dc" : "astra";
}

/** Map one API Lead into the flat row the sales tables render. */
export function mapApiLead(l: ApiLead): SalesLead {
  const bookingDate = isoDate(l.bookingDate);
  const date = bookingDate || isoDate(l.timestamp);
  return {
    id: l.id,
    consultantId: l.consultant?.id ?? "",
    consultantName: l.consultant?.name ?? undefined,
    date,
    bookingDate: bookingDate || undefined,
    dateSet: isoDate(l.timestamp) || date,
    time: l.bookingTime ?? "",
    name: `${l.firstName ?? ""} ${l.surName ?? ""}`.trim(),
    phone: l.phone ?? "",
    email: l.email ?? undefined,
    address: l.address ?? "",
    state: l.state ?? "",
    bills: l.billSpend ?? undefined,
    source: l.source ? (SOURCE_LABEL[l.source] ?? l.source) : "",
    company: mapCompany(l.company),
    lgNotes: l.leadGenNotes ?? undefined,
    cbNotes: l.consultantNotes ?? undefined,
    followUpNotes: l.consultantNotes ?? undefined,
    attempts: l.dials ?? undefined,
    hot: l.outcome === "HOT_CALL_BACK",
    disposition: l.disposition
      ? (API_TO_DISPOSITION[l.disposition] ?? "set")
      : "set",
    stage: l.stage ?? undefined,
    checklistStatus: l.checklist?.status ?? null,
    leadGenName: l.leadGen?.name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Sales pipeline (GET /sales) -> per-lead pipeline column data.
// ---------------------------------------------------------------------------
interface ApiSaleStatusDetails {
  financeStatus?: StageState | null;
  preapprovalStatus?: StageState | null;
  meterChangeStatus?: StageState | null;
}
interface ApiSystemDetails {
  systemSize?: string | number | null;
  batterySize?: string | number | null;
  batteryBrand?: string | null;
  inverterModel?: string | null;
  phase?: string | null;
}
interface ApiSaleFinance {
  lender?: string | null;
  amount?: string | number | null;
}
export interface ApiSale {
  id: string;
  leadId: string;
  openSolarId?: string | null;
  soldPrice?: string | number | null;
  status?: string | null;
  statusDetails?: ApiSaleStatusDetails | null;
  systemDetails?: ApiSystemDetails | null;
  installation?: { installDate?: string | null } | null;
  finance?: ApiSaleFinance[] | null;
}

/** Decimal columns arrive as strings — coerce to a clean number (drops "6.60"→6.6). */
function num(v?: string | number | null): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Build a concise product string from the system-spec snapshot. */
function buildProduct(sd?: ApiSystemDetails | null): string | undefined {
  if (!sd) return undefined;
  const parts: string[] = [];
  const kw = num(sd.systemSize);
  if (kw) parts.push(`${kw}kW Solar`);
  const batt = num(sd.batterySize);
  if (batt) parts.push(`${batt}kWh ${sd.batteryBrand ?? ""}`.trim());
  if (sd.inverterModel)
    parts.push(`${sd.inverterModel}${sd.phase ? ` ${sd.phase}` : ""}`);
  return parts.length ? parts.join(" + ") : undefined;
}

/** "Cash" when there's no finance leg; otherwise the lender label. */
function paymentLabel(finance?: ApiSaleFinance[] | null): string {
  const legs = (finance ?? []).filter(
    (f) => (f.lender && f.lender.trim()) || (num(f.amount) ?? 0) > 0,
  );
  if (legs.length === 0) return "Cash";
  return legs[0].lender?.trim() || "Finance";
}

const STAGE_FALLBACK: StageState = "PENDING";

export function mapSaleToPipeline(s: ApiSale): SalePipeline {
  return {
    saleId: s.id,
    openSolarId: s.openSolarId ?? undefined,
    product: buildProduct(s.systemDetails),
    price: num(s.soldPrice),
    payment: paymentLabel(s.finance),
    financeStatus: s.statusDetails?.financeStatus ?? STAGE_FALLBACK,
    preApprovals: s.statusDetails?.preapprovalStatus ?? STAGE_FALLBACK,
    meterChange: s.statusDetails?.meterChangeStatus ?? STAGE_FALLBACK,
    saleStatus: s.status ?? undefined,
    installDate: s.installation?.installDate ?? undefined,
  };
}

/**
 * Fetch the consultant-scoped sales pipeline and index it by leadId, so the
 * My Leads table can merge pipeline columns onto each sold lead's row.
 */
export function useSalesPipeline() {
  const { data, loading, error, reload } = useApi<ApiSale[]>("/sales");
  const byLead = React.useMemo(() => {
    const m = new Map<string, SalePipeline>();
    for (const s of data ?? []) m.set(s.leadId, mapSaleToPipeline(s));
    return m;
  }, [data]);
  return { byLead, loading, error, reload };
}

/** Build the /leads query string for a set of view dispositions. */
function buildPath(dispositions?: Disposition[]): string {
  if (!dispositions || dispositions.length === 0) return "/leads";
  const api = Array.from(
    new Set(
      dispositions
        .map((d) => DISPOSITION_TO_API[d])
        .filter((x): x is string => !!x),
    ),
  );
  return api.length ? `/leads?disposition=${api.join(",")}` : "/leads";
}

/**
 * Fetch scoped leads (optionally filtered to a set of view dispositions) and
 * return them mapped to SalesLead rows, plus loading/error/reload.
 */
export function useSalesLeads(dispositions?: Disposition[]) {
  const path = React.useMemo(() => buildPath(dispositions), [
    dispositions?.join(","),
  ]);
  const { data, loading, error, reload } = useApi<ApiLead[]>(path);
  const leads = React.useMemo(
    () => (data ?? []).map(mapApiLead),
    [data],
  );
  return { leads, loading, error, reload };
}
