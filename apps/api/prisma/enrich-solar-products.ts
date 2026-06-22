/**
 * Enrich existing SolarProduct rows:
 *   - Common fields on EVERY row: brand, panelWatt, panelModel, states.
 *   - Per system-size: profit + commission (authoritative price list).
 *
 * Matches rows by systemSize. Idempotent — safe to run repeatedly.
 *
 * Run: npm run db:enrich-solar-products --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const COMMON = {
  brand: 'Standard(Bloome)',
  panelWatt: 475,
  panelModel: 'Jinko JKM475N-48HL4M-DV [AU]',
  states: ['ACT', 'NSW'],
};

// [systemSize (kW), profit ($), solarCommission ($)]
const ROWS: Array<[number, number, number]> = [
  [4.75, 3000, 850],
  [5.225, 3000, 850],
  [5.7, 3000, 850],
  [6.175, 3000, 850],
  [6.65, 2987, 850],
  [7.13, 4100, 850],
  [7.6, 4100, 1000],
  [8.075, 4400, 1000],
  [8.55, 4400, 1000],
  [9.025, 4550, 1000],
  [9.5, 4550, 1100],
  [9.975, 4550, 1100],
  [10.45, 4650, 1100],
  [10.925, 4650, 1100],
  [11.4, 5050, 1100],
  [11.88, 5250, 1100],
  [12.35, 5750, 1100],
  [12.825, 5750, 1200],
  [13.3, 5750, 1200],
  [13.775, 5750, 1350],
  [14.25, 5750, 1350],
];

async function main() {
  // 1) Common fields on every solar product.
  const common = await prisma.solarProduct.updateMany({ data: COMMON });
  console.log(`Common fields set on ${common.count} row(s).`);

  // 2) Per-size profit + commission.
  let updated = 0;
  let missing = 0;
  for (const [systemSize, profit, solarCommission] of ROWS) {
    const { count } = await prisma.solarProduct.updateMany({
      where: { systemSize },
      data: {
        profit,
        solarCommission,
        numOfPanels: Math.round((systemSize * 1000) / COMMON.panelWatt),
      },
    });
    if (count === 0) {
      missing++;
      console.warn(`  no SolarProduct found for ${systemSize} kW`);
    } else {
      updated += count;
    }
  }
  console.log(
    `Per-size update complete: ${updated} row(s) updated, ${missing} size(s) not found.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
