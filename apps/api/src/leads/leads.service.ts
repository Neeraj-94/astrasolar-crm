import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  LeadOutcome,
  LeadSource,
  LeadStage,
  PERMISSIONS,
  SaleStatus,
  SalesDisposition,
} from '@astra/shared';
import type { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../common/audit.service';
import { LeadHistoryService } from '../history/lead-history.service';
import type { AuthUser } from '../common/auth-user';
import type {
  AddActivityDto,
  BookLeadDto,
  CreateLeadDto,
  UpdateDispositionDto,
  UpdateOutcomeDto,
} from './dto';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly history: LeadHistoryService,
  ) {}

  async list(
    user: AuthUser,
    filters: {
      stage?: LeadStage;
      disposition?: SalesDisposition | SalesDisposition[];
      userId?: string;
    } = {},
  ) {
    const where = await this.scope.leadWhere(user, filters.userId);
    if (filters.stage) where.stage = filters.stage;
    if (filters.disposition) {
      where.disposition = Array.isArray(filters.disposition)
        ? { in: filters.disposition }
        : filters.disposition;
    }
    return this.prisma.lead.findMany({
      where,
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { timestamp: 'desc' },
      ],
      take: 200,
      include: {
        leadGen: { select: { id: true, name: true } },
        consultant: { select: { id: true, name: true } },
        booking: true,
        // Lightweight status so the web can label the checklist action
        // ("Build" vs "View / Edit") without an extra round-trip per row.
        checklist: { select: { status: true } },
      },
    });
  }

  /**
   * Persist a drag-and-drop row order: each id gets its array index as
   * `sortOrder`. Ids outside the caller's visibility scope are ignored, so a
   * user can never move records they aren't allowed to see.
   */
  async reorder(user: AuthUser, ids: string[]) {
    const where = await this.scope.leadWhere(user);
    const visible = await this.prisma.lead.findMany({
      where: { ...where, id: { in: ids } },
      select: { id: true },
    });
    const allowed = new Set(visible.map((l) => l.id));
    await this.prisma.$transaction(
      ids
        .filter((id) => allowed.has(id))
        .map((id, index) =>
          this.prisma.lead.update({
            where: { id },
            data: { sortOrder: index },
          }),
        ),
    );
    return { ok: true };
  }

  async get(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        leadGen: { select: { id: true, name: true } },
        consultant: { select: { id: true, name: true } },
        booking: true,
        sale: true,
        stateLog: { orderBy: { changedAt: 'desc' }, take: 50 },
        activities: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    await this.assertCanRead(user, lead);
    return lead;
  }

  /** Create a lead (contact details flattened on). Writes initial state log + audit. */
  async create(user: AuthUser, dto: CreateLeadDto) {
    const leadGenId = dto.leadGenId ?? user.id;

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          firstName: dto.firstName,
          surName: dto.surName,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
          postCode: dto.postCode,
          state: dto.state,
          company: dto.company as Company,
          source: dto.source ?? LeadSource.INBOUND,
          leadGenId,
          stage: LeadStage.INTAKE,
          // outcome is unset at intake (nullable, no default)
          billSpend: dto.billSpend,
          code: dto.code,
          leadGenNotes: dto.notes,
        },
      });
      await this.history.recordFromLead(tx, lead, user.id);
      await this.audit.record(
        { userId: user.id, action: 'LEAD_CREATED', entity: 'Lead', entityId: lead.id },
        tx,
      );
      return lead;
    });
  }

  /** Intake outcome update (lead-gen). BOOKED is handled by book(). */
  async updateOutcome(user: AuthUser, id: string, dto: UpdateOutcomeDto) {
    const lead = await this.loadForWrite(user, id);
    if (dto.outcome === LeadOutcome.APPOINTMENT) {
      throw new BadRequestException('Use the booking endpoint to book a lead');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          outcome: dto.outcome,
          leadGenNotes: dto.notes ?? lead.leadGenNotes,
          stage:
            dto.outcome === LeadOutcome.NOT_INTERESTED ||
            dto.outcome === LeadOutcome.DNQ
              ? LeadStage.CLOSED
              : lead.stage,
        },
      });
      await this.history.recordFromLead(tx, updated, user.id);
      await this.audit.record(
        { userId: user.id, action: 'LEAD_OUTCOME_CHANGED', entity: 'Lead', entityId: id, metadata: { outcome: dto.outcome } },
        tx,
      );
      return updated;
    });
  }

  /**
   * TRIGGER 1 — outcome -> APPOINTMENT. One atomic transaction:
   *  1. create Booking (consultant, bookedBy, scheduledAt)
   *  2. set lead.stage = BOOKED, consultantId, outcome = APPOINTMENT
   *  3. write LeadStateLog snapshot + AuditLog
   */
  async book(user: AuthUser, id: string, dto: BookLeadDto) {
    const lead = await this.loadForWrite(user, id);
    if (lead.booking) {
      throw new BadRequestException('Lead is already booked');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.booking.create({
        data: {
          leadId: id,
          consultantId: dto.consultantId,
          bookedById: user.id,
          scheduledAt: new Date(dto.scheduledAt),
        },
      });
      const updated = await tx.lead.update({
        where: { id },
        data: {
          stage: LeadStage.BOOKED,
          outcome: LeadOutcome.APPOINTMENT,
          consultantId: dto.consultantId,
        },
      });
      await this.history.recordFromLead(tx, updated, user.id);
      await this.audit.record(
        { userId: user.id, action: 'BOOKING_CREATED', entity: 'Lead', entityId: id, metadata: { consultantId: dto.consultantId } },
        tx,
      );
      return updated;
    });
  }

  /**
   * TRIGGER 2 — disposition -> SOLD. One atomic transaction:
   *  1. set lead.stage = CONVERTED, convertedAt = now()
   *  2. create Sale (linked to lead + contact, owner = consultant)
   *  3. write LeadStateLog snapshot + AuditLog
   * SOLD is owner-only: the acting user must be the lead's current consultant
   * (break-glass: super admin) and hold sales:manage:own.
   */
  async updateDisposition(user: AuthUser, id: string, dto: UpdateDispositionDto) {
    const lead = await this.loadForWrite(user, id);
    if (lead.stage === LeadStage.INTAKE) {
      throw new BadRequestException('Lead must be booked before disposition');
    }

    const isSold = dto.disposition === SalesDisposition.SOLD;
    if (isSold) {
      const owns =
        user.id === lead.consultantId ||
        user.permissions.has(PERMISSIONS.SYSTEM_ADMIN);
      if (!owns || !user.permissions.has(PERMISSIONS.SALES_MANAGE_OWN)) {
        throw new ForbiddenException(
          'Only the owning consultant may mark a lead SOLD',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          disposition: dto.disposition,
          consultantNotes: dto.consultantNotes ?? lead.consultantNotes,
          stage: isSold ? LeadStage.CONVERTED : lead.stage,
          convertedAt: isSold ? new Date() : lead.convertedAt,
        },
      });

      if (isSold) {
        const saleRef = await this.nextSaleRef(tx);
        const sale = await tx.sale.create({
          data: {
            saleRef,
            leadId: id,
            ownerId: lead.consultantId!,
            company: lead.company,
            status: SaleStatus.NEGOTIATION,
            saleDate: new Date(),
            statusDetails: { create: {} },
          },
        });
        await tx.saleStageHistory.create({
          data: { saleId: sale.id, toStage: SaleStatus.NEGOTIATION, changedBy: user.id },
        });
        await this.audit.record(
          { userId: user.id, action: 'LEAD_CONVERTED', entity: 'Sale', entityId: sale.id, metadata: { leadId: id } },
          tx,
        );
      }

      await this.history.recordFromLead(tx, updated, user.id);
      await this.audit.record(
        { userId: user.id, action: 'LEAD_DISPOSITION_CHANGED', entity: 'Lead', entityId: id, metadata: { disposition: dto.disposition } },
        tx,
      );
      return updated;
    });
  }

  /** Reassign a lead's owner — leads:reassign (super admin) only. */
  async reassign(user: AuthUser, id: string, newOwnerId: string) {
    if (!user.permissions.has(PERMISSIONS.LEADS_REASSIGN)) {
      throw new ForbiddenException('Missing leads:reassign');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: { leadGenId: newOwnerId },
      });
      await this.history.recordFromLead(tx, updated, user.id);
      await this.audit.record(
        { userId: user.id, action: 'LEAD_REASSIGNED', entity: 'Lead', entityId: id, metadata: { newOwnerId } },
        tx,
      );
      return updated;
    });
  }

  async addActivity(user: AuthUser, id: string, dto: AddActivityDto) {
    await this.loadForWrite(user, id);
    return this.prisma.activity.create({
      data: { type: dto.type, content: dto.content, leadId: id, userId: user.id },
    });
  }

  // ---- authorization helpers ----

  private async loadForWrite(user: AuthUser, id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { booking: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    await this.assertCanWrite(user, lead);
    return lead;
  }

  private async assertCanRead(
    user: AuthUser,
    lead: { leadGenId: string; consultantId: string | null },
  ) {
    if (user.scope === 'all') return;
    const visible = await this.scope.visibleUserIds(user);
    if (visible === 'all') return;
    if (
      visible.includes(lead.leadGenId) ||
      (lead.consultantId && visible.includes(lead.consultantId))
    ) {
      return;
    }
    throw new ForbiddenException('Lead is out of your visibility scope');
  }

  private async assertCanWrite(
    user: AuthUser,
    lead: { leadGenId: string; consultantId: string | null },
  ) {
    if (user.permissions.has(PERMISSIONS.SYSTEM_ADMIN)) return;
    // Team writers may edit leads within their scope.
    if (user.permissions.has(PERMISSIONS.LEADS_WRITE_TEAM)) {
      const visible = await this.scope.visibleUserIds(user);
      if (
        visible === 'all' ||
        visible.includes(lead.leadGenId) ||
        (lead.consultantId && visible.includes(lead.consultantId))
      ) {
        return;
      }
    }
    // Own writers may edit leads they own or are the consultant on.
    if (user.permissions.has(PERMISSIONS.LEADS_WRITE_OWN)) {
      if (
        user.id === lead.leadGenId ||
        user.id === lead.consultantId
      ) {
        return;
      }
    }
    throw new ForbiddenException('You cannot edit this lead');
  }

  private async nextSaleRef(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const count = await tx.sale.count();
    return `S-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}
