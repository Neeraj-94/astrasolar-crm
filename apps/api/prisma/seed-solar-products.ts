/**
 * Seed the SolarProduct catalogue with the standard system-size price list.
 *
 * Source data (provided 15/06/2026) has three columns:
 *   Commission (inc GST) -> solarCommission
 *   System Size (kW)     -> systemSize
 *   System Price         -> solarRrp
 *
 * Fields not present in the source are left at sensible defaults:
 *   productName  = "<size> kW Solar System" (derived; used as the idempotency key)
 *   brand / panelModel / panelWatt / profit = null (not supplied)
 *   states       = [] (applies to all states)
 *   status       = ACTIVE
 *   effectiveDate = EFFECTIVE (the date this price list takes effect)
 *
 * Idempotent — a row is skipped if a SolarProduct with the same productName
 * already exists. Safe to run repeatedly.
 *
 * Run: npm run db:seed-solar-products --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

// Date this price list becomes effective (27/03/2026).
const EFFECTIVE = new Date('2026-03-27T00:00:00.000Z');

const COMMON = {
  brand: 'Standard(Bloome)',
  panelWatt: 475,
  panelModel: 'Jinko JKM475N-48HL4M-DV [AU]',
  states: ['ACT', 'NSW'],
};

// [systemSize (kW), solarCommission ($ inc GST), solarRrp (system price $), profit ($)]
const ROWS: Array<[number, number, number, number]> = [
  [4.75, 850, 8363.35, 3000],
  [5.225, 850, 8602.78, 3000],
  [5.7, 850, 8768.95, 3000],
  [6.175, 850, 8995.81, 3000],
  [6.65, 850, 9097.18, 2987],
  [7.13, 850, 10745.63, 4100],
  [7.6, 1000, 11191.3, 4100],
  [8.075, 1000, 11568.16, 4400],
  [8.55, 1000, 11907.53, 4400],
  [9.025, 1000, 12321.89, 4550],
  [9.5, 1100, 12648.75, 4550],
  [9.975, 1100, 13287.11, 4550],
  [10.45, 1100, 13578.05, 4650],
  [10.925, 1100, 13820.33, 4650],
  [11.4, 1100, 14505.2, 5050],
  [11.88, 1100, 15269.56, 5250],
  [12.35, 1100, 15621.43, 5750],
  [12.825, 1200, 15948.29, 5750],
  [13.3, 1200, 16062.65, 5750],
  [13.775, 1350, 16439.51, 5750],
  [14.25, 1350, 16778.88, 5750],
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [systemSize, solarCommission, solarRrp, profit] of ROWS) {
    const productName = `${systemSize} kW Solar System`;
    const existing = await prisma.solarProduct.findFirst({
      where: { productName },
      select: { id: true },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.solarProduct.create({
      data: {
        productName,
        systemSize,
        solarCommission,
        solarRrp,
        profit,
        numOfPanels: Math.round((systemSize * 1000) / COMMON.panelWatt),
        status: 'ACTIVE',
        effectiveDate: EFFECTIVE,
        ...COMMON,
      },
    });
    created++;
  }

  console.log(
    `SolarProduct seed complete: ${created} created, ${skipped} skipped (${ROWS.length} total).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
