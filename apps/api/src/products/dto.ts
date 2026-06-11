import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ProductCategory } from '@astra/shared';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  productRef?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @IsOptional()
  @IsInt()
  stc?: number;

  @IsOptional()
  @IsNumber()
  commission?: number;

  @IsOptional()
  @IsNumber()
  rrp?: number;

  @IsOptional()
  @IsNumber()
  grossPrice?: number;

  @IsOptional()
  @IsInt()
  panelWatt?: number;

  @IsOptional()
  @IsNumber()
  batterySize?: number;

  @IsOptional()
  @IsInt()
  batteryModules?: number;

  @IsOptional()
  @IsString()
  inverterType?: string;

  @IsOptional()
  @IsBoolean()
  optimisers?: boolean;
}

export class UpdateProductDto extends CreateProductDto {}
