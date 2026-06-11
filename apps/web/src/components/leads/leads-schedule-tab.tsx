import { listConsultants, startOfWeek, addDays } from "@/lib/availability";
import { listAppointments } from "@/lib/leads/appointments";
import {
  LeadsScheduleClient,
  type ScheduleConsultant,
  type ScheduleAppointment,
} from "./leads-schedule-client";

/**
 * Server component for the Leads Schedule tab.
 *
 * Pulls the real sales consultants from the database (users with the
 * `sales_consultant` role) and the current-week appointments from the new
 * Appointment table, then hands them to the client component for rendering.
 *
 * Range: previous week → next week (3 weeks) so the client can navigate
 * forward/back without a server round-trip for adjacent weeks.
 */
export async function LeadsScheduleTab() {
  const dbConsultants = await listConsultants();

  const consultants: ScheduleConsultant[] = dbConsultants.map((c) => ({
    id: c.id,
    name: c.displayName?.trim() || c.email,
    region: c.region,
  }));

  const thisWeek = startOfWeek(new Date());
  const from = addDays(thisWeek, -7);
  const to = addDays(thisWeek, 13); // end of next week

  const appointments = consultants.length
    ? await listAppointments({
        from,
        to,
        consultantIds: consultants.map((c) => c.id),
      })
    : [];

  // The query helper already returns objects in the shape the client expects;
  // a direct cast keeps the boundary type-safe without duplicating field maps.
  return (
    <LeadsScheduleClient
      consultants={consultants}
      appointments={appointments as ScheduleAppointment[]}
    />
  );
}
