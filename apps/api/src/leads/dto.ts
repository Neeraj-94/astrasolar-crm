import {
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
 * present in the payload are written. `outcome` stays a free string in the
 * schema (sheet truth), but the web UI restricts it to the known label set.
 */
export class UpdateBloomeLeadDto {
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
  @MaxLength(2000)
  notes?: string | null;
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
