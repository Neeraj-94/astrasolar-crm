import { getCurrentUser, hasPermission } from "@/lib/rbac";
import {
  listConsultants,
  listSlots,
  listSubmissions,
  startOfWeek,
  addDays,
  toISODate,
} from "@/lib/availability";
import { TeamAvailabilityClient } from "./team-availability-client";

/**
 * Server component for the Team Availability tab.
 *
 * Loads:
 *   - consultant directory
 *   - this-week + next-week submitted slot rows (so the overview renders fast)
 *   - submission summaries for both weeks
 */
export async function TeamAvailabilityTab() {
  const user = await getCurrentUser();
  const canEdit = hasPermission(user, "leads.availability.manage");

  const consultants = await listConsultants();

  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const nextWeekEnd = addDays(thisWeekStart, 13);

  const [slots, thisSubs, nextSubs] = await Promise.all([
    listSlots({ from: thisWeekStart, to: nextWeekEnd }),
    listSubmissions({ weekStart: thisWeekStart }),
    listSubmissions({ weekStart: nextWeekStart }),
  ]);

  return (
    <TeamAvailabilityClient
      consultants={consultants}
      initialSlots={slots}
      initialSubmissions={[...thisSubs, ...nextSubs]}
      thisWeekStart={toISODate(thisWeekStart)}
      nextWeekStart={toISODate(nextWeekStart)}
      canEdit={canEdit}
      currentUserName={user?.displayName ?? user?.email ?? "Unknown user"}
    />
  );
}
