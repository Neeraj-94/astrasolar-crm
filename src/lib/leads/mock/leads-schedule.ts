import { CONSULTANTS } from "./consultants";

/** Status of a single appointment slot on a consultant's day. */
export type SlotStatus =
  | "open"        // consultant available, no booking yet
  | "booked"      // an appointment is scheduled
  | "tentative"   // soft-held
  | "confirmed"   // booked + confirmed by customer
  | "unavailable" // consultant off
  | "holiday"
  | "completed"   // appointment ran
  | "cancelled";

export interface AppointmentLead {
  id: string;
  customer: string;
  phone: string;
  email?: string;
  suburb: string;
  postcode: string;
  source: string; // "Bloome", "Referral", "Web", "Door Knock", "Repeat"
  company: "astra" | "dc";
  notes?: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** hour (8..19) */
  hour: number;
  durationHours: number;
  consultantId: string;
  status: SlotStatus;
}

export const WORK_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

/** Returns the local date string YYYY-MM-DD for `offsetDays` from today. */
export function relativeDate(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const CUSTOMERS = [
  ["Hugh Bennett", "0411 220 998", "Sandy Bay", "7005"],
  ["Aiyana Wallis", "0431 887 554", "Glenorchy", "7010"],
  ["Eddie Tran", "0455 110 887", "Kingston", "7050"],
  ["Maria Lo", "0467 332 220", "Bellerive", "7018"],
  ["Patrick Halligan", "0421 998 776", "Howrah", "7018"],
  ["Sienna Park", "0488 665 443", "Lindisfarne", "7015"],
  ["Tom Veitch", "0412 887 002", "Mornington", "7018"],
  ["Olivia Russo", "0434 002 998", "Newtown", "7008"],
  ["Marco Bianchi", "0455 998 332", "South Hobart", "7004"],
  ["Phoebe Carlin", "0466 220 887", "Battery Point", "7004"],
  ["Wendy Harrison", "0411 776 220", "Lenah Valley", "7008"],
  ["Daniel Okafor", "0455 220 887", "Berriedale", "7011"],
  ["Lucy Tjandra", "0467 887 220", "Rosny Park", "7018"],
  ["Sam McCleary", "0488 332 998", "Lauderdale", "7021"],
  ["Joon Suh", "0421 002 998", "Risdon Vale", "7016"],
  ["Aida Romero", "0434 887 220", "Claremont", "7011"],
  ["Bruno Halpin", "0466 220 998", "Cambridge", "7170"],
  ["Heath Marston", "0411 887 002", "Brighton", "7030"],
  ["Tara Khanna", "0488 002 998", "Margate", "7054"],
  ["Vincent Drake", "0455 332 998", "Sorell", "7172"],
];

const SOURCES = ["Bloome", "Referral", "Web", "Door Knock", "Repeat", "Bloome"];

let seq = 1;
function nextId(): string {
  return `appt-${String(seq++).padStart(4, "0")}`;
}

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/**
 * Generates a 14-day appointment schedule across consultants. Deterministic
 * (same output across renders) — good enough for review-quality mocks.
 */
function buildAppointments(): AppointmentLead[] {
  const out: AppointmentLead[] = [];
  for (let dayOffset = -2; dayOffset < 12; dayOffset++) {
    const date = relativeDate(dayOffset);
    const isPast = dayOffset < 0;
    CONSULTANTS.forEach((c, ci) => {
      // 0-4 appointments per consultant per day (deterministic by ci+dayOffset)
      const slots = (ci + dayOffset + 9) % 5;
      for (let s = 0; s < slots; s++) {
        const idx = (ci * 17 + dayOffset * 7 + s * 3) >>> 0;
        const [name, phone, suburb, postcode] = pick(CUSTOMERS, idx);
        const hour = pick(WORK_HOURS, idx + s + ci) ?? 10;
        // skip lunch hour 12
        const adjusted = hour === 12 ? 13 : hour;
        const company = (idx + ci) % 3 === 0 ? "dc" : "astra";
        const source = pick(SOURCES, idx);
        let status: SlotStatus = "booked";
        if (isPast) {
          status = idx % 9 === 0 ? "cancelled" : "completed";
        } else {
          const r = (idx + s) % 8;
          status =
            r === 0
              ? "tentative"
              : r === 1
                ? "confirmed"
                : r === 2
                  ? "confirmed"
                  : "booked";
        }
        out.push({
          id: nextId(),
          customer: name,
          phone,
          suburb,
          postcode,
          source,
          company: company as "astra" | "dc",
          date,
          hour: adjusted,
          durationHours: 1,
          consultantId: c.id,
          status,
          notes:
            idx % 5 === 0
              ? "Customer requested afternoon — flexible on day."
              : undefined,
        });
      }
    });
  }
  return out;
}

export const MOCK_APPOINTMENTS = buildAppointments();
