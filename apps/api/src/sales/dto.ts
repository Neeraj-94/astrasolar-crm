import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  Company,
  SaleStatus,
  SaleType,
  StageState,
  SystemType,
} from '@astra/shared';

export class UpdateSaleStatusDto {
  @IsEnum(SaleStatus)
  status!: SaleStatus;
}

export class UpdateSaleCoreDto {
  @IsOptional() @IsEnum(SaleType) saleType?: SaleType;
  @IsOptional() @IsEnum(SystemType) systemType?: SystemType;
  @IsOptional() @IsEnum(Company) company?: Company;
  @IsOptional() @IsString() openSolarId?: string;
  @IsOptional() @IsString() saleDate?: string; // ISO yyyy-mm-dd
  @IsOptional() @IsString() energyProvider?: string;
  @IsOptional() @IsString() referral?: string;
  @IsOptional() @IsNumber() soldPrice?: number;
  @IsOptional() @IsNumber() totalRRP?: number;
  @IsOptional() @IsNumber() totalCommission?: number;
  @IsOptional() @IsString() installNotes?: string;
}

export class UpdateSystemDetailsDto {
  @IsOptional() @IsString() batteryProductId?: string;
  @IsOptional() @IsString() panelProductId?: string;
  @IsOptional() @IsString() inverterProductId?: string;
  @IsOptional() @IsInt() numPanels?: number;
  @IsOptional() @IsNumber() systemSize?: number;
  @IsOptional() @IsInt() tilts?: number;
  @IsOptional() @IsString() roofType?: string;
  @IsOptional() @IsInt() storeys?: number;
  @IsOptional() @IsString() switchboard?: string;
  @IsOptional() @IsString() nmi?: string;
  @IsOptional() @IsString() phase?: string;
  // Free-text spec overrides (persisted straight onto the SystemDetails snapshot).
  @IsOptional() @IsString() panelModel?: string;
  @IsOptional() @IsString() inverterModel?: string;
  @IsOptional() @IsString() batteryModel?: string;
  @IsOptional() @IsString() batteryBrand?: string;
  @IsOptional() @IsString() backup?: string;
  @IsOptional() @IsString() hotWater?: string;
  @IsOptional() @IsString() aircon?: string;
}

export class UpdatePaymentDetailsDto {
  @IsOptional() @IsString() paymentDate?: string; // ISO yyyy-mm-dd
  @IsOptional() @IsString() paymentNotes?: string;
}

export class UpdateStatusDetailsDto {
  @IsOptional() @IsEnum(StageState) financeStatus?: StageState;
  @IsOptional() @IsEnum(StageState) preapprovalStatus?: StageState;
  @IsOptional() @IsEnum(StageState) meterChangeStatus?: StageState;
  @IsOptional() @IsEnum(StageState) installStatus?: StageState;
  @IsOptional() @IsEnum(StageState) paymentStatus?: StageState;
  @IsOptional() @IsEnum(StageState) commissioningStatus?: StageState;
  @IsOptional() @IsEnum(StageState) cesStatus?: StageState;
}

export class AddExtraDto {
  @IsString() itemName!: string;
  @IsNumber() itemPrice!: number;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() itemRef?: string;
}

/**
 * Sales Form (ported from astrasolar-app "Generate Sales Form"). Raw form values
 * are accepted as strings/numbers and mapped to enums + records server-side.
 * Creates a Lead (CONVERTED/SOLD) + Sale + system/finance/payment detail blocks.
 */
export class CreateSaleFormDto {
  // Step 1 — Sale info (enum values + user IDs sourced from the database)
  @IsOptional() @IsString() company?: string; // Company enum value
  @IsOptional() @IsString() consultantId?: string; // sales consultant (User id)
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() saleType?: string; // SaleType enum value
  @IsOptional() @IsString() systemType?: string; // SystemType enum value
  @IsOptional() @IsString() saleDate?: string; // ISO yyyy-mm-dd
  @IsOptional() @IsString() leadGenId?: string; // lead-gen rep (User id)
  @IsOptional() @IsString() leadSource?: string; // LeadSource enum value

  // Step 2 — Customer + pricing
  @IsString() firstName!: string;
  @IsString() surName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsNumber() soldPrice?: number;
  @IsOptional() @IsNumber() batteryStc?: number;
  @IsOptional() @IsNumber() solarStc?: number;

  // Step 3 — Property
  @IsOptional() @IsString() storeys?: string;
  @IsOptional() @IsString() roofType?: string;
  @IsOptional() @IsString() phase?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() suburb?: string;
  @IsOptional() @IsString() postcode?: string;
  @IsOptional() @IsString() energyProvider?: string;
  @IsOptional() @IsString() nmi?: string;

  // Step 4 — System
  @IsOptional() @IsString() panelModel?: string;
  @IsOptional() @IsInt() numPanels?: number;
  @IsOptional() @IsNumber() systemSize?: number;
  @IsOptional() @IsInt() tilts?: number;
  @IsOptional() @IsInt() optimisers?: number;
  @IsOptional() @IsString() inverter?: string;
  @IsOptional() @IsString() batteryBrand?: string;
  @IsOptional() @IsString() switchboard?: string;

  // Step 5 — Extras
  @IsOptional() @IsString() backup?: string;
  @IsOptional() @IsString() hotWater?: string;
  @IsOptional() @IsString() aircon?: string;
  @IsOptional() @IsString() installNotes?: string;
  @IsOptional() @IsString() referral?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) financeOptions?: string[];
  /** Selected ExtraProduct ids → persisted as SaleExtra rows. */
  @IsOptional() @IsArray() @IsString({ each: true }) extraIds?: string[];
}
