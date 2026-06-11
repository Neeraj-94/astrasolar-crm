import { Injectable } from '@nestjs/common';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * System-wide security trail. Distinct from LeadStateLog (status timeline) and
 * Activity (human action feed). Can run standalone or inside a transaction so
 * the audit row commits atomically with the mutation it records.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: {
      userId: string;
      action: string;
      entity: string;
      entityId: string;
      source?: string;
      metadata?: Prisma.InputJsonValue;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        source: entry.source ?? 'app',
        metadata: entry.metadata,
      },
    });
  }
}
