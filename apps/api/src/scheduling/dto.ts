import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Leads Schedule appointment dispositions (legacy vocabulary). Dispositions in
// VACATING_DISPOSITIONS take the lead out of its timeslot and surface it in the
// "Additional Leads" section below the schedule.
export const APPOINTMENT_DISPOSITIONS = [
  'sold',
  'pres',
  'no_answer',
  'callback',
  'cancel',
  'dnq',
  'not_interested',
  'reschedule',
  'been_rescheduled',
] as const;
export type AppointmentDisposition = (typeof APPOINTMENT_DISPOSITIONS)[number];

// Dispositions that take the lead OUT of its timeslot into "Additional Leads".
// `been_rescheduled` is intentionally excluded: a rebooked lead lands back in
// its new slot (just badged "Has Been Rescheduled").
export const VACATING_DISPOSITIONS: AppointmentDisposition[] = [
  'cancel',
  'dnq',
  'not_interested',
  'reschedule',
];

export type AvailabilityStatusValue = 'AVAILABLE' | 'UNAVAILABLE' | 'HOLIDAY';
const STATUS_VALUES: AvailabilityStatusValue[] = [
  'AVAILABLE',
  'UNAVAILABLE',
  'HOLIDAY',
];

export class SlotUpdateDto {
  @IsString() consultantId!: string;
  @Matches(ISO_DATE) date!: string;
  @IsInt() @Min(0) @Max(23) hour!: number;
  @IsIn(STATUS_VALUES) status!: AvailabilityStatusValue;
  @IsOptional() @IsString() note?: string | null;
}

export class UpsertSlotsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SlotUpdateDto)
  updates!: SlotUpdateDto[];
}

export class WeekDayDto {
  @Matches(ISO_DATE) date!: string;
  @IsArray() @IsInt({ each: true }) availableHours!: number[];
  @IsBoolean() holiday!: boolean;
}

export class SaveWeekDto {
  @IsString() consultantId!: string;
  @IsString() consultantName!: string;
  @Matches(ISO_DATE) weekStart!: string;

  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeekDayDto)
  days!: WeekDayDto[];
}

export class BookingCheckDto {
  @IsString() consultantId!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
}

// ---------------------------------------------------------------------------
// Leads Schedule appointments — inline entry / edit / reschedule / remove
// (port of the legacy lgCreateLead / lgSaveEdit / lgRemoveLead write paths).
// ---------------------------------------------------------------------------

export class CreateAppointmentDto {
  @IsString() consultantId!: string;
  @Matches(ISO_DATE) date!: string;
  @IsInt() @Min(0) @Max(23) hour!: number;
  @IsOptional() @IsInt() @IsIn([0, 30]) minute?: number;

  @IsOptional() @IsString() firstName?: string | null;
  @IsOptional() @IsString() lastName?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() suburb?: string | null;
  @IsOptional() @IsString() state?: string | null;
  @IsOptional() @IsString() postcode?: string | null;
  @IsOptional() @IsString() bills?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() company?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

export class UpdateAppointmentDto {
  // Reschedule (both optional — when present together the row moves slot)
  @IsOptional() @Matches(ISO_DATE) date?: string;
  @IsOptional() @IsInt() @Min(0) @Max(23) hour?: number;
  @IsOptional() @IsInt() @IsIn([0, 30]) minute?: number;
  @IsOptional() @IsString() rescheduleReason?: string | null;

  // Consultant disposition. Setting a VACATING value (e.g. reschedule) empties
  // the timeslot and moves the lead into the Additional Leads section.
  @IsOptional() @IsIn(APPOINTMENT_DISPOSITIONS) disposition?: AppointmentDisposition;

  @IsOptional() @IsString() firstName?: string | null;
  @IsOptional() @IsString() lastName?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() suburb?: string | null;
  @IsOptional() @IsString() state?: string | null;
  @IsOptional() @IsString() postcode?: string | null;
  @IsOptional() @IsString() bills?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsString() company?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
