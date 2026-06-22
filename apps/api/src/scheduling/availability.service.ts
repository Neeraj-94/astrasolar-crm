import { ForbiddenException, Injectable } from '@nestjs/common';
import { PERMISSIONS } from '@astra/shared';
import type { AvailabilityStatus } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth-user';

export const FIRST_HOUR = 8;
export const LAST_HOUR = 19; // last *start* hour (slot is 19–20)
export const HOURS: number[] = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);

const isWorkingHour = (h: number) => h >= FIRST_HOUR && h <= LAST_HOUR;

// ---- DB date boundary (DATE columns round-trip as UTC midnights) -----------

const isoToDbDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dbDateToISO = (d: Date) => d.toISOString().slice(0, 10);
const addDaysUTC = (d: Date, n: number) => {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
};
/** UTC Monday of the week containing the UTC-midnight date `d`. */
const weekStartUTC = (d: Date) => {
  const dow = d.getUTCDay(); // 0 = Sun
  return addDaysUTC(d, dow === 0 ? -6 : 1 - dow);
};

// ---- payload shapes (mirror the legacy web lib) -----------------------------

export interface SlotRecord {
  consultantId: string;
  date: string; // YYYY-MM-DD
  hour: number;
  status: AvailabilityStatus;
  note: string | null;
}

export interface WeekSubmissionSummary {
  consultantId: string;
  consultantName: string;
  weekStart: string;
  weekEnd: string;
  holidayDays: string[];
  slotsCount: number;
  submitted: boolean;
  submittedAt: string;
  updatedAt: string;
  updatedById: string | null;
  updatedByName: string | null;
}

export interface SaveWeekInput {
  consultantId: string;
  consultantName: string;
  weekStart: string; // Monday, YYYY-MM-DD
  days: Array<{ date: string; availableHours: number[]; holiday: boolean }>;
}

