import "server-only";
import { cookies } from "next/headers";
import { apiGet } from "@/lib/api/client";
import type { ApiLead } from "@/lib/sales/leads";
import {
  SALES_METRICS,
  TIME_RANGES,
  type ConsultantStats,
  type SalesMetricKey,
  type TeamStatusEntry,
  type TimeRange,
} from "@/lib/sales/statistics-shared";

/**
 * Statistics tab — server-only data fetchers, backed by the live API.
 *
 *   1. Team Status — the real consultant roster (GET /users/consultants).
 *   2. Sales Statistics — per-consultant counts aggregated from real leads
 *      (GET /leads), bucketed by disposition and filtered by the chosen range.
 *
 * NOTE on presence: the app does not yet track per-user activity, so the
 * online/offline flag below reports everyone as "offline" with lastSeenAt null.
 * Wiring true presence requires a `User.lastSeenAt` heartbeat (a middleware
 * that bumps the field on each authenticated request); once that exists, only
 * the `status`/`lastSeenAt` derivation here changes.
 *
 * Re-exports the shared types/constants so existing call sites (API routes,
 * widgets) can still import from a single module path.
 */
export { SALES_METRICS, TIME_RANGES };
export type {
  ConsultantStats,
  OnlineStatus,
  SalesMetricKey,
  TeamStatusEntry,
  TimeRange,
} from "@/lib/sales/statistics-shared";

interface ApiConsultant {
  id: string;
  name: string;
  email: string;
  region: string | null;
}

/** Forward the caller's auth cookies to the API for server-side fetches. */
function authOpts() {
  return { cookieHeader: cookies().toString() };
}

async function fetchConsultants(): Promise<ApiConsultant[]> {
  try {
    return (await apiGet<ApiConsultant[]>("/users/consultants", authOpts())) ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Team Status — real roster (presence pending a lastSeenAt heartbeat).
// ---------------------------------------------------------------------------
export async function getTeamStatus(): Promise<TeamStatusEntry[]> {
  const consultants = await fetchConsultants();
  return consultants
    .map<TeamStatusEntry>((c) => ({
      consultantId: c.id,
      name: c.name,
      email: c.email,
      region: c.region ?? null,
      // No presence backend yet — see file header.
      status: "offline",
      lastSeenAt: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Sales Statistics — aggregated from real leads.
// ---------------------------------------------------------------------------
/** Inclusive lower bound (UTC midnight) for the requested range. */
function rangeStart(range: TimeRange, now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  switch (range) {
    case "daily":
      return d;
    case "weekly": {
      const day = d.getDay(); // 0 = Sun
      const offset = day === 0 ? -6 : 1 - day; // back to Monday
      d.setDate(d.getDate() + offset);
      return d;
    }
    case "monthly":
      d.setDate(1);
      return d;
    case "yearly":
      d.setMonth(0, 1);
      return d;
  }
}

/** API SalesDisposition (UPPER) -> stats metric bucket. */
const DISPOSITION_TO_METRIC: Record<string, SalesMetricKey> = {
  SOLD: "sales",
  PRES_PROP_CREATED: "presentations",
  CALL_BACK: "callbacks",
  NO_ANSWER: "no_answers",
  CANCELLED: "cancellations",
};

function leadDateISO(l: ApiLead): string {
  const v = l.bookingDate || l.timestamp || "";
  const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export async function getSalesStatistics(
  range: TimeRange,
): Promise<ConsultantStats[]> {
  const startISO = rangeStart(range).toISOString().slice(0, 10);
  const [consultants, leads] = await Promise.all([
    fetchConsultants(),
    apiGet<ApiLead[]>("/leads", authOpts()).catch(() => [] as ApiLead[]),
  ]);

  // Seed every consultant so zero-activity reps still appear (empty bars).
  const byConsultant = new Map<string, ConsultantStats>();
  const emptyCounts = (): Record<SalesMetricKey, number> => ({
    sales: 0,
    presentations: 0,
    callbacks: 0,
    no_answers: 0,
    cancellations: 0,
  });
  for (const c of consultants) {
    byConsultant.set(c.id, { consultantId: c.id, name: c.name, counts: emptyCounts() });
  }

  for (const lead of leads ?? []) {
    if (!lead.disposition) continue;
    const metric = DISPOSITION_TO_METRIC[lead.disposition];
    if (!metric) continue;
    if (leadDateISO(lead) < startISO) continue;
    const cid = lead.consultant?.id;
    if (!cid) continue;
    let row = byConsultant.get(cid);
    if (!row) {
      // Consultant outside the directory (e.g. inactive) but with activity.
      row = {
        consultantId: cid,
        name: lead.consultant?.name ?? cid,
        counts: emptyCounts(),
      };
      byConsultant.set(cid, row);
    }
    row.counts[metric] += 1;
  }

  return Array.from(byConsultant.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
