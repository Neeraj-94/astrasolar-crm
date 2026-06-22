import { Injectable, Logger } from '@nestjs/common';
import { Company, LeadOutcome, LeadSource, LeadStage } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { LeadHistoryService } from '../history/lead-history.service';
import { UsersService } from '../users/users.service';

/**
 * Phase 2.5 — Google Sheets intake.
 *
 * Production wiring: a BullMQ repeatable job (SHEETS_POLL_CRON) fetches new rows
 * via the Sheets API and calls importRows(). Dedup matches an existing lead by
 * phone (fallback first+surname) — re-importing the same row is a no-op.
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
    private readonly users: UsersService,
  ) {}

  async importRows(
    rows: SheetRow[],
    actingUserId: string,
  ): Promise<ImportResult> {
    const result: ImportResult = { imported: 0, skipped: 0, unmatchedNames: [] };
    const fallbackOwnerId = actingUserId;

    // Build the name/alias lookup once for the whole batch. The sheet records a
    // setter's display name, which may be one of a user's aliases (e.g. "Dan"
    // for "Daniel"), so match on name OR alias.
    const userIndex = await this.users.nameAliasIndex();

    for (const row of rows) {
      // Dedup: externalRef was removed from the schema, so we match on phone
      // (the most reliable sheet identifier) and fall back to first+surname.
      const existing = await this.prisma.lead.findFirst({
        where: row.phone
          ? { phone: row.phone }
          : { firstName: row.firstName, surName: row.surname },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const ownerId =
        userIndex.get(row.leadGenName?.trim().toLowerCase() ?? '')?.id ?? null;
      if (row.leadGenName && !ownerId) {
        result.unmatchedNames.push(row.leadGenName);
      }

      await this.prisma.$transaction(async (tx) => {
        const lead = await tx.lead.create({
          data: {
            firstName: row.firstName,
            surName: row.surname,
            email: row.email,
            phone: row.phone,
            postCode: row.postcode,
            state: row.state,
            source: LeadSource.BLOOM_ASTRA,
            code: row.rowId, // keep the sheet row id for traceability
            company: this.parseCompany(row.company),
            stage: LeadStage.INTAKE,
            // outcome unset at intake (nullable, no default)
            leadGenId: ownerId ?? fallbackOwnerId,
            billSpend: row.billSpend != null ? String(row.billSpend) : undefined,
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
}
