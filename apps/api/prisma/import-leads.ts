/**
 * Import legacy Firebase leads (prisma/data/leads-import.json) into the CRM
 * `Lead` table. Idempotent — leads are UPSERTED by their original `id`, so the
 * script is safe to re-run.
 *
 * Source: the flattened `{ leads: [...] }` array exported from the Firebase
 * RTDB `staff/[id]/dayLeads` buckets (field names already remapped to the app
 * schema: bookingDate, billSpend, timestamp, consultantNotes, leadGenNotes,
 * leadGen, bookingTime, etc.).
 *
 * Mapping decisions (agreed 22/06/2026):
 *  - Upsert by id (idempotent). Existing rows are updated, new ones inserted.
 *  - User resolution: `consultant` and `leadGen` strings are resolved to User
 *    rows. Resolution order: existing User by (a) exact email, (b) exact name,
 *    (c) alias, (d) first-name token (after stripping a leading "NNN/" code).
 *    Hints derived from the Firebase `userMap` (name/slug -> email) seed the
 *    matcher so e.g. "506/Daniel" -> Daniel L, "088/Remy" -> Remy.
 *  - `leadGenId` is REQUIRED. Unresolved NON-EMPTY labels (e.g. "Inbound",
 *    "680/Max", "Guy", "Simon") are KEPT AS-IS by creating an inactive
 *    placeholder User (name = cleaned label). Empty/"None"/"-" lead-gen falls
 *    back to a single "Unknown (import)" placeholder so the FK is satisfied.
 *  - `consultantId` is OPTIONAL: unresolved non-empty consultant labels also
 *    get a placeholder (to preserve the link); empty -> null.
 *  - Enums normalised via the tables below; unmappable values -> null
 *    (or the schema default for `source`/`company`). Every distinct value and
 *    where it mapped is printed in the run summary.
 *  - `stage` derived: SOLD -> CONVERTED (+convertedAt); CANCELLED -> CLOSED;
 *    has bookingDate -> BOOKED; else INTAKE.
 *  - stateLog -> ONE LeadStateLog snapshot row per affected lead capturing the
 *    current stage/outcome/disposition/leadGenId/consultantId (the field-level
 *    from/to is intentionally not stored — see schema note). changedBy uses the
 *    resolved `_lastEditedBy` user id when present, else the lead-gen id.
 *
 * Flags:
 *   --dry-run         resolve + map everything, print the summary, write NOTHING.
 *   --limit=N         only process the first N leads (debugging).
 *
 * Run: npm run db:import-leads --workspace=@astra/api
 *      npm run db:import-leads --workspace=@astra/api -- --dry-run
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  PrismaClient,
  LeadSource,
  Company,
  LeadStage,
  LeadOutcome,
  SalesDisposition,
} from '../src/db';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const PLACEHOLDER_PASSWORD = '!imported-no-login'; // non-functional; placeholders cannot sign in
const PLACEHOLDER_DOMAIN = 'imported.astrasolar.local';

// ---------------------------------------------------------------------------
// Canonical users — derived from the Firebase `userMap`. tokens are matched
// case-insensitively against the (NNN/-stripped) label. email is the stable key
// used to find the real User row in the DB.
// ---------------------------------------------------------------------------
const CANONICAL: { email: string; name: string; tokens: string[] }[] = [
  { email: 'neeraj@astrasolar.com.au', name: 'Neeraj', tokens: ['neeraj'] },
  { email: 'lachlan@astrasolar.com.au', name: 'Lachlan M', tokens: ['lachlan'] },
  { email: 'chris@astrasolar.com.au', name: 'Chris D', tokens: ['chris'] },
  { email: 'ben@astrasolar.com.au', name: 'Burhan A', tokens: ['burhan', 'ben'] },
  { email: 'justin.parle@astrasolar.com.au', name: 'Justin P', tokens: ['justin'] },
  { email: 'daniel.lulham@astrasolar.com.au', name: 'Daniel L', tokens: ['daniel'] },
  { email: 'wilson@astrasolar.com.au', name: 'Wilson', tokens: ['wilson'] },
  { email: 'stephen@astrasolar.com.au', name: 'Stephen N', tokens: ['stephen'] },
  { email: 'jody@astrasolar.com.au', name: 'Jody', tokens: ['jody'] },
  { email: 'remy@astrasolar.com.au', name: 'Remy', tokens: ['remy'] },
  { email: 'finance@astrasolar.com.au', name: 'Finance', tokens: ['finance'] },
  { email: 'matthaeus@astrasolar.com.au', name: 'Mattie H', tokens: ['mattie', 'matthaeus'] },
  { email: 'ernest@astrasolar.com.au', name: 'Ernest L', tokens: ['ernest'] },
  { email: 'zane@astrasolar.com.au', name: 'Zane A', tokens: ['zane'] },
];

// ---------------------------------------------------------------------------
// Enum maps. Keys are normalised (lowercased, trimmed). Unlisted -> fallback.
// ---------------------------------------------------------------------------
const SOURCE_MAP: Record<string, LeadSource> = {
  'bloom astra': LeadSource.BLOOM_ASTRA,
  bloome: LeadSource.BLOOM_ASTRA,
  'bloome astra': LeadSource.BLOOM_ASTRA,
  'bloome dcsolar': LeadSource.BLOOM_ASTRA,
  bloom: LeadSource.BLOOM_ASTRA,
  inbound: LeadSource.INBOUND,
  direct: LeadSource.INBOUND,
  'post install call': LeadSource.INBOUND,
  commbank: LeadSource.INBOUND,
  callback: LeadSource.INBOUND,
  website: LeadSource.WEBSITE,
  'astra web': LeadSource.WEBSITE,
  brighte: LeadSource.BRIGHTE,
  referral: LeadSource.REFERRAL,
  'text 2026': LeadSource.REFERRAL,
  text2026: LeadSource.REFERRAL,
  text: LeadSource.REFERRAL,
};

const COMPANY_MAP: Record<string, Company> = {
  astra: Company.ASTRA,
  dcnt: Company.DC,
  dcsolar: Company.DC,
  'dc elec': Company.DC,
  'dc solar': Company.DC,
  dc: Company.DC,
};

// JSON `disposition` (lowercase codes) -> SalesDisposition (nullable).
const DISPOSITION_MAP: Record<string, SalesDisposition> = {
  pres: SalesDisposition.PRES_PROP_CREATED,
  resent_proposal: SalesDisposition.PRES_PROP_CREATED,
  still_deciding: SalesDisposition.PRES_PROP_CREATED,
  sold: SalesDisposition.SOLD,
  no_answer: SalesDisposition.NO_ANSWER,
  not_interested: SalesDisposition.NOT_INTERESTED,
  reschedule: SalesDisposition.RESCHEDULE,
  been_rescheduled: SalesDisposition.BEEN_RESCHEDULED,
  callback: SalesDisposition.CALL_BACK,
  maybe_future: SalesDisposition.CALL_BACK,
  cancel: SalesDisposition.CANCELLED,
  dnq: SalesDisposition.DNQ,
  // sent_to_daniel -> null (no equivalent)
};

// JSON `outcome` (UPPER human strings) -> LeadOutcome. Only the values that
// genuinely fit the lead-gen enum are mapped; PRES/SOLD/CANCELL/etc. are
// dispositions, not lead-gen outcomes, so they map to null here.
const OUTCOME_MAP: Record<string, LeadOutcome> = {
  'no answer': LeadOutcome.NO_ANSWER,
  reschedule: LeadOutcome.RESCHEDULE,
  'not interested': LeadOutcome.NOT_INTERESTED,
  dnq: LeadOutcome.DNQ,
  'call back': LeadOutcome.HOT_CALL_BACK,
};

// ---------------------------------------------------------------------------
const norm = (v: unknown) =>
  typeof v === 'string' ? v.trim().toLowerCase() : '';
const isEmptyLabel = (v: unknown) => {
  const n = norm(v);
  return n === '' || n === 'none' || n === '-' || n === 'null';
};
// Junk labels are NOT real people — header rows ("CONSULTANT"/"REP"), date/note
// fragments ("3/2026", "2nd appt"), or anything without a clean alphabetic name
// after the "NNN/" code is stripped. These must not spawn placeholder users.
const HEADER_WORDS = new Set([
  'consultant',
  'rep',
  'source',
  'outcome',
  'company',
  'name',
  'disposition',
]);
const isJunkLabel = (v: unknown) => {
  if (isEmptyLabel(v)) return true;
  const s = stripCode(String(v));
  if (!/[a-z]/i.test(s)) return true; // no letters
  if (/\d/.test(s)) return true; // contains digits (dates, "2nd appt")
  if (HEADER_WORDS.has(s.trim().toLowerCase())) return true;
  if (s.replace(/[^a-z]/gi, '').length < 2) return true; // too short to be a name
  return false;
};
const stripCode = (label: string) => label.replace(/^\s*\d+\s*\//, '').trim();
const tokens = (label: string) =>
  stripCode(label)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

function slugify(label: string) {
  return (
    stripCode(label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

// summary trackers
const sourceTally: Record<string, string> = {};
const companyTally: Record<string, string> = {};
const dispoTally: Record<string, string> = {};
const outcomeTally: Record<string, string> = {};
const unmappedSource = new Set<string>();
const unmappedCompany = new Set<string>();
const createdPlaceholders = new Set<string>();
const stageCount: Record<string, number> = {
  INTAKE: 0,
  BOOKED: 0,
  CONVERTED: 0,
  CLOSED: 0,
};

function mapSource(v: unknown): LeadSource {
  const n = norm(v);
  const hit = SOURCE_MAP[n];
  if (hit) {
    sourceTally[String(v)] = hit;
    return hit;
  }
  if (!isEmptyLabel(v)) unmappedSource.add(String(v));
  sourceTally[String(v)] = `${LeadSource.BLOOM_ASTRA} (default)`;
  return LeadSource.BLOOM_ASTRA; // schema default
}
function mapCompany(v: unknown): Company {
  const n = norm(v);
  const hit = COMPANY_MAP[n];
  if (hit) {
    companyTally[String(v)] = hit;
    return hit;
  }
  if (!isEmptyLabel(v)) unmappedCompany.add(String(v));
  companyTally[String(v)] = `${Company.ASTRA} (default)`;
  return Company.ASTRA; // schema default
}
function mapDisposition(v: unknown): SalesDisposition | null {
  const n = norm(v);
  const hit = DISPOSITION_MAP[n] ?? null;
  dispoTally[String(v)] = hit ?? 'null';
  return hit;
}
function mapOutcome(v: unknown): LeadOutcome | null {
  const n = norm(v);
  const hit = OUTCOME_MAP[n] ?? null;
  outcomeTally[String(v)] = hit ?? 'null';
  return hit;
}

function parseBookingDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function parseTs(v: unknown): Date | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

// ---------------------------------------------------------------------------
// User cache + resolver (built from the live DB, augmented with placeholders).
// ---------------------------------------------------------------------------
type U = { id: string; email: string; name: string; aliases: string[] };
const byEmail = new Map<string, U>();
const byName = new Map<string, U>();
const byAlias = new Map<string, U>();
const byToken = new Map<string, U>(); // first-name token -> user (best effort)
const byId = new Map<string, U>(); // userId -> user (for the resolution report)
const labelCache = new Map<string, string>(); // raw label -> userId

// Per-field resolution tally: field -> raw label -> { count, userId }
const resolution: Record<'leadGen' | 'consultant', Map<string, { count: number; id: string | null }>> = {
  leadGen: new Map(),
  consultant: new Map(),
};
function recordResolution(field: 'leadGen' | 'consultant', label: unknown, id: string | null) {
  const key = label === undefined || label === null ? '' : String(label);
  const m = resolution[field];
  const cur = m.get(key);
  if (cur) cur.count++;
  else m.set(key, { count: 1, id });
}

function indexUser(u: U) {
  byEmail.set(u.email.toLowerCase(), u);
  byName.set(u.name.trim().toLowerCase(), u);
  byId.set(u.id, u);
  for (const a of u.aliases || []) byAlias.set(a.trim().toLowerCase(), u);
  const t = u.name.trim().toLowerCase().split(/\s+/)[0];
  if (t && !byToken.has(t)) byToken.set(t, u);
}

async function loadUsers() {
  if (DRY_RUN) {
    // No DB access in dry-run: resolve against the userMap-derived canonical
    // hints only (real run below resolves against the live User table, which
    // may also match extra aliases). Good enough to preview the mapping.
    for (const c of CANONICAL) {
      const stub: U = {
        id: `user:${c.email}`,
        email: c.email,
        name: c.name,
        aliases: [],
      };
      indexUser(stub);
      for (const t of c.tokens) byToken.set(t, stub);
    }
    return;
  }
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, aliases: true },
  });
  for (const u of users) indexUser(u as U);
  // seed token index with canonical hints pointing at existing users by email
  for (const c of CANONICAL) {
    const u = byEmail.get(c.email.toLowerCase());
    if (u) for (const t of c.tokens) if (!byToken.has(t)) byToken.set(t, u);
  }
}

async function getOrCreatePlaceholder(name: string): Promise<string> {
  const email = `imported.${slugify(name)}@${PLACEHOLDER_DOMAIN}`;
  const existing = byEmail.get(email.toLowerCase());
  if (existing) return existing.id;
  if (DRY_RUN) {
    createdPlaceholders.add(`${name} <${email}>`);
    const fake: U = { id: `dryrun:${email}`, email, name, aliases: [] };
    indexUser(fake);
    return fake.id;
  }
  const u = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name,
      password: PLACEHOLDER_PASSWORD,
      isActive: false,
      aliases: [name],
    },
    select: { id: true, email: true, name: true, aliases: true },
  });
  indexUser(u as U);
  createdPlaceholders.add(`${name} <${email}>`);
  return u.id;
}

/**
 * Resolve a label to a User id.
 *  - required=true (leadGen): empty labels -> the shared "Unknown (import)" user.
 *  - required=false (consultant): empty labels -> null.
 * Non-empty labels that don't match an existing user create a placeholder so
 * the original identity ("Inbound", "680/Max", "Guy", ...) is preserved.
 */