/**
 * Consultant availability — strict explicit-submission model:
 *
 *   - a slot is bookable ONLY when the consultant has submitted availability
 *     for that week AND the hour is explicitly AVAILABLE (holiday days and
 *     UNAVAILABLE hours block booking)
 *   - without a submission for the week, NOTHING is bookable — no leads can
 *     be entered into the Leads Schedule grid or the Bloome booking modal
 *     until availability is submitted
 */
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Consultants may edit their own week; editing others needs team write. */
  private assertCanEdit(user: AuthUser, consultantId: string) {
    if (user.id === consultantId) return;
    const perms = new Set(user.permissions);
    if (
      perms.has(PERMISSIONS.LEADS_WRITE_TEAM) ||
      perms.has(PERMISSIONS.SYSTEM_ADMIN)
    ) {
      return;
    }
    throw new ForbiddenException(
      "You can only edit your own availability (leads:write:team required for others').",
    );
  }

  async listSlots(args: {
    from: string;
    to: string;
    consultantIds?: string[];
  }): Promise<SlotRecord[]> {
    const rows = await this.prisma.availabilitySlot.findMany({
      where: {
        date: { gte: isoToDbDate(args.from), lte: isoToDbDate(args.to) },
        ...(args.consultantIds?.length
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
      date: dbDateToISO(r.date),
      hour: r.hour,
      status: r.status,
      note: r.note,
    }));
  }

  async upsertSlots(
    user: AuthUser,
    inputs: Array<{
      consultantId: string;
      date: string;
      hour: number;
      status: AvailabilityStatus;
      note?: string | null;
    }>,
  ): Promise<{ written: number }> {
    if (inputs.length === 0) return { written: 0 };
    for (const i of inputs) {
      this.assertCanEdit(user, i.consultantId);
      if (!isWorkingHour(i.hour)) {
        throw new Error(
          `hour ${i.hour} is outside working hours (${FIRST_HOUR}..${LAST_HOUR})`,
        );
      }
    }
    await this.prisma.$transaction(
      inputs.map((i) =>
        this.prisma.availabilitySlot.upsert({
          where: {
            consultantId_date_hour: {
              consultantId: i.consultantId,
              date: isoToDbDate(i.date),
              hour: i.hour,
            },
          },
          update: { status: i.status, note: i.note ?? null, createdById: user.id },
          create: {
            consultantId: i.consultantId,
            date: isoToDbDate(i.date),
            hour: i.hour,
            status: i.status,
            note: i.note ?? null,
            createdById: user.id,
          },
        }),
      ),
    );
    await this.audit.record({
      userId: user.id,
      action: 'AVAILABILITY_SLOTS_UPSERTED',
      entity: 'AvailabilitySlot',
      entityId: inputs[0].consultantId,
      metadata: { count: inputs.length },
    });
    return { written: inputs.length };
  }

  async listSubmissions(args: {
    weekStart: string;
    consultantIds?: string[];
  }): Promise<WeekSubmissionSummary[]> {
    const rows = await this.prisma.availabilitySubmission.findMany({
      where: {
        weekStart: isoToDbDate(args.weekStart),
        ...(args.consultantIds?.length
          ? { consultantId: { in: args.consultantIds } }
          : {}),
      },
    });
    return rows.map((r) => this.toSummary(r));
  }

  private toSummary(r: {
    consultantId: string;
    consultantName: string;
    weekStart: Date;
    weekEnd: Date;
    holidayDays: string[];
    slotsCount: number;
    submitted: boolean;
    submittedAt: Date;
    updatedAt: Date;
    updatedById: string | null;
    updatedByName: string | null;
  }): WeekSubmissionSummary {
    return {
      consultantId: r.consultantId,
      consultantName: r.consultantName,
      weekStart: dbDateToISO(r.weekStart),
      weekEnd: dbDateToISO(r.weekEnd),
      holidayDays: r.holidayDays,
      slotsCount: r.slotsCount,
      submitted: r.submitted,
      submittedAt: r.submittedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      updatedById: r.updatedById,
      updatedByName: r.updatedByName,
    };
  }

  /** Save a full week (submission row + replace the week's slot rows). */
  async saveWeek(
    user: AuthUser,
    input: SaveWeekInput,
  ): Promise<WeekSubmissionSummary> {
    this.assertCanEdit(user, input.consultantId);

    const weekStart = isoToDbDate(input.weekStart);
    const weekEnd = addDaysUTC(weekStart, 6);
    const allowedDates = new Set(
      Array.from({ length: 7 }, (_, i) => dbDateToISO(addDaysUTC(weekStart, i))),
    );
    for (const d of input.days) {
      if (!allowedDates.has(d.date)) {
        throw new Error(
          `date ${d.date} is outside the week starting ${input.weekStart}`,
        );
      }
      for (const h of d.availableHours) {
        if (!isWorkingHour(h)) throw new Error(`hour ${h} is outside working hours`);
      }
    }

    const holidayDays = input.days.filter((d) => d.holiday).map((d) => d.date);
    const slotsCount = input.days.reduce(
      (acc, d) => acc + (d.holiday ? 0 : d.availableHours.length),
      0,
    );

    const slotRows: Array<{
      consultantId: string;
      date: Date;
      hour: number;
      status: AvailabilityStatus;
    }> = [];
    for (const day of input.days) {
      const date = isoToDbDate(day.date);
      if (day.holiday) {
        for (const h of HOURS) {
          slotRows.push({ consultantId: input.consultantId, date, hour: h, status: 'HOLIDAY' });
        }
        continue;
      }
      const available = new Set(day.availableHours);
      for (const h of HOURS) {
        slotRows.push({
          consultantId: input.consultantId,
          date,
          hour: h,
          status: available.has(h) ? 'AVAILABLE' : 'UNAVAILABLE',
        });
      }
    }

    const submission = await this.prisma.$transaction(async (tx) => {
      await tx.availabilitySlot.deleteMany({
        where: {
          consultantId: input.consultantId,
          date: { gte: weekStart, lte: weekEnd },
        },
      });
      if (slotRows.length > 0) {
        await tx.availabilitySlot.createMany({
          data: slotRows.map((r) => ({ ...r, createdById: user.id })),
        });
      }
      const sub = await tx.availabilitySubmission.upsert({
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
          updatedById: user.id,
          updatedByName: user.name,
        },
        update: {
          consultantName: input.consultantName,
          weekEnd,
          holidayDays,
          slotsCount,
          submitted: true,
          updatedById: user.id,
          updatedByName: user.name,
        },
      });
      await this.audit.record(
        {
          userId: user.id,
          action: 'AVAILABILITY_WEEK_SUBMITTED',
          entity: 'AvailabilitySubmission',
          entityId: sub.id,
          metadata: {
            consultantId: input.consultantId,
            weekStart: input.weekStart,
            slotsCount,
            holidayDays,
          },
        },
        tx,
      );
      return sub;
    });

    return this.toSummary(submission);
  }

  /**
   * Open (bookable) HOURLY slots per consultant across a date range.
   *
   * A slot is open when the consultant has submitted availability for the
   * week, the hour is explicitly AVAILABLE (no holiday / not UNAVAILABLE),
   * and no appointment already occupies that hour. One slot is emitted per
   * open hour (minute 0) — the Bloome "Book Appointment" picker books on an
   * hourly basis. Without a week submission, no slots are returned.
   */
  async listOpenSlots(args: {
    from: string;
    to: string; // inclusive, YYYY-MM-DD
    consultantIds: string[];
  }): Promise<
    Array<{ consultantId: string; date: string; hour: number; minute: number }>
  > {
    if (args.consultantIds.length === 0) return [];

    const fromDate = isoToDbDate(args.from);
    const toDate = isoToDbDate(args.to);

    // Enumerate the calendar dates in range (inclusive), capped defensively.
    const dates: string[] = [];
    for (
      let d = new Date(fromDate);
      d <= toDate && dates.length < 62;
      d = addDaysUTC(d, 1)
    ) {
      dates.push(dbDateToISO(d));
    }
    if (dates.length === 0) return [];

    const [slotRows, appointments] = await Promise.all([
      this.prisma.availabilitySlot.findMany({
        where: {
          consultantId: { in: args.consultantIds },
          date: { gte: fromDate, lte: toDate },
        },
        select: { consultantId: true, date: true, hour: true, status: true },
      }),
      this.prisma.appointment.findMany({
        where: {
          consultantId: { in: args.consultantIds },
          date: { gte: fromDate, lte: toDate },
        },
        select: { consultantId: true, date: true, hour: true, minute: true },
      }),
    ]);

    const weekStarts = Array.from(
      new Set(dates.map((iso) => dbDateToISO(weekStartUTC(isoToDbDate(iso))))),
    ).map(isoToDbDate);
    const submissions = await this.prisma.availabilitySubmission.findMany({
      where: {
        consultantId: { in: args.consultantIds },
        weekStart: { in: weekStarts },
      },
      select: { consultantId: true, weekStart: true, holidayDays: true },
    });

    const statusByKey = new Map<string, AvailabilityStatus>();
    for (const r of slotRows) {
      statusByKey.set(`${r.consultantId}|${dbDateToISO(r.date)}|${r.hour}`, r.status);
    }
    const submittedWeeks = new Map<string, string[]>();
    for (const s of submissions) {
      submittedWeeks.set(`${s.consultantId}|${dbDateToISO(s.weekStart)}`, s.holidayDays);
    }
    // Hour-granular: an hour is occupied if any appointment lands in it,
    // regardless of minute (slots are booked on an hourly basis).
    const booked = new Set(
      appointments.map(
        (a) => `${a.consultantId}|${dbDateToISO(a.date)}|${a.hour}`,
      ),
    );

    const open: Array<{
      consultantId: string;
      date: string;
      hour: number;
      minute: number;
    }> = [];

    for (const consultantId of args.consultantIds) {
      for (const iso of dates) {
        const wkIso = dbDateToISO(weekStartUTC(isoToDbDate(iso)));
        const weekKey = `${consultantId}|${wkIso}`;
        const hasSubmission = submittedWeeks.has(weekKey);
        // No submission for this week → nothing bookable for the whole day.
        if (!hasSubmission) continue;
        const holidayDays = submittedWeeks.get(weekKey);

        for (const hour of HOURS) {
          const status = statusByKey.get(`${consultantId}|${iso}|${hour}`);
          if (status === 'HOLIDAY' || holidayDays?.includes(iso)) continue;
          // Submitted week → only explicitly AVAILABLE hours are bookable.
          if (status !== 'AVAILABLE') continue;
          // Hourly: one slot per open hour, skipped if the hour is taken.
          if (booked.has(`${consultantId}|${iso}|${hour}`)) continue;
          open.push({ consultantId, date: iso, hour, minute: 0 });
        }
      }
    }

    return open;
  }

  /** Booking guard for the Leads Schedule (port of canBookConsultant). */
  async canBook(args: {
    consultantId: string;
    startsAt: Date;
    endsAt: Date;
  }): Promise<{ ok: boolean; conflicts: Array<{ date: string; hour: number; reason: string }> }> {
    const conflicts: Array<{ date: string; hour: number; reason: string }> = [];

    // The booking range arrives as instants; bucket it into local-date hours
    // using the AU east-coast calendar the schedule operates in.
    const slots: Array<{ iso: string; hour: number }> = [];
    const cursor = new Date(args.startsAt);
    cursor.setMinutes(0, 0, 0);
    while (cursor < args.endsAt) {
      const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      slots.push({ iso, hour: cursor.getHours() });
      cursor.setHours(cursor.getHours() + 1);
    }

    for (const s of slots) {
      if (!isWorkingHour(s.hour)) {
        conflicts.push({ date: s.iso, hour: s.hour, reason: 'outside working hours (8–20)' });
      }
    }
    if (slots.length === 0) return { ok: conflicts.length === 0, conflicts };

    const dates = Array.from(new Set(slots.map((s) => s.iso))).map(isoToDbDate);
    const hours = Array.from(new Set(slots.map((s) => s.hour)));

    const rows = await this.prisma.availabilitySlot.findMany({
      where: { consultantId: args.consultantId, date: { in: dates }, hour: { in: hours } },
      select: { date: true, hour: true, status: true },
    });
    const statusByKey = new Map<string, AvailabilityStatus>();
    for (const r of rows) statusByKey.set(`${dbDateToISO(r.date)}|${r.hour}`, r.status);

    const weekStarts = Array.from(
      new Set(dates.map((d) => dbDateToISO(weekStartUTC(d)))),
    ).map(isoToDbDate);
    const submissions = await this.prisma.availabilitySubmission.findMany({
      where: { consultantId: args.consultantId, weekStart: { in: weekStarts } },
      select: { weekStart: true, holidayDays: true },
    });
    const submittedWeeks = new Map<string, string[]>();
    for (const s of submissions) submittedWeeks.set(dbDateToISO(s.weekStart), s.holidayDays);

    for (const s of slots) {
      const key = `${s.iso}|${s.hour}`;
      const status = statusByKey.get(key);
      const wkIso = dbDateToISO(weekStartUTC(isoToDbDate(s.iso)));
      const weekHolidayDays = submittedWeeks.get(wkIso);

      if (status === 'HOLIDAY' || weekHolidayDays?.includes(s.iso)) {
        conflicts.push({ date: s.iso, hour: s.hour, reason: 'consultant on holiday' });
        continue;
      }
      if (status === 'UNAVAILABLE') {
        conflicts.push({ date: s.iso, hour: s.hour, reason: 'consultant marked unavailable' });
        continue;
      }
      // Strict model: no submission for the week → not bookable at all.
      if (!submittedWeeks.has(wkIso)) {
        conflicts.push({
          date: s.iso,
          hour: s.hour,
          reason: 'consultant has not submitted availability for this week',
        });
        continue;
      }
      if (status !== 'AVAILABLE') {
        conflicts.push({
          date: s.iso,
          hour: s.hour,
          reason: 'not in the consultant’s submitted availability',
        });
      }
    }

    return { ok: conflicts.length === 0, conflicts };
  }

  /**
   * Single-cell booking guard for the Leads Schedule inline entry. Returns
   * true only when the consultant has submitted availability for that week
   * and the hour is explicitly AVAILABLE (not holiday / not UNAVAILABLE).
   * Mirrors the client's isSlotAvailable so grid and server agree.
   */
  async isHourBookable(
    consultantId: string,
    dateIso: string,
    hour: number,
  ): Promise<boolean> {
    if (!isWorkingHour(hour)) return false;
    const date = isoToDbDate(dateIso);
    const weekStart = weekStartUTC(date);
    const [slot, submission] = await Promise.all([
      this.prisma.availabilitySlot.findUnique({
        where: { consultantId_date_hour: { consultantId, date, hour } },
        select: { status: true },
      }),
      this.prisma.availabilitySubmission.findUnique({
        where: { consultantId_weekStart: { consultantId, weekStart } },
        select: { holidayDays: true },
      }),
    ]);
    if (!submission) return false; // no submission → nothing bookable
    if (submission.holidayDays.includes(dateIso)) return false;
    return slot?.status === 'AVAILABLE';
  }
}
