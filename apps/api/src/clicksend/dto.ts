import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Send an outbound SMS via ClickSend. Either target a lead (so the message is
 * linked + the recipient/brand can be resolved from the lead) or pass a raw
 * `to` number. `body` is the message text.
 */
export class SendSmsDto {
  // Link + recipient/brand resolution. If provided, the lead's phone is used
  // as the default recipient and the lead's company as the sender brand.
  @IsOptional()
  @IsString()
  leadId?: string;

  // Explicit recipient (overrides the lead phone). AU mobile or E.164.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  // Which brand's sender ID to use. Defaults to the lead's company, else ASTRA.
  @IsOptional()
  @IsIn(['ASTRA', 'DC'])
  brand?: 'ASTRA' | 'DC';

  @IsString()
  @IsNotEmpty()
  @MaxLength(1530) // up to ~10 SMS segments
  body!: string;
}
