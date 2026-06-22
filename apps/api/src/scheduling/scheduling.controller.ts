import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import { AvailabilityService } from './availability.service';
import { AppointmentsService } from './appointments.service';
import {
  BookingCheckDto,
  CreateAppointmentDto,
  SaveWeekDto,
  UpdateAppointmentDto,
  UpsertSlotsDto,
} from './dto';

const splitIds = (v?: string) =>
  v ? v.split(',').filter(Boolean) : undefined;

/**
 * Scheduling — consultant availability + Leads Schedule appointments.
 * Migrated from the legacy web routes (`/api/leads/availability*`).
 */
@ApiTags('scheduling')
@Controller('scheduling')
export class SchedulingController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly appointments: AppointmentsService,
  ) {}

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('availability')
  listSlots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('consultantIds') consultantIds?: string,
  ) {
    return this.availability.listSlots({
      from,
      to,
      consultantIds: splitIds(consultantIds),
    });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('availability')
  async upsertSlots(@CurrentUser() user: AuthUser, @Body() dto: UpsertSlotsDto) {
    const result = await this.availability.upsertSlots(user, dto.updates);
    return { ok: true, ...result };
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('availability/submissions')
  listSubmissions(
    @Query('weekStart') weekStart: string,
    @Query('consultantIds') consultantIds?: string,
  ) {
    return this.availability.listSubmissions({
      weekStart,
      consultantIds: splitIds(consultantIds),
    });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('availability/submit')
  async submitWeek(@CurrentUser() user: AuthUser, @Body() dto: SaveWeekDto) {
    const submission = await this.availability.saveWeek(user, dto);
    return { ok: true, submission };
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Post('availability/check')
  canBook(@Body() dto: BookingCheckDto) {
    return this.availability.canBook({
      consultantId: dto.consultantId,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    });
  }

  /** Open (bookable) 30-minute slots — feeds the Book Appointment picker. */
  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('open-slots')
  listOpenSlots(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('consultantIds') consultantIds?: string,
  ) {
    return this.availability.listOpenSlots({
      from,
      to,
      consultantIds: splitIds(consultantIds) ?? [],
    });
  }

  @RequirePermissions(PERMISSIONS.RECORDS_READ_OWN)
  @Get('appointments')
  listAppointments(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('consultantIds') consultantIds?: string,
    @Query('disposition') disposition?: string,
    @Query('bookedByUserId') bookedByUserId?: string,
  ) {
    return this.appointments.list({
      from,
      to,
      consultantIds: splitIds(consultantIds),
      dispositions: splitIds(disposition),
      bookedByUserId: bookedByUserId || undefined,
    });
  }

  /** Inline entry from the Leads Schedule grid (legacy lgCreateLead). */
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Post('appointments')
  createAppointment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(user, dto);
  }

  /** Inline edit / reschedule (legacy lgSaveEdit / reschedule commit). */
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Patch('appointments/:id')
  updateAppointment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(user, id, dto);
  }

  /** Remove a lead from the schedule (legacy lgRemoveLead). */
  @RequirePermissions(PERMISSIONS.BOOKING_CREATE)
  @Delete('appointments/:id')
  removeAppointment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appointments.remove(user, id);
  }
}
