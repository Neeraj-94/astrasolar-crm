import "server-only";
import { prisma } from "@/lib/prisma";
import { fromISODate, toISODate } from "@/lib/availability";
import type { ScheduleAppointment } from "./schedule-types";

/**
 * Lead appointment queries — the source of truth for the Leads Schedule view.
 *
 * Pure types and slot/disposition constants live in `./schedule-types` so the
 * client component can import them without pulling in `server-only` / Prisma.
 */

export async function listAppointments(args: {
  from: Date;
  to: Date; // inclusive
  consultantIds?: string[];
}): Promise<ScheduleAppointment[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      date: { gte: args.from, lte: args.to },
      ...(args.consultantIds && args.consultantIds.length > 0
        ? { consultantId: { in: args.consultantIds } }
        : {}),
    },
    include: {
      lead: {
        select: {
          id: true,
          fullName: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          addressLine1: true,
          suburb: true,
          state: true,
          postcode: true,
          source: true,
          notes: true,
        },
      },
    },
    orderBy: [{ date: "asc" }, { hour: "asc" }, { minute: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    consultantId: r.consultantId,
    date: toISODate(r.date),
    hour: r.hour,
    minute: r.minute,
    slotKey: `${r.hour}:${r.minute === 0 ? "00" : "30"}`,
    durationMinutes: r.durationMinutes,

    customer:
      r.lead.fullName ||
      [r.lead.firstName, r.lead.lastName].filter(Boolean).join(" ").trim() ||
      "—",
    firstName: r.lead.firstName,
    lastName: r.lead.lastName,
    phone: r.lead.phone,
    email: r.lead.email,
    address: r.lead.addressLine1,
    suburb: r.lead.suburb,
    postcode: r.lead.postcode,
    state: r.lead.state,
    bills: r.bills,
    source: r.source ?? r.lead.source,
    company: r.company,
    notes: r.notes ?? r.lead.notes,

    disposition: r.disposition,
    bookedByUserId: r.bookedByUserId,
    bookedByName: r.bookedByName,
    isAdditional: r.isAdditional,
    cancelPending: r.cancelPending,
  }));
}

export { fromISODate, toISODate };
