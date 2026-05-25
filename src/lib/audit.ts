import "server-only";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@prisma/client";

interface LogArgs {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(args: LogArgs) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: args.actorId ?? null,
        action: args.action,
        entityType: args.entityType,
        entityId: args.entityId,
        summary: args.summary,
        metadata: args.metadata as never,
        ipAddress: args.ipAddress,
        userAgent: args.userAgent,
      },
    });
  } catch (err) {
    // Audit logging should never break a request — surface to logs only.
    console.error("[audit] failed to write audit log", err);
  }
}
