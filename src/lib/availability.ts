import "server-only";
import { prisma } from "@/lib/prisma";
import type { AvailabilityStatus } from "@prisma/client";

/**
 * Consultant availability — sparse-row model.
 *
 * Default assumption: every consultant is AVAILABLE for the 8 AM–8 PM working
 * day on every date, UNLESS an AvailabilitySlot row exists for that
 * (consultant, date, hour) tuple marking them UNAVAILABLE (or explicitly
 * AVAILABLE — we still store explicit rows so the UI can show "manager set
 * this slot" history and managers can override defaults later).
 *
 * Hour semantics: `hour` is the start of a 1-hour slot in local time. The
 * working day covers hours 8..19 inclusive (12 slots — 8–9, 9–10, …, 19–20).
 */

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
// Queries
// ---------------------------------------------------------------------------

export interface ConsultantSummary {
  id: string;
  displayName: string | null;
  email: string;
  region: string | null;
}

export async function listConsultants(): Promise<ConsultantSummary[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { some: { role: { key: "sales_consultant" } } },
    },
    select: {
      id: true,
      displayName: true,
      email: true,
      consultant: { select: { region: true } },
    },
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
  });

  return users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    region: u.consultant?.region ?? null,
  }));
}

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
  const rows = await prisma.availabilitySlot.findMany({
    where: {
      date: { gte: args.from, lte: args.to },
      ...(args.consultantIds && args.consultantIds.length > 0
        ? { consultantId: { in: args.consultantIds } }
        : {}),
    },
    select: {
      consultantId: true,
      date: true,
      hour: true,
      status: true,
      note: true,
    },
  });

  return rows.map((r) => ({
    consultantId: r.consultantId,
    date: toISODate(r.date),
    hour: r.hour,
    status: r.status,
    note: r.note,
  }));
}

export interface UpsertSlotInput {
  consultantId: string;
  date: string; // YYYY-MM-DD
  hour: number;
  status: AvailabilityStatus;
  note?: string | null;
}

/**
 * Upsert a batch of slot updates. Each input is keyed by
 * (consultantId, date, hour).
 */
export async function upsertSlots(
  inputs: UpsertSlotInput[],
  actorId: string,
): Promise<{ written: number }> {
  if (inputs.length === 0) return { written: 0 };

  for (const i of inputs) {
    if (!isWorkingHour(i.hour)) {
      throw new Error(
        `hour ${i.hour} is outside working hours (${FIRST_HOUR}..${LAST_HOUR})`,
      );
    }
  }

  // Use a transaction of upserts. Could be optimised later with createMany +
  // unique conflict handling, but the batch sizes here are tiny.
  await prisma.$transaction(
    inputs.map((i) =>
      prisma.availabilitySlot.upsert({
        where: {
          consultantId_date_hour: {
            consultantId: i.consultantId,
            date: fromISODate(i.date),
            hour: i.hour,
          },
        },
        update: {
          status: i.status,
          note: i.note ?? null,
          createdById: actorId,
        },
        create: {
          consultantId: i.consultantId,
          date: fromISODate(i.date),
          hour: i.hour,
          status: i.status,
          note: i.note ?? null,
          createdById: actorId,
        },
      }),
    ),
  );

  return { written: inputs.length };
}

export async function deleteSlot(args: {
  consultantId: string;
  date: string;
  hour: number;
}): Promise<void> {
  await prisma.availabilitySlot.deleteMany({
    where: {
      consultantId: args.consultantId,
      date: fromISODate(args.date),
      hour: args.hour,
    },
  });
}

// ---------------------------------------------------------------------------
// Booking-side check — used by Leads Schedule before allocating a slot.
// ---------------------------------------------------------------------------

export interface BookingCheck {
  ok: boolean;
  conflicts: Array<{ date: string; hour: number; reason: string }>;
}

/**
 * Returns whether a consultant can be booked for the time range
 * [startsAt, endsAt). Treats the range as a sequence of 1-hour slots aligned
 * to the start time's hour.
 *
 * Conflicts occur if any slot in the range is outside working hours or has an
 * UNAVAILABLE record.
 */
export async function canBookConsultant(args: {
  consultantId: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<BookingCheck> {
  const conflicts: BookingCheck["conflicts"] = [];

  // Build the list of (date, hour) tuples the booking would consume.
  const slots: Array<{ date: Date; hour: number }> = [];
  const cursor = new Date(args.startsAt);
  cursor.setMinutes(0, 0, 0); // align to top of hour
  while (cursor < args.endsAt) {
    slots.push({ date: cursor, hour: cursor.getHours() });
    cursor.setHours(cursor.getHours() + 1);
  }

  // Working hours check (cheap, runs first).
  for (const s of slots) {
    if (!isWorkingHour(s.hour)) {
      conflicts.push({
        date: toISODate(s.date),
        hour: s.hour,
        reason: "outside working hours (8–20)",
      });
    }
  }

  if (slots.length === 0) {
    return { ok: conflicts.length === 0, conflicts };
  }

  // Pull any UNAVAILABLE rows that overlap.
  const dates = Array.from(new Set(slots.map((s) => toISODate(s.date)))).map(
    fromISODate,
  );
  const hours = Array.from(new Set(slots.map((s) => s.hour)));
  const rows = await prisma.availabilitySlot.findMany({
    where: {
      consultantId: args.consultantId,
      date: { in: dates },
      hour: { in: hours },
      status: "UNAVAILABLE",
    },
    select: { date: true, hour: true, note: true },
  });

  const blockedSet = new Set(
    rows.map((r) => `${toISODate(r.date)}|${r.hour}`),
  );
  for (const s of slots) {
    const key = `${toISODate(s.date)}|${s.hour}`;
    if (blockedSet.has(key)) {
      conflicts.push({
        date: toISODate(s.date),
        hour: s.hour,
        reason: "consultant marked unavailable",
      });
    }
  }

  return { ok: conflicts.length === 0, conflicts };
}
