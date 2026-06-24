import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Trigger an outbound Aircall click-to-dial. Either pass a `leadId` (the lead's
 * phone is dialled) or an explicit `to` number. The Aircall agent is resolved
 * from the calling user's email unless `aircallUserId` is given; the outbound
 * line defaults to AIRCALL_DEFAULT_NUMBER_ID unless `numberId` is given.
 */
export class ClickToDialDto {
  @IsOptional()
  @IsString()
  leadId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  // Aircall user id to place the call from (overrides email resolution).
  @IsOptional()
  @IsString()
  aircallUserId?: string;

  // Aircall number/line id to dial out on (overrides the env default).
  @IsOptional()
  @IsString()
  numberId?: string;
}
