/**
 * One-shot migration: rename existing DB rows so the old "manager" role and
 * "manager" dashboard become "sales_manager" / "sales-manager" without
 * breaking existing UserRole grants or DashboardTab FK relations.
 *
 * Run BEFORE `npm run db:seed` after pulling the renaming change.
 *
 * Usage:
 *   npm run migrate:rename-manager
 *
 * Idempotent: re-running is a no-op once the rename has happened.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ----- Role rename ---------------------------------------------------------
  const oldRole = await prisma.role.findUnique({ where: { key: "manager" } });
  if (oldRole) {
    // If a new sales_manager already exists (e.g. seed ran first), merge:
    // move all UserRole rows from the old role to the new one, then delete
    // the old one.
    const newRole = await prisma.role.findUnique({
      where: { key: "sales_manager" },
    });
    if (newRole) {
      await prisma.userRole.updateMany({
        where: { roleId: oldRole.id },
        data: { roleId: newRole.id },
      });
      await prisma.rolePermission.deleteMany({ where: { roleId: oldRole.id } });
      await prisma.role.delete({ where: { id: oldRole.id } });
      console.log(
        `merged old "manager" role into existing "sales_manager" and deleted old row.`,
      );
    } else {
      await prisma.role.update({
        where: { id: oldRole.id },
        data: { key: "sales_manager", name: "Sales Manager" },
      });
      console.log(`renamed Role "manager" -> "sales_manager".`);
    }
  } else {
    console.log(`no Role with key "manager" found (already migrated).`);
  }

  // ----- Dashboard rename ----------------------------------------------------
  const oldDash = await prisma.dashboard.findUnique({
    where: { key: "manager" },
  });
  if (oldDash) {
    const newDash = await prisma.dashboard.findUnique({
      where: { key: "sales-manager" },
    });
    if (newDash) {
      // Move tabs over (or just delete old ones — seed will recreate them).
      await prisma.dashboardTab.deleteMany({ where: { dashboardId: oldDash.id } });
      await prisma.dashboard.delete({ where: { id: oldDash.id } });
      console.log(
        `removed old Dashboard "manager" — "sales-manager" already exists.`,
      );
    } else {
      await prisma.dashboard.update({
        where: { id: oldDash.id },
        data: { key: "sales-manager", name: "Sales Manager" },
      });
      console.log(`renamed Dashboard "manager" -> "sales-manager".`);
    }
  } else {
    console.log(`no Dashboard with key "manager" found (already migrated).`);
  }

  // ----- Permission cleanup --------------------------------------------------
  // Old `dashboard.manager.*` permission keys would otherwise sit orphaned
  // forever; the seed will create fresh `dashboard.sales-manager.*` ones.
  const oldPerms = await prisma.permission.deleteMany({
    where: { key: { startsWith: "dashboard.manager." } },
  });
  if (oldPerms.count > 0) {
    console.log(`deleted ${oldPerms.count} old "dashboard.manager.*" permission(s).`);
  }

  console.log("done. Now run: npm run db:push && npm run db:seed");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
