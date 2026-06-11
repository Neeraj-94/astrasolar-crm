import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  LeadOutcome,
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
    filters: { stage?: LeadStage; userId?: string } = {},
  ) {
    const where = await this.scope.leadWhere(user, filters.userId);
    if (filters.stage) where.stage = filters.stage;
    return this.prisma.lead.findMany({
      where,
      orderBy: [
        { sortOrder: { sort: 'asc', nulls: 'last' } },
        { leadDate: 'desc' },
      ],
      take: 200,
      include: {
        contact: true,
        owner: { select: { id: true, name: true } },
        currentConsultant: { select: { id: true, name: true } },
        booking: true,
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
        contact: true,
        owner: { select: { id: true, name: true } },
        currentConsultant: { select: { id: true, name: true } },
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

  /** Create a lead (+ inline contact). Writes initial state log + audit. */
  async create(user: AuthUser, dto: CreateLeadDto) {
    if (!dto.contact && !dto.contactId) {
      throw new BadRequestException('Provide contact or contactId');
    }
    const ownerId = dto.ownerId ?? user.id;

    return this.prisma.$transaction(async (tx) => {
      const contactId =
        dto.contactId ??
        (await tx.contact.create({ data: dto.contact! })).id;

      const lead = await tx.lead.create({
        data: {
          contactId,
          company: dto.company as Company,
          source: dto.source ?? 'MANUAL',
          externalRef: dto.externalRef,
          ownerId,
          stage: LeadStage.INTAKE,
          outcome: LeadOutcome.NEW,
          billSpend: dto.billSpend,
          estValue: dto.estValue,
          notes: dto.notes,
          leadDate: new Date(dto.leadDate),
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
    if (dto.outcome === LeadOutcome.BOOKED) {
      throw new BadRequestException('Use the booking endpoint to book a lead');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id },
        data: {
          outcome: dto.outcome,
          notes: dto.notes ?? lead.notes,
          stage:
            dto.outcome === LeadOutcome.NOT_INTERESTED ||
            dto.outcome === LeadOutcome.NOT_QUALIFIED
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
   * TRIGGER 1 — outcome -> BOOKED. One atomic transaction:
   *  1. create Booking (consultant, bookedBy, scheduledAt)
   *  2. set lead.stage = BOOKED, currentConsultantId, outcome = BOOKED
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
          outcome: LeadOutcome.BOOKED,
          currentConsultantId: dto.consultantId,
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
        user.id === lead.currentConsultantId ||
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
            contactId: lead.contactId,
            ownerId: lead.currentConsultantId!,
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
        data: { ownerId: newOwnerId },
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
    lead: { ownerId: string; currentConsultantId: string | null },
  ) {
    if (user.scope === 'all') return;
    const visible = await this.scope.visibleUserIds(user);
    if (visible === 'all') return;
    if (
      visible.includes(lead.ownerId) ||
      (lead.currentConsultantId && visible.includes(lead.currentConsultantId))
    ) {
      return;
    }
    throw new ForbiddenException('Lead is out of your visibility scope');
  }

  private async assertCanWrite(
    user: AuthUser,
    lead: { ownerId: string; currentConsultantId: string | null },
  ) {
    if (user.permissions.has(PERMISSIONS.SYSTEM_ADMIN)) return;
    // Team writers may edit leads within their scope.
    if (user.permissions.has(PERMISSIONS.LEADS_WRITE_TEAM)) {
      const visible = await this.scope.visibleUserIds(user);
      if (
        visible === 'all' ||
        visible.includes(lead.ownerId) ||
        (lead.currentConsultantId && visible.includes(lead.currentConsultantId))
      ) {
        return;
      }
    }
    // Own writers may edit leads they own or are the consultant on.
    if (user.permissions.has(PERMISSIONS.LEADS_WRITE_OWN)) {
      if (
        user.id === lead.ownerId ||
        user.id === lead.currentConsultantId
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
