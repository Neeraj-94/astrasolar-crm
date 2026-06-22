import "server-only";
import { cookies } from "next/headers";
import { apiGet, apiPost } from "@/lib/api/client";

/**
 * Consultant availability — explicit-submission model.
 *
 * STORAGE MOVED: availability now lives in the API database (NestJS
 * `SchedulingModule`, `/scheduling/*` endpoints). This module keeps the same
 * exported surface it had when it owned the tables, but every data function
 * is now a thin authenticated client over the API. Date helpers remain local
 * (pure functions used by both server and client code paths).
 *
 * Semantics (enforced API-side):
 *   - a submission for (consultant, week) makes ONLY explicit AVAILABLE rows
 *     bookable inside that week; holiday days block the whole day
 *   - without a submission, the sparse default applies (AVAILABLE unless a
 *     row marks UNAVAILABLE/HOLIDAY)
 */

export type AvailabilityStatus = "AVAILABLE" | "UNAVAILABLE" | "HOLIDAY";

export const FIRST_HOUR = 8;
export const LAST_HOUR = 19; // last *start* hour (slot is 19–20)
export const HOURS: number[] = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);

export function isWorkingHour(hour: number): boolean {
  return hour >= FIRST_HOUR && hour <= LAST_HOUR;
}

// ---------------------------------------------------------------------------
// Date helpers (no third-party date lib)
// ---------------------------------------------------------------------------

/** Start of the local-time week that contains `d`, with Monday as day 1. */
export function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0 = Sun
  const offset = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + offset);
  return out;
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** YYYY-MM-DD in local time. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  // Parse as local midnight to avoid TZ surprises.
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Returns 7 Date objects, Monday → Sunday, at local midnight. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// ---------------------------------------------------------------------------
// API client plumbing
// ---------------------------------------------------------------------------

function authed() {
  return { cookieHeader: cookies().toString() };
}

function idsParam(ids?: string[]): string {
  return ids && ids.length > 0
    ? `&consultantIds=${encodeURIComponent(ids.join(","))}`
    : "";
}

// ---------------------------------------------------------------------------
// Consultant directory
// ---------------------------------------------------------------------------

export interface ConsultantSummary {
  id: string;
  displayName: string | null;
  email: string;
  region: string | null;
}

/** Active sales consultants, from the API user directory. */
export async function listConsultants(): Promise<ConsultantSummary[]> {
  const users = await apiGet<
    { id: string; name: string; email: string; region: string | null }[]
  >("/users/consultants", authed());

  return users.map((u) => ({
    id: u.id,
    displayName: u.name || null,
    email: u.email,
    region: u.region ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export interface SlotRecord {
  consultantId: string;
  date: string; // YYYY-MM-DD
  hour: number;
  status: AvailabilityStatus;
  note: string | null;
}

export async function listSlots(args: {
  consultantIds?: string[];
  from: Date;
  to: Date; // inclusive
}): Promise<SlotRecord[]> {
  return apiGet<SlotRecord[]>(
    `/scheduling/availability?from=${toISODate(args.from)}&to=${toISODate(args.to)}${idsParam(args.consultantIds)}`,
    authed(),
  );
}

export interface UpsertSlotInput {
  consultantId: string;
  date: string; // YYYY-MM-DD
  hour: number;
  status: AvailabilityStatus;
  note?: string | null;
}

/** Upsert a batch of slot updates, keyed by (consultantId, date, hour). */
export async function upsertSlots(
  inputs: UpsertSlotInput[],
): Promise<{ written: number }> {
  if (inputs.length === 0) return { written: 0 };
  return apiPost<{ written: number }>(
    "/scheduling/availability",
    { updates: inputs },
    authed(),
  );
}

// ---------------------------------------------------------------------------
// Week-level submissions
// ---------------------------------------------------------------------------

export interface WeekSubmissionSummary {
  consultantId: string;
  consultantName: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string; // YYYY-MM-DD (Sunday)
  holidayDays: string[];
  slotsCount: number;
  submitted: boolean;
  submittedAt: string;
  updatedAt: string;
  updatedById: string | null;
  updatedByName: string | null;
}

export async function listSubmissions(args: {
  weekStart: Date;
  consultantIds?: string[];
}): Promise<WeekSubmissionSummary[]> {
  return apiGet<WeekSubmissionSummary[]>(
    `/scheduling/availability/submissions?weekStart=${toISODate(args.weekStart)}${idsParam(args.consultantIds)}`,
    authed(),
  );
}

export interface SaveWeekInput {
  consultantId: string;
  consultantName: string;
  weekStart: string; // Monday, YYYY-MM-DD
  days: Array<{
    date: string;
    availableHours: number[];
    holiday: boolean;
  }>;
}

/** Save (replace) a full week of availability for one consultant. */
export async function saveWeekSubmission(
  input: SaveWeekInput,
): Promise<WeekSubmissionSummary> {
  const res = await apiPost<{ submission: WeekSubmissionSummary }>(
    "/scheduling/availability/submit",
    input,
    authed(),
  );
  return res.submission;
}

// ---------------------------------------------------------------------------
// Booking-side check — used by Leads Schedule before allocating a slot.
// ---------------------------------------------------------------------------

export interface BookingCheck {
  ok: boolean;
  conflicts: Array<{ date: string; hour: number; reason: string }>;
}

export async function canBookConsultant(args: {
  consultantId: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<BookingCheck> {
  return apiPost<BookingCheck>(
    "/scheduling/availability/check",
    {
      consultantId: args.consultantId,
      startsAt: args.startsAt.toISOString(),
      endsAt: args.endsAt.toISOString(),
    },
    authed(),
  );
}
