import { Injectable } from '@nestjs/common';
import type { Prisma } from '../db';

/** Choke point for product catalogue change history (ProductLog). */
@Injectable()
export class ProductHistoryService {
  async recordChanges(
    tx: Prisma.TransactionClient,
    productId: string,
    changes: Array<{ field: string; oldValue?: string | null; newValue?: string | null }>,
    changedBy: string,
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.productLog.createMany({
      data: changes.map((c) => ({
        productId,
        field: c.field,
        oldValue: c.oldValue ?? null,
        newValue: c.newValue ?? null,
        changedBy,
      })),
    });
  }
}
