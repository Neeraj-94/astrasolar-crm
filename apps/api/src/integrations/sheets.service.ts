import { Injectable, Logger } from '@nestjs/common';
import { Company, LeadOutcome, LeadSource, LeadStage } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { LeadHistoryService } from '../history/lead-history.service';

/**
 * Phase 2.5 — Google Sheets intake.
 *
 * Production wiring: a BullMQ repeatable job (SHEETS_POLL_CRON) fetches new rows
 * via the Sheets API and calls importRows(). Dedup is enforced by the schema's
 * @@unique([source, externalRef]) — re-importing the same row is a no-op.
 *
 * This service is transport-agnostic: it takes already-parsed rows so it can be
 * driven by the poller, a webhook, or a manual admin sync. Lead-gen / consultant
 * names are resolved to user ids; unmatched names are flagged in the result.
 */
export interface SheetRow {
  rowId: string; // becomes externalRef
  firstName: string;
  surname: string;
  email?: string;
  phone?: string;
  postcode?: string;
  state?: string;
  company?: string; // "ASTRA" | "DC"
  leadGenName?: string;
  leadDate?: string; // ISO date
  billSpend?: number;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  unmatchedNames: string[];
}

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly history: LeadHistoryService,
  ) {}

  async importRows(
    rows: SheetRow[],
    actingUserId: string,
  ): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, unmatchedNames: [] };
    const fallbackOwnerId = actingUserId;

    for (const row of rows) {
      const existing = await this.prisma.lead.findUnique({
        where: {
          source_externalRef: {
            source: LeadSource.GOOGLE_SHEETS,
            externalRef: row.rowId,
          },
        },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const ownerId = await this.resolveUserId(row.leadGenName);
      if (row.leadGenName && !ownerId) {
        result.unmatchedNames.push(row.leadGenName);
      }

      await this.prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: {
            firstName: row.firstName,
            surname: row.surname,
            email: row.email,
            phone: row.phone,
            postcode: row.postcode,
            state: row.state,
          },
        });
        const lead = await tx.lead.create({
          data: {
            contactId: contact.id,
            source: LeadSource.GOOGLE_SHEETS,
            externalRef: row.rowId,
            company: this.parseCompany(row.company),
            stage: LeadStage.INTAKE,
            outcome: LeadOutcome.NEW,
            ownerId: ownerId ?? fallbackOwnerId,
            billSpend: row.billSpend,
            leadDate: row.leadDate ? new Date(row.leadDate) : new Date(),
          },
        });
        await this.history.recordFromLead(tx, lead, actingUserId);
        await this.audit.record(
          {
            userId: actingUserId,
            action: 'LEAD_IMPORTED',
            entity: 'Lead',
            entityId: lead.id,
            source: 'google_sheets',
            metadata: { rowId: row.rowId },
          },
          tx,
        );
      });
      result.imported++;
    }

    this.logger.log(
      `Sheets import: ${result.imported} imported, ${result.skipped} skipped, ${result.unmatchedNames.length} unmatched`,
    );
    return result;
  }

  private parseCompany(raw?: string): Company {
    return raw?.toUpperCase() === 'DC' ? Company.DC : Company.ASTRA;
  }

  private async resolveUserId(name?: string): Promise<string | null> {
    if (!name) return null;
    const user = await this.prisma.user.findFirst({
      where: { name: { equals: name.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    return user?.id ?? null;
  }
}
