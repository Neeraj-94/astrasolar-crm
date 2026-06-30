/**
 * Import the transformed sold-lead records (prisma/data/sales-import.json) into
 * the CRM `Sale` table and its 1:1 / 1:n relation tables. Idempotent — sales are
 * UPSERTED by their lead id (one lead → at most one sale), so the script is safe
 * to re-run.
 *
 * Source: Sales.json produced from the Firebase export — sold leads reshaped to
 * the Sale schema and priced from the product catalogue via the app's pricing
 * engine. Each record already carries enum-valid strings (company, status,
 * saleType, systemType, StageState, InstallationStatus) plus nested blocks:
 *   systemDetails, statusDetails, installation, paymentDetails,
 *   commissioningDetails, extras[], finance[].
 * The non-schema provenance fields (_match, _pricing) are ignored on import.
 *
 * Mapping decisions:
 *  - Upsert by leadId (idempotent). Child rows are upserted by saleId; the
 *    repeating children (extras, finance) are rebuilt (deleteMany + recreate).
 *  - Sale.leadId is a FK to Lead. Leads must already be imported
 *    (npm run db:import-leads). Sales whose lead is missing are SKIPPED and
 *    listed in the summary (run leads first, then re-run this).
 *  - Sale.ownerId is a FK to User. The record's `ownerId` (the consultant slug,
 *    e.g. "burhan", "justin") is resolved to a real User the same way the lead
 *    importer resolves consultants: existing user by name/alias/first-name
 *    token (seeded from the Firebase userMap canonical hints). Unresolved
 *    non-empty owners get an inactive placeholder User so the FK is satisfied.
 *  - Decimals/ints/dates are coerced; nulls pass through untouched.
 *
 * Flags:
 *   --dry-run     resolve + validate everything, print the summary, write NOTHING.
 *   --limit=N     only process the first N sales (debugging).
 *
 * Run: npm run db:import-sales --workspace=@astra/api -- --dry-run
 *      npm run db:import-sales --workspace=@astra/api
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith('--limit='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

const PLACEHOLDER_PASSWORD = '!imported-no-login';
const PLACEHOLDER_DOMAIN = 'imported.astrasolar.local';

// Canonical users — same hints the lead importer uses (from the Firebase userMap).
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
// Coercion helpers
// ---------------------------------------------------------------------------
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const bool = (v: unknown): boolean | null =>
  v === null || v === undefined ? null : Boolean(v);
/** @db.Date — midnight UTC from 'YYYY-MM-DD' (or any parseable date). */
const dDate = (v: unknown): Date | null => {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
/** DateTime — full timestamp. */
const dTime = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

// ---------------------------------------------------------------------------
// User resolver (built from the live DB, augmented with placeholders).
// ---------------------------------------------------------------------------
type U = { id: string; email: string; name: string; aliases: string[] };
const byEmail = new Map<string, U>();
const byName = new Map<string, U>();
const byAlias = new Map<string, U>();
const byToken = new Map<string, U>();
const byId = new Map<string, U>();
const ownerCache = new Map<string, string>();
const createdPlaceholders = new Set<string>();
const ownerResolution = new Map<string, { count: number; id: string }>();

const stripCode = (label: string) => label.replace(/^\s*\d+\s*\//, '').trim();
const tokenize = (label: string) =>
  stripCode(label).toLowerCase().split(/[^a-z]+/).filter(Boolean);
const slugify = (label: string) =>
  stripCode(label).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
const isEmptyLabel = (v: unknown) => {
  const n = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return n === '' || n === 'none' || n === '-' || n === 'null';
};

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
    for (const c of CANONICAL) {
      const stub: U = { id: `user:${c.email}`, email: c.email, name: c.name, aliases: [] };
      indexUser(stub);
      for (const t of c.tokens) byToken.set(t, stub);
    }
    return;
  }
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, aliases: true },
  });
  for (const u of users) indexUser(u as U);
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
    create: { email, name, password: PLACEHOLDER_PASSWORD, isActive: false, aliases: [name] },
    select: { id: true, email: true, name: true, aliases: true },
  });
  indexUser(u as U);
  createdPlaceholders.add(`${name} <${email}>`);
  return u.id;
}

/** Resolve an owner/consultant label to a User id (required — never null). */
async function resolveOwner(label: unknown): Promise<string> {
  const raw = isEmptyLabel(label) ? 'Unknown (import)' : String(label);
  if (ownerCache.has(raw)) {
    const id = ownerCache.get(raw)!;
    bumpOwner(raw, id);
    return id;
  }
  const stripped = stripCode(raw).toLowerCase();
  let u = byEmail.get(stripped) || byName.get(stripped) || byAlias.get(stripped) || null;
  if (!u) {
    for (const t of tokenize(raw)) {
      if (byToken.has(t)) { u = byToken.get(t)!; break; }
    }
  }
  const id = u ? u.id : await getOrCreatePlaceholder(stripCode(raw) || raw);
  ownerCache.set(raw, id);
  bumpOwner(raw, id);
  return id;
}
function bumpOwner(label: string, id: string) {
  const cur = ownerResolution.get(label);
  if (cur) cur.count++;
  else ownerResolution.set(label, { count: 1, id });
}

