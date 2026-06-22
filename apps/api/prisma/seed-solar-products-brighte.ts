/**
 * Seed the ACT/NSW "Special (Brighte)" SolarProduct price list.
 *
 * Same panel/config as the ACT/NSW Standard list (Jinko 475 W, states ACT/NSW),
 * but brand = "Special(Brighte)" with its own pricing. Product names suffixed
 * "(Brighte)" so they don't collide with the Standard rows.
 *
 * Columns: solarRrp (RRP), profit, solarCommission. numOfPanels is derived.
 * Idempotent — a row is skipped if a SolarProduct with the same productName
 * already exists.
 *
 * Run: npm run db:seed-solar-products-brighte --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const EFFECTIVE = new Date('2026-03-27T00:00:00.000Z'); // 27/03/2026

const COMMON = {
  brand: 'Special(Brighte)',
  panelWatt: 475,
  panelModel: 'Jinko JKM475N-48HL4M-DV [AU]',
  states: ['ACT', 'NSW'],
};

// [systemSize (kW), solarCommission ($), solarRrp ($), profit ($)]
const ROWS: Array<[number, number, number, number]> = [
  [4.75, 400, 7722.32, 2872.34],
  [5.225, 400, 8130.11, 3292.27],
  [5.7, 400, 8242.9, 3044.95],
  [6.175, 400, 8215.7, 2892.64],
  [6.65, 400, 8077.68, 2769.5],
  [7.13, 400, 9659.38, 3803.65],
  [7.6, 520, 9712.37, 3101.07],
  [8.075, 520, 10027.87, 3339.71],
  [8.55, 520, 10418.36, 3390.83],
  [9.025, 520, 10701.35, 3409.46],
  [9.5, 600, 11315.84, 3717.09],
  [9.975, 600, 11582.91, 3345.8],
  [10.45, 600, 11801.32, 3373.27],
  [10.925, 600, 12162.32, 3491.99],
  [11.4, 600, 12530.81, 3575.61],
  [11.88, 600, 13063.8, 3544.24],
  [12.35, 600, 13154.29, 3782.86],
  [12.825, 680, 13477.28, 3798.99],
  [13.3, 680, 13792.78, 4000.13],
  [13.775, 800, 14139.51, 4000],
  [14.25, 800, 14478.88, 4000],
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [systemSize, solarCommission, solarRrp, profit] of ROWS) {
    const productName = `${systemSize} kW Solar System (Brighte)`;
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
    `Brighte SolarProduct seed complete: ${created} created, ${skipped} skipped (${ROWS.length} total).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
