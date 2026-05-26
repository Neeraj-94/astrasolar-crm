/**
 * Mock consultant directory — shared across tabs.
 * Inspired by the staff/* structure in the legacy app's Firebase RTDB.
 */
export interface MockConsultant {
  id: string;
  name: string;
  email: string;
  region: "TAS" | "ACT" | "VIC" | "NSW";
  role: "consultant" | "lead_gen";
  brand: "astra" | "dc" | "both";
  active: boolean;
  /** Astra Solar callback number override (blank => system default) */
  astraNumber?: string;
  /** Astra Solar ClickSend sender ID override */
  astraSenderId?: string;
  /** DC Solar callback number override */
  dcNumber?: string;
  /** DC Solar ClickSend sender ID override */
  dcSenderId?: string;
}

export const MOCK_CONSULTANTS: MockConsultant[] = [
  {
    id: "c-aaron",
    name: "Aaron Whitlock",
    email: "aaron@astrasolar.com.au",
    region: "TAS",
    role: "consultant",
    brand: "both",
    active: true,
    astraNumber: "0412 998 221",
    astraSenderId: "ASTRASOLAR",
    dcNumber: "0455 660 144",
    dcSenderId: "DCSOLAR",
  },
  {
    id: "c-bree",
    name: "Bree Sutherland",
    email: "bree@astrasolar.com.au",
    region: "TAS",
    role: "consultant",
    brand: "astra",
    active: true,
    astraNumber: "0413 110 998",
    astraSenderId: "ASTRASOLAR",
  },
  {
    id: "c-callum",
    name: "Callum Rivers",
    email: "callum@astrasolar.com.au",
    region: "ACT",
    role: "consultant",
    brand: "both",
    active: true,
    astraNumber: "0414 220 887",
    astraSenderId: "ASTRASOLAR",
    dcNumber: "0455 880 332",
    dcSenderId: "DCSOLAR",
  },
  {
    id: "c-diana",
    name: "Diana Cho",
    email: "diana@astrasolar.com.au",
    region: "ACT",
    role: "consultant",
    brand: "dc",
    active: true,
    dcNumber: "0455 770 445",
    dcSenderId: "DCSOLAR",
  },
  {
    id: "c-eli",
    name: "Eli Mendoza",
    email: "eli@astrasolar.com.au",
    region: "VIC",
    role: "consultant",
    brand: "both",
    active: true,
  },
  {
    id: "c-faye",
    name: "Faye Whitcombe",
    email: "faye@astrasolar.com.au",
    region: "TAS",
    role: "consultant",
    brand: "astra",
    active: true,
  },
  {
    id: "c-grant",
    name: "Grant Holloway",
    email: "grant@astrasolar.com.au",
    region: "NSW",
    role: "consultant",
    brand: "both",
    active: true,
  },
  {
    id: "c-haru",
    name: "Haru Tanaka",
    email: "haru@astrasolar.com.au",
    region: "ACT",
    role: "consultant",
    brand: "astra",
    active: true,
  },

  // Lead Gen agents (used as the "Agent" filter in Bloome / No Answers)
  {
    id: "lg-daniel",
    name: "Daniel Park",
    email: "daniel@astrasolar.com.au",
    region: "TAS",
    role: "lead_gen",
    brand: "both",
    active: true,
  },
  {
    id: "lg-maya",
    name: "Maya Klein",
    email: "maya@astrasolar.com.au",
    region: "ACT",
    role: "lead_gen",
    brand: "both",
    active: true,
  },
  {
    id: "lg-jonas",
    name: "Jonas Riley",
    email: "jonas@astrasolar.com.au",
    region: "TAS",
    role: "lead_gen",
    brand: "both",
    active: true,
  },
];

export const CONSULTANTS = MOCK_CONSULTANTS.filter(
  (c) => c.role === "consultant",
);

export const LEAD_GEN_AGENTS = MOCK_CONSULTANTS.filter(
  (c) => c.role === "lead_gen",
);
