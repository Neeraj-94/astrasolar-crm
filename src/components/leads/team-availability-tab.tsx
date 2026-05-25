import { getCurrentUser, hasPermission } from "@/lib/rbac";
import {
  listConsultants,
  listSlots,
  startOfWeek,
  addDays,
  toISODate,
} from "@/lib/availability";
import { TeamAvailabilityClient } from "./team-availability-client";

/**
 * Server component for the Team Availability tab.
 * Fetches the consultant directory and the initial two weeks of availability
 * rows, then hands them to the client component for interaction.
 */
export async function TeamAvailabilityTab() {
  const user = await getCurrentUser();
  const canEdit = hasPermission(user, "leads.availability.manage");

  const consultants = await listConsultants();

  // Preload this-week and next-week so the initial render has data without a
  // client round-trip.
  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const nextWeekEnd = addDays(thisWeekStart, 13);

  const slots = await listSlots({
    from: thisWeekStart,
    to: nextWeekEnd,
  });

  return (
    <TeamAvailabilityClient
      consultants={consultants}
      initialSlots={slots}
      initialWeekStart={toISODate(thisWeekStart)}
      canEdit={canEdit}
    />
  );
}
