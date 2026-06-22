/**
 * Place booked leads into the Leads Schedule grid.
 *
 * For every Lead that carries a booking (bookingDate + bookingTime + a resolved
 * consultantId) but has no Appointment yet, this creates the matching
 * Appointment row in the consultant's timeslot — the reverse of
 * backfill-appointment-leads.ts (which creates Leads from orphan Appointments).
 *
 * Idempotent: a lead that already has a linked Appointment is skipped, so the
 * script is safe to re-run after new leads are imported.
 *
 * Mapping (mirrors AppointmentsService.create's appointment row):
 *  - timeslot: bookingTime is parsed from the legacy free-text formats
 *    ("17:00", "5:00 pm", "11:00 am", "12.00 pm", "1:00:00 pm", "5:30 pm") to a
 *    grid hour (8..19) + minute (0 or 30). Times outside 8..19 or that can't be
 *    parsed (e.g. "ANYTIME", "after 5") are SKIPPED and reported — the grid
 *    only renders 8..19 and an Appointment needs a concrete hour.
 *  - contact snapshot: copied from the lead (firstName, surName, phone, email,
 *    address, postcode, state, billSpend) so the grid renders standalone.
 *  - bookedBy: the lead's leadGen (id + name).
 *  - disposition: Lead.disposition (enum) -> the grid's lowercase vocabulary.
 *    Vacating dispositions (cancel/dnq/not_interested/reschedule) are flagged
 *    isAdditional so they surface in "Additional Leads" rather than holding a
 *    live slot — same rule the UI applies on disposition change.
 *  - slot collisions: if a LIVE slot (consultant/date/hour/minute) is already
 *    occupied, the new row is placed as isAdditional (overflow) and reported,
 *    so an existing booking is never clobbered.
 *
 * Availability is intentionally NOT gated here (historical bulk placement —
 * like an admin force-book); the strict isHourBookable gate only applies to
 * interactive grid entry.
 *
 * Flags:
 *   --dry-run            map everything, print the summary, write NOTHING.
 *   --limit=N            only process the first N qualifying leads (debugging).
 *
 * Run: npm run db:import-lead-appointments --workspace=@astra/api
 *      npm run db:import-lead-appointments --workspace=@astra/api -- --dry-run
 */
import {
  PrismaClient,
  Company,
  LeadSource,
  SalesDisposition,
} from '../src/db';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const FIRST_HOUR = 8;
const LAST_HOUR = 19;

// ---------------------------------------------------------------------------
// bookingTime parser — legacy free-text -> { hour 0..23, minute 0|30 } | null
// ---------------------------------------------------------------------------
function parseBookingTime(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim().toLowerCase().replace('.', ':'); // "12.00 pm" -> "12:00 pm"
  // "5:00 pm" | "5:00:00 pm" | "17:00" | "19:30:00-20:00" (take the first time)
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/);
  let hour: number;
  let minute: number;
  let ap: string | undefined;
  if (m) {
    hour = parseInt(m[1], 10);
    minute = parseInt(m[2], 10);
    ap = m[3];
  } else {
    // "5 pm" / "11am"
    m = s.match(/^(\d{1,2})\s*(am|pm)$/);
    if (!m) return null;
    hour = parseInt(m[1], 10);
    minute = 0;
    ap = m[2];
  }
  if (ap === 'pm' && hour !== 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  const snappedMinute = minute >= 30 ? 30 : 0;
  return { hour, minute: snappedMinute };
}

// Lead.disposition (enum) -> Leads Schedule grid disposition string.
const DISPOSITION_TO_GRID: Record<SalesDisposition, string> = {
  [SalesDisposition.SOLD]: 'sold',
  [SalesDisposition.PRES_PROP_CREATED]: 'pres',
  [SalesDisposition.CALL_BACK]: 'callback',
  [SalesDisposition.RESCHEDULE]: 'reschedule',
  [SalesDisposition.BEEN_RESCHEDULED]: 'been_rescheduled',
  [SalesDisposition.NO_ANSWER]: 'no_answer',
  [SalesDisposition.NOT_INTERESTED]: 'not_interested',
  [SalesDisposition.DNQ]: 'dnq',
  [SalesDisposition.CANCELLED]: 'cancel',
};
const VACATING = new Set(['cancel', 'dnq', 'not_interested', 'reschedule']);

// Enum -> friendly label for the grid's free-text source/company columns.
const SOURCE_LABEL: Record<LeadSource, string> = {
  [LeadSource.BLOOM_ASTRA]: 'Bloome',
  [LeadSource.REFERRAL]: 'Referral',
  [LeadSource.INBOUND]: 'Inbound',
  [LeadSource.WEBSITE]: 'Website',
  [LeadSource.BRIGHTE]: 'Brighte',
};
const COMPANY_LABEL: Record<Company, string> = {
  [Company.ASTRA]: 'Astra',
  [Company.DC]: 'DC ELEC',
};

