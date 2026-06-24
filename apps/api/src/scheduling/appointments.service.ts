import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Company, LeadOutcome, LeadSource, LeadStage } from '@astra/shared';
import type { Appointment } from '../db';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { LeadHistoryService } from '../history/lead-history.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityService } from './availability.service';
import type { AuthUser } from '../common/auth-user';
import {
  VACATING_DISPOSITIONS,
  type CreateAppointmentDto,
  type UpdateAppointmentDto,
} from './dto';

const isoToDbDate = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dbDateToISO = (d: Date) => d.toISOString().slice(0, 10);

/** Slot -> "HH:MM" 24h label, mirroring the denormalised Lead.bookingTime. */
const slotToTime = (hour: number, minute: number) =>
  `${String(hour).padStart(2, '0')}:${minute === 30 ? '30' : '00'}`;

/** Map free-form appointment source text to a LeadSource enum value. */
const toLeadSource = (raw?: string | null): LeadSource => {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'brighte':
      return LeadSource.BRIGHTE;
    case 'referral':
      return LeadSource.REFERRAL;
    case 'website':
      return LeadSource.WEBSITE;
    case 'bloome':
    case 'bloom':
    case 'bloom astra':
    case 'bloom_astra':
      return LeadSource.BLOOM_ASTRA;
    default:
      return LeadSource.INBOUND;
  }
};

/** Map free-form appointment company text to a Company enum value. */
const toCompany = (raw?: string | null): Company =>
  (raw ?? '').trim().toLowerCase().startsWith('dc')
    ? Company.DC
    : Company.ASTRA;

