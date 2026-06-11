import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { SaleStatus, SaleType, StageState, SystemType } from '@astra/shared';

export class UpdateSaleStatusDto {
  @IsEnum(SaleStatus)
  status!: SaleStatus;
}

export class UpdateSaleCoreDto {
  @IsOptional() @IsEnum(SaleType) saleType?: SaleType;
  @IsOptional() @IsEnum(SystemType) systemType?: SystemType;
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
