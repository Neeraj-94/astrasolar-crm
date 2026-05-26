export type SmsProvider = "clicksend" | "twilio" | "messagebird";

export interface SmsProviderConfig {
  provider: SmsProvider;
  apiKeyMasked: string;
  defaultSenderId: string;
  connected: boolean;
  monthlyLimit: number;
  monthlySent: number;
}

export const MOCK_SMS_CONFIG: SmsProviderConfig = {
  provider: "clicksend",
  apiKeyMasked: "••••••••••••••••cb24",
  defaultSenderId: "ASTRASOLAR",
  connected: true,
  monthlyLimit: 25000,
  monthlySent: 8740,
};

export interface SmsTemplate {
  id: string;
  name: string;
  category: "booking" | "reminder" | "follow-up" | "marketing";
  body: string;
  /** Tokens used (for editor warnings) */
  placeholders: string[];
  /** Times sent in the last 30 days */
  sent30d: number;
  active: boolean;
}

export const MOCK_SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "tpl-book-confirm",
    name: "Booking Confirmation",
    category: "booking",
    body: "Hi {{firstName}}, your Astra Solar consultation with {{consultantName}} is confirmed for {{date}} at {{time}}. Reply YES to confirm or call {{consultantPhone}}.",
    placeholders: ["firstName", "consultantName", "date", "time", "consultantPhone"],
    sent30d: 412,
    active: true,
  },
  {
    id: "tpl-reminder-24h",
    name: "24h Reminder",
    category: "reminder",
    body: "Reminder: your Astra Solar appointment is tomorrow at {{time}}. {{consultantName}} will visit you at {{address}}.",
    placeholders: ["time", "consultantName", "address"],
    sent30d: 388,
    active: true,
  },
  {
    id: "tpl-reminder-1h",
    name: "1h Reminder",
    category: "reminder",
    body: "Hi {{firstName}}, {{consultantName}} is on the way for your {{time}} appointment. Call {{consultantPhone}} if you need to reschedule.",
    placeholders: ["firstName", "consultantName", "time", "consultantPhone"],
    sent30d: 376,
    active: true,
  },
  {
    id: "tpl-no-answer",
    name: "No Answer Follow-Up",
    category: "follow-up",
    body: "Hi {{firstName}}, sorry we missed you. Please call {{consultantPhone}} to rebook your free solar consultation.",
    placeholders: ["firstName", "consultantPhone"],
    sent30d: 142,
    active: true,
  },
  {
    id: "tpl-marketing-spring",
    name: "Spring Promo",
    category: "marketing",
    body: "Spring sale at Astra Solar — save up to $1,200 on a 10kW system. Reply YES for a free quote, STOP to opt out.",
    placeholders: [],
    sent30d: 0,
    active: false,
  },
];

export type SmsDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered";

export interface SmsLogEntry {
  id: string;
  to: string;
  customer: string;
  templateId: string;
  templateName: string;
  sentAt: string;
  status: SmsDeliveryStatus;
  cost: number;
  bodyPreview: string;
  errorMessage?: string;
}

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

const STATUSES: SmsDeliveryStatus[] = [
  "delivered",
  "delivered",
  "delivered",
  "delivered",
  "sent",
  "queued",
  "failed",
  "undelivered",
];
const NAMES = [
  "Hugh Bennett",
  "Aiyana Wallis",
  "Eddie Tran",
  "Maria Lo",
  "Patrick Halligan",
  "Sienna Park",
  "Tom Veitch",
  "Olivia Russo",
];

export const MOCK_SMS_LOG: SmsLogEntry[] = (() => {
  const r = rng(303);
  const out: SmsLogEntry[] = [];
  const now = Date.now();
  for (let i = 0; i < 40; i++) {
    const tpl = MOCK_SMS_TEMPLATES[Math.floor(r() * MOCK_SMS_TEMPLATES.length)];
    const status = STATUSES[Math.floor(r() * STATUSES.length)];
    const name = NAMES[Math.floor(r() * NAMES.length)];
    out.push({
      id: `sms-${i + 1}`,
      to: `04${10 + Math.floor(r() * 90)} ${100 + Math.floor(r() * 900)} ${100 + Math.floor(r() * 900)}`,
      customer: name,
      templateId: tpl.id,
      templateName: tpl.name,
      sentAt: new Date(now - i * 1000 * 60 * 17).toISOString(),
      status,
      cost: 0.07,
      bodyPreview: tpl.body.slice(0, 80),
      errorMessage:
        status === "failed"
          ? "Carrier rejected — number on do-not-call list."
          : status === "undelivered"
            ? "Handset unreachable."
            : undefined,
    });
  }
  return out;
})();