/**
 * Leads Schedule grid rows. Contact fields are denormalised snapshots
 * (imported from the legacy database); shape mirrors the legacy web
 * `ScheduleAppointment` so the existing client renders unchanged.
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly leadHistory: LeadHistoryService,
    private readonly notifications: NotificationsService,
    private readonly availability: AvailabilityService,
  ) {}

  private toWire(r: Appointment) {
    return {
      id: r.id,
      leadId: r.leadId,
      consultantId: r.consultantId,
      date: dbDateToISO(r.date),
      hour: r.hour,
      minute: r.minute,
      slotKey: `${r.hour}:${r.minute === 0 ? '00' : '30'}`,
      durationMinutes: r.durationMinutes,

      customer:
        r.customerName ||
        [r.firstName, r.lastName].filter(Boolean).join(' ').trim() ||
        '—',
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      email: r.email,
      address: r.address,
      suburb: r.suburb,
      postcode: r.postcode,
      state: r.state,
      bills: r.bills,
      source: r.source,
      company: r.company,
      notes: r.notes,

      disposition: r.disposition,
      bookedByUserId: r.bookedByUserId,
      bookedByName: r.bookedByName,
      isAdditional: r.isAdditional,
      cancelPending: r.cancelPending,
    };
  }

  async list(args: {
    from: string;
    to: string;
    consultantIds?: string[];
    dispositions?: string[];
    bookedByUserId?: string;
  }) {
    const rows = await this.prisma.appointment.findMany({
      where: {
        // Blacklisted appointments are soft-deleted (Blacklist Leads sweep).
        blacklisted: false,
        date: { gte: isoToDbDate(args.from), lte: isoToDbDate(args.to) },
        ...(args.consultantIds?.length
          ? { consultantId: { in: args.consultantIds } }
          : {}),
        ...(args.dispositions?.length
          ? { disposition: { in: args.dispositions } }
          : {}),
        ...(args.bookedByUserId
          ? { bookedByUserId: args.bookedByUserId }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { hour: 'asc' }, { minute: 'asc' }],
    });

    return rows.map((r) => this.toWire(r));
  }

  /**
   * Inline entry from the Leads Schedule grid (legacy lgCreateLead).
   * Slot-occupancy guard mirrors the Bloome booking path; availability is
   * already surfaced in the grid so a hard canBook gate is not re-run here —
   * the schedule allows admin-class users to force-book like the legacy app.
   */
  async create(user: AuthUser, dto: CreateAppointmentDto) {
    const dbDate = isoToDbDate(dto.date);
    const minute = dto.minute ?? 0;

    const taken = await this.prisma.appointment.findFirst({
      where: {
        consultantId: dto.consultantId,
        date: dbDate,
        hour: dto.hour,
        minute,
      },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('That timeslot is already booked.');
    }

    // Strict availability gate: a lead can only be entered on an hour the
    // consultant has explicitly submitted as AVAILABLE for that week.
    const bookable = await this.availability.isHourBookable(
      dto.consultantId,
      dto.date,
      dto.hour,
    );
    if (!bookable) {
      throw new ConflictException(
        'That timeslot is not in the consultant’s submitted availability.',
      );
    }

    const customerName =
      [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim() || null;

    // Booking a lead into the schedule must also land it in the leads database.
    // Lead creation, its state-log snapshot, and the Appointment row all commit
    // together so the schedule can never hold a lead the Leads board never saw.
    const { row } = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.create({
        data: {
          firstName: dto.firstName?.trim() || '—',
          surName: dto.lastName?.trim() || '—',
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          postCode: dto.postcode ?? null,
          state: dto.state ?? null,
          billSpend: dto.bills ?? null,
          source: toLeadSource(dto.source),
          company: toCompany(dto.company),
          leadGenId: user.id, // booker owns the intake
          consultantId: dto.consultantId, // mirrors the booking
          // Booked straight into a timeslot -> BOOKED / APPOINTMENT.
          stage: LeadStage.BOOKED,
          outcome: LeadOutcome.APPOINTMENT,
          bookingDate: dbDate,
          bookingTime: slotToTime(dto.hour, minute),
          leadGenNotes: dto.notes ?? null,
        },
      });
      await this.leadHistory.recordFromLead(tx, lead, user.id);

      const created = await tx.appointment.create({
        data: {
          leadId: lead.id,
          consultantId: dto.consultantId,
          date: dbDate,
          hour: dto.hour,
          minute,
          durationMinutes: 60,
          bookedByUserId: user.id,
          bookedByName: user.name,
          customerName,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
          phone: dto.phone ?? null,
          email: dto.email ?? null,
          address: dto.address ?? null,
          suburb: dto.suburb ?? null,
          state: dto.state ?? null,
          postcode: dto.postcode ?? null,
          bills: dto.bills ?? null,
          source: dto.source ?? null,
          company: dto.company ?? null,
          notes: dto.notes ?? null,
        },
      });

      await this.audit.record(
        {
          userId: user.id,
          action: 'LEAD_CREATED',
          entity: 'Lead',
          entityId: lead.id,
          metadata: { via: 'schedule_appointment', appointmentId: created.id },
        },
        tx,
      );

      return { lead, row: created };
    });

    await this.audit.record({
      userId: user.id,
      action: 'APPOINTMENT_CREATED',
      entity: 'Appointment',
      entityId: row.id,
      metadata: {
        consultantId: dto.consultantId,
        date: dto.date,
        hour: dto.hour,
        leadId: row.leadId,
      },
    });

    return this.toWire(row);
  }

  /** Inline edit / reschedule (legacy lgSaveEdit + lgOpenReschedule commit). */
  async update(user: AuthUser, id: string, dto: UpdateAppointmentDto) {
    const existing = await this.prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Appointment not found');

    // The disposition is the assigned consultant's call: only they may set it.
    // `been_rescheduled` is excluded — that is the system transition applied
    // when a lead is rebooked through the schedule, not a consultant verdict.
    if (
      dto.disposition !== undefined &&
      dto.disposition !== 'been_rescheduled' &&
      existing.consultantId !== user.id
    ) {
      throw new ForbiddenException(
        'Only the assigned consultant can change the disposition.',
      );
    }

    const destConsultantId = dto.consultantId ?? existing.consultantId;
    const consultantChanged = destConsultantId !== existing.consultantId;

    const moving =
      consultantChanged ||
      (dto.date !== undefined && dto.date !== dbDateToISO(existing.date)) ||
      (dto.hour !== undefined && dto.hour !== existing.hour) ||
      (dto.minute !== undefined && dto.minute !== existing.minute);

    if (moving) {
      const destDate = dto.date ?? dbDateToISO(existing.date);
      const destHour = dto.hour ?? existing.hour;
      const taken = await this.prisma.appointment.findFirst({
        where: {
          consultantId: destConsultantId,
          date: dto.date ? isoToDbDate(dto.date) : existing.date,
          hour: destHour,
          minute: dto.minute ?? existing.minute,
          id: { not: id },
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('That timeslot is already booked.');
      }

      // Moving a lead must land on a submitted-available hour for the
      // destination consultant as well.
      const bookable = await this.availability.isHourBookable(
        destConsultantId,
        destDate,
        destHour,
      );
      if (!bookable) {
        throw new ConflictException(
          'That timeslot is not in the consultant’s submitted availability.',
        );
      }
    }

    const customerName =
      dto.firstName !== undefined || dto.lastName !== undefined
        ? [
            dto.firstName ?? existing.firstName,
            dto.lastName ?? existing.lastName,
          ]
            .filter(Boolean)
            .join(' ')
            .trim() || null
        : undefined;

    // Disposition transition. Setting a "vacating" disposition (e.g. reschedule)
    // empties the timeslot: the lead drops into the Additional Leads section.
    const dispositionChanged =
      dto.disposition !== undefined && dto.disposition !== existing.disposition;
    const becomingVacating =
      dto.disposition !== undefined &&
      VACATING_DISPOSITIONS.includes(dto.disposition);

    const row = await this.prisma.appointment.update({
      where: { id },
      data: {
        ...(consultantChanged ? { consultantId: destConsultantId } : {}),
        ...(dto.date !== undefined ? { date: isoToDbDate(dto.date) } : {}),
        ...(dto.hour !== undefined ? { hour: dto.hour } : {}),
        ...(dto.minute !== undefined ? { minute: dto.minute } : {}),
        ...(moving
          ? {
              originalDate: existing.date,
              originalHour: existing.hour,
              originalMinute: existing.minute,
              rescheduleReason: dto.rescheduleReason ?? null,
              rescheduledAt: new Date(),
            }
          : {}),
        ...(dto.disposition !== undefined
          ? { disposition: dto.disposition, isAdditional: becomingVacating }
          : {}),
        ...(customerName !== undefined ? { customerName } : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.suburb !== undefined ? { suburb: dto.suburb } : {}),
        ...(dto.state !== undefined ? { state: dto.state } : {}),
        ...(dto.postcode !== undefined ? { postcode: dto.postcode } : {}),
        ...(dto.bills !== undefined ? { bills: dto.bills } : {}),
        ...(dto.source !== undefined ? { source: dto.source } : {}),
        ...(dto.company !== undefined ? { company: dto.company } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    // Keep the linked lead's consultant assignment in step with the move.
    if (consultantChanged && row.leadId) {
      await this.prisma.lead.update({
        where: { id: row.leadId },
        data: { consultantId: destConsultantId },
      });
    }

    await this.audit.record({
      userId: user.id,
      action: dispositionChanged
        ? 'APPOINTMENT_DISPOSITION_CHANGED'
        : moving
          ? 'APPOINTMENT_RESCHEDULED'
          : 'APPOINTMENT_UPDATED',
      entity: 'Appointment',
      entityId: id,
      metadata: dispositionChanged
        ? { disposition: dto.disposition }
        : moving
          ? {
              from: `${dbDateToISO(existing.date)} ${existing.hour}:${existing.minute}`,
              to: `${dto.date ?? dbDateToISO(existing.date)} ${dto.hour ?? existing.hour}:${dto.minute ?? existing.minute}`,
            }
          : undefined,
    });

    // When a lead is dispositioned RESCHEDULE, tell the lead-gen who booked it
    // that it has left the schedule and now needs rebooking.
    if (
      dispositionChanged &&
      dto.disposition === 'reschedule' &&
      row.bookedByUserId
    ) {
      await this.notifyRescheduleNeeded(user, row);
    }

    return this.toWire(row);
  }

  /** Notify the booking lead-gen that a lead needs rebooking after RESCHEDULE. */
  private async notifyRescheduleNeeded(user: AuthUser, appt: Appointment) {
    if (!appt.bookedByUserId) return;
    const who =
      appt.customerName ||
      [appt.firstName, appt.lastName].filter(Boolean).join(' ').trim() ||
      'A lead';
    await this.notifications.create({
      userId: appt.bookedByUserId,
      type: 'LEAD_NEEDS_REBOOKING',
      title: `${who} needs rebooking`,
      body: `${who} was marked Reschedule by the consultant and has left the schedule. Rebook them into a new timeslot.`,
      entityType: 'Appointment',
      entityId: appt.id,
      actorId: user.id,
      data: {
        consultantId: appt.consultantId,
        previousDate: dbDateToISO(appt.date),
        previousHour: appt.hour,
        previousMinute: appt.minute,
      },
    });
  }

  /** Remove a lead from the schedule (legacy lgRemoveLead). */
  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.appointment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Appointment not found');

    await this.prisma.appointment.delete({ where: { id } });
    await this.audit.record({
      userId: user.id,
      action: 'APPOINTMENT_DELETED',
      entity: 'Appointment',
      entityId: id,
      metadata: {
        consultantId: existing.consultantId,
        date: dbDateToISO(existing.date),
        hour: existing.hour,
        customer: existing.customerName,
      },
    });
    return { ok: true };
  }
}
