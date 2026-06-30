/**
 * Seed the real staff users (from prisma/data/users-seed.json, derived from the
 * Firebase `userMap`) so that lead/sale/appointment imports resolve owners to
 * real accounts by email instead of creating `imported.*` placeholders.
 *
 * Run AFTER `db:seed` (which creates roles + the super admin) and BEFORE the
 * data imports (`db:replace-leads`, `db:import-lead-appointments`, ...).
 *
 * Idempotent:
 *  - users are upserted by email; on UPDATE the existing password is left
 *    untouched (so re-running never resets a real password). A fresh random
 *    temp password is only set on CREATE, and stored in `welcomePassword` so a
 *    super admin can (re)send the welcome email from the Users tab.
 *  - the role link is upserted; existing extra roles are left in place.
 *
 * Run: npm run db:seed-users --workspace=@astra/api
 */
import { PrismaClient } from './generated/client';
import * as bcrypt from 'bcryptjs';
import { ROLES } from '@astra/shared';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

type SeedUser = { email: string; name: string; role: keyof typeof ROLES; slug: string; aliases: string[] };

function tempPassword(): string {
  // 12-char URL-safe temp password; non-guessable, replaced on first login.
  return randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 12) + 'A1!';
}

async function main() {
  const file = path.join(__dirname, 'data', 'users-seed.json');
  const users = JSON.parse(fs.readFileSync(file, 'utf8')) as SeedUser[];
  console.log(`Seeding ${users.length} staff users from ${path.relative(process.cwd(), file)}\n`);

  // role name -> roleId
  const roleRows = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleId = new Map(roleRows.map((r) => [r.name, r.id]));

  let created = 0, updated = 0, roleLinked = 0, missingRole = 0;
  for (const u of users) {
    const roleName = (ROLES as Record<string, string>)[u.role];
    const rid = roleName ? roleId.get(roleName) : undefined;
    if (!rid) {
      missingRole++;
      console.warn(`  ! no role "${u.role}" (${roleName}) for ${u.email} — run db:seed first`);
    }

    const existing = await prisma.user.findUnique({ where: { email: u.email }, select: { id: true } });
    let userId: string;
    if (existing) {
      const r = await prisma.user.update({
        where: { email: u.email },
        data: { name: u.name, aliases: u.aliases, isActive: true }, // password left as-is
        select: { id: true },
      });
      userId = r.id; updated++;
    } else {
      const temp = tempPassword();
      const r = await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          password: await bcrypt.hash(temp, 10),
          welcomePassword: temp,
          isActive: true,
          aliases: u.aliases,
        },
        select: { id: true },
      });
      userId = r.id; created++;
    }

    if (rid) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId, roleId: rid } },
        create: { userId, roleId: rid },
        update: {},
      });
      roleLinked++;
    }
  }

  console.log(`\nDone. created: ${created}, updated: ${updated}, role links: ${roleLinked}, missing role: ${missingRole}`);
  if (created) console.log('New users got a random temp password (stored in welcomePassword) — send welcome emails or have them reset.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
