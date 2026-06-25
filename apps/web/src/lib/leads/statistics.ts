import "server-only";
import { cookies } from "next/headers";
import { apiGet } from "@/lib/api/client";
import {
  emptyCounts,
  outcomeToMetric,
  APPOINTMENT_OUTCOME,
  type AgentStats,
  type Granularity,
  type LeadMetricKey,
  type LeadStatRow,
  type LeadStatsResponse,
  type LeadStatsSummary,
  type TimeBucket,
} from "@/lib/leads/statistics-shared";

/**
 * Lead Statistics — server-only data fetcher.
 *
 * Aggregates lead-gen performance from the live raw Bloome appointment-setter
 * leads (`GET /leads/bloome`). Each Bloome row carries a `dials` count, an
 * `outcome` label, the setting `agent`, and a submission `timestamp`; from
 * those we derive:
 *
 *   • dials made           — Σ row.dials
 *   • call backs attended  — count of call-back outcomes
 *   • leads appointed      — count of "Appointment" outcomes
 *
 * computed three ways: an overall summary, a time-series bucketed by the
 * chosen granularity, a per-agent breakdown, and a per-lead drill-down list.
 *
 * NOTE: rows with an unparseable `timestamp` cannot be placed on the time axis
 * or inside a date window, so they are excluded from the windowed aggregates.
 */

export type {
  AgentStats,
  Granularity,
  LeadStatRow,
  LeadStatsResponse,
  LeadStatsSummary,
  TimeBucket,
} from "@/lib/leads/statistics-shared";

/** Raw Bloome row as returned by the API (subset we use). */
interface BloomeRow {
  id: string;
  region: string | null;
  timestamp: string | null;
  firstName: string | null;
  lastName: string | null;
  agent: string | null;
  dials: number | null;
  outcome: string | null;
  appDate: string | null;
}

interface BloomeListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: BloomeRow[];
}

