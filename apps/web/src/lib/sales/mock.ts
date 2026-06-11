/**
 * Mock sales-dashboard data.
 *
 * Mirrors the lead shape used by astrasolar-app's consultant dashboard
 * (`renderLeads`, Call Back / Past Preso / Not Interested tabs) so each tab
 * here can hydrate from the same source and we can ship a single rendering
 * pipeline instead of five duplicated ones.
 */

import { CONSULTANTS } from "@/lib/leads/mock/consultants";

export type Disposition =
  | "set"
  | "presented"
  | "callback"
  | "still_deciding"
  | "maybe_future"
  | "resent_proposal"
  | "sold"
  | "not_interested"
  | "no_answer"
  | "cancel"
  | "reschedule"
  | "dnq";

export type LeadCompany = "astra" | "dc" | "bloome";

export interface SalesLead {
  id: string;
  consultantId: string;
  /** ISO date YYYY-MM-DD — the day the appointment was set for */
  date: string;
  time: string; // e.g. "10:00 am"
  name: string;
  phone: string;
  email?: string;
  address: string;
  state: "ACT" | "TAS Hobart" | "TAS Laun" | "NSW" | "VIC" | "QLD" | "SA";
  bills?: string;
  source: string;
  company: LeadCompany;
  lgNotes?: string;
  cbNotes?: string;
  followUpNotes?: string;
  attempts?: number;
  hot?: boolean;
  /** ISO date the lead was originally set on */
  dateSet: string;
  disposition: Disposition;
}

const NAMES = [
  "Neil De Vries",
  "Hugh Bennett",
  "Aiyana Wallis",
  "Eddie Tran",
  "Maria Lo",
  "Patrick Halligan",
  "Sienna Park",
  "Tom Veitch",
  "Olivia Russo",
  "Marco Bianchi",
  "Phoebe Carlin",
  "Wendy Harrison",
  "Daniel Okafor",
  "Lucy Tjandra",
  "Sam McCleary",
  "Joon Suh",
  "Aida Romero",
  "Bruno Halpin",
  "Heath Marston",
  "Tara Khanna",
  "Vincent Drake",
  "Ravi Sengupta",
  "Marta Lim",
  "Connor Webb",
  "Polly Frost",
];

const SUBURBS: Array<[string, SalesLead["state"], string]> = [
  ["Sandy Bay", "TAS Hobart", "7005"],
  ["Howrah", "TAS Hobart", "7018"],
  ["Glenorchy", "TAS Hobart", "7010"],
  ["Kingston", "TAS Hobart", "7050"],
  ["Newtown", "TAS Hobart", "7008"],
  ["Launceston", "TAS Laun", "7250"],
  ["Riverside", "TAS Laun", "7250"],
  ["Belconnen", "ACT", "2617"],
  ["Tuggeranong", "ACT", "2900"],
  ["Gungahlin", "ACT", "2912"],
  ["Penrith", "NSW", "2750"],
  ["Newcastle", "NSW", "2300"],
  ["Geelong", "VIC", "3220"],
  ["Ballarat", "VIC", "3350"],
];

const TIMES = ["10:00 am", "11:30 am", "1:00 pm", "3:00 pm", "4:30 pm", "6:00 pm"];
const SOURCES = ["Bloome", "Referral", "Web", "Repeat", "Door Knock"];

const DISP_BY_TAB: Record<string, Disposition[]> = {
  callback: ["callback", "still_deciding", "maybe_future", "resent_proposal"],
  preso: ["presented", "sold"],
  ni: ["not_interested"],
  today: ["set", "no_answer", "presented", "sold", "callback"],
};

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function build(
  seedCount: number,
  bucket: keyof typeof DISP_BY_TAB,
  baseOffset = 0,
): SalesLead[] {
  const out: SalesLead[] = [];
  for (let i = 0; i < seedCount; i++) {
    const [suburb, state, postcode] = pick(SUBURBS, i + bucket.length);
    const consultant = pick(CONSULTANTS, i + bucket.length);
    const disp = pick(DISP_BY_TAB[bucket], i);
    const offset = baseOffset - (i % 14);
    out.push({
      id: `${bucket}-${i + 1}`,
      consultantId: consultant.id,
      date: dateOffset(offset),
      dateSet: dateOffset(offset - (i % 5)),
      time: pick(TIMES, i),
      name: pick(NAMES, i + bucket.length),
      phone: `04${(11 + (i % 80)).toString().padStart(2, "0")} ${(100 + i).toString().padStart(3, "0")} ${(220 + i).toString().padStart(3, "0")}`,
      email: `${pick(NAMES, i + bucket.length).toLowerCase().split(" ")[0]}@example.com`,
      address: `${10 + (i % 80)} Example St, ${suburb} ${postcode}`,
      state,
      bills: `$${280 + ((i * 17) % 300)}`,
      source: pick(SOURCES, i),
      company: pick<LeadCompany>(["astra", "dc", "bloome"], i),
      lgNotes:
        i % 3 === 0
          ? "Owns home, ready to discuss tariffs."
          : i % 3 === 1
            ? "Existing 5kW, wants battery sizing."
            : "Soft lead, partner needs to be home.",
      cbNotes:
        bucket === "callback"
          ? `Spoke ${i % 4} time(s). Wants quote revised before next call.`
          : undefined,
      followUpNotes:
        bucket === "preso"
          ? "Quote sent. Waiting on finance approval."
          : undefined,
      attempts: bucket === "callback" ? (i % 5) + 1 : undefined,
      hot: bucket === "callback" && i % 4 === 0,
      disposition: disp,
    });
  }
  return out;
}

/** Today's leads — mixed dispositions, all today. */
export const TODAY_LEADS: SalesLead[] = build(14, "today", 0).map((l) => ({
  ...l,
  date: dateOffset(0),
}));

/** Call Back Sheet — all callback-style leads, mixed dates. */
export const CALLBACK_LEADS: SalesLead[] = build(36, "callback", -1);

/** Past Preso's — presented + sold, mixed dates. */
export const PRESO_LEADS: SalesLead[] = build(28, "preso", -3);

/** Not Interested — archived. */
export const NOT_INTERESTED_LEADS: SalesLead[] = build(22, "ni", -5);

/** Convenient lookup of every lead — used by Team View. */
export const ALL_LEADS: SalesLead[] = [
  ...TODAY_LEADS,
  ...CALLBACK_LEADS,
  ...PRESO_LEADS,
  ...NOT_INTERESTED_LEADS,
];

export const DISPOSITION_LABEL: Record<Disposition, string> = {
  set: "Set",
  presented: "Presented",
  callback: "Call Back",
  still_deciding: "Still Deciding",
  maybe_future: "Maybe in the Future",
  resent_proposal: "Resent Proposal",
  sold: "Sold",
  not_interested: "Not Interested",
  no_answer: "No Answer",
  cancel: "Cancel",
  reschedule: "Reschedule",
  dnq: "DNQ",
};

export const STATE_OPTIONS = [
  "ACT",
  "TAS Hobart",
  "TAS Laun",
  "NSW",
  "VIC",
  "QLD",
  "SA",
] as const;
