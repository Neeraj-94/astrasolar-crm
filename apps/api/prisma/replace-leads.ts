/**
 * REPLACE ALL LEADS  —  destructive, transactional, guarded.
 *
 * Deletes every Lead and all lead-linked child records, then inserts the
 * deduped leads from `prisma/data/leads-deduped.json` (the phone-deduped array
 * with nested `stateLog`). Owner fields in that file are CANONICAL EMAILS (or
 * name-like labels for non-roster people); they are resolved to real `User.id`
 * values against the live DB at run time, creating inactive placeholder users
 * for any label that doesn't match an existing user.
 *
 * WHY A REPLACE (not an upsert): the source was deduplicated by phone, so the
 * original per-row Firebase `id`s were merged away. New UUIDs are generated for
 * every inserted lead.
 *
 * WHAT GETS WIPED (because Sale.leadId / Booking.leadId are REQUIRED, so every
 * sale/booking belongs to a lead): customer, installation, systemDetails,
 * saleStatusDetails, saleExtra, saleFinance, paymentDetails, commissioningDetails,
 * postInstallIssue, saleLog, saleStageHistory, rrpRequest, sale, booking,
 * leadStateLog, leadChecklist, lead-linked activities. Appointments are detached
 * (leadId -> null) rather than deleted (schema onDelete: SetNull).
 *
 * SAFETY:
 *   - DRY RUN BY DEFAULT. Prints current row counts + the resolution/insert plan
 *     and writes NOTHING.
 *   - To actually run you must pass BOTH flags:  --confirm --yes-delete-all
 *   - On a real run it first writes a full JSON backup of everything it is about
 *     to delete to  prisma/backups/leads-backup-<timestamp>.json
 *   - All deletes + inserts run inside ONE transaction: any error rolls back the
 *     whole thing (the pre-deletion backup is your extra safety net).
 *
 * Run (preview):  npm run db:replace-leads --workspace=@astra/api
 * Run (apply):    npm run db:replace-leads --workspace=@astra/api -- --confirm --yes-delete-all
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const CONFIRM = process.argv.includes('--confirm') && process.argv.includes('--yes-delete-all');
const DATA_FILE = path.join(__dirname, 'data', 'leads-deduped.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

const PLACEHOLDER_PASSWORD = '!imported-no-login';
const PLACEHOLDER_DOMAIN = 'imported.astrasolar.local';
const UNKNOWN_NAME = 'Unknown (import)';

// ---------------------------------------------------------------------------
// User resolution (email-first; labels fall back to name/token, then placeholder)
// ---------------------------------------------------------------------------
type U = { id: string; email: string; name: string; aliases: string[] };
const byEmail = new Map<string, U>();
const byName = new Map<string, U>();
const byAlias = new Map<string, U>();
const byToken = new Map<string, U>();
const resolveCache = new Map<string, string>();
const placeholdersCreated = new Set<string>();

function indexUser(u: U) {
  byEmail.set(u.email.toLowerCase(), u);
  byName.set(u.name.trim().toLowerCase(), u);
  for (const a of u.aliases || []) byAlias.set(a.trim().toLowerCase(), u);
  const t = u.name.trim().toLowerCase().split(/\s+/)[0];
  if (t && !byToken.has(t)) byToken.set(t, u);
}

async function loadUsers() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, aliases: true },
  });
  for (const u of users) indexUser(u as U);
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
const nameFromEmail = (email: string) => {
  const local = email.split('@')[0].replace(/[._]+/g, ' ').trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase()) || email;
};

async function getOrCreatePlaceholder(email: string, name: string): Promise<string> {
  const hit = byEmail.get(email.toLowerCase());
  if (hit) return hit.id;
  const u = (await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, password: PLACEHOLDER_PASSWORD, isActive: false, aliases: [name] },
    select: { id: true, email: true, name: true, aliases: true },
  })) as U;
  indexUser(u);
  placeholdersCreated.add(`${name} <${email}>`);
  return u.id;
}

/**
 * value semantics in the deduped file:
 *   - an email  -> match by email (or placeholder with that email)
 *   - a label   -> match by name/token (or placeholder named after the label)
 *   - '' / null -> required ? Unknown(import) : null
 */
