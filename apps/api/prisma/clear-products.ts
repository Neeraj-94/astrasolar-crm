/**
 * Wipe ALL product catalogue data: combo logs, combos, product logs, products.
 *
 * Sale data is never touched — if any sale references a product (SystemDetails
 * or SaleExtra), the script aborts before deleting anything.
 *
 * The import migration (20260611130000) stays recorded as applied, so nothing
 * auto-re-imports. To re-import later: npm run db:import-products
 *
 * Run: npm run db:clear-products --workspace=@astra/api
 */
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

async function main() {
  const [sysRefs, extraRefs] = await Promise.all([
    prisma.systemDetails.count({
      where: {
        OR: [
          { batteryProductId: { not: null } },
          { panelProductId: { not: null } },
          { inverterProductId: { not: null } },
        ],
      },
    }),
    prisma.saleExtra.count(),
  ]);
  if (sysRefs + extraRefs > 0) {
    console.error(
      `Aborted: ${sysRefs} system detail(s) and ${extraRefs} sale extra(s) reference products. ` +
        'Remove those sale references first — this script never deletes sale data.',
    );
    process.exit(1);
  }

  const result = await prisma.$transaction(async (tx) => {
    const comboLogs = await tx.batteryComboLog.deleteMany();
    const combos = await tx.batteryCombo.deleteMany();
    const productLogs = await tx.productLog.deleteMany();
    const products = await tx.product.deleteMany();
    return { comboLogs, combos, productLogs, products };
  });

  console.log(
    `Deleted: ${result.products.count} products, ${result.combos.count} combos, ` +
      `${result.comboLogs.count} combo log entries, ${result.productLogs.count} product log entries.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
