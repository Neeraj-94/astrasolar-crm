import "server-only";
import { CONSULTANTS } from "@/lib/leads/mock/consultants";
import { ALL_LEADS, type SalesLead, type Disposition } from "@/lib/sales/mock";
import {
  SALES_METRICS,
  TIME_RANGES,
  type ConsultantStats,
  type OnlineStatus,
  type SalesMetricKey,
  type TeamStatusEntry,
  type TimeRange,
} from "@/lib/sales/statistics-shared";

/**
 * Statistics tab — server-only data fetchers.
 *
 * Two responsibilities:
 *   1. Team Status — who is online vs. offline right now.
 *   2. Sales Statistics — counts per consultant per metric, filtered by range.
 *
 * Both are read from mock sources today so the page renders meaningfully in
 * dev. In production:
 *   - Team Status should read from a per-user `lastSeenAt` heartbeat (e.g.
 *     a small middleware that bumps User.lastSeenAt on each authenticated
 *     request, and treats "<2 min since last beat" as Online). The shape
 *     returned below is what the UI consumes; only the source of truth
 *     changes.
 *   - Sales Statistics should aggregate against the Lead/Sale tables in
 *     Postgres, filtered by `lead.date` (or `sale.createdAt`) inside the
 *     chosen range.
 *
 * Re-exports the shared types/constants so existing call sites (API routes,
 * widgets) can still import from a single module path.
 */
export {
  SALES_METRICS,
  TIME_RANGES,
};
export type {
  ConsultantStats,
  OnlineStatus,
  SalesMetricKey,
  TeamStatusEntry,
  TimeRange,
};

// ---------------------------------------------------------------------------
// Team Status
// ---------------------------------------------------------------------------

/**
 * Deterministic "online/offline" mock — flips roughly every minute based on a
 * stable hash of the consultant id. Replace the body with a real
 * `lastSeenAt` lookup once the heartbeat lands.
 */
export async function getTeamStatus(): Promise<TeamStatusEntry[]> {
  const nowMin = Math.floor(Date.now() / 60_000);

  return CONSULTANTS.map((c) => {
    const seed = hash(c.id);
    // Online if (minute + seed) mod 3 != 0  → ~2/3 online at any moment.
    const online = (nowMin + seed) % 3 !== 0;
    const minutesSince = online ? seed % 2 : 5 + (seed % 25);
    const lastSeen = new Date(Date.now() - minutesSince * 60_000);

    const entry: TeamStatusEntry = {
      consultantId: c.id,
      name: c.name,
      email: c.email,
      region: c.region,
      status: online ? "online" : "offline",
      lastSeenAt: lastSeen.toISOString(),
    };
    return entry;
  }).sort((a, b) => {
    // Online first, then alphabetical.
    if (a.status !== b.status) return a.status === "online" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Sales Statistics
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

const DISPOSITION_TO_METRIC: Partial<Record<Disposition, SalesMetricKey>> = {
  sold:            "sales",
  presented:       "presentations",
  callback:        "callbacks",
  no_answer:       "no_answers",
  cancel:          "cancellations",
};

export async function getSalesStatistics(
  range: TimeRange,
): Promise<ConsultantStats[]> {
  const start = rangeStart(range);
  const startISO = start.toISOString().slice(0, 10);

  // Index by consultant so every consultant shows up even if they had zero
  // activity in the range — empty bars are signal too.
  const byConsultant = new Map<string, ConsultantStats>();
  for (const c of CONSULTANTS) {
    byConsultant.set(c.id, {
      consultantId: c.id,
      name: c.name,
      counts: {
        sales: 0,
        presentations: 0,
        callbacks: 0,
        no_answers: 0,
        cancellations: 0,
      },
    });
  }

  const inRange = (lead: SalesLead) => lead.date >= startISO;

  for (const lead of ALL_LEADS) {
    if (!inRange(lead)) continue;
    const metric = DISPOSITION_TO_METRIC[lead.disposition];
    if (!metric) continue;
    const row = byConsultant.get(lead.consultantId);
    if (!row) continue;
    row.counts[metric] += 1;
  }

  // For Weekly/Monthly/Yearly the underlying mock only has ~5 days of leads,
  // so we synthesize plausible additional activity per consultant. This keeps
  // the chart legible while remaining deterministic. Remove once the live
  // Lead/Sale tables are wired in.
  if (range !== "daily") {
    const multiplier =
      range === "weekly" ? 1 : range === "monthly" ? 3 : 14;
    for (const row of byConsultant.values()) {
      const seed = hash(row.consultantId);
      row.counts.sales         += ((seed % 4) + 1) * multiplier;
      row.counts.presentations += ((seed % 5) + 2) * multiplier;
      row.counts.callbacks     += ((seed % 6) + 1) * multiplier;
      row.counts.no_answers    += ((seed % 7))     * multiplier;
      row.counts.cancellations += ((seed % 3))     * multiplier;
    }
  }

  return Array.from(byConsultant.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

// ---------------------------------------------------------------------------
// Tiny string hash so the mock data is stable across requests.
// ---------------------------------------------------------------------------

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
