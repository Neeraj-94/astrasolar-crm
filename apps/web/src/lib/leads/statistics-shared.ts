/**
 * Lead Statistics (Lead-Gen Performance) — shared types + runtime constants.
 *
 * This module is intentionally free of any server-only imports (no Prisma, no
 * `server-only` marker) so it can be imported by BOTH the server-side data
 * fetcher (`./statistics.ts`, the API route) AND the client widget.
 *
 * The numbers are aggregated from the raw Bloome appointment-setter leads
 * (`GET /leads/bloome`): each lead row carries a `dials` count, an `outcome`
 * label, the setting `agent`, and a submission `timestamp`. From those we
 * derive three lead-gen performance metrics plus an overall summary.
 */

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export type LeadMetricKey = "dials" | "callbacks" | "appointments";

export const LEAD_METRICS: Array<{
  key: LeadMetricKey;
  label: string;
  description: string;
  /** Tailwind background class used by the legend swatch. */
  swatch: string;
  /** Tailwind text-color class used by SVG `fill/stroke="currentColor"`. */
  color: string;
}> = [
  {
    key: "dials",
    label: "Dials made",
    description: "Total outbound dials recorded against leads.",
    swatch: "bg-sky-500",
    color: "text-sky-500",
  },
  {
    key: "callbacks",
    label: "Call backs attended",
    description: "Leads dispositioned to a call-back outcome.",
    swatch: "bg-violet-500",
    color: "text-violet-500",
  },
  {
    key: "appointments",
    label: "Leads appointed",
    description: "Leads booked into an appointment.",
    swatch: "bg-emerald-500",
    color: "text-emerald-500",
  },
];

/** Empty counts object — one zeroed entry per metric. */
export function emptyCounts(): Record<LeadMetricKey, number> {
  return { dials: 0, callbacks: 0, appointments: 0 };
}

/**
 * Outcome labels (raw Bloome vocabulary) that count as a "call back attended".
 * Mirrors the Bloome Leads tab's callback grouping.
 */
export const CALLBACK_OUTCOMES = ["Call Back", "Hot Call Back", "CB After 5pm"];

/** Outcome label that counts as an appointment booked. */
export const APPOINTMENT_OUTCOME = "Appointment";

/** Classify a raw outcome into the metric it contributes to (or null). */
export function outcomeToMetric(
  outcome: string | null | undefined,
): Extract<LeadMetricKey, "callbacks" | "appointments"> | null {
  if (!outcome) return null;
  if (outcome === APPOINTMENT_OUTCOME) return "appointments";
  if (CALLBACK_OUTCOMES.includes(outcome) || outcome.includes("Call Back"))
    return "callbacks";
  return null;
}

// ---------------------------------------------------------------------------
// Time controls
// ---------------------------------------------------------------------------

/** Preset bucket granularity for the trend (time-series) chart. */
export type Granularity = "daily" | "weekly" | "monthly" | "yearly";

export const GRANULARITIES: Array<{ key: Granularity; label: string }> = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly", label: "Yearly" },
];

/** Chart type — user-switchable per chart panel. */
export type ChartType = "bar" | "line";

export const CHART_TYPES: Array<{ key: ChartType; label: string }> = [
  { key: "bar", label: "Bar" },
  { key: "line", label: "Line" },
];

// ---------------------------------------------------------------------------
// Aggregate shapes (server -> client)
// ---------------------------------------------------------------------------

/** One point on the trend chart (a day / week / month / year bucket). */
export interface TimeBucket {
  /** Stable ISO-ish key, e.g. "2026-06-25", "2026-W26", "2026-06", "2026". */
  key: string;
  /** Human label, e.g. "25 Jun", "Jun 2026", "2026". */
  label: string;
  counts: Record<LeadMetricKey, number>;
  /** Total leads worked in this bucket (context, not a charted metric). */
  leads: number;
}

/** Per-agent (individual performer) rollup. */
export interface AgentStats {
  agent: string;
  counts: Record<LeadMetricKey, number>;
  leads: number;
}

/** A single lead row for the per-lead drill-down. */
export interface LeadStatRow {
  id: string;
  name: string;
  agent: string | null;
  region: string | null;
  date: string | null; // ISO date (YYYY-MM-DD) of submission, if known
  outcome: string | null;
  dials: number;
  appDate: string | null;
}

/** Overall summary indicators across the whole filtered window. */
export interface LeadStatsSummary {
  totalLeads: number;
  dials: number;
  callbacks: number;
  appointments: number;
  /** appointments / leads, 0..1. */
  conversionRate: number;
  /** appointments / dials, 0..1. */
  dialToAppointmentRate: number;
  /** dials / leads. */
  avgDialsPerLead: number;
}

export interface LeadStatsResponse {
  granularity: Granularity;
  /** Resolved window (inclusive), ISO dates. */
  from: string;
  to: string;
  region: string | null;
  summary: LeadStatsSummary;
  series: TimeBucket[];
  byAgent: AgentStats[];
  leads: LeadStatRow[];
  fetchedAt: string;
}
