/**
 * Backfill: create a Lead in the leads database for every Appointment that was
 * booked into the schedule without one (leadId IS NULL).
 *
 * Mirrors AppointmentsService.create(): for each orphan appointment it creates a
 * Lead from the appointment's contact snapshot, writes a LeadStateLog snapshot,
 * and links the appointment to the new lead — all in one transaction per row.
 *
 * Idempotent: appointments that already have a leadId are skipped, so it is safe
 * to run repeatedly.
 *
 *   npm run db:backfill-appointment-leads
 */
import { Company, LeadOutcome, LeadSource, LeadStage } from '@astra/shared';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const slotToTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${minute === 30 ? '30' : '00'}`;

const toLeadSource = (raw?: string | null): LeadSource => {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'brighte':
      return LeadSource.BRIGHTE;
    case 'referral':
      return LeadSource.REFERRAL;
    case 'website':
      return LeadSource.WEBSITE;
    case 'bloome':
    case 'bloom':
    case 'bloom astra':
    case 'bloom_astra':
      return LeadSource.BLOOM_ASTRA;
    default:
      return LeadSource.INBOUND;
  }
};

const toCompany = (raw?: string | null): Company =>
  (raw ?? '').trim().toLowerCase().startsWith('dc') ? Company.DC : Company.ASTRA;

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const orphans = await prisma.appointment.findMany({
    where: { leadId: null },
    orderBy: { createdAt: 'asc' },
  });

  console.log(
    `Found ${orphans.length} appointment(s) with no linked lead${
      dryRun ? ' (dry run — no writes)' : ''
    }.`,
  );
  if (orphans.length === 0) return;

  // Lead.leadGenId is required and must reference a real User. Prefer the
  // appointment's booker; fall back to a system user when that id is missing or
  // no longer exists.
  const users = await prisma.user.findMany({ select: { id: true } });
  const validUserIds = new Set(users.map((u) => u.id));

  const fallbackUser =
    (await prisma.user.findFirst({
      where: { roles: { some: { role: { name: 'Super Admin' } } } },
      select: { id: true },
    })) ??
    (await prisma.user.findFirst({
      where: { isActive: true },
      select: { id: true },
    }));

  if (!fallbackUser) {
    throw new Error(
      'No users exist to attribute backfilled leads to. Seed users first.',
    );
  }

  const resolveOwner = (bookedByUserId: string | null) =>
    bookedByUserId && validUserIds.has(bookedByUserId)
      ? bookedByUserId
      : fallbackUser.id;

  let created = 0;
  let skipped = 0;

  for (const appt of orphans) {
    const ownerId = resolveOwner(appt.bookedByUserId);
    const firstName =
      (appt.firstName ?? '').trim() ||
      (appt.customerName ?? '').trim().split(/\s+/)[0] ||
      '—';
    const lastName =
      (appt.lastName ?? '').trim() ||
      (appt.customerName ?? '').trim().split(/\s+/).slice(1).join(' ') ||
      '—';

    if (dryRun) {
      console.log(
        `  would create lead for appointment ${appt.id} (${firstName} ${lastName}, ${appt.date
          .toISOString()
          .slice(0, 10)} ${slotToTime(appt.hour, appt.minute)})`,
      );
      created += 1;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            firstName,
            surName: lastName,
            phone: appt.phone ?? null,
            email: appt.email ?? null,
            address: appt.address ?? null,
            postCode: appt.postcode ?? null,
            state: appt.state ?? null,
            billSpend: appt.bills ?? null,
            source: toLeadSource(appt.source),
            company: toCompany(appt.company),
            leadGenId: ownerId,
            consultantId: appt.consultantId,
            stage: LeadStage.BOOKED,
            outcome: LeadOutcome.APPOINTMENT,
            bookingDate: appt.date,
            bookingTime: slotToTime(appt.hour, appt.minute),
            leadGenNotes: appt.notes ?? null,
            // Preserve the original booking time so history reflects reality.
            timestamp: appt.createdAt,
          },
        });

        await tx.leadStateLog.create({
          data: {
            leadId: lead.id,
            stage: lead.stage,
            leadGenId: lead.leadGenId,
            consultantId: lead.consultantId,
            outcome: lead.outcome,
            disposition: lead.disposition,
            changedBy: ownerId,
          },
        });

        await tx.appointment.update({
          where: { id: appt.id },
          data: { leadId: lead.id },
        });
      });
      created += 1;
    } catch (err) {
      skipped += 1;
      console.error(`  ! failed appointment ${appt.id}:`, (err as Error).message);
    }
  }

  console.log(
    dryRun
      ? `Dry run complete. ${created} lead(s) would be created.`
      : `Done. Created ${created} lead(s); ${skipped} failed/skipped.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
