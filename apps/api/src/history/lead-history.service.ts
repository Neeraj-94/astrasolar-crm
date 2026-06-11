import { Injectable } from '@nestjs/common';
import type {
  LeadOutcome,
  LeadStage,
  Prisma,
  SalesDisposition,
} from '../db';

/**
 * The SINGLE choke point for recording lead history. Every service that mutates
 * a lead's state routes through here so a LeadStateLog snapshot can never be
 * accidentally skipped. History is a side effect the code can't forget.
 *
 * KEY RULE: state changes are written INSIDE the same DB transaction as the
 * mutation. Pass the Prisma transaction client (`tx`) so the lead update and its
 * log row commit or roll back together.
 */
@Injectable()
export class LeadHistoryService {
  async recordState(
    tx: Prisma.TransactionClient,
    leadId: string,
    snapshot: {
      stage: LeadStage;
      leadGenId?: string | null;
      consultantId?: string | null;
      outcome?: LeadOutcome | null;
      disposition?: SalesDisposition | null;
    },
    changedBy: string,
  ): Promise<void> {
    await tx.leadStateLog.create({
      data: {
        leadId,
        stage: snapshot.stage,
        leadGenId: snapshot.leadGenId ?? null,
        consultantId: snapshot.consultantId ?? null,
        outcome: snapshot.outcome ?? null,
        disposition: snapshot.disposition ?? null,
        changedBy,
      },
    });
  }

  /** Snapshot directly from a freshly-updated lead row. */
  async recordFromLead(
    tx: Prisma.TransactionClient,
    lead: {
      id: string;
      stage: LeadStage;
      ownerId: string;
      currentConsultantId: string | null;
      outcome: LeadOutcome | null;
      disposition: SalesDisposition | null;
    },
    changedBy: string,
  ): Promise<void> {
    await this.recordState(
      tx,
      lead.id,
      {
        stage: lead.stage,
        leadGenId: lead.ownerId,
        consultantId: lead.currentConsultantId,
        outcome: lead.outcome,
        disposition: lead.disposition,
      },
      changedBy,
    );
  }
}
