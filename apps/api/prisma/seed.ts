/**
 * Seed: permission vocabulary + 10 system roles (from permission-matrix.md) +
 * a bootstrap super admin. Idempotent — safe to run repeatedly.
 */
import { PrismaClient } from '../src/db';
import * as bcrypt from 'bcryptjs';
import {
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
  ROLES,
} from '@astra/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding permissions...');
  for (const [key, description] of Object.entries(PERMISSION_DESCRIPTIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }

  console.log('Seeding system roles...');
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

    // Reset this role's permission set to exactly match the matrix.
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`  ${role.name}: ${perms.length} permissions`);
  }

  // Bootstrap super admin.
  const email =
    process.env.SEED_SUPERADMIN_EMAIL || 'neeraj@astrasolar.com.au';
  const password = process.env.SEED_SUPERADMIN_PASSWORD || 'Nexusadmin0';
  const name = process.env.SEED_SUPERADMIN_NAME || 'Neeraj';

  const superRole = await prisma.role.findUnique({
    where: { name: ROLES.SUPER_ADMIN },
  });
  if (superRole) {
    const hash = await bcrypt.hash(password, 10);
    // Enforce the bootstrap credentials on every seed run: update the password
    // hash + name and re-activate the account, so the super admin can always
    // sign in with the configured email / password.
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, password: hash, name, isActive: true },
      update: { password: hash, name, isActive: true },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: superRole.id } },
      create: { userId: user.id, roleId: superRole.id },
      update: {},
    });
    console.log(`Bootstrap super admin: ${email}`);
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
