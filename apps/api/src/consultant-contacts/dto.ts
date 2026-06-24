import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// AU mobile, accepts pretty/intl formats — service normalises to "04XX XXX XXX".
// Empty string is allowed (clears the override for that brand).
const AU_MOBILE = /^(?:\+?61|0)[\s-]?4(?:[\s-]?\d){8}$|^$/;
// ClickSend alphanumeric sender ID: 3–11 chars, letters/digits, no spaces.
const SENDER_ID = /^[A-Za-z0-9]{3,11}$|^$/;

export class UpsertConsultantContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(AU_MOBILE, {
    message:
      'contactPhoneAstra must be a 10-digit Australian mobile starting with 04 (e.g. 0412 345 678), or blank.',
  })
  contactPhoneAstra?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(SENDER_ID, {
    message:
      'senderIdAstra must be 3–11 letters/digits, no spaces (e.g. ASTRASOLAR), or blank.',
  })
  senderIdAstra?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(AU_MOBILE, {
    message:
      'contactPhoneDc must be a 10-digit Australian mobile starting with 04 (e.g. 0412 345 678), or blank.',
  })
  contactPhoneDc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(SENDER_ID, {
    message:
      'senderIdDc must be 3–11 letters/digits, no spaces (e.g. DCSOLAR), or blank.',
  })
  senderIdDc?: string;
}
