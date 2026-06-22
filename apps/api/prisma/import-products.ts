/**
 * One-off import of the legacy astrasolar.app product catalogue
 * (prisma/data/products-combined.json) into the CRM Product/BatteryCombo
 * tables. Idempotent — products are upserted by productRef and combos are
 * skipped if an identical row already exists. Safe to run repeatedly.
 *
 * Mapping decisions (agreed 11/06/2026):
 *  - Solar "standard" -> pricingTier BLOOME, "special" -> BRIGHTE
 *  - Non-Tasmania ("default"/ACT) pricing -> states [] (all states);
 *    Tasmania -> states ["TAS"]
 *  - Inverter+battery combos -> BatteryCombo rows (pricing matrix); the
 *    combo's CURRENT rrp = rrpAfter30Mar ?? rrpAfter, current stc = stcAfter.
 *    History goes to BatteryComboLog: rrpBefore/stcBefore @ 01/01/2025,
 *    rrpAfter @ 21/03/2026, rrpAfter30Mar @ 30/03/2026.
 *  - module_S + module_M are summed into Product.batteryModules
 *  - Zero-priced Firebase overrides are SKIPPED; custom extras are imported;
 *    discontinued models (3x GoodWe + SolaX X1-VAST-8K) -> DISCONTINUED.
 *
 * Run: npm run db:import-products --workspace=@astra/api
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const IMPORT_USER = 'import';
const D_BEFORE = new Date('2025-01-01T00:00:00.000Z'); // rrpBefore / stcBefore
const D_AFTER = new Date('2026-03-21T00:00:00.000Z'); // rrpAfter (21/03/2026)
const D_AFTER_30MAR = new Date('2026-03-30T00:00:00.000Z'); // rrpAfter30Mar

// ---------------------------------------------------------------------------

type SolarRow = { size: number; rrp: number; profit: number; commission: number };
type ComboRow = {
  phase: number;
  inverter: string;
  battery: string;
  profit: number;
  commission: number;
  grossPrice: number;
  module_S?: number;
  module_M?: number;
  // default region:
  stcBefore?: number;
  stcAfter?: number;
  rrpBefore?: number;
  rrpAfter?: number;
  rrpAfter30Mar?: number;
  // tasmania region (flat):
  stc?: number;
  rrp?: number;
};
type ExtraRow = {
  id: string;
  name: string;
  price: number;
  unit?: string;
  perUnit?: string;
  note?: string;
};

const DISCONTINUED_NOTE = 'Imported as discontinued from legacy app';

function brandOf(model: string): string | undefined {
  if (/^(GW|LX)/i.test(model)) return 'GoodWe';
  if (/^(H1|H3|KH|EQ|CQ)/i.test(model)) return 'Fox ESS';
  if (/^Fronius/i.test(model)) return 'Fronius';
  if (/^X1-/i.test(model)) return 'SolaX';
  return undefined;
}

/** "(16.6kWh)" / "(13.98 kWh)" in the model string, or LX F<kWh> models. */
function kwhOf(model: string): number | undefined {
  const m = model.match(/\(([\d.]+)\s*kWh\)/i);
  if (m) return parseFloat(m[1]);
  const lx = model.match(/^LX\s+F([\d.]+)/i);
  if (lx) return parseFloat(lx[1]);
  return undefined;
}

async function upsertProduct(productRef: string, create: Record<string, unknown>) {
  return prisma.product.upsert({
    where: { productRef },
    update: {}, // idempotent: never clobber manual edits on re-run
    create: { productRef, ...create } as never,
  });
}

// ---------------------------------------------------------------------------

