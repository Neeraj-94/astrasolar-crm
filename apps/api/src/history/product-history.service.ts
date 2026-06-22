import { Injectable } from '@nestjs/common';
import type { Prisma } from '../db';

export interface FieldChange {
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
}

/**
 * Choke point for catalogue change history. Each catalogue has its own log
 * table; every entry carries an `effectiveDate` (REQUIRED) so price/spec
 * history can be replayed as-of any date. `effectiveDate` defaults to now when
 * a change doesn't specify when it takes effect.
 */
@Injectable()
export class ProductHistoryService {
  private rows(changes: FieldChange[], changedBy: string, effectiveDate: Date) {
    return changes.map((c) => ({
      field: c.field,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      changedBy,
      effectiveDate,
    }));
  }

  async recordSolar(
    tx: Prisma.TransactionClient,
    productId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.solarProductLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        productId,
      })),
    });
  }

  async recordInverter(
    tx: Prisma.TransactionClient,
    productId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.inverterProductLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        productId,
      })),
    });
  }

  async recordBattery(
    tx: Prisma.TransactionClient,
    productId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.batteryProductLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        productId,
      })),
    });
  }

  async recordExtra(
    tx: Prisma.TransactionClient,
    productId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.extraProductLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        productId,
      })),
    });
  }

  async recordBatteryContextPrice(
    tx: Prisma.TransactionClient,
    contextPriceId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.batteryContextPriceLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        contextPriceId,
      })),
    });
  }

  async recordBatteryComboPrice(
    tx: Prisma.TransactionClient,
    comboPriceId: string,
    changes: FieldChange[],
    changedBy: string,
    effectiveDate: Date = new Date(),
  ): Promise<void> {
    if (changes.length === 0) return;
    await tx.batteryComboContextPriceLog.createMany({
      data: this.rows(changes, changedBy, effectiveDate).map((r) => ({
        ...r,
        comboPriceId,
      })),
    });
  }
}
