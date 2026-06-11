/**
 * Grant a role to a user by email.
 *
 * Usage:
 *   npm run grant-role -- <email> <roleKey>
 *
 * Examples:
 *   npm run grant-role -- neeraj@astrasolar.com.au super_admin
 *   npm run grant-role -- jane@example.com sales_consultant
 *
 * Available roleKeys: super_admin, ceo, finance, sales_manager,
 *                     operations_manager, lead_gen, sales_consultant,
 *                     admin, installer, customer
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [, , email, roleKey] = process.argv;

  if (!email || !roleKey) {
    console.error("Usage: npm run grant-role -- <email> <roleKey>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(
      `No user with email "${email}". Sign in once at /login first to create the User row.`,
    );
    process.exit(1);
  }

  const role = await prisma.role.findUnique({ where: { key: roleKey } });
  if (!role) {
    const all = await prisma.role.findMany({ select: { key: true } });
    console.error(
      `No role with key "${roleKey}". Available: ${all.map((r) => r.key).join(", ")}`,
    );
    process.exit(1);
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  console.log(`✅ Granted "${role.name}" to ${user.email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
