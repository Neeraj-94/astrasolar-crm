/**
 * Import legacy Firebase consultant availability
 * (prisma/data/availability-import.json) into the CRM scheduling tables
 * (`AvailabilitySlot` + `AvailabilitySubmission`). Idempotent — each week is
 * REPLACED on import (delete the week's slots, recreate, upsert the
 * submission), so the script is safe to re-run and mirrors the app's own
 * `saveWeek` re-submission semantics.
 *
 * Source: `staff/<id>/availability` from the Firebase RTDB export, flattened to
 * `prisma/data/availability-import.json` by the extraction step. Each week is
 * already shaped as a `saveWeek()` payload:
 *   { weekStart, weekEnd, submittedBy, submittedAt, days: [{ date,
 *     availableHours: number[], holiday: boolean }] }
 *
 * Mapping decisions:
 *  - Consultants are resolved to existing User rows by their canonical
 *    `@astrasolar.com.au` email (same mapping import-leads.ts uses). An
 *    unresolved consultant is SKIPPED and reported (no placeholder users are
 *    created — availability for a non-existent user would be unbookable noise).
 *  - For each of the week's 7 days, every working hour (8..19) gets a slot row:
 *    AVAILABLE if the hour is in `availableHours`, else UNAVAILABLE. The source
 *    has no "holiday" concept, so `holidayDays` is always empty and no HOLIDAY
 *    rows are written.
 *  - Overwrite-on-import: the week's existing slots are deleted and the
 *    submission upserted (chosen behaviour — matches saveWeek).
 *  - Original `submittedAt` / `submittedBy` are preserved on the submission row
 *    (submittedAt set explicitly; submitter resolved to updatedById/Name).
 *
 * Flags:
 *   --dry-run            resolve + map everything, print the summary, write NOTHING.
 *   --consultant=KEY     only import one staffKey (e.g. --consultant=justin).
 *
 * Run: npm run db:import-availability --workspace=@astra/api
 *      npm run db:import-availability --workspace=@astra/api -- --dry-run
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient, type AvailabilityStatus } from '../src/db';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_CONSULTANT = (() => {
  const a = process.argv.find((x) => x.startsWith('--consultant='));
  return a ? a.split('=')[1].trim().toLowerCase() : null;
})();

// App working hours — start hour of each 1-hour slot (mirrors
// scheduling/availability.service.ts FIRST_HOUR..LAST_HOUR).
const FIRST_HOUR = 8;
const LAST_HOUR = 19;
const HOURS: number[] = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
);

// DATE columns round-trip as UTC midnights (see schema note + the service).
const isoToDbDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

// submittedBy tokens seen in the export -> canonical email (for attribution).
const SUBMITTER_EMAIL: Record<string, string> = {
  daniel: 'daniel.lulham@astrasolar.com.au',
  burhan: 'ben@astrasolar.com.au',
  ben: 'ben@astrasolar.com.au',
  ernest: 'ernest@astrasolar.com.au',
  justin: 'justin.parle@astrasolar.com.au',
  lachlan: 'lachlan@astrasolar.com.au',
  neeraj: 'neeraj@astrasolar.com.au',
  stephen: 'stephen@astrasolar.com.au',
  zane: 'zane@astrasolar.com.au',
};

// ---------------------------------------------------------------------------
// Source types (prisma/data/availability-import.json)
// ---------------------------------------------------------------------------
interface SrcDay {
  date: string; // YYYY-MM-DD
  availableHours: number[];
  holiday: boolean;
}
interface SrcWeek {
  weekStart: string; // Monday YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  submitted: boolean;
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: string | null; // ISO
  slotsCount: number;
  days: SrcDay[];
}
interface SrcConsultant {
  staffKey: string;
  email: string;
  name: string;
  weekCount: number;
  weeks: SrcWeek[];
}
interface SrcFile {
  _meta: unknown;
  consultants: SrcConsultant[];
}

async function main() {
  const dataPath = path.join(__dirname, 'data', 'availability-import.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`availability data not found at ${dataPath}`);
  }
  const src = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as SrcFile;

  // Resolve users (email -> { id, name }). No DB hit in dry-run.
  const byEmail = new Map<string, { id: string; name: string }>();
  if (!DRY_RUN) {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true },
    });
    for (const u of users) byEmail.set(u.email.toLowerCase(), u);
  }

  const resolveId = (email: string | null | undefined): string | null => {
    if (!email) return null;
    return byEmail.get(email.toLowerCase())?.id ?? null;
  };

  let consultantsDone = 0;
  let weeksWritten = 0;
  let slotsWritten = 0;
  const skippedConsultants: string[] = [];
  const perConsultant: string[] = [];

  for (const c of src.consultants) {
    if (ONLY_CONSULTANT && c.staffKey.toLowerCase() !== ONLY_CONSULTANT) continue;

    const consultantId = DRY_RUN ? `dryrun:${c.email}` : resolveId(c.email);
    if (!consultantId) {
      skippedConsultants.push(`${c.staffKey} <${c.email}> — no User row`);
      continue;
    }

    let cWeeks = 0;
    let cSlots = 0;

    for (const wk of c.weeks) {
      const weekStart = isoToDbDate(wk.weekStart);
      const weekEnd = isoToDbDate(wk.weekEnd);

      // Build slot rows for all 7 days × working hours.
      const slotRows: Array<{
        consultantId: string;
        date: Date;
        hour: number;
        status: AvailabilityStatus;
        createdById: string | null;
      }> = [];
      const submitterId = resolveId(
        wk.submittedBy ? SUBMITTER_EMAIL[wk.submittedBy.toLowerCase()] : null,
      );
      const createdById = submitterId ?? consultantId;

      let weekAvail = 0;
      for (const day of wk.days) {
        const date = isoToDbDate(day.date);
        const available = new Set(
          day.availableHours.filter((h) => h >= FIRST_HOUR && h <= LAST_HOUR),
        );
        for (const h of HOURS) {
          const isAvail = available.has(h);
          if (isAvail) weekAvail++;
          slotRows.push({
            consultantId,
            date,
            hour: h,
            status: isAvail ? 'AVAILABLE' : 'UNAVAILABLE',
            createdById,
          });
        }
      }

      cWeeks++;
      cSlots += weekAvail;

      if (DRY_RUN) continue;

      await prisma.$transaction(async (tx) => {
        await tx.availabilitySlot.deleteMany({
          where: {
            consultantId,
            date: { gte: weekStart, lte: weekEnd },
          },
        });
        if (slotRows.length > 0) {
          await tx.availabilitySlot.createMany({ data: slotRows });
        }
        await tx.availabilitySubmission.upsert({
          where: {
            consultantId_weekStart: { consultantId, weekStart },
          },
          create: {
            consultantId,
            consultantName: c.name,
            weekStart,
            weekEnd,
            holidayDays: [],
            slotsCount: weekAvail,
            submitted: wk.submitted !== false,
            ...(wk.submittedAt ? { submittedAt: new Date(wk.submittedAt) } : {}),
            updatedById: submitterId,
            updatedByName: wk.submittedByName ?? null,
          },
          update: {
            consultantName: c.name,
            weekEnd,
            holidayDays: [],
            slotsCount: weekAvail,
            submitted: wk.submitted !== false,
            ...(wk.submittedAt ? { submittedAt: new Date(wk.submittedAt) } : {}),
            updatedById: submitterId,
            updatedByName: wk.submittedByName ?? null,
          },
        });
      });
    }

    consultantsDone++;
    weeksWritten += cWeeks;
    slotsWritten += cSlots;
    perConsultant.push(
      `  ${c.staffKey.padEnd(8)} ${c.email.padEnd(32)} weeks=${cWeeks} availableSlots=${cSlots}`,
    );
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('==========================================================');
  console.log('Availability import summary');
  console.log('==========================================================');
  console.log(`consultants imported : ${consultantsDone}`);
  console.log(`week submissions     : ${weeksWritten}`);
  console.log(`available hour-slots : ${slotsWritten}`);
  console.log('');
  for (const l of perConsultant) console.log(l);
  if (skippedConsultants.length) {
    console.log('\n⚠ skipped consultants (no matching User row):');
    for (const s of skippedConsultants) console.log(`  ${s}`);
  }
  console.log('==========================================================');
  if (DRY_RUN) {
    console.log('\nDRY RUN — no rows were written. Re-run without --dry-run to apply.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (!DRY_RUN) await prisma.$disconnect();
  });
