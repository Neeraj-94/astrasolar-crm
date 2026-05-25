/**
 * Seed: dashboards, tabs, permissions, roles, and role-permission mappings.
 * Run with: npm run db:seed
 *
 * This seed is idempotent — safe to run multiple times.
 */
import { PrismaClient } from "@prisma/client";
import {
  DASHBOARDS,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
} from "../src/lib/permissions";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding dashboards & tabs...");
  for (const d of DASHBOARDS) {
    const dashboard = await prisma.dashboard.upsert({
      where: { key: d.key },
      update: {
        name: d.name,
        description: d.description,
        iconKey: d.iconKey,
        sortOrder: d.sortOrder,
        isActive: true,
      },
      create: {
        key: d.key,
        name: d.name,
        description: d.description,
        iconKey: d.iconKey,
        sortOrder: d.sortOrder,
      },
    });

    for (const tab of d.tabs) {
      await prisma.dashboardTab.upsert({
        where: {
          dashboardId_key: { dashboardId: dashboard.id, key: tab.key },
        },
        update: {
          name: tab.name,
          description: tab.description,
          sortOrder: tab.sortOrder,
          isDefault: tab.isDefault ?? false,
          isActive: true,
        },
        create: {
          dashboardId: dashboard.id,
          key: tab.key,
          name: tab.name,
          description: tab.description,
          sortOrder: tab.sortOrder,
          isDefault: tab.isDefault ?? false,
        },
      });
    }
  }

  console.log("Seeding permissions...");
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        description: p.description,
        dashboard: p.dashboard,
        tab: p.tab,
      },
      create: {
        key: p.key,
        name: p.name,
        description: p.description,
        dashboard: p.dashboard,
        tab: p.tab,
      },
    });
  }

  console.log("Seeding roles...");
  for (const r of ROLES) {
    await prisma.role.upsert({
      where: { key: r.key },
      update: {
        name: r.name,
        description: r.description,
        isSystem: r.isSystem ?? false,
      },
      create: {
        key: r.key,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem ?? false,
      },
    });
  }

  console.log("Wiring role -> permission grants...");
  for (const [roleKey, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });

    // Resolve permissions (supports "*" wildcard meaning every permission).
    const wantedKeys =
      permKeys.includes("*")
        ? (await prisma.permission.findMany({ select: { key: true } })).map(
            (p) => p.key,
          )
        : permKeys;

    const perms = await prisma.permission.findMany({
      where: { key: { in: wantedKeys } },
    });

    // Wipe + reinsert this role's grants so seed is deterministic.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (perms.length > 0) {
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
