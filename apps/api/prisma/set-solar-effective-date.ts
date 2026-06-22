/**
 * Set effectiveDate = 27/03/2026 on EVERY SolarProduct row.
 *
 * One-off correction. Safe to run repeatedly (it just re-sets the same date).
 *
 * Run: npm run db:set-solar-effective-date --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

const EFFECTIVE = new Date('2026-03-27T00:00:00.000Z'); // 27/03/2026

async function main() {
  const { count } = await prisma.solarProduct.updateMany({
    data: { effectiveDate: EFFECTIVE },
  });
  console.log(`Updated effectiveDate on ${count} SolarProduct row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