// ---------------------------------------------------------------------------
// Field builders for each (nested) table — only schema columns, coerced.
// ---------------------------------------------------------------------------
function systemDetailsData(sd: any) {
  if (!sd) return null;
  return {
    batteryBrand: str(sd.batteryBrand), batteryModel: str(sd.batteryModel),
    batterySTC: int(sd.batterySTC), batteryModules: int(sd.batteryModules),
    batterySize: num(sd.batterySize), batteryRRP: num(sd.batteryRRP),
    batteryCommission: num(sd.batteryCommission),
    panelModel: str(sd.panelModel), panelWatt: int(sd.panelWatt),
    numPanels: int(sd.numPanels), systemSize: num(sd.systemSize),
    solarRRP: num(sd.solarRRP), solarSTC: int(sd.solarSTC),
    solarCommission: num(sd.solarCommission), solarProfit: num(sd.solarProfit),
    batteryProfit: num(sd.batteryProfit),
    inverterModel: str(sd.inverterModel), inverterType: str(sd.inverterType),
    optimisers: bool(sd.optimisers), tilts: int(sd.tilts),
    roofType: str(sd.roofType), storeys: int(sd.storeys),
    switchboard: str(sd.switchboard), nmi: str(sd.nmi), phase: str(sd.phase),
  };
}
const STAGE = (v: unknown) => str(v) ?? 'PENDING';
function statusDetailsData(s: any) {
  if (!s) return null;
  return {
    // financeStatus + preapprovalStatus use their own enums and are nullable —
    // pass through as-is (null when unknown), don't coerce to a StageState default.
    financeStatus: str(s.financeStatus), preapprovalStatus: str(s.preapprovalStatus),
    meterChangeStatus: STAGE(s.meterChangeStatus), installStatus: STAGE(s.installStatus),
    paymentStatus: STAGE(s.paymentStatus), commissioningStatus: STAGE(s.commissioningStatus),
    cesStatus: STAGE(s.cesStatus),
  };
}
function installationData(i: any) {
  if (!i) return null;
  return {
    installerId: str(i.installerId), status: str(i.status) ?? 'SCHEDULED',
    installDate: dDate(i.installDate), scheduledAt: dTime(i.scheduledAt),
    completedAt: dTime(i.completedAt), notes: str(i.notes),
    postInstallNotes: str(i.postInstallNotes), sortOrder: int(i.sortOrder),
  };
}

// summary
const enumTally = {
  status: {} as Record<string, number>,
  saleType: {} as Record<string, number>,
  systemType: {} as Record<string, number>,
  company: {} as Record<string, number>,
};
const bump = (m: Record<string, number>, k: unknown) => { const s = String(k); m[s] = (m[s] || 0) + 1; };

