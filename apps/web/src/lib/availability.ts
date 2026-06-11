import "server-only";
import { prisma } from "@/lib/prisma";
import type { AvailabilityStatus } from "@prisma/client";

/**
 * Consultant availability — explicit-submission model.
 *
 * Each consultant submits their availability per week. The submission record
 * (AvailabilitySubmission) lives at the logical path:
 *   availability/consultants/[consultantId]/[weekStart]
 *
 * When a submission exists for a (consultant, week) tuple, the Leads Schedule
 * treats ONLY AvailabilitySlot rows with status=AVAILABLE within that week as
 * bookable. Days listed in submission.holidayDays are entirely unavailable.
 *
 * Backwards compatibility: when no submission exists for the week containing a
 * requested booking date, the booking guard falls back to the legacy sparse-row
 * default — i.e. AVAILABLE unless a row marks UNAVAILABLE/HOLIDAY.
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
// Week-level submissions
// ---------------------------------------------------------------------------

export interface WeekSubmissionSummary {
  consultantId: string;
  consultantName: string;
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
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
  const rows = await prisma.availabilitySubmission.findMany({
    where: {
      weekStart: args.weekStart,
      ...(args.consultantIds && args.consultantIds.length > 0
        ? { consultantId: { in: args.consultantIds } }
        : {}),
    },
  });
  return rows.map((r) => ({
    consultantId: r.consultantId,
    consultantName: r.consultantName,
    weekStart: toISODate(r.weekStart),
    weekEnd: toISODate(r.weekEnd),
    holidayDays: r.holidayDays,
    slotsCount: r.slotsCount,
    submitted: r.submitted,
    submittedAt: r.submittedAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    updatedById: r.updatedById,
    updatedByName: r.updatedByName,
  }));
}

export interface SaveWeekInput {
  consultantId: string;
  consultantName: string;
  weekStart: string; // YYYY-MM-DD
  /** Day-level state. Each entry corresponds to one of the 7 days in the week. */
  days: Array<{
    date: string; // YYYY-MM-DD
    /** Hours (8..19) the consultant is AVAILABLE. */
    availableHours: number[];
    /** When true the entire day is HOLIDAY — availableHours is ignored. */
    holiday: boolean;
  }>;
}

/**
 * Save (upsert) a full week of availability for one consultant.
 * Writes one AvailabilitySubmission row + replaces every AvailabilitySlot for
 * the week. Atomic via Prisma transaction.
 */