/** Forward the caller's auth cookies to the API for server-side fetches. */
function authOpts() {
  return { cookieHeader: cookies().toString() };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse the start of day (UTC) for an ISO date string. */
function parseISODate(s: string): Date {
  const d = new Date(`${s}T00:00:00.000Z`);
  return d;
}

/** Monday (UTC) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  const day = out.getUTCDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + offset);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Bucket key + label for a date under a given granularity. */
function bucketFor(
  d: Date,
  g: Granularity,
): { key: string; label: string } {
  switch (g) {
    case "daily": {
      const key = isoDate(d);
      return { key, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` };
    }
    case "weekly": {
      const m = mondayOf(d);
      return {
        key: isoDate(m),
        label: `${m.getUTCDate()} ${MONTHS[m.getUTCMonth()]}`,
      };
    }
    case "monthly": {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      return { key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
    }
    case "yearly": {
      const key = String(d.getUTCFullYear());
      return { key, label: key };
    }
  }
}

/** Every bucket between [from, to] inclusive, in order (fills empty gaps). */
function enumerateBuckets(
  from: Date,
  to: Date,
  g: Granularity,
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  // Safety cap so a bad range can never loop unbounded.
  for (let i = 0; i < 2000 && cursor <= to; i++) {
    const b = bucketFor(cursor, g);
    if (!seen.has(b.key)) {
      seen.add(b.key);
      out.push(b);
    }
    switch (g) {
      case "daily":
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        break;
      case "weekly":
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        break;
      case "monthly":
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
        break;
      case "yearly":
        cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
        break;
    }
  }
  return out;
}

/** Default window (inclusive) for a granularity when no custom range is set. */
export function defaultWindow(
  g: Granularity,
  now = new Date(),
): { from: string; to: string } {
  const to = new Date(now);
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  switch (g) {
    case "daily":
      from.setUTCDate(from.getUTCDate() - 29); // last 30 days
      break;
    case "weekly":
      from.setUTCDate(from.getUTCDate() - 7 * 11); // last 12 weeks
      break;
    case "monthly":
      from.setUTCMonth(from.getUTCMonth() - 11); // last 12 months
      break;
    case "yearly":
      from.setUTCFullYear(from.getUTCFullYear() - 4); // last 5 years
      break;
  }
  return { from: isoDate(from), to: isoDate(to) };
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

/** Page through every Bloome row (optionally scoped to a region). */
async function fetchAllBloomeRows(region?: string | null): Promise<BloomeRow[]> {
  const pageSize = 250;
  const all: BloomeRow[] = [];
  let page = 1;
  // Safety cap: 200 pages × 250 = 50k rows.
  for (let i = 0; i < 200; i++) {
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    let res: BloomeListResponse | null = null;
    try {
      res = await apiGet<BloomeListResponse>(
        `/leads/bloome?${params.toString()}`,
        authOpts(),
      );
    } catch {
      break;
    }
    if (!res || !Array.isArray(res.rows) || res.rows.length === 0) break;
    all.push(...res.rows);
    if (all.length >= res.total || res.rows.length < pageSize) break;
    page += 1;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface GetParams {
  granularity: Granularity;
  /** Inclusive ISO date bounds. Defaults derived from granularity. */
  from?: string;
  to?: string;
  region?: string | null;
}

export async function getLeadStatistics(
  params: GetParams,
): Promise<LeadStatsResponse> {
  const { granularity } = params;
  const win = defaultWindow(granularity);
  const fromISO = params.from || win.from;
  const toISO = params.to || win.to;
  const from = parseISODate(fromISO);
  const to = parseISODate(toISO);
  // Make `to` inclusive of the whole day.
  const toEnd = new Date(to);
  toEnd.setUTCHours(23, 59, 59, 999);

  const rows = await fetchAllBloomeRows(params.region ?? undefined);

  // Seed continuous time buckets so the trend axis has no gaps.
  const buckets = new Map<string, TimeBucket>();
  for (const b of enumerateBuckets(from, to, granularity)) {
    buckets.set(b.key, { key: b.key, label: b.label, counts: emptyCounts(), leads: 0 });
  }

  const byAgent = new Map<string, AgentStats>();
  const summary: LeadStatsSummary = {
    totalLeads: 0,
    dials: 0,
    callbacks: 0,
    appointments: 0,
    conversionRate: 0,
    dialToAppointmentRate: 0,
    avgDialsPerLead: 0,
  };
  const leadRows: LeadStatRow[] = [];

  for (const r of rows) {
    if (!r.timestamp) continue;
    const ts = new Date(r.timestamp);
    if (isNaN(ts.getTime())) continue;
    if (ts < from || ts > toEnd) continue;

    const dials = Number.isFinite(r.dials as number) ? (r.dials as number) : 0;
    const metric = outcomeToMetric(r.outcome);

    // --- summary ---
    summary.totalLeads += 1;
    summary.dials += dials;
    if (metric === "callbacks") summary.callbacks += 1;
    if (metric === "appointments") summary.appointments += 1;

    // --- time bucket ---
    const bk = bucketFor(ts, granularity);
    let bucket = buckets.get(bk.key);
    if (!bucket) {
      bucket = { key: bk.key, label: bk.label, counts: emptyCounts(), leads: 0 };
      buckets.set(bk.key, bucket);
    }
    bucket.leads += 1;
    bucket.counts.dials += dials;
    if (metric) bucket.counts[metric] += 1;

    // --- per agent ---
    const agentName = (r.agent && r.agent.trim()) || "Unassigned";
    let agent = byAgent.get(agentName);
    if (!agent) {
      agent = { agent: agentName, counts: emptyCounts(), leads: 0 };
      byAgent.set(agentName, agent);
    }
    agent.leads += 1;
    agent.counts.dials += dials;
    if (metric) agent.counts[metric] += 1;

    // --- per lead drill-down ---
    const name =
      [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || "—";
    leadRows.push({
      id: r.id,
      name,
      agent: r.agent ?? null,
      region: r.region ?? null,
      date: isoDate(ts),
      outcome: r.outcome ?? null,
      dials,
      appDate: r.appDate ?? null,
    });
  }

  // Derived summary ratios.
  summary.conversionRate =
    summary.totalLeads > 0 ? summary.appointments / summary.totalLeads : 0;
  summary.dialToAppointmentRate =
    summary.dials > 0 ? summary.appointments / summary.dials : 0;
  summary.avgDialsPerLead =
    summary.totalLeads > 0 ? summary.dials / summary.totalLeads : 0;

  // Order series chronologically by key (keys sort lexicographically for all
  // granularities since they are zero-padded ISO-ish strings).
  const series = Array.from(buckets.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );

  // Agents: most appointments first, then dials.
  const agents = Array.from(byAgent.values()).sort(
    (a, b) =>
      b.counts.appointments - a.counts.appointments ||
      b.counts.dials - a.counts.dials ||
      a.agent.localeCompare(b.agent),
  );

  // Leads: newest first; cap the drill-down payload.
  leadRows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return {
    granularity,
    from: fromISO,
    to: toISO,
    region: params.region ?? null,
    summary,
    series,
    byAgent: agents,
    leads: leadRows.slice(0, 1000),
    fetchedAt: new Date().toISOString(),
  };
}

/** Unused metric-key re-export kept for symmetry with the sales module. */
export type { LeadMetricKey };
export { APPOINTMENT_OUTCOME };
