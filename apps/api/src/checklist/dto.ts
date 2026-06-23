import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CHECKLIST_DRIVERS,
  CHECKLIST_ROOF_TYPES,
  type ChecklistDriver,
  type RoofType,
} from '@astra/shared';

export class UsageSplitDto {
  @IsNumber() @Min(0)
  day!: number;

  @IsNumber() @Min(0)
  night!: number;
}

export class PriorSystemDto {
  @IsOptional() @IsNumber()
  existingArrayKw?: number;

  @IsOptional() @IsNumber()
  existingArrayAgeYears?: number;

  @IsOptional() @IsString() @MaxLength(200)
  existingInverter?: string;

  @IsOptional() @IsString() @MaxLength(60)
  existingInverterPhase?: string;

  @IsOptional() @IsBoolean()
  working?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  existingBattery?: string;

  @IsOptional() @IsString() @MaxLength(500)
  keptRemovedAdded?: string;

  @IsOptional() @IsString() @MaxLength(300)
  disposal?: string;
}

/**
 * Save / update the checklist. Every field is optional so a partial draft can
 * be saved; the required-field set is enforced in the service ONLY when the
 * consultant asks for recommendations (so nothing is fabricated to pass
 * validation, and drafts never block).
 */
export class SaveChecklistDto {
  // ── Group 1 — lead & site ──────────────────────────────────────────────
  @IsOptional() @IsString() @MaxLength(20)
  state?: string;

  @IsOptional() @IsString() @MaxLength(20)
  nmi?: string;

  @IsOptional() @IsIn([...CHECKLIST_ROOF_TYPES])
  roofType?: RoofType;

  @IsOptional() @IsNumber() @Min(1)
  storeys?: number;

  @IsOptional() @IsString() @MaxLength(120)
  orientation?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  shadingNotes?: string;

  @IsOptional() @IsIn(['single', 'three'])
  phase?: 'single' | 'three';

  @IsOptional() @IsString() @MaxLength(200)
  switchboard?: string;

  // ── Group 2 — energy profile ───────────────────────────────────────────
  @IsOptional() @IsNumber() @Min(0)
  spendAmount?: number;

  @IsOptional() @IsIn(['quarter', 'year'])
  spendPeriod?: 'quarter' | 'year';

  @IsOptional() @IsObject() @ValidateNested() @Type(() => UsageSplitDto)
  usageSplit?: UsageSplitDto;

  @IsOptional() @IsArray() @IsIn([...CHECKLIST_DRIVERS], { each: true })
  drivers?: ChecklistDriver[];

  @IsOptional() @IsIn(['cash', 'finance', 'show_both'])
  budgetPosture?: 'cash' | 'finance' | 'show_both';

  // ── Group 3 — system category ──────────────────────────────────────────
  @IsOptional() @IsIn(['new', 'replacement', 'additional', 'both'])
  category?: 'new' | 'replacement' | 'additional' | 'both';

  @IsOptional() @IsObject() @ValidateNested() @Type(() => PriorSystemDto)
  priorSystem?: PriorSystemDto;

  // ── Group 4 — constraints / preferences ────────────────────────────────
  @IsOptional() @IsArray() @IsString({ each: true })
  preferredBrands?: string[];

  @IsOptional() @IsArray() @IsString({ each: true })
  excludedBrands?: string[];

  @IsOptional() @IsIn(['yes', 'no', 'let_ai_decide'])
  batteryPref?: 'yes' | 'no' | 'let_ai_decide';

  @IsOptional() @IsIn(['yes', 'no', 'let_ai_decide'])
  evChargerPref?: 'yes' | 'no' | 'let_ai_decide';

  @IsOptional() @IsNumber() @Min(0)
  budgetCeiling?: number;
}

export class SelectOptionDto {
  @IsString() @MaxLength(120)
  optionId!: string;
}
