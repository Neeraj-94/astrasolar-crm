import { IsOptional, IsString, MaxLength } from 'class-validator';

// All fields optional at the DTO layer; the service enforces the "at least 2
// fields filled" rule (matches need >=2 fields to align), mirroring the legacy
// blAddEntry validation.
export class CreateBlacklistEntryDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
}
