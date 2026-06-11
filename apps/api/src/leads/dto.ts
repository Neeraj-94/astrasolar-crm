import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Company,
  LeadOutcome,
  LeadSource,
  SalesDisposition,
} from '@astra/shared';

class InlineContactDto {
  @IsString() firstName!: string;
  @IsString() surname!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() streetAddress?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() postcode?: string;
}

export class CreateLeadDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => InlineContactDto)
  contact?: InlineContactDto;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsEnum(Company)
  company!: Company;

  @IsOptional()
  @IsEnum(LeadSource)
  source?: LeadSource;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsDateString()
  leadDate!: string;

  @IsOptional()
  @IsNumber()
  billSpend?: number;

  @IsOptional()
  @IsNumber()
  estValue?: number;

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
