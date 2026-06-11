/**
 * Statistics tab — shared types + runtime constants.
 *
 * This file is intentionally free of any server-only imports (no Prisma,
 * no mock data, no `server-only` marker) so both server code and client
 * components can import from it. The server-only data fetchers live in
 * `./statistics.ts`.
 */
import type { MockConsultant } from "@/lib/leads/mock/consultants";

// ---------------------------------------------------------------------------
// Team Status
// ---------------------------------------------------------------------------

export type OnlineStatus = "online" | "offline";

export interface TeamStatusEntry {
  consultantId: string;
  name: string;
  email: string;
  region: MockConsultant["region"];
  status: OnlineStatus;
  /** ISO timestamp of last activity. Null when the user has never logged in. */
  lastSeenAt: string | null;
}

// ---------------------------------------------------------------------------
// Sales Statistics
// ---------------------------------------------------------------------------

export type SalesMetricKey =
  | "sales"
  | "presentations"
  | "callbacks"
  | "no_answers"
  | "cancellations";

export const SALES_METRICS: Array<{
  key: SalesMetricKey;
  label: string;
  /** Tailwind color class used by the bar chart. */
  color: string;
}> = [
  { key: "sales",         label: "Sales made",     color: "bg-emerald-500" },
  { key: "presentations", label: "Presentations",  color: "bg-sky-500" },
  { key: "callbacks",     label: "Call backs",     color: "bg-violet-500" },
  { key: "no_answers",    label: "No answers",     color: "bg-amber-500" },
  { key: "cancellations", label: "Cancellations",  color: "bg-red-500" },
];

export interface ConsultantStats {
  consultantId: string;
  name: string;
  counts: Record<SalesMetricKey, number>;
}

export type TimeRange = "daily" | "weekly" | "monthly" | "yearly";

export const TIME_RANGES: Array<{ key: TimeRange; label: string }> = [
  { key: "daily",   label: "Daily" },
  { key: "weekly",  label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "yearly",  label: "Yearly" },
];
