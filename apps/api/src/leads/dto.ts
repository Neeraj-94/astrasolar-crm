import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  Company,
  LeadOutcome,
  LeadSource,
  SalesDisposition,
} from '@astra/shared';

export class CreateLeadDto {
  // Contact details — flattened directly onto the lead.
  @IsString() firstName!: string;
  @IsString() surName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() postCode?: string;
  @IsOptional() @IsString() state?: string;

  @IsEnum(Company)
  company!: Company;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  leadGenId?: string;

  @IsOptional()
  @IsString()
  billSpend?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOutcomeDto {
  @IsEnum(LeadOutcome)
  outcome!: LeadOutcome;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BookLeadDto {
  @IsString()
  consultantId!: string;

  @IsDateString()
  scheduledAt!: string;
}

/**
 * Book an existing lead into a consultant's Leads Schedule slot — the same
 * day/slot picker the Bloome tab uses. Mirrors BookBloomeLeadDto so the shared
 * Book Appointment dialog drives both flows.
 */
export class BookLeadSlotDto {
  @IsString()
  consultantId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string; // YYYY-MM-DD

  @IsInt()
  @Min(8)
  @Max(19)
  hour!: number;

  @IsIn([0, 30])
  minute!: number;
}

export class UpdateDispositionDto {
  @IsEnum(SalesDisposition)
  disposition!: SalesDisposition;

  @IsOptional()
  @IsString()
  consultantNotes?: string;
}

export class ReassignDto {
  @IsString()
  ownerId!: string;
}

export class AddActivityDto {
  @IsString()
  type!: string; // call | email | note | task

  @IsOptional()
  @IsString()
  content?: string;
}

// ---------------------------------------------------------------------------
// Bloome setter leads (raw sheet rows) — inline editing + booking
// ---------------------------------------------------------------------------

/**
 * Inline-editable fields on a BloomeLead row. All optional; only the keys
 * present in the payload are written. Every data field on the row is
 * editable from the list — system columns (id, region, sourceTab, rowNum,
 * createdAt, updatedAt) are intentionally omitted. `outcome` stays a free
 * string in the schema (sheet truth), but the web UI restricts it to the
 * known label set.
 */
export class UpdateBloomeLeadDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string | null;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) mobile?: string | null;
  @IsOptional() @IsString() @MaxLength(200) email?: string | null;
  @IsOptional() @IsString() @MaxLength(400) address?: string | null;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) suburb?: string | null;
  @IsOptional() @IsString() @MaxLength(60) billSpend?: string | null;
  @IsOptional() @IsString() @MaxLength(60) code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  agent?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  dials?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  outcome?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  company?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional() @IsString() @MaxLength(60) lastCalled?: string | null;
  @IsOptional() @IsString() @MaxLength(40) appDate?: string | null;
  @IsOptional() @IsString() @MaxLength(40) appTime?: string | null;
  @IsOptional() @IsString() @MaxLength(120) existingSystem?: string | null;
}

/** Book a Bloome lead into a consultant's Leads Schedule timeslot. */
export class BookBloomeLeadDto {
  @IsString()
  consultantId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string; // YYYY-MM-DD

  @IsInt()
  @Min(8)
  @Max(19)
  hour!: number;

  @IsIn([0, 30])
  minute!: number;
}

/**
 * Shared filter payload for the bulk operations — mirrors the list-view facets
 * so an action applies to exactly the set of leads currently on screen.
 */
class BloomeFilterDto {
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) outcomes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) agents?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dials?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) companies?: string[];
}

/**
 * Bulk-allocate a setter to the first N *unallocated* leads matching the
 * current filters (in the same order the table renders them).
 */
export class BulkAllocateBloomeDto extends BloomeFilterDto {
  @IsString()
  @MaxLength(120)
  agent!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;
}

/**
 * Redistribute the top N "No Answer" leads (highest dials first) matching the
 * current filters to a setter, overwriting whoever is currently assigned.
 */
export class RedistributeBloomeDto extends BloomeFilterDto {
  @IsString()
  @MaxLength(120)
  agent!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;
}

/** Edit a lead's contact / detail fields — the "Edit Lead" modal. */
export class UpdateLeadDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() surName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() postCode?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() billSpend?: string;
  @IsOptional() @IsEnum(Company) company?: Company;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() leadGenNotes?: string;
}