async function resolveUser(
  label: unknown,
  required: boolean,
): Promise<string | null> {
  if (isJunkLabel(label)) {
    return required ? getOrCreatePlaceholder('Unknown (import)') : null;
  }
  const raw = String(label);
  if (labelCache.has(raw)) return labelCache.get(raw)!;

  const stripped = stripCode(raw).toLowerCase();
  let u =
    byEmail.get(stripped) ||
    byName.get(stripped) ||
    byAlias.get(stripped) ||
    null;
  if (!u) {
    for (const t of tokens(raw)) {
      if (byToken.has(t)) {
        u = byToken.get(t)!;
        break;
      }
    }
  }
  const id = u ? u.id : await getOrCreatePlaceholder(stripCode(raw) || raw);
  labelCache.set(raw, id);
  return id;
}

// ---------------------------------------------------------------------------
function deriveStage(
  dispo: SalesDisposition | null,
  bookingDate: Date | null,
): LeadStage {
  if (dispo === SalesDisposition.SOLD) return LeadStage.CONVERTED;
  if (dispo === SalesDisposition.CANCELLED) return LeadStage.CLOSED;
  if (bookingDate) return LeadStage.BOOKED;
  return LeadStage.INTAKE;
}

async function main() {
  const file = path.join(__dirname, 'data', 'leads-import.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8')).leads as any[];
  const leads = all.slice(0, LIMIT);
  console.log(
    `\n${DRY_RUN ? '[DRY RUN] ' : ''}Importing ${leads.length} of ${all.length} leads from ${path.relative(process.cwd(), file)}\n`,
  );

  await loadUsers();
  console.log(`Loaded ${byEmail.size} existing users from DB.\n`);

  let imported = 0;
  let stateLogRows = 0;
  let skippedNoName = 0;

  for (const l of leads) {
    if (!l.id || !l.firstName) {
      skippedNoName++;
      continue;
    }
    const leadGenId = (await resolveUser(l.leadGen, true))!;
    const consultantId = await resolveUser(l.consultant, false);
    recordResolution('leadGen', l.leadGen, leadGenId);
    recordResolution('consultant', l.consultant, consultantId);
    const dispo = mapDisposition(l.disposition);
    const outcome = mapOutcome(l.outcome);
    const bookingDate = parseBookingDate(l.bookingDate);
    const stage = deriveStage(dispo, bookingDate);
    stageCount[stage]++;
    const ts = parseTs(l.timestamp);

    const dials = (() => {
      const n = parseInt(String(l.tpDials ?? ''), 10);
      return Number.isFinite(n) ? n : 0;
    })();

    const data = {
      firstName: String(l.firstName),
      surName: String(l.surname ?? ''),
      phone: l.phone ? String(l.phone) : null,
      email: l.email ? String(l.email) : null,
      address: l.address ? String(l.address) : null,
      postCode: l.postcode ? String(l.postcode) : null,
      state: l.state ? String(l.state) : null,
      billSpend: l.billSpend ? String(l.billSpend) : null,
      leadGenId,
      consultantId,
      source: mapSource(l.source),
      outcome,
      disposition: dispo,
      dials,
      leadGenNotes: l.leadGenNotes ? String(l.leadGenNotes) : null,
      consultantNotes: l.consultantNotes ? String(l.consultantNotes) : null,
      company: mapCompany(l.company),
      bookingDate,
      bookingTime: l.bookingTime ? String(l.bookingTime) : null,
      stage,
      convertedAt: stage === LeadStage.CONVERTED ? (ts ?? new Date()) : null,
    } as const;

    if (!DRY_RUN) {
      await prisma.lead.upsert({
        where: { id: String(l.id) },
        update: data,
        create: { id: String(l.id), ...(ts ? { timestamp: ts } : {}), ...data },
      });

      if (Array.isArray(l.stateLog) && l.stateLog.length > 0) {
        const changedBy =
          (await resolveUser(l._lastEditedBy, false)) ?? leadGenId;
        const changedAt = parseTs(l._lastEditedAt) ?? ts ?? new Date();
        await prisma.leadStateLog.create({
          data: {
            leadId: String(l.id),
            stage,
            leadGenId,
            consultantId,
            outcome,
            disposition: dispo,
            changedBy,
            changedAt,
          },
        });
        stateLogRows++;
      }
    } else if (Array.isArray(l.stateLog) && l.stateLog.length > 0) {
      stateLogRows++;
    }
    imported++;
  }

  // ---- summary ----------------------------------------------------------
  const line = (s: string) => console.log(s);
  line('===================== IMPORT SUMMARY =====================');
  line(`Leads processed:        ${imported}`);
  line(`Skipped (no id/name):   ${skippedNoName}`);
  line(`LeadStateLog snapshots: ${stateLogRows}`);
  line('');
  line('Stage distribution:');
  for (const [k, v] of Object.entries(stageCount)) line(`  ${k}: ${v}`);
  line('');
  line(`Placeholder users ${DRY_RUN ? 'to create' : 'created'}: ${createdPlaceholders.size}`);
  for (const p of [...createdPlaceholders].sort()) line(`  + ${p}`);
  line('');

  // ---- user-id resolution report ---------------------------------------
  const describe = (id: string | null) => {
    if (id === null) return '— (null)';
    const u = byId.get(id);
    if (!u) return id;
    const kind = u.email.endsWith(`@${PLACEHOLDER_DOMAIN}`) ? ' [placeholder]' : '';
    return `${u.name} <${u.email}> = ${u.id}${kind}`;
  };
  for (const field of ['leadGen', 'consultant'] as const) {
    line(`${field} → user id (label : count → resolved system user):`);
    const rows = [...resolution[field].entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [label, { count, id }] of rows) {
      line(`  ${JSON.stringify(label)} : ${count} → ${describe(id)}`);
    }
    line('');
  }
  line('source mapping (value -> enum):');
  for (const [k, v] of Object.entries(sourceTally).sort()) line(`  ${JSON.stringify(k)} -> ${v}`);
  line('');
  line('company mapping:');
  for (const [k, v] of Object.entries(companyTally).sort()) line(`  ${JSON.stringify(k)} -> ${v}`);
  line('');
  line('disposition mapping:');
  for (const [k, v] of Object.entries(dispoTally).sort()) line(`  ${JSON.stringify(k)} -> ${v}`);
  line('');
  line('outcome mapping:');
  for (const [k, v] of Object.entries(outcomeTally).sort()) line(`  ${JSON.stringify(k)} -> ${v}`);
  if (unmappedSource.size)
    line(`\n⚠ unmapped source values (fell back to default): ${[...unmappedSource].join(' | ')}`);
  if (unmappedCompany.size)
    line(`⚠ unmapped company values (fell back to default): ${[...unmappedCompany].join(' | ')}`);
  line('==========================================================');
  if (DRY_RUN) line('\nDRY RUN — no rows were written. Re-run without --dry-run to apply.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (!DRY_RUN) await prisma.$disconnect(); // no connection opened in dry-run
  });
