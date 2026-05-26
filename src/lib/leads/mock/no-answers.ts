import { CONSULTANTS, LEAD_GEN_AGENTS } from "./consultants";

export type NoAnswerStatus = "pending" | "in_progress" | "rebooked" | "closed";

export type ConsultantDisposition =
  | "cancel"
  | "reschedule"
  | "dnq"
  | "not_interested"
  | "no_answer";

export type NoAnswerOutcome =
  | ""
  | "Booked"
  | "Callback Scheduled"
  | "No Answer"
  | "Wrong Number"
  | "Not Interested"
  | "Do Not Call";

export interface NoAnswerLead {
  id: string;
  customerName: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address: string;
  suburb: string;
  state: "TAS" | "ACT" | "VIC" | "NSW";
  leadGenRepId: string;
  consultantId: string;
  consultantDisposition: ConsultantDisposition;
  company: "Astra" | "DC";
  source: "Bloome" | "Web" | "Referral" | "Door Knock" | "Repeat";
  outcome: NoAnswerOutcome;
  notes?: string;
  dialCount: number;
  lastCalledAt?: string;
  /** Originally scheduled date (YYYY-MM-DD) */
  originalDate: string;
  /** Originally scheduled hour (8..19) */
  originalHour: number;
  status: NoAnswerStatus;
  createdAt: string;
}

const FIRSTNAMES = [
  "Hugh",
  "Aiyana",
  "Eddie",
  "Maria",
  "Patrick",
  "Sienna",
  "Tom",
  "Olivia",
  "Marco",
  "Phoebe",
  "Wendy",
  "Daniel",
];
const SURNAMES = [
  "Bennett",
  "Wallis",
  "Tran",
  "Lo",
  "Halligan",
  "Park",
  "Veitch",
  "Russo",
  "Bianchi",
  "Carlin",
  "Harrison",
  "Okafor",
];
const SUBURBS: [string, "TAS" | "ACT" | "VIC" | "NSW"][] = [
  ["Sandy Bay", "TAS"],
  ["Glenorchy", "TAS"],
  ["Kingston", "TAS"],
  ["Belconnen", "ACT"],
  ["Tuggeranong", "ACT"],
  ["Dickson", "ACT"],
  ["Carlton North", "VIC"],
  ["Brunswick", "VIC"],
  ["Surry Hills", "NSW"],
];

const DISP: ConsultantDisposition[] = [
  "no_answer",
  "no_answer",
  "no_answer",
  "cancel",
  "reschedule",
  "dnq",
  "not_interested",
];

const OUTCOMES: NoAnswerOutcome[] = [
  "",
  "Callback Scheduled",
  "No Answer",
  "Booked",
  "Wrong Number",
  "Not Interested",
];

const SOURCES: NoAnswerLead["source"][] = [
  "Bloome",
  "Bloome",
  "Web",
  "Referral",
  "Door Knock",
];

function rng(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function build(): NoAnswerLead[] {
  const r = rng(101);
  const out: NoAnswerLead[] = [];
  for (let i = 0; i < 64; i++) {
    const fn = FIRSTNAMES[Math.floor(r() * FIRSTNAMES.length)];
    const sn = SURNAMES[Math.floor(r() * SURNAMES.length)];
    const [suburb, state] = SUBURBS[Math.floor(r() * SUBURBS.length)];
    const repId =
      LEAD_GEN_AGENTS[Math.floor(r() * LEAD_GEN_AGENTS.length)].id;
    const consId = CONSULTANTS[Math.floor(r() * CONSULTANTS.length)].id;
    const disp = DISP[Math.floor(r() * DISP.length)];
    const outcome = OUTCOMES[Math.floor(r() * OUTCOMES.length)];
    const status: NoAnswerStatus =
      outcome === "Booked"
        ? "rebooked"
        : outcome === "Not Interested" || outcome === "Wrong Number"
          ? "closed"
          : outcome === "Callback Scheduled"
            ? "in_progress"
            : "pending";
    out.push({
      id: `na-${String(i + 1).padStart(4, "0")}`,
      customerName: `${fn} ${sn}`,
      phone: `04${10 + Math.floor(r() * 90)} ${100 + Math.floor(r() * 900)} ${100 + Math.floor(r() * 900)}`,
      email: r() < 0.4 ? `${fn.toLowerCase()}.${sn.toLowerCase()}@example.com` : undefined,
      address: `${100 + Math.floor(r() * 800)} Elm St`,
      suburb,
      state,
      leadGenRepId: repId,
      consultantId: consId,
      consultantDisposition: disp,
      company: r() < 0.6 ? "Astra" : "DC",
      source: SOURCES[Math.floor(r() * SOURCES.length)],
      outcome,
      notes:
        outcome === "Callback Scheduled"
          ? "Asked to call back tomorrow morning."
          : outcome === "Not Interested"
            ? "Going with rooftop competitor."
            : undefined,
      dialCount: 1 + Math.floor(r() * 6),
      lastCalledAt: daysAgo(Math.floor(r() * 4)),
      originalDate: isoDate(-Math.floor(r() * 14) - 1),
      originalHour: 9 + Math.floor(r() * 9),
      status,
      createdAt: daysAgo(Math.floor(r() * 14)),
    });
  }
  return out;
}

export const MOCK_NO_ANSWERS = build();