export async function saveWeekSubmission(
  input: SaveWeekInput,
  actor: { id: string; name: string },
): Promise<WeekSubmissionSummary> {
  const weekStart = fromISODate(input.weekStart);
  const weekEnd = addDays(weekStart, 6);

  // Validate every supplied date sits inside the week
  const allowedDates = new Set(
    weekDays(weekStart).map((d) => toISODate(d)),
  );
  for (const d of input.days) {
    if (!allowedDates.has(d.date)) {
      throw new Error(`date ${d.date} is outside the week starting ${input.weekStart}`);
    }
    for (const h of d.availableHours) {
      if (!isWorkingHour(h)) {
        throw new Error(`hour ${h} is outside working hours`);
      }
    }
  }

  const holidayDays = input.days.filter((d) => d.holiday).map((d) => d.date);
  const slotsCount = input.days.reduce(
    (acc, d) => acc + (d.holiday ? 0 : d.availableHours.length),
    0,
  );

  // Build the slot rows we want to keep for the week.
  // AVAILABLE rows for each ticked hour; HOLIDAY rows for each hour of a
  // holiday day; UNAVAILABLE rows for every other working hour so the booking
  // guard treats anything not explicitly AVAILABLE as blocked.
  const slotRows: Array<{
    consultantId: string;
    date: Date;
    hour: number;
    status: "AVAILABLE" | "UNAVAILABLE" | "HOLIDAY";
  }> = [];

  for (const day of input.days) {
    const date = fromISODate(day.date);
    if (day.holiday) {
      for (const h of HOURS) {
        slotRows.push({
          consultantId: input.consultantId,
          date,
          hour: h,
          status: "HOLIDAY",
        });
      }
      continue;
    }
    const available = new Set(day.availableHours);
    for (const h of HOURS) {
      slotRows.push({
        consultantId: input.consultantId,
        date,
        hour: h,
        status: available.has(h) ? "AVAILABLE" : "UNAVAILABLE",
      });
    }
  }

  const submission = await prisma.$transaction(async (tx) => {
    // Replace existing slot rows for the week
    await tx.availabilitySlot.deleteMany({
      where: {
        consultantId: input.consultantId,
        date: { gte: weekStart, lte: weekEnd },
      },
    });

    if (slotRows.length > 0) {
      await tx.availabilitySlot.createMany({
        data: slotRows.map((r) => ({
          consultantId: r.consultantId,
          date: r.date,
          hour: r.hour,
          status: r.status,
          createdById: actor.id,
        })),
      });
    }

    return tx.availabilitySubmission.upsert({
      where: {
        consultantId_weekStart: {
          consultantId: input.consultantId,
          weekStart,
        },
      },
      create: {
        consultantId: input.consultantId,
        consultantName: input.consultantName,
        weekStart,
        weekEnd,
        holidayDays,
        slotsCount,
        submitted: true,
        updatedById: actor.id,
        updatedByName: actor.name,
      },
      update: {
        consultantName: input.consultantName,
        weekEnd,
        holidayDays,
        slotsCount,
        submitted: true,
        updatedById: actor.id,
        updatedByName: actor.name,
      },
    });
  });

  return {
    consultantId: submission.consultantId,
    consultantName: submission.consultantName,
    weekStart: toISODate(submission.weekStart),
    weekEnd: toISODate(submission.weekEnd),
    holidayDays: submission.holidayDays,
    slotsCount: submission.slotsCount,
    submitted: submission.submitted,
    submittedAt: submission.submittedAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    updatedById: submission.updatedById,
    updatedByName: submission.updatedByName,
  };
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

  // Pull every slot row that overlaps (any non-AVAILABLE status blocks).
  const dates = Array.from(new Set(slots.map((s) => toISODate(s.date)))).map(
    fromISODate,
  );
  const hours = Array.from(new Set(slots.map((s) => s.hour)));
  const rows = await prisma.availabilitySlot.findMany({
    where: {
      consultantId: args.consultantId,
      date: { in: dates },
      hour: { in: hours },
    },
    select: { date: true, hour: true, status: true, note: true },
  });

  const statusByKey = new Map<string, AvailabilityStatus>();
  for (const r of rows) {
    statusByKey.set(`${toISODate(r.date)}|${r.hour}`, r.status);
  }

  // Find any submissions for weeks that overlap this booking — when one
  // exists, a missing row means UNAVAILABLE (explicit-submission semantics).
  const weekStarts = Array.from(
    new Set(dates.map((d) => toISODate(startOfWeek(d)))),
  ).map(fromISODate);
  const submissions = await prisma.availabilitySubmission.findMany({
    where: {
      consultantId: args.consultantId,
      weekStart: { in: weekStarts },
    },
    select: { weekStart: true, holidayDays: true },
  });
  const submittedWeeks = new Map<string, string[]>();
  for (const s of submissions) {
    submittedWeeks.set(toISODate(s.weekStart), s.holidayDays);
  }

  for (const s of slots) {
    const iso = toISODate(s.date);
    const key = `${iso}|${s.hour}`;
    const status = statusByKey.get(key);
    const wkIso = toISODate(startOfWeek(s.date));
    const weekHolidayDays = submittedWeeks.get(wkIso);

    if (status === "HOLIDAY" || weekHolidayDays?.includes(iso)) {
      conflicts.push({
        date: iso,
        hour: s.hour,
        reason: "consultant on holiday",
      });
      continue;
    }
    if (status === "UNAVAILABLE") {
      conflicts.push({
        date: iso,
        hour: s.hour,
        reason: "consultant marked unavailable",
      });
      continue;
    }
    if (submittedWeeks.has(wkIso) && status !== "AVAILABLE") {
      // Submission exists for the week but this slot isn't ticked.
      conflicts.push({
        date: iso,
        hour: s.hour,
        reason: "slot not in submitted availability",
      });
    }
  }

  return { ok: conflicts.length === 0, conflicts };
}
