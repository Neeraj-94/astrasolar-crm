"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seed: permission vocabulary + 10 system roles (from permission-matrix.md) +
 * a bootstrap super admin. Idempotent — safe to run repeatedly.
 */
const db_1 = require("../src/db");
const bcrypt = __importStar(require("bcryptjs"));
const shared_1 = require("@astra/shared");
const prisma = new db_1.PrismaClient();
async function main() {
    console.log('Seeding permissions...');
    for (const [key, description] of Object.entries(shared_1.PERMISSION_DESCRIPTIONS)) {
        await prisma.permission.upsert({
            where: { key },
            create: { key, description },
            update: { description },
        });
    }
    console.log('Seeding system roles...');
    for (const role of shared_1.SYSTEM_ROLES) {
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
    const email = process.env.SEED_SUPERADMIN_EMAIL || 'neeraj@astrasolar.com.au';
    const password = process.env.SEED_SUPERADMIN_PASSWORD || 'Nexusadmin0';
    const name = process.env.SEED_SUPERADMIN_NAME || 'Neeraj';
    const superRole = await prisma.role.findUnique({
        where: { name: shared_1.ROLES.SUPER_ADMIN },
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
//# sourceMappingURL=seed.js.map