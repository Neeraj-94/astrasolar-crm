import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Integration credentials update. Every field is optional; an empty string
 * clears that setting, an omitted field is left unchanged. Secret fields
 * (apiKey / apiToken) are write-only — never read back.
 */
export class IntegrationSettingsUpdateDto {
  // ClickSend
  @IsOptional() @IsString() @MaxLength(200)
  clicksendUsername?: string;

  @IsOptional() @IsString() @MaxLength(400)
  clicksendApiKey?: string;

  // Aircall
  @IsOptional() @IsString() @MaxLength(200)
  aircallApiId?: string;

  @IsOptional() @IsString() @MaxLength(400)
  aircallApiToken?: string;

  // Google Sheets
  @IsOptional() @IsString() @MaxLength(400)
  sheetsApiKey?: string;

  @IsOptional() @IsString() @MaxLength(200)
  sheetsSpreadsheetId?: string;

  // Anthropic
  @IsOptional() @IsString() @MaxLength(400)
  anthropicApiKey?: string;
}
