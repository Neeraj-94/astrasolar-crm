import {
  BadRequestException,
  ConflictException,
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
import { AvailabilityService } from '../scheduling/availability.service';
import type { AuthUser } from '../common/auth-user';
import type {
  AddActivityDto,
  BookLeadDto,
  BookLeadSlotDto,
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
    private readonly availability: AvailabilityService,
  ) {}

  async list(
    user: AuthUser,
    filters: {
      stage?: LeadStage;
      disposition?: SalesDisposition | SalesDisposition[];
      outcome?: LeadOutcome | LeadOutcome[];
      userId?: string;
    } = {},
  ) {
    const scopeWhere = await this.scope.leadWhere(user, filters.userId);
    if (filters.stage) scopeWhere.stage = filters.stage;
    // Blacklisted leads are soft-deleted (Leads -> Blacklist Leads sweep) and
    // never surface in the No Answers tab or other lead lists.
    scopeWhere.blacklisted = false;

    // Match leads in EITHER set: disposition-in-set OR outcome-in-set. Kept as
    // a separate OR branch (AND'd with the scope filter) so it never clobbers
    // the scope's own OR clause.
    const statusOr: Prisma.LeadWhereInput[] = [];
    if (filters.disposition) {
      statusOr.push({
        disposition: Array.isArray(filters.disposition)
          ? { in: filters.disposition }
          : filters.disposition,
      });
    }
    if (filters.outcome) {
      statusOr.push({
        outcome: Array.isArray(filters.outcome)
          ? { in: filters.outcome }
          : filters.outcome,
      });
    }

    const where: Prisma.LeadWhereInput =
      statusOr.length === 0
        ? scopeWhere
        : {
            AND: [
              scopeWhere,
              statusOr.length === 1 ? statusOr[0] : { OR: statusOr },
            ],
          };

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
   * Book an existing lead into a consultant's Leads Schedule slot — the same
   * day/slot picker the Bloome tab uses (Book Appointment). Creates a linked
   * Appointment on the schedule grid (contact snapshot from the lead), stamps
   * the lead BOOKED/APPOINTMENT, and clears any disposition (e.g. NO_ANSWER) so
   * a rebooked lead leaves the No Answers list. Availability + slot-occupancy
   * are guarded exactly like the Bloome booking path.
   */
  async bookIntoSlot(user: AuthUser, id: string, dto: BookLeadSlotDto) {
    const lead = await this.loadForWrite(user, id);
    const pad = (n: number) => String(n).padStart(2, '0');

    const startsAt = new Date(
      `${dto.date}T${pad(dto.hour)}:${pad(dto.minute)}:00`,
    );
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const check = await this.availability.canBook({
      consultantId: dto.consultantId,
      startsAt,
      endsAt,
    });
    if (!check.ok) {
      throw new BadRequestException(
        `Consultant is not available at that time: ${check.conflicts
          .map((c) => c.reason)
          .join('; ')}`,
      );
    }

    const dbDate = new Date(`${dto.date}T00:00:00.000Z`);
    const taken = await this.prisma.appointment.findFirst({
      where: {
        consultantId: dto.consultantId,
        date: dbDate,
        hour: dto.hour,
        minute: dto.minute,
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('That timeslot is already booked.');
    }

    const customerName =
      [lead.firstName, lead.surName].filter(Boolean).join(' ').trim() || null;
    const bookingTime = `${pad(dto.hour)}:${dto.minute === 0 ? '00' : '30'}`;

    // Carry the lead's prior booked slot into the appointment's reschedule
    // audit, so a rebook reads as a move on the schedule.
    const prevHour = lead.bookingTime
      ? Number(lead.bookingTime.split(':')[0])
      : NaN;
    const prevMinute = lead.bookingTime
      ? Number(lead.bookingTime.split(':')[1])
      : NaN;
    const hasPrevSlot =
      !!lead.bookingDate &&
      Number.isFinite(prevHour) &&
      Number.isFinite(prevMinute);

    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          leadId: lead.id,
          consultantId: dto.consultantId,
          date: dbDate,
          hour: dto.hour,
          minute: dto.minute,
          durationMinutes: 30,
          bookedByUserId: user.id,
          bookedByName: user.name,
          source: lead.source,
          company: lead.company,
          bills: lead.billSpend,
          notes: lead.consultantNotes ?? lead.leadGenNotes,
          customerName,
          firstName: lead.firstName,
          lastName: lead.surName,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
          state: lead.state,
          postcode: lead.postCode,
          originalDate: hasPrevSlot ? lead.bookingDate : undefined,
          originalHour: hasPrevSlot ? prevHour : undefined,
          originalMinute: hasPrevSlot ? prevMinute : undefined,
          rescheduledAt: hasPrevSlot ? new Date() : undefined,
        },
      });
      const updated = await tx.lead.update({
        where: { id },
        data: {
          stage: LeadStage.BOOKED,
          outcome: LeadOutcome.APPOINTMENT,
          disposition: null,
          consultantId: dto.consultantId,
          bookingDate: dbDate,
          bookingTime,
        },
      });
      await this.history.recordFromLead(tx, updated, user.id);
      await this.audit.record(
        {
          userId: user.id,
          action: 'LEAD_REBOOKED',
          entity: 'Lead',
          entityId: id,
          metadata: {
            appointmentId: created.id,
            consultantId: dto.consultantId,
            date: dto.date,
            hour: dto.hour,
            minute: dto.minute,
          },
        },
        tx,
      );
      return created;
    });

    return { ok: true, appointment };
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

  // ==========================================================================
  //  AUDIT — read-only, team-wide trail of every change to any lead.
  //
  //  Powers the Leads -> Audit Logs tab. Reads the append-only AuditLog rows
  //  the existing lead mutations already write (outcome/booking/disposition/
  //  reassign/convert). Visibility is TEAM-WIDE: any user who can open the
  //  Leads dashboard sees every lead-gen user's changes — the route is gated
  //  on DASHBOARD_LEADGEN, not on the record-visibility scope, by design.
  //
  //  Each row is flattened for the table: field changed (+ old/new value when
  //  the writer captured them in metadata), originating tab/context, acting
  //  user, the affected lead's reference, and a timestamp.
  // ==========================================================================
  async listAudit(filters: {
    leadId?: string;
    userId?: string;
    action?: string;
    from?: string;
    to?: string;
    take?: number;
  }) {
    const take = Math.min(filters.take ?? 200, 500);

    // Date-range bound on createdAt (inclusive). `to` is widened to end-of-day.
    const createdAt =
      filters.from || filters.to
        ? {
            gte: filters.from ? new Date(filters.from) : undefined,
            lte: filters.to
              ? new Date(`${filters.to}T23:59:59.999Z`)
              : undefined,
          }
        : undefined;

    // Lead-affecting audit rows. LEAD_* actions are recorded on entity "Lead";
    // conversion is recorded on entity "Sale" but carries the originating
    // leadId in metadata, so include those too and resolve them back.
    const where: Prisma.AuditLogWhereInput = {
      action: filters.action || undefined,
      createdAt,
      userId: filters.userId || undefined,
      OR: [
        {
          entity: 'Lead',
          ...(filters.leadId ? { entityId: filters.leadId } : {}),
        },
        {
          entity: 'Sale',
          action: 'LEAD_CONVERTED',
          ...(filters.leadId
            ? { metadata: { path: ['leadId'], equals: filters.leadId } }
            : {}),
        },
      ],
    };

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Resolve acting-user display names.
    const actorIds = [...new Set(rows.map((r) => r.userId))];
    const actors = await this.prisma.user.findMany({
      where: { id: { in: actorIds } },
      select: { id: true, name: true, email: true },
    });
    const actorById = new Map(actors.map((u) => [u.id, u]));

    // Resolve the affected lead reference for each row. For Sale-entity
    // conversion rows the lead id lives in metadata.leadId.
    const leadIdOf = (r: (typeof rows)[number]): string | null => {
      if (r.entity === 'Lead') return r.entityId;
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return typeof meta.leadId === 'string' ? meta.leadId : null;
    };
    const leadIds = [
      ...new Set(rows.map(leadIdOf).filter(Boolean) as string[]),
    ];
    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds } },
      select: { id: true, firstName: true, surName: true, phone: true },
    });
    const leadById = new Map(leads.map((l) => [l.id, l]));

    return rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const leadId = leadIdOf(r);
      const lead = leadId ? leadById.get(leadId) : null;
      const actor = actorById.get(r.userId);

      // Field / old / new — surfaced when the writer captured them. Falls back
      // to a best-effort read of common metadata shapes per action.
      const field =
        (typeof meta.field === 'string' && meta.field) ||
        ACTION_FIELD[r.action] ||
        null;
      const oldValue = meta.oldValue ?? meta.old ?? meta.from ?? null;
      const newValue =
        meta.newValue ??
        meta.new ??
        meta.to ??
        meta.outcome ??
        meta.disposition ??
        meta.consultantId ??
        meta.newOwnerId ??
        null;
      const context =
        (typeof meta.tab === 'string' && meta.tab) ||
        (typeof meta.context === 'string' && meta.context) ||
        r.source ||
        null;

      return {
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        leadId,
        leadName: lead ? `${lead.firstName} ${lead.surName}`.trim() : null,
        leadPhone: lead?.phone ?? null,
        actorId: r.userId,
        actorName: actor?.name ?? null,
        actorEmail: actor?.email ?? null,
        field,
        oldValue: oldValue === null ? null : stringifyValue(oldValue),
        newValue: newValue === null ? null : stringifyValue(newValue),
        context,
        source: r.source,
        metadata: r.metadata,
      };
    });
  }
}

// Human-friendly field label per action, used when the writer didn't record an
// explicit `field` in metadata. Keep in sync with the lead mutation methods.
const ACTION_FIELD: Record<string, string> = {
  LEAD_OUTCOME_CHANGED: 'outcome',
  LEAD_DISPOSITION_CHANGED: 'disposition',
  BOOKING_CREATED: 'booking',
  LEAD_REASSIGNED: 'leadGenId',
  LEAD_CONVERTED: 'stage',
};

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