async function main() {
  // Default to the curated sales-import.json; override with --file=<name> to load
  // a different data file (e.g. --file=sales-from-sold-leads.json). A bare name
  // resolves under prisma/data; an absolute path is used as-is.
  const fileArg = process.argv.find((x) => x.startsWith('--file='))?.split('=')[1];
  const file = fileArg
    ? (path.isAbsolute(fileArg) ? fileArg : path.join(__dirname, 'data', fileArg))
    : path.join(__dirname, 'data', 'sales-import.json');
  const all = JSON.parse(fs.readFileSync(file, 'utf8')).sales as any[];
  const sales = all.slice(0, LIMIT);
  console.log(
    `\n${DRY_RUN ? '[DRY RUN] ' : ''}Importing ${sales.length} of ${all.length} sales from ${path.relative(process.cwd(), file)}\n`,
  );

  await loadUsers();
  console.log(`Loaded ${byEmail.size} existing users.\n`);

  let imported = 0;
  let childRows = 0;
  let skippedNoLead = 0;
  let skippedNoId = 0;
  const missingLeads: string[] = [];

  for (const sale of sales) {
    if (!sale.leadId) { skippedNoId++; continue; }
    const leadId = String(sale.leadId);

    // Sale.leadId is a FK — the Lead must exist (skip + report otherwise).
    // Also inherit the lead's company when the sale record has none.
    let leadCompany: string | null = null;
    if (!DRY_RUN) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, company: true } });
      if (!lead) { skippedNoLead++; missingLeads.push(leadId); continue; }
      leadCompany = (lead.company as string | null) ?? null;
    }

    const ownerId = await resolveOwner(sale.ownerId);

    bump(enumTally.status, sale.status);
    bump(enumTally.saleType, sale.saleType);
    bump(enumTally.systemType, sale.systemType);
    bump(enumTally.company, sale.company);

    const saleData = {
      saleRef: str(sale.saleRef),
      ownerId,
      company: str(sale.company) ?? leadCompany ?? 'ASTRA',
      status: str(sale.status) ?? 'NEGOTIATION',
      saleType: str(sale.saleType),
      systemType: str(sale.systemType),
      energyProvider: str(sale.energyProvider),
      referral: str(sale.referral),
      soldPrice: num(sale.soldPrice),
      totalRRP: num(sale.totalRRP),
      totalCommission: num(sale.totalCommission),
      difference: num(sale.difference),
      totalProfit: num(sale.totalProfit),
      saleDate: dDate(sale.saleDate),
      closedAt: dTime(sale.closedAt),
      installNotes: str(sale.installNotes),
      sortOrder: int(sale.sortOrder),
    };

    if (DRY_RUN) { imported++; continue; }

    await prisma.$transaction(async (tx) => {
      const created = dTime(sale.createdAt) ?? undefined;
      const saved = await tx.sale.upsert({
        where: { leadId },
        update: saleData as any,
        create: {
          id: str(sale.id) ?? undefined,
          leadId,
          ...(saleData as any),
          ...(created ? { createdAt: created } : {}),
        },
      });
      const saleId = saved.id;

      const sd = systemDetailsData(sale.systemDetails);
      if (sd) {
        await tx.systemDetails.upsert({ where: { saleId }, update: sd as any, create: { saleId, ...(sd as any) } });
        childRows++;
      }
      const st = statusDetailsData(sale.statusDetails);
      if (st) {
        await tx.saleStatusDetails.upsert({ where: { saleId }, update: st as any, create: { saleId, ...(st as any) } });
        childRows++;
      }
      const inst = installationData(sale.installation);
      if (inst) {
        await tx.installation.upsert({ where: { saleId }, update: inst as any, create: { saleId, ...(inst as any) } });
        childRows++;
      }
      if (sale.paymentDetails) {
        const pd = { paymentNotes: str(sale.paymentDetails.paymentNotes), paymentDate: dDate(sale.paymentDetails.paymentDate) };
        await tx.paymentDetails.upsert({ where: { saleId }, update: pd as any, create: { saleId, ...(pd as any) } });
        childRows++;
      }
      if (sale.commissioningDetails) {
        const cd = { commissioningNotes: str(sale.commissioningDetails.commissioningNotes), commissionDate: dDate(sale.commissioningDetails.commissionDate) };
        await tx.commissioningDetails.upsert({ where: { saleId }, update: cd as any, create: { saleId, ...(cd as any) } });
        childRows++;
      }

      // Repeating children — rebuild for idempotency.
      await tx.saleExtra.deleteMany({ where: { saleId } });
      if (Array.isArray(sale.extras) && sale.extras.length) {
        await tx.saleExtra.createMany({
          data: sale.extras.map((e: any) => ({
            saleId, itemName: String(e.itemName ?? 'Item'), itemRef: str(e.itemRef),
            itemPrice: num(e.itemPrice) ?? 0, profit: num(e.profit),
          })),
        });
        childRows += sale.extras.length;
      }
      await tx.saleFinance.deleteMany({ where: { saleId } });
      if (Array.isArray(sale.finance) && sale.finance.length) {
        await tx.saleFinance.createMany({
          data: sale.finance.map((f: any) => ({
            saleId, lender: str(f.lender), amount: num(f.amount),
            termMonths: int(f.termMonths), status: str(f.status) ?? 'PENDING',
          })),
        });
        childRows += sale.finance.length;
      }
    });
    imported++;
  }

  // ---- summary ----------------------------------------------------------
  const line = (s: string) => console.log(s);
  line('===================== SALES IMPORT SUMMARY =====================');
  line(`Sales ${DRY_RUN ? 'validated' : 'imported'}:   ${imported}`);
  line(`Child rows written:    ${childRows}`);
  line(`Skipped (no leadId):   ${skippedNoId}`);
  line(`Skipped (lead missing):${skippedNoLead}`);
  line('');
  for (const [name, m] of Object.entries(enumTally)) {
    line(`${name}: ${Object.entries(m).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  line('');
  line(`Placeholder users ${DRY_RUN ? 'to create' : 'created'}: ${createdPlaceholders.size}`);
  for (const p of [...createdPlaceholders].sort()) line(`  + ${p}`);
  line('');
  const describe = (id: string) => {
    const u = byId.get(id);
    if (!u) return id;
    const kind = u.email.endsWith(`@${PLACEHOLDER_DOMAIN}`) ? ' [placeholder]' : '';
    return `${u.name} <${u.email}>${kind}`;
  };
  line('owner → user (label : count → resolved):');
  for (const [label, { count, id }] of [...ownerResolution.entries()].sort((a, b) => b[1].count - a[1].count)) {
    line(`  ${JSON.stringify(label)} : ${count} → ${describe(id)}`);
  }
  if (missingLeads.length) {
    line('');
    line(`⚠ ${missingLeads.length} sales skipped — lead not found (import leads first, then re-run):`);
    for (const id of missingLeads.slice(0, 30)) line(`    ${id}`);
    if (missingLeads.length > 30) line(`    … and ${missingLeads.length - 30} more`);
  }
  line('================================================================');
  if (DRY_RUN) line('\nDRY RUN — no rows were written. Re-run without --dry-run to apply.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { if (!DRY_RUN) await prisma.$disconnect(); });
