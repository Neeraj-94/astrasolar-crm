import { LEAD_GEN_AGENTS } from "./consultants";

export type Region = "TAS" | "ACT";

export type BloomeOutcome =
  | "No Answer"
  | "Booked"
  | "Not Interested"
  | "Callback"
  | "DNQ"
  | "Wrong Number"
  | "Voicemail"
  | "Do Not Call"
  | "";

export type BloomeCompany = "Astra" | "DC" | "";

export interface BloomeLead {
  id: string;
  region: Region;
  /** Customer name */
  name: string;
  phone: string;
  email?: string;
  address: string;
  suburb: string;
  postcode: string;
  /** Current power bill estimate (qtr) */
  bill?: number;
  /** Lead source code (e.g. "FB-Apr") */
  code?: string;
  /** Assigned Lead Gen agent id (or empty) */
  agentId: string;
  /** Number of dial attempts */
  dials: number;
  outcome: BloomeOutcome;
  /** Company allocated to (Astra / DC / blank) */
  company: BloomeCompany;
  notes?: string;
  /** ISO date of most recent dial attempt */
  lastCalledAt?: string;
  /** ISO timestamp the lead was imported */
  importedAt: string;
}

const STREETS = [
  "Sunshine Cres",
  "Pelican Way",
  "Riverside Dr",
  "Beach Rd",
  "Mountain View",
  "Heritage Pl",
  "Federation St",
  "Park Lane",
  "Ridge Cres",
  "Bay View Tce",
  "Eucalypt Gve",
  "Coral St",
  "Lighthouse Rd",
  "Highland Ave",
  "Tasman Hwy",
];

const TAS_SUBURBS: [string, string][] = [
  ["Sandy Bay", "7005"],
  ["Glenorchy", "7010"],
  ["Kingston", "7050"],
  ["Bellerive", "7018"],
  ["Howrah", "7018"],
  ["Lindisfarne", "7015"],
  ["Mornington", "7018"],
  ["Newtown", "7008"],
  ["South Hobart", "7004"],
  ["Battery Point", "7004"],
  ["Margate", "7054"],
  ["Sorell", "7172"],
];

const ACT_SUBURBS: [string, string][] = [
  ["Belconnen", "2617"],
  ["Tuggeranong", "2900"],
  ["Gungahlin", "2912"],
  ["Woden", "2606"],
  ["Dickson", "2602"],
  ["Braddon", "2612"],
  ["Kingston", "2604"],
  ["Manuka", "2603"],
  ["Civic", "2601"],
  ["Yarralumla", "2600"],
];

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
  "Lucy",
  "Sam",
  "Joon",
  "Aida",
  "Bruno",
  "Heath",
  "Tara",
  "Vincent",
  "Roisin",
  "Caspar",
  "Nadia",
  "Reuben",
  "Esme",
  "Otis",
  "Margot",
  "Felix",
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
  "Tjandra",
  "McCleary",
  "Suh",
  "Romero",
  "Halpin",
  "Marston",
  "Khanna",
  "Drake",
];
const OUTCOMES: BloomeOutcome[] = [
  "",
  "No Answer",
  "No Answer",
  "No Answer",
  "Booked",
  "Booked",
  "Callback",
  "Voicemail",
  "Not Interested",
  "Wrong Number",
  "DNQ",
  "Do Not Call",
];
const CODES = ["FB-Mar", "FB-Apr", "FB-May", "Web-Apr", "Web-May", "Print-Apr"];

function rng(seed: number) {
  // Mulberry32
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function buildLeads(region: Region, count: number, seedBase: number): BloomeLead[] {
  const r = rng(seedBase);
  const suburbs = region === "TAS" ? TAS_SUBURBS : ACT_SUBURBS;
  const out: BloomeLead[] = [];
  for (let i = 0; i < count; i++) {
    const fn = FIRSTNAMES[Math.floor(r() * FIRSTNAMES.length)];
    const sn = SURNAMES[Math.floor(r() * SURNAMES.length)];
    const [suburb, postcode] = suburbs[Math.floor(r() * suburbs.length)];
    const number = 100 + Math.floor(r() * 900);
    const street = STREETS[Math.floor(r() * STREETS.length)];
    const outcome = OUTCOMES[Math.floor(r() * OUTCOMES.length)];
    const dials = outcome === "No Answer" ? 1 + Math.floor(r() * 8) : Math.floor(r() * 3);
    const hasAgent = r() < 0.85;
    const agentId = hasAgent
      ? LEAD_GEN_AGENTS[Math.floor(r() * LEAD_GEN_AGENTS.length)].id
      : "";
    const company: BloomeCompany =
      outcome === "Booked"
        ? r() < 0.6
          ? "Astra"
          : "DC"
        : "";
    const daysAgo = Math.floor(r() * 30);
    const lastCallDaysAgo = outcome ? Math.floor(r() * 7) : undefined;
    out.push({
      id: `bl-${region.toLowerCase()}-${String(i + 1).padStart(4, "0")}`,
      region,
      name: `${fn} ${sn}`,
      phone: `04${10 + Math.floor(r() * 90)} ${100 + Math.floor(r() * 900)} ${100 + Math.floor(r() * 900)}`,
      email: r() < 0.6 ? `${fn.toLowerCase()}.${sn.toLowerCase()}@example.com` : undefined,
      address: `${number} ${street}`,
      suburb,
      postcode,
      bill: 250 + Math.floor(r() * 1500),
      code: CODES[Math.floor(r() * CODES.length)],
      agentId,
      dials,
      outcome,
      company,
      notes:
        outcome === "Callback"
          ? "Call back after 5pm — wife handles utilities."
          : outcome === "Not Interested"
            ? "Just signed with another provider."
            : outcome === "No Answer" && dials > 4
              ? "Multiple no answers — try mobile."
              : undefined,
      lastCalledAt: lastCallDaysAgo !== undefined ? isoDaysAgo(lastCallDaysAgo) : undefined,
      importedAt: isoDaysAgo(daysAgo),
    });
  }
  return out;
}

export const BLOOME_LEADS_TAS = buildLeads("TAS", 180, 7);
export const BLOOME_LEADS_ACT = buildLeads("ACT", 120, 17);

export const BLOOME_LEADS_ALL = [...BLOOME_LEADS_TAS, ...BLOOME_LEADS_ACT];
