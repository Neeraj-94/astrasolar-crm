import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NovaAttachmentDto {
  @IsIn(['image', 'document'])
  type!: 'image' | 'document';

  // For images: image/png | image/jpeg | image/gif | image/webp.
  // For documents: application/pdf.
  @IsString()
  mediaType!: string;

  @IsString()
  dataBase64!: string;
}

export class NovaChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  message?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NovaAttachmentDto)
  attachments?: NovaAttachmentDto[];
}

// ── Knowledge Brain admin (nova:manage) ───────────────────────────────────────

export class NovaKbUpsertDto {
  @IsString() @MaxLength(120)
  category!: string;

  @IsString() @MaxLength(500)
  question!: string;

  @IsString() @MaxLength(8000)
  answer!: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsString() @MaxLength(200)
  authority?: string;

  @IsOptional() @IsString() @MaxLength(200)
  source?: string;

  @IsOptional() @IsString()
  sourceDate?: string;

  @IsOptional() @IsIn(['active', 'deprecated'])
  status?: 'active' | 'deprecated';
}

export class NovaMemoryUpsertDto {
  @IsString() @MaxLength(80)
  category!: string;

  @IsString() @MaxLength(2000)
  fact!: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

export class NovaSpeakDto {
  @IsString() @MaxLength(5000)
  text!: string;
}

// Voice & avatar credential management (nova:manage). Every field optional —
// an empty string clears that setting; an omitted field is left unchanged.
// Secret fields (apiKey, clientKey) are write-only — never read back.
export class NovaSettingsUpdateDto {
  @IsOptional() @IsString() @MaxLength(200)
  elevenLabsApiKey?: string;

  @IsOptional() @IsString() @MaxLength(120)
  voiceId?: string;

  @IsOptional() @IsString() @MaxLength(120)
  ttsModel?: string;

  @IsOptional() @IsString() @MaxLength(200)
  didAgentId?: string;

  @IsOptional() @IsString() @MaxLength(400)
  didClientKey?: string;
}
