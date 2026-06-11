// Barrel for the API's dedicated Prisma client.
//
// The client is generated to `apps/api/prisma/generated/client` (see the
// generator `output` in schema.prisma) so it never collides with the legacy
// web app's Prisma client. Import all Prisma types/enums/PrismaClient from
// here ("@/db" or relative "../db") rather than from "@prisma/client".
export * from '../prisma/generated/client';
