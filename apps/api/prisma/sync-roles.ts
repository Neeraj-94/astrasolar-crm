/**
 * Sync the permission vocabulary + system-role → permission grants from the
 * shared SYSTEM_ROLES matrix into the database. Idempotent and SAFE to run on
 * every deploy/boot:
 *   • Only touches Permission / Role / RolePermission rows.
 *   • Does NOT create or modify any user (unlike `seed.ts`, which also resets
 *     the bootstrap super-admin password — we deliberately skip that here so a
 *     boot-time sync never rewrites credentials).
 *   • Only iterates SYSTEM_ROLES, so custom (non-system) roles created via the
 *     RBAC UI are left untouched.
 *
 * Run manually:  npm run db:sync-roles  (from apps/api)
 * Runs automatically before the API boots (see Dockerfile / railway.json).
 */
import { PrismaClient } from './generated/client';
import { PERMISSION_DESCRIPTIONS, SYSTEM_ROLES } from '@astra/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('[sync-roles] Syncing permission vocabulary...');
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }

  console.log('[sync-roles] Syncing system roles...');
  for (const role of SYSTEM_ROLES) {
    const dbRole = await prisma.role.upsert({
      where: { name: role.key },
      create: {
        name: role.key,
        description: `${role.name} — ${role.description}`,
        isSystem: true,
      },
      update: {
        description: `${role.name} — ${role.description}`,
        isSystem: true,
      },
    });

    const perms = await prisma.permission.findMany({
      where: { key: { in: role.permissions } },
    });

    // Reset this system role's permission set to exactly match the matrix.
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`  ${role.name}: ${perms.length} permissions`);
  }

  console.log('[sync-roles] Done.');
}

main()
  .catch((e) => {
    console.error('[sync-roles] FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