async function resolveOwner(value: unknown, required: boolean): Promise<string | null> {
  const raw = value == null ? '' : String(value).trim();
  if (raw === '') {
    if (!required) return null;
    return getOrCreatePlaceholder(`imported.${slugify(UNKNOWN_NAME)}@${PLACEHOLDER_DOMAIN}`, UNKNOWN_NAME);
  }
  if (resolveCache.has(raw)) return resolveCache.get(raw)!;

  let id: string;
  if (raw.includes('@')) {
    const u = byEmail.get(raw.toLowerCase());
    id = u ? u.id : await getOrCreatePlaceholder(raw.toLowerCase(), nameFromEmail(raw));
  } else {
    const key = raw.toLowerCase();
    let u = byName.get(key) || byAlias.get(key) || null;
    if (!u) for (const t of key.split(/[^a-z]+/)) if (t && byToken.has(t)) { u = byToken.get(t)!; break; }
    id = u ? u.id : await getOrCreatePlaceholder(`imported.${slugify(raw)}@${PLACEHOLDER_DOMAIN}`, raw);
  }
  resolveCache.set(raw, id);
  return id;
}

// ---------------------------------------------------------------------------
const toDateOnly = (s: unknown): Date | null => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00.000Z`);
};
const toDateTime = (s: unknown): Date | null => {
  if (typeof s !== 'string' || !s.trim()) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

// child tables wiped wholesale, in FK-safe order (deepest first)
const WIPE_ORDER = [
  'customer', 'installation', 'systemDetails', 'saleStatusDetails', 'saleExtra',
  'saleFinance', 'paymentDetails', 'commissioningDetails', 'postInstallIssue',
  'saleLog', 'saleStageHistory', 'rrpRequest', 'sale', 'booking',
  'leadStateLog', 'leadChecklist', 'appointment',
] as const;

async function currentCounts() {
  const counts: Record<string, number> = {};
  for (const m of [...WIPE_ORDER, 'activity', 'lead']) {
    // @ts-ignore dynamic model access
    counts[m] = await prisma[m].count();
  }
  return counts;
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) throw new Error(`Data file not found: ${DATA_FILE}`);
  const leads = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) as any[];
  if (!Array.isArray(leads)) throw new Error('Data file must be a JSON array of leads.');

  console.log(`\n${CONFIRM ? '' : '[DRY RUN] '}Replace-leads: ${leads.length} leads from ${path.relative(process.cwd(), DATA_FILE)}\n`);

  await loadUsers();
  console.log(`Loaded ${byEmail.size} existing users.\n`);

  const before = await currentCounts();
  console.log('Current row counts (will be deleted unless noted):');
  for (const [k, v] of Object.entries(before)) {
    const note = k === 'appointment' ? '  (deleted; schedule is rebuilt by db:import-lead-appointments)' :
                 k === 'activity' ? '  (only rows with leadId set are deleted)' : '';
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(7)}${note}`);
  }
  console.log('');

  // ---- resolve owners + build insert rows -------------------------------
  const leadRows: any[] = [];
  const stateLogRows: any[] = [];
  let withLog = 0;
  const leadGenTally = new Map<string, number>();

  for (const l of leads) {
    if (!l.firstName) continue;
    // Honour a stable id from the data file (so lead-linked imports like
    // sales-from-sold-leads.json can reference leadId); fall back to a new uuid.
    const id = (typeof l.id === 'string' && l.id) ? l.id : randomUUID();
    const leadGenId = (await resolveOwner(l.leadGenId, true))!;
    const consultantId = await resolveOwner(l.consultantId, false);
    leadGenTally.set(leadGenId, (leadGenTally.get(leadGenId) ?? 0) + 1);

    const bookingDate = toDateOnly(l.bookingDate);
    const firstChange = Array.isArray(l.stateLog) && l.stateLog.length
      ? toDateTime(l.stateLog[0].changedAt) : null;
    const stage = l.stage || (l.disposition === 'SOLD' ? 'CONVERTED' : bookingDate ? 'BOOKED' : 'INTAKE');

    leadRows.push({
      id,
      ...(firstChange ? { timestamp: firstChange } : {}),
      firstName: String(l.firstName),
      surName: String(l.surName ?? ''),
      phone: l.phone || null,
      email: l.email || null,
      address: l.address || null,
      postCode: l.postCode || null,
      state: l.state || null,
      billSpend: l.billSpend || null,
      code: l.code || null,
      leadGenId,
      consultantId,
      source: l.source || 'BLOOM_ASTRA',
      outcome: l.outcome ?? null,
      disposition: l.disposition ?? null,
      dials: Number.isFinite(l.dials) ? l.dials : 0,
      leadGenNotes: l.leadGenNotes || null,
      consultantNotes: l.consultantNotes || null,
      company: l.company || 'ASTRA',
      bookingDate,
      bookingTime: l.bookingTime || null,
      stage,
      convertedAt: stage === 'CONVERTED' ? (toDateTime(l.bookingDate + 'T00:00:00Z') ?? new Date()) : null,
    });

    if (Array.isArray(l.stateLog) && l.stateLog.length) {
      withLog++;
      for (const e of l.stateLog) {
        const changedBy = (await resolveOwner(e.changedBy, false)) ?? leadGenId;
        stateLogRows.push({
          leadId: id,
          stage: e.stage || stage,
          leadGenId,
          consultantId,
          outcome: e.outcome ?? null,
          disposition: e.disposition ?? null,
          changedBy,
          ...(toDateTime(e.changedAt) ? { changedAt: toDateTime(e.changedAt) } : {}),
        });
      }
    }
  }

  console.log(`Prepared ${leadRows.length} lead rows, ${stateLogRows.length} stateLog rows (from ${withLog} leads).`);
  console.log(`Placeholder users ${CONFIRM ? 'created' : 'to create'}: ${placeholdersCreated.size}`);
  for (const p of [...placeholdersCreated].sort()) console.log(`  + ${p}`);
  console.log('');

  if (!CONFIRM) {
    console.log('DRY RUN — nothing was deleted or written.');
    console.log('To apply:  npm run db:replace-leads --workspace=@astra/api -- --confirm --yes-delete-all\n');
    return;
  }

  // ---- backup everything we are about to delete -------------------------
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `leads-backup-${stamp}.json`);
  const backup: Record<string, any> = { takenAt: new Date().toISOString(), counts: before };
  backup.lead = await prisma.lead.findMany();
  backup.leadStateLog = await prisma.leadStateLog.findMany();
  backup.leadChecklist = await prisma.leadChecklist.findMany();
  backup.booking = await prisma.booking.findMany();
  backup.sale = await prisma.sale.findMany();
  backup.customer = await prisma.customer.findMany();
  backup.installation = await prisma.installation.findMany();
  backup.activityWithLead = await prisma.activity.findMany({ where: { leadId: { not: null } } });
  backup.appointment = await prisma.appointment.findMany();
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Backup written: ${path.relative(process.cwd(), backupFile)}\n`);

  // ---- transactional wipe + insert --------------------------------------
  await prisma.$transaction(async (tx) => {
    // delete lead-linked activities only
    const act = await tx.activity.deleteMany({ where: { leadId: { not: null } } });
    console.log(`Deleted lead activities: ${act.count}`);
    for (const m of WIPE_ORDER) {
      // @ts-ignore dynamic model access
      const r = await tx[m].deleteMany({});
      console.log(`Deleted ${m}: ${r.count}`);
    }
    const del = await tx.lead.deleteMany({});
    console.log(`Deleted leads: ${del.count}`);

    // insert
    await tx.lead.createMany({ data: leadRows });
    if (stateLogRows.length) await tx.leadStateLog.createMany({ data: stateLogRows });
    console.log(`Inserted leads: ${leadRows.length}, stateLog: ${stateLogRows.length}`);
  }, { timeout: 120_000 });

  const after = await currentCounts();
  console.log('\nDone. New counts: lead=%d, leadStateLog=%d', after.lead, after.leadStateLog);
}

main()
  .catch((e) => { console.error('\nFAILED (rolled back):', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
