/**
 * Seed the TAS SolarProduct price list (Longi panels).
 *
 * Distinct from the ACT/NSW list: different panel model, states = ['TAS'], and
 * product names suffixed "(TAS)" so they don't collide.
 *
 * Columns: solarRrp (RRP), profit, solarCommission. numOfPanels is derived
 * (systemSize * 1000 / panelWatt). Idempotent — a row is skipped if a
 * SolarProduct with the same productName already exists.
 *
 * Run: npm run db:seed-solar-products-tas --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const EFFECTIVE = new Date('2026-03-27T00:00:00.000Z'); // 27/03/2026

const COMMON = {
  brand: 'Standard(Bloome)',
  panelWatt: 475,
  panelModel: 'Longi LR7-54HVH-475M',
  states: ['TAS'],
};

// [systemSize (kW), solarCommission ($), solarRrp ($), profit ($)]
const ROWS: Array<[number, number, number, number]> = [
  [4.75, 850, 8572.53, 3235.93],
  [5.225, 850, 8928.62, 3322.17],
  [5.7, 850, 9040.23, 3201.43],
  [6.175, 850, 9285.26, 3214.11],
  [6.65, 850, 9529.65, 3226.15],
  [7.13, 850, 10227.68, 3351.93],
  [7.6, 1000, 10625.78, 3367.68],
  [8.075, 1000, 10913.12, 3385.17],
  [8.55, 1000, 11635.48, 3875.18],
  [9.025, 1000, 12130.32, 3752.67],
  [9.5, 1100, 12492.68, 3782.68],
  [9.975, 1100, 12652.52, 3710.17],
  [10.45, 1100, 13597.38, 4422.68],
  [10.925, 1100, 13892.22, 4375.17],
  [11.4, 1100, 14236.9, 4450],
  [11.88, 1100, 15047.88, 5028.63],
  [12.35, 1100, 15291.78, 5040.18],
  [12.825, 1200, 15671.63, 5050.18],
  [13.3, 1200, 15877.6, 5023.8],
  [13.775, 1350, 16236.15, 5000],
  [14.25, 1350, 16468.5, 5000],
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [systemSize, solarCommission, solarRrp, profit] of ROWS) {
    const productName = `${systemSize} kW Solar System (TAS)`;
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
    `TAS SolarProduct seed complete: ${created} created, ${skipped} skipped (${ROWS.length} total).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