async function main() {
  const file = path.join(__dirname, 'data', 'products-combined.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  const counts = { products: 0, combos: 0, logs: 0, skipped: 0 };

  // ---- 1) Solar systems ----------------------------------------------------
  const tierMap: Record<string, 'BLOOME' | 'BRIGHTE'> = {
    standard: 'BLOOME',
    special: 'BRIGHTE',
  };
  const regionMap: Record<string, string[]> = { ACT: [], Tasmania: ['TAS'] };

  for (const [tierKey, tier] of Object.entries(tierMap)) {
    for (const [regionKey, states] of Object.entries(regionMap)) {
      const rows: SolarRow[] = data.app.solar[tierKey]?.[regionKey] ?? [];
      for (const row of rows) {
        const ref = `solar:${tier}:${regionKey}:${row.size}`;
        await upsertProduct(ref, {
          name: `${row.size}kW Solar System`,
          category: 'SOLAR',
          pricingTier: tier,
          systemSize: row.size,
          states,
          rrp: row.rrp,
          profit: row.profit,
          commission: row.commission,
        });
        counts.products++;
      }
    }
  }

  // ---- 2) Unique inverters & batteries from the combo tables ----------------
  const comboSets: Array<{ rows: ComboRow[]; states: string[]; context: string }> = [
    { rows: data.app.batteries.default.solar_battery, states: [], context: 'SOLAR_BATTERY' },
    { rows: data.app.batteries.default.battery_only, states: [], context: 'BATTERY_ONLY' },
    { rows: data.app.batteries.tasmania.solar_battery, states: ['TAS'], context: 'SOLAR_BATTERY' },
    { rows: data.app.batteries.tasmania.battery_only, states: ['TAS'], context: 'BATTERY_ONLY' },
  ];

  const discontinuedInverters = new Set<string>(data.app.inverters.discontinued ?? []);

  const inverterPhases = new Map<string, Set<number>>();
  const batteryInfo = new Map<string, { phases: Set<number>; modules?: number }>();
  for (const set of comboSets) {
    for (const row of set.rows) {
      if (!inverterPhases.has(row.inverter)) inverterPhases.set(row.inverter, new Set());
      inverterPhases.get(row.inverter)!.add(row.phase);
      if (!batteryInfo.has(row.battery)) {
        batteryInfo.set(row.battery, {
          phases: new Set(),
          // user rule: combine module_S + module_M quantities
          modules:
            row.module_S != null || row.module_M != null
              ? (row.module_S ?? 0) + (row.module_M ?? 0)
              : undefined,
        });
      }
      batteryInfo.get(row.battery)!.phases.add(row.phase);
    }
  }

  const inverterIds = new Map<string, string>();
  for (const [model, phases] of inverterPhases) {
    const p = await upsertProduct(`inverter:${model}`, {
      name: model,
      model,
      category: 'INVERTER',
      brand: brandOf(model),
      phase: phases.size === 1 ? [...phases][0] : null, // e.g. KH10 is 1ph & 3ph
      status: discontinuedInverters.has(model) ? 'DISCONTINUED' : 'ACTIVE',
      note: discontinuedInverters.has(model) ? DISCONTINUED_NOTE : undefined,
    });
    inverterIds.set(model, p.id);
    counts.products++;
  }

  const batteryIds = new Map<string, string>();
  for (const [model, info] of batteryInfo) {
    const p = await upsertProduct(`battery:${model}`, {
      name: model,
      model,
      category: 'BATTERIES',
      brand: brandOf(model),
      batterySize: kwhOf(model),
      batteryModules: info.modules,
      phase: info.phases.size === 1 ? [...info.phases][0] : null,
    });
    batteryIds.set(model, p.id);
    counts.products++;
  }

  // ---- 3) Combos + price history logs ---------------------------------------
  for (const set of comboSets) {
    for (const row of set.rows) {
      const inverterId = inverterIds.get(row.inverter)!;
      const batteryId = batteryIds.get(row.battery)!;

      const existing = await prisma.batteryCombo.findFirst({
        where: {
          inverterId,
          batteryId,
          phase: row.phase,
          saleContext: set.context as never,
          states: { equals: set.states },
        },
        select: { id: true },
      });
      if (existing) {
        counts.skipped++;
        continue;
      }

      const isDefaultRegion = set.states.length === 0;
      const currentRrp = isDefaultRegion
        ? row.rrpAfter30Mar ?? row.rrpAfter
        : row.rrp;
      const currentStc = isDefaultRegion ? row.stcAfter : row.stc;

      const combo = await prisma.batteryCombo.create({
        data: {
          inverterId,
          batteryId,
          phase: row.phase,
          states: set.states,
          saleContext: set.context as never,
          grossPrice: row.grossPrice,
          rrp: currentRrp,
          stc: currentStc,
          profit: row.profit,
          commission: row.commission,
        },
      });
      counts.combos++;

      if (isDefaultRegion) {
        const logs: Array<{
          field: string;
          oldValue: string | null;
          newValue: string | null;
          changedAt: Date;
        }> = [
          { field: 'rrp', oldValue: null, newValue: String(row.rrpBefore), changedAt: D_BEFORE },
          { field: 'stc', oldValue: null, newValue: String(row.stcBefore), changedAt: D_BEFORE },
          { field: 'rrp', oldValue: String(row.rrpBefore), newValue: String(row.rrpAfter), changedAt: D_AFTER },
          { field: 'stc', oldValue: String(row.stcBefore), newValue: String(row.stcAfter), changedAt: D_AFTER },
        ];
        if (row.rrpAfter30Mar != null) {
          logs.push({
            field: 'rrp',
            oldValue: String(row.rrpAfter),
            newValue: String(row.rrpAfter30Mar),
            changedAt: D_AFTER_30MAR,
          });
        }
        await prisma.batteryComboLog.createMany({
          data: logs.map((l) => ({ ...l, comboId: combo.id, changedBy: IMPORT_USER })),
        });
        counts.logs += logs.length;
      }
    }
  }

  // ---- 4) Extras (built-in groups + custom Firebase extras) ------------------
  const extraGroups: ExtraRow[][] = [
    data.app.extras.main ?? [],
    data.app.extras.country ?? [],
    data.app.extras.battery ?? [],
  ];
  for (const group of extraGroups) {
    for (const row of group) {
      await upsertProduct(`extra:${row.id}`, {
        name: row.name,
        category: 'EXTRAS',
        rrp: row.price,
        unit: row.unit,
        perUnit: row.perUnit,
        note: row.note || undefined,
      });
      counts.products++;
    }
  }

  // ---- 5) Firebase ("database") section --------------------------------------
  // Custom extras (no overrideOf) are imported; zero-priced "Override of
  // built-in product" rows are intentionally skipped as test data.
  for (const row of Object.values<any>(data.database?.extras ?? {})) {
    if (row.status !== 'active') continue;
    await upsertProduct(`extra:${row.id}`, {
      name: row.name,
      category: 'EXTRAS',
      rrp: row.price,
      unit: row.unit,
      perUnit: row.perUnit,
      note: row.note || undefined,
    });
    counts.products++;
  }

  // Discontinued custom inverters (e.g. SolaX X1-VAST-8K)
  for (const row of Object.values<any>(data.database?.inverters ?? {})) {
    if (row.status !== 'discontinued') {
      counts.skipped++;
      continue;
    }
    await upsertProduct(`inverter:${row.model}`, {
      name: row.model,
      model: row.model,
      category: 'INVERTER',
      brand: row.brand || brandOf(row.model),
      phase: row.phase ?? null,
      status: 'DISCONTINUED',
      note: DISCONTINUED_NOTE,
    });
    counts.products++;
  }
  // All zero-priced battery/solar overrides skipped by design.
  counts.skipped +=
    Object.keys(data.database?.batteries ?? {}).length +
    Object.keys(data.database?.solar ?? {}).length;

  console.log(
    `Import done. Products upserted: ${counts.products}, combos created: ${counts.combos}, ` +
      `log entries: ${counts.logs}, rows skipped: ${counts.skipped}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
