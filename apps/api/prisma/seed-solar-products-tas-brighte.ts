/**
 * Seed the TAS "Special (Brighte)" SolarProduct price list (Longi panels).
 *
 * Same panel/config as the TAS Standard list (Longi 475 W, states ['TAS']), but
 * brand = "Special(Brighte)" with its own pricing. Product names suffixed
 * "(TAS Brighte)" so they don't collide.
 *
 * Columns: solarRrp (RRP), profit, solarCommission. numOfPanels is derived.
 * Idempotent — a row is skipped if a SolarProduct with the same productName
 * already exists.
 *
 * Run: npm run db:seed-solar-products-tas-brighte --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const EFFECTIVE = new Date('2026-03-27T00:00:00.000Z'); // 27/03/2026

const COMMON = {
  brand: 'Special(Brighte)',
  panelWatt: 475,
  panelModel: 'Longi LR7-54HVH-475M',
  states: ['TAS'],
};

// [systemSize (kW), solarCommission ($), solarRrp ($), profit ($)]
const ROWS: Array<[number, number, number, number]> = [
  [4.75, 400, 7536.6, 2650],
  [5.225, 400, 7806.45, 2650],
  [5.7, 400, 8038.8, 2650],
  [6.175, 400, 8271.15, 2650],
  [6.65, 400, 8503.5, 2650],
  [7.13, 400, 10075.75, 3650],
  [7.6, 520, 10308.1, 3530],
  [8.075, 520, 10577.95, 3530],
  [8.55, 520, 10960.3, 3680],
  [9.025, 520, 11577.65, 3680],
  [9.5, 600, 11910.0, 3700],
  [9.975, 600, 12142.35, 3700],
  [10.45, 600, 12474.7, 3800],
  [10.925, 600, 12817.05, 3800],
  [11.4, 600, 13186.9, 3900],
  [11.88, 600, 13789.25, 4270],
  [12.35, 600, 13921.6, 4170],
  [12.825, 680, 14271.45, 4170],
  [13.3, 680, 14653.8, 4320],
  [13.775, 800, 15006.15, 4320],
  [14.25, 800, 15238.5, 4320],
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const [systemSize, solarCommission, solarRrp, profit] of ROWS) {
    const productName = `${systemSize} kW Solar System (TAS Brighte)`;
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
    `TAS Brighte SolarProduct seed complete: ${created} created, ${skipped} skipped (${ROWS.length} total).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