const dbDateToISO = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  // Qualifying leads: booking present, consultant resolved, no appointment yet.
  const leads = await prisma.lead.findMany({
    where: {
      bookingDate: { not: null },
      bookingTime: { not: null },
      consultantId: { not: null },
      scheduleAppointments: { none: {} }, // idempotent
    },
    select: {
      id: true,
      firstName: true,
      surName: true,
      phone: true,
      email: true,
      address: true,
      postCode: true,
      state: true,
      billSpend: true,
      source: true,
      company: true,
      disposition: true,
      consultantId: true,
      bookingDate: true,
      bookingTime: true,
      leadGenId: true,
      consultantNotes: true,
      leadGenNotes: true,
      leadGen: { select: { id: true, name: true } },
    },
    orderBy: { bookingDate: 'asc' },
  });

  console.log(
    `Found ${leads.length} booked lead(s) without an appointment${
      DRY_RUN ? ' (dry run — no writes)' : ''
    }.`,
  );

  // Pre-load occupied LIVE slots so we never clobber an existing booking.
  const occupied = new Set<string>();
  if (!DRY_RUN) {
    const existing = await prisma.appointment.findMany({
      where: { isAdditional: false },
      select: { consultantId: true, date: true, hour: true, minute: true },
    });
    for (const a of existing) {
      occupied.add(`${a.consultantId}|${dbDateToISO(a.date)}|${a.hour}|${a.minute}`);
    }
  }

  let placed = 0;
  let placedLive = 0;
  let placedAdditional = 0;
  let skippedUnparsable = 0;
  let skippedOutOfRange = 0;
  let failed = 0;
  const unparsableSamples: string[] = [];
  const oorSamples: string[] = [];

  let processed = 0;
  for (const lead of leads) {
    if (processed >= LIMIT) break;
    processed += 1;

    const parsed = parseBookingTime(lead.bookingTime!);
    if (!parsed) {
      skippedUnparsable += 1;
      if (unparsableSamples.length < 15) {
        unparsableSamples.push(`"${lead.bookingTime}" (${lead.firstName} ${lead.surName})`);
      }
      continue;
    }
    const { hour, minute } = parsed;
    if (hour < FIRST_HOUR || hour > LAST_HOUR) {
      skippedOutOfRange += 1;
      if (oorSamples.length < 15) {
        oorSamples.push(`"${lead.bookingTime}" -> ${hour}:${minute}`);
      }
      continue;
    }

    const consultantId = lead.consultantId!;
    const dateISO = dbDateToISO(lead.bookingDate!);
    const gridDisposition = lead.disposition
      ? DISPOSITION_TO_GRID[lead.disposition]
      : null;

    // Vacating dispositions, or a slot already taken by a live booking, go to
    // "Additional Leads" instead of holding a live timeslot.
    const slotKey = `${consultantId}|${dateISO}|${hour}|${minute}`;
    const vacating = gridDisposition ? VACATING.has(gridDisposition) : false;
    const slotTaken = occupied.has(slotKey);
    const isAdditional = vacating || slotTaken;

    const customerName =
      [lead.firstName, lead.surName].filter((p) => p && p !== '—').join(' ').trim() ||
      null;

    if (DRY_RUN) {
      placed += 1;
      isAdditional ? (placedAdditional += 1) : (placedLive += 1);
      continue;
    }

    try {
      await prisma.appointment.create({
        data: {
          leadId: lead.id,
          consultantId,
          date: lead.bookingDate!,
          hour,
          minute,
          durationMinutes: 60,
          disposition: gridDisposition,
          bookedByUserId: lead.leadGenId,
          bookedByName: lead.leadGen?.name ?? null,
          source: SOURCE_LABEL[lead.source],
          company: COMPANY_LABEL[lead.company],
          bills: lead.billSpend,
          notes: lead.consultantNotes ?? lead.leadGenNotes ?? null,
          customerName,
          firstName: lead.firstName,
          lastName: lead.surName,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
          state: lead.state,
          postcode: lead.postCode,
          isAdditional,
        },
      });
      if (!isAdditional) occupied.add(slotKey);
      placed += 1;
      isAdditional ? (placedAdditional += 1) : (placedLive += 1);
    } catch (err) {
      failed += 1;
      console.error(`  ! failed lead ${lead.id}:`, (err as Error).message);
    }
  }

  // -------------------------------------------------------------------------
  console.log('==========================================================');
  console.log('Lead → appointment placement summary');
  console.log('==========================================================');
  console.log(`appointments ${DRY_RUN ? 'to place' : 'placed'}   : ${placed}`);
  console.log(`  live (in timeslot)        : ${placedLive}`);
  console.log(`  additional (overflow/vac) : ${placedAdditional}`);
  console.log(`skipped — time out of 8–19  : ${skippedOutOfRange}`);
  console.log(`skipped — unparsable time   : ${skippedUnparsable}`);
  if (!DRY_RUN) console.log(`failed                      : ${failed}`);
  if (oorSamples.length) {
    console.log('\n  out-of-range samples:');
    for (const s of oorSamples) console.log(`    ${s}`);
  }
  if (unparsableSamples.length) {
    console.log('\n  unparsable samples:');
    for (const s of unparsableSamples) console.log(`    ${s}`);
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
