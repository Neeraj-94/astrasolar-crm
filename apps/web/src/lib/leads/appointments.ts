import "server-only";
import { cookies } from "next/headers";
import { apiGet } from "@/lib/api/client";
import { fromISODate, toISODate } from "@/lib/availability";
import type { ScheduleAppointment } from "./schedule-types";

/**
 * Lead appointment queries — the source of truth for the Leads Schedule view.
 *
 * STORAGE MOVED: appointments now live in the API database (`Appointment`
 * model, `/scheduling/appointments`). The API returns rows already in the
 * `ScheduleAppointment` shape (contact details are denormalised snapshots).
 */
export async function listAppointments(args: {
  from: Date;
  to: Date; // inclusive
  consultantIds?: string[];
}): Promise<ScheduleAppointment[]> {
  const ids =
    args.consultantIds && args.consultantIds.length > 0
      ? `&consultantIds=${encodeURIComponent(args.consultantIds.join(","))}`
      : "";
  return apiGet<ScheduleAppointment[]>(
    `/scheduling/appointments?from=${toISODate(args.from)}&to=${toISODate(args.to)}${ids}`,
    { cookieHeader: cookies().toString() },
  );
}

export { fromISODate, toISODate };
