import { Injectable } from '@nestjs/common';
import type { Prisma, SaleStatus } from '../db';

/**
 * Choke point for sale history. Two surfaces:
 *   - SaleLog          : general field-level change log (section/field/old/new)
 *   - SaleStageHistory : lifecycle status transitions
 * Both written inside the mutating transaction.
 */
@Injectable()
export class SaleHistoryService {
  async recordFieldChanges(
    tx: Prisma.TransactionClient,
    saleId: string,
    changes: Array<{
      section: string;
      field: string;
      oldValue?: string | null;
      newValue?: string | null;
    }>,
    changedBy: string,
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.saleLog.createMany({
      data: changes.map((c) => ({
        saleId,
        section: c.section,
        field: c.field,
        oldValue: c.oldValue ?? null,
        newValue: c.newValue ?? null,
        changedBy,
      })),
    });
  }

  async recordStageChange(
    tx: Prisma.TransactionClient,
    saleId: string,
    toStage: SaleStatus,
    changedBy: string,
    fromStage?: SaleStatus | null,
  ): Promise<void> {
    await tx.saleStageHistory.create({
      data: { saleId, toStage, fromStage: fromStage ?? null, changedBy },
    });
  }
}
