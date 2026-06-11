/**
 * Shared types + constants for the Leads Schedule view.
 *
 * Lives in its own module (no `server-only` import) so the client component
 * can import the slot list, dispositions and tone mappings without dragging
 * in the Prisma client.
 */

import type { BadgeTone } from "@/components/leads/shared";

// ---------------------------------------------------------------------------
// Slot model — mirrors the legacy "LG_TIME_SLOTS" (30-minute slots, 8 AM–8 PM)
// ---------------------------------------------------------------------------

export const SLOT_FIRST_HOUR = 8;
export const SLOT_LAST_HOUR = 19; // last *start* hour (slot is 19:30–20:00)
export const SLOT_MINUTES = [0, 30] as const;

export interface TimeSlot {
  hour: number;
  minute: number;
  /** "8:00" | "8:30" — used for matching the appointment row to a slot */
  key: string;
  /** "8:00 AM" | "8:30 AM" — display label */
  label: string;
  /** "8:00 AM – 8:30 AM" — display range */
  rangeLabel: string;
}

function fmtAmPm(h: number, m: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const mm = m === 0 ? "00" : String(m).padStart(2, "0");
  return `${display}:${mm} ${period}`;
}

export function buildTimeSlots(): TimeSlot[] {
  const out: TimeSlot[] = [];
  for (let h = SLOT_FIRST_HOUR; h <= SLOT_LAST_HOUR; h++) {
    for (const m of SLOT_MINUTES) {
      const nextH = m === 30 ? h + 1 : h;
      const nextM = m === 30 ? 0 : 30;
      out.push({
        hour: h,
        minute: m,
        key: `${h}:${m === 0 ? "00" : "30"}`,
        label: fmtAmPm(h, m),
        rangeLabel: `${fmtAmPm(h, m)} – ${fmtAmPm(nextH, nextM)}`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DISPOSITIONS — kept aligned with the legacy DISPOSITIONS constant.
// ---------------------------------------------------------------------------

export const DISPOSITIONS: ReadonlyArray<{
  value: string;
  label: string;
  tone: BadgeTone;
}> = [
  { value: "sold", label: "Sold", tone: "success" },
  { value: "pres", label: "Pres / Prop Created", tone: "info" },
  { value: "callback", label: "Call Back", tone: "warning" },
  { value: "reschedule", label: "Reschedule", tone: "warning" },
  { value: "been_rescheduled", label: "Been Rescheduled", tone: "warning" },
  { value: "no_answer", label: "No Answer", tone: "neutral" },
  { value: "not_interested", label: "Not Interested", tone: "neutral" },
  { value: "dnq", label: "DNQ", tone: "neutral" },
  { value: "cancel", label: "Cancelled", tone: "danger" },
];

export type DispositionValue = (typeof DISPOSITIONS)[number]["value"];

export const DISPOSITION_LABEL: Record<string, string> = Object.fromEntries(
  DISPOSITIONS.map((d) => [d.value, d.label]),
);

// ---------------------------------------------------------------------------
// Wire shape returned by the server tab to the client component.
// ---------------------------------------------------------------------------

export interface ScheduleConsultant {
  id: string;
  name: string;
  region: string | null;
}

export interface ScheduleAppointment {
  id: string;
  leadId: string;
  consultantId: string;
  /** YYYY-MM-DD */
  date: string;
  hour: number;
  minute: number;
  slotKey: string; // e.g. "8:00" or "8:30"
  durationMinutes: number;

  customer: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  bills: string | null;
  source: string | null;
  company: string | null;
  notes: string | null;

  disposition: string | null;
  bookedByUserId: string | null;
  bookedByName: string | null;
  isAdditional: boolean;
  cancelPending: string | null;
}
