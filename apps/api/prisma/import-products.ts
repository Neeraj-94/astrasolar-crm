/**
 * Import the legacy astrasolar.app product catalogue
 * (prisma/data/products-combined.json) into the CURRENT split catalogue schema:
 *   InverterProduct, BatteryProduct, ExtraProduct,
 *   BatteryInverterCompat (+ BatteryComboContextPrice) and their *Log siblings.
 *
 * (Rewritten 30/06/2026 — the previous version targeted a unified `Product` /
 *  `BatteryCombo` schema that no longer exists. SOLAR products are intentionally
 *  NOT handled here: they are owned by the maintained `db:seed-solar-products*`
 *  scripts.)
 *
 * Source layout:
 *   app.batteries.{default,tasmania}.{solar_battery,battery_only}[]  ← combo matrix
 *   app.inverters.discontinued[]                                      ← model strings
 *   app.extras.{main,country,battery}[]                               ← add-on line items
 *   database.{inverters,extras,...}                                   ← Firebase overrides
 *
 * Mapping:
 *  - Unique inverter / battery MODEL strings (from every combo row) become one
 *    InverterProduct / BatteryProduct each. phase = the single phase if a model
 *    only ever appears at one phase, else null. brand inferred from the model.
 *  - Battery intrinsics (size kWh, modules = module_S + module_M, STC, profit,
 *    commission) come from a representative DEFAULT combo for that battery.
 *  - DEFAULT-region combos (states []) create a BatteryInverterCompat pair +
 *    one BatteryComboContextPrice per context (SOLAR_BATTERY / BATTERY_ONLY)
 *    with grossPrice + current RRP (rrpAfter30Mar ?? rrpAfter), and price-history
 *    log rows (before @ 01/01/2025, after @ 21/03/2026, 30Mar @ 30/03/2026).
 *  - TASMANIA combos: the products are shared, but the current schema has NO
 *    region dimension on combo pricing, so TAS combo PRICES are skipped and
 *    reported (would need a schema change to store).
 *  - Extras -> ExtraProduct (category = source group). Active custom Firebase
 *    extras included; zero-priced "Override of built-in product" rows skipped.
 *  - Discontinued custom inverters -> InverterProduct(status DISCONTINUED).
 *
 * Idempotent: products are matched by name and only created once (logs are
 * written only on first create); compat + combo-price rows are upserted by their
 * unique keys. Safe to re-run.
 *
 * Flags:  --dry-run   resolve + map everything, print the summary, write NOTHING.
 *
 * Run: npm run db:import-products --workspace=@astra/api
 *      npm run db:import-products --workspace=@astra/api -- --dry-run
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const IMPORT_USER = 'import';
const D_BEFORE = new Date('2025-01-01T00:00:00.000Z');
const D_AFTER = new Date('2026-03-21T00:00:00.000Z');
const D_AFTER_30MAR = new Date('2026-03-30T00:00:00.000Z');

type ComboRow = {
  phase: number; inverter: string; battery: string;
  profit?: number; commission?: number; grossPrice?: number;
  module_S?: number; module_M?: number;
  stcBefore?: number; stcAfter?: number;
  rrpBefore?: number; rrpAfter?: number; rrpAfter30Mar?: number;
  stc?: number; rrp?: number;
};
type ExtraRow = { id: string; name: string; price: number; unit?: string; perUnit?: string; note?: string };

function brandOf(model: string): string | undefined {
  if (/^(GW|LX)/i.test(model)) return 'GoodWe';
  if (/^(H1|H3|KH|EQ|CQ)/i.test(model)) return 'Fox ESS';
  if (/^Fronius/i.test(model)) return 'Fronius';
  if (/^X1-/i.test(model)) return 'SolaX';
  return undefined;
}
function kwhOf(model: string): number | undefined {
  const m = model.match(/\(([\d.]+)\s*kWh\)/i);
  if (m) return parseFloat(m[1]);
  const lx = model.match(/^LX\s+F([\d.]+)/i);
  if (lx) return parseFloat(lx[1]);
  return undefined;
}
const single = (s: Set<number>) => (s.size === 1 ? [...s][0] : null);

const counts = {
  inverters: 0, batteries: 0, extras: 0, compat: 0, comboPrices: 0,
  logs: 0, skippedTasCombo: 0, skippedOverride: 0,
};

async function main() {
  const file = path.join(__dirname, 'data', 'products-combined.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Importing catalogue from ${path.relative(process.cwd(), file)}\n`);

  const defaultSets = [
    { rows: (data.app.batteries.default.solar_battery ?? []) as ComboRow[], context: 'SOLAR_BATTERY' as const },
    { rows: (data.app.batteries.default.battery_only ?? []) as ComboRow[], context: 'BATTERY_ONLY' as const },
  ];
  const tasSets = [
    ...(data.app.batteries.tasmania?.solar_battery ?? []),
    ...(data.app.batteries.tasmania?.battery_only ?? []),
  ] as ComboRow[];
  const allCombo = [...defaultSets.flatMap((s) => s.rows), ...tasSets];

  // ---- gather unique inverter / battery model metadata --------------------
  const invPhase = new Map<string, Set<number>>();
  const batMeta = new Map<string, { phases: Set<number>; modules?: number; stc?: number; profit?: number; commission?: number }>();
  for (const r of allCombo) {
    if (r.inverter) (invPhase.get(r.inverter) ?? invPhase.set(r.inverter, new Set()).get(r.inverter)!).add(r.phase);
    if (r.battery) {
      if (!batMeta.has(r.battery)) {
        batMeta.set(r.battery, {
          phases: new Set(),
          modules: r.module_S != null || r.module_M != null ? (r.module_S ?? 0) + (r.module_M ?? 0) : undefined,
        });
      }
      const m = batMeta.get(r.battery)!;
      m.phases.add(r.phase);
      // capture representative intrinsics from a default solar_battery row
      if (m.stc == null && r.stcAfter != null) m.stc = r.stcAfter;
      if (m.profit == null && r.profit != null) m.profit = r.profit;
      if (m.commission == null && r.commission != null) m.commission = r.commission;
    }
  }

  const discontinued = new Set<string>(data.app.inverters?.discontinued ?? []);
  for (const row of Object.values<any>(data.database?.inverters ?? {})) {
    if (row.status === 'discontinued' && row.model) discontinued.add(row.model);
  }

  // ---- inverters ----------------------------------------------------------
  const inverterId = new Map<string, string>();
  for (const [model, phases] of invPhase) {
    const id = await findOrCreateInverter(model, single(phases), discontinued.has(model));
    inverterId.set(model, id);
  }
  // discontinued-only custom inverters that never appear in a combo
  for (const row of Object.values<any>(data.database?.inverters ?? {})) {
    if (row.status === 'discontinued' && row.model && !inverterId.has(row.model)) {
      inverterId.set(row.model, await findOrCreateInverter(row.model, row.phase ?? null, true, row.brand));
    }
  }

  // ---- batteries ----------------------------------------------------------
  const batteryId = new Map<string, string>();
  for (const [model, meta] of batMeta) {
    batteryId.set(model, await findOrCreateBattery(model, meta));
  }

  // ---- default-region compat + combo context pricing ----------------------
  for (const set of defaultSets) {
    for (const r of set.rows) {
      const invId = inverterId.get(r.inverter);
      const batId = batteryId.get(r.battery);
      if (!invId || !batId) continue;
      const compatId = await upsertCompat(invId, batId);
      const rrp = r.rrpAfter30Mar ?? r.rrpAfter ?? null;
      await upsertComboPrice(compatId, set.context, r.grossPrice ?? null, rrp, r);
    }
  }
  // TAS combo prices can't be stored (no region dimension on combo pricing)
  counts.skippedTasCombo = tasSets.length;

  // ---- extras -------------------------------------------------------------
  const extraGroups: Array<{ rows: ExtraRow[]; category: string }> = [
    { rows: data.app.extras?.main ?? [], category: 'Main' },
    { rows: data.app.extras?.country ?? [], category: 'Country' },
    { rows: data.app.extras?.battery ?? [], category: 'Battery' },
  ];
  for (const g of extraGroups) for (const row of g.rows) await findOrCreateExtra(row, g.category);
  for (const row of Object.values<any>(data.database?.extras ?? {})) {
    if (row.status === 'active') await findOrCreateExtra(row, 'Custom');
  }

  // zero-priced battery/solar overrides are test data — skipped by design
  counts.skippedOverride =
    Object.keys(data.database?.batteries ?? {}).length +
    Object.keys(data.database?.solar ?? {}).length;

  // ---- summary ------------------------------------------------------------
  console.log('===================== IMPORT SUMMARY =====================');
  console.log(`InverterProduct created   : ${counts.inverters}`);
  console.log(`BatteryProduct created    : ${counts.batteries}`);
  console.log(`ExtraProduct created      : ${counts.extras}`);
  console.log(`Compat pairs (default)    : ${counts.compat}`);
  console.log(`Combo context prices      : ${counts.comboPrices}`);
  console.log(`Log rows                  : ${counts.logs}`);
  console.log(`Skipped TAS combo prices  : ${counts.skippedTasCombo}  (no region dimension in schema)`);
  console.log(`Skipped FB overrides      : ${counts.skippedOverride}  (zero-priced test data)`);
  console.log('==========================================================');
  if (DRY_RUN) console.log('\nDRY RUN — no rows were written.');
}

// ---------------------------------------------------------------------------
async function findOrCreateInverter(model: string, phase: number | null, isDisc: boolean, brand?: string): Promise<string> {
  const existing = await prisma.inverterProduct.findFirst({ where: { productName: model }, select: { id: true } });
  if (existing) return existing.id;
  counts.inverters++;
  if (DRY_RUN) return `dry:inv:${model}`;
  const p = await prisma.inverterProduct.create({
    data: {
      productName: model, inverterModel: model, brand: brand || brandOf(model) || null,
      phase, states: [], status: isDisc ? 'DISCONTINUED' : 'ACTIVE',
      notes: isDisc ? 'Imported as discontinued from legacy app' : null,
      logs: { create: [{ field: 'status', oldValue: null, newValue: isDisc ? 'DISCONTINUED' : 'ACTIVE', effectiveDate: D_AFTER_30MAR, changedBy: IMPORT_USER }] },
    },
    select: { id: true },
  });
  counts.logs++;
  return p.id;
}

async function findOrCreateBattery(model: string, meta: { phases: Set<number>; modules?: number; stc?: number; profit?: number; commission?: number }): Promise<string> {
  const existing = await prisma.batteryProduct.findFirst({ where: { productName: model }, select: { id: true } });
  if (existing) return existing.id;
  counts.batteries++;
  if (DRY_RUN) return `dry:bat:${model}`;
  const p = await prisma.batteryProduct.create({
    data: {
      productName: model, batteryModel: model, brand: brandOf(model) || null,
      batterySize: kwhOf(model) ?? null, modules: meta.modules ?? null, phase: single(meta.phases),
      batteryStc: meta.stc ?? null, batteryCommission: meta.commission ?? null, profit: meta.profit ?? null,
      effectiveDate: D_AFTER_30MAR, states: [], status: 'ACTIVE',
      logs: { create: [{ field: 'effectiveDate', oldValue: null, newValue: '2026-03-30', effectiveDate: D_AFTER_30MAR, changedBy: IMPORT_USER }] },
    },
    select: { id: true },
  });
  counts.logs++;
  return p.id;
}

async function findOrCreateExtra(row: ExtraRow & { perUnit?: string }, category: string): Promise<void> {
  const existing = await prisma.extraProduct.findFirst({ where: { itemName: row.name }, select: { id: true } });
  if (existing) return;
  counts.extras++;
  if (DRY_RUN) return;
  await prisma.extraProduct.create({
    data: {
      itemName: row.name, category, unit: row.unit ?? null, unitPrice: row.price ?? null,
      notes: [row.perUnit, row.note].filter(Boolean).join(' — ') || null,
      logs: { create: [{ field: 'unitPrice', oldValue: null, newValue: String(row.price ?? ''), effectiveDate: D_AFTER_30MAR, changedBy: IMPORT_USER }] },
    },
  });
  counts.logs++;
}

async function upsertCompat(inverterId: string, batteryId: string): Promise<string> {
  if (DRY_RUN) { counts.compat++; return `dry:compat:${inverterId}:${batteryId}`; }
  const existing = await prisma.batteryInverterCompat.findUnique({
    where: { inverterId_batteryId: { inverterId, batteryId } }, select: { id: true },
  });
  if (existing) return existing.id;
  counts.compat++;
  const c = await prisma.batteryInverterCompat.create({
    data: { inverterId, batteryId, isActive: true, createdById: null }, select: { id: true },
  });
  return c.id;
}

async function upsertComboPrice(compatId: string, context: 'SOLAR_BATTERY' | 'BATTERY_ONLY', grossPrice: number | null, rrp: number | null, r: ComboRow): Promise<void> {
  if (DRY_RUN) { counts.comboPrices++; return; }
  const existing = await prisma.batteryComboContextPrice.findUnique({
    where: { compatId_context: { compatId, context } }, select: { id: true },
  });
  if (existing) return;
  counts.comboPrices++;
  const logs = [] as Array<{ field: string; oldValue: string | null; newValue: string | null; effectiveDate: Date; changedBy: string }>;
  if (r.rrpBefore != null) logs.push({ field: 'batteryRrp', oldValue: null, newValue: String(r.rrpBefore), effectiveDate: D_BEFORE, changedBy: IMPORT_USER });
  if (r.rrpAfter != null) logs.push({ field: 'batteryRrp', oldValue: r.rrpBefore != null ? String(r.rrpBefore) : null, newValue: String(r.rrpAfter), effectiveDate: D_AFTER, changedBy: IMPORT_USER });
  if (r.rrpAfter30Mar != null && r.rrpAfter30Mar !== r.rrpAfter) logs.push({ field: 'batteryRrp', oldValue: String(r.rrpAfter), newValue: String(r.rrpAfter30Mar), effectiveDate: D_AFTER_30MAR, changedBy: IMPORT_USER });
  await prisma.batteryComboContextPrice.create({
    data: {
      compatId, context, grossPrice, batteryRrp: rrp, effectiveDate: D_AFTER_30MAR,
      ...(logs.length ? { logs: { create: logs } } : {}),
    },
  });
  counts.logs += logs.length;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { if (!DRY_RUN) await prisma.$disconnect(); });
