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
  | "dnq";

export type LeadCompany = "astra" | "dc" | "bloome";

export interface SalesLead {
  id: string;
  consultantId: string;
  /** Display name of the assigned consultant (carried from the API join). */
  consultantName?: string;
  /** ISO date YYYY-MM-DD — the day the appointment was set for */
  date: string;
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
  BEEN_RESCHEDULED: "reschedule",
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
  const date = isoDate(l.bookingDate) || isoDate(l.timestamp);
  return {
    id: l.id,
    consultantId: l.consultant?.id ?? "",
    consultantName: l.consultant?.name ?? undefined,
    date,
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
  };
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
