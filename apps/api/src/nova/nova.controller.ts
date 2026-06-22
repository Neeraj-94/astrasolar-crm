import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@astra/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NovaService } from './nova.service';
import { NovaVoiceService } from './nova-voice.service';
import {
  NovaSettingsService,
  NOVA_SETTING_KEYS,
} from './nova-settings.service';
import { Audit, CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/auth-user';
import {
  NovaChatDto,
  NovaKbUpsertDto,
  NovaMemoryUpsertDto,
  NovaSettingsUpdateDto,
  NovaSpeakDto,
} from './dto';

/**
 * Nova's HTTP surface, under /api/v1/nova. Everything sits behind the global
 * JwtAuthGuard; chat requires `nova:use`, the Knowledge Brain admin endpoints
 * require `nova:manage`.
 */
@ApiTags('nova')
@Controller('nova')
export class NovaController {
  constructor(
    private readonly nova: NovaService,
    private readonly voice: NovaVoiceService,
    private readonly settings: NovaSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Chat + conversations (nova:use) ─────────────────────────────────────────

  @RequirePermissions(PERMISSIONS.NOVA_USE)
  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: NovaChatDto) {
    return this.nova.chat(user, dto);
  }

  @RequirePermissions(PERMISSIONS.NOVA_USE)
  @Get('conversations')
  conversations(@CurrentUser() user: AuthUser) {
    return this.nova.listConversations(user);
  }

  /**
   * D-ID avatar credentials for the animated Nova avatar. The client key is a
   * browser-scoped D-ID agent key (domain-restricted on D-ID's side), returned
   * only to authenticated nova:use users rather than baked into the JS bundle.
   * `configured:false` → the frontend simply hides the avatar.
   */
  @RequirePermissions(PERMISSIONS.NOVA_USE)
  @Get('avatar-config')
  async avatarConfig() {
    const agentId = await this.settings.resolve(NOVA_SETTING_KEYS.DID_AGENT_ID);
    const clientKey = await this.settings.resolve(NOVA_SETTING_KEYS.DID_CLIENT_KEY);
    return { configured: !!(agentId && clientKey), agentId, clientKey };
  }

  // ── Voice & avatar settings (nova:manage) ───────────────────────────────────

  /** Client-safe settings view — secrets reported only as booleans. */
  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Get('settings')
  getSettings() {
    return this.settings.status();
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_SETTINGS_UPDATED', entity: 'NovaSetting' })
  @Patch('settings')
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() dto: NovaSettingsUpdateDto,
  ) {
    const map: Record<string, string> = {};
    if (dto.elevenLabsApiKey !== undefined)
      map[NOVA_SETTING_KEYS.ELEVENLABS_API_KEY] = dto.elevenLabsApiKey;
    if (dto.voiceId !== undefined) map[NOVA_SETTING_KEYS.VOICE_ID] = dto.voiceId;
    if (dto.ttsModel !== undefined) map[NOVA_SETTING_KEYS.TTS_MODEL] = dto.ttsModel;
    if (dto.didAgentId !== undefined)
      map[NOVA_SETTING_KEYS.DID_AGENT_ID] = dto.didAgentId;
    if (dto.didClientKey !== undefined)
      map[NOVA_SETTING_KEYS.DID_CLIENT_KEY] = dto.didClientKey;
    await this.settings.setMany(map, userId);
    return this.settings.status();
  }

  /**
   * Text-to-speech for Nova's voice. Returns audio/mpeg when ElevenLabs is
   * configured, or 204 No Content so the browser falls back to its built-in
   * speech synthesis. The ElevenLabs key never leaves the server.
   */
  @RequirePermissions(PERMISSIONS.NOVA_USE)
  @Post('speak')
  async speak(@Body() dto: NovaSpeakDto, @Res() res: Response) {
    const audio = await this.voice.synthesize(dto.text);
    if (!audio) {
      res.status(204).end();
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  }

  @RequirePermissions(PERMISSIONS.NOVA_USE)
  @Get('conversations/:id')
  conversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.nova.getConversation(user, id);
  }

  // ── Knowledge Brain — KB entries (nova:manage) ──────────────────────────────

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Get('knowledge')
  listKb(@Query('status') status?: string) {
    return this.prisma.novaKnowledgeEntry.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_KB_CREATED', entity: 'NovaKnowledgeEntry' })
  @Post('knowledge')
  createKb(@CurrentUser('id') userId: string, @Body() dto: NovaKbUpsertDto) {
    return this.prisma.novaKnowledgeEntry.create({
      data: {
        category: dto.category,
        question: dto.question,
        answer: dto.answer,
        tags: dto.tags ?? [],
        authority: dto.authority ?? null,
        source: dto.source ?? null,
        sourceDate: dto.sourceDate ? new Date(dto.sourceDate) : null,
        status: dto.status ?? 'active',
        createdBy: userId,
      },
    });
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_KB_UPDATED', entity: 'NovaKnowledgeEntry' })
  @Patch('knowledge/:id')
  updateKb(@Param('id') id: string, @Body() dto: NovaKbUpsertDto) {
    return this.prisma.novaKnowledgeEntry.update({
      where: { id },
      data: {
        category: dto.category,
        question: dto.question,
        answer: dto.answer,
        tags: dto.tags ?? [],
        authority: dto.authority ?? null,
        source: dto.source ?? null,
        sourceDate: dto.sourceDate ? new Date(dto.sourceDate) : null,
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_KB_DELETED', entity: 'NovaKnowledgeEntry' })
  @Delete('knowledge/:id')
  deleteKb(@Param('id') id: string) {
    // Soft-deprecate rather than hard-delete (keeps audit lineage).
    return this.prisma.novaKnowledgeEntry.update({
      where: { id },
      data: { status: 'deprecated' },
    });
  }

  // ── Knowledge Brain — learned memory (nova:manage) ──────────────────────────

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Get('memory')
  listMemory(@Query('category') category?: string) {
    return this.prisma.novaMemory.findMany({
      where: { active: true, ...(category ? { category } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_MEMORY_CREATED', entity: 'NovaMemory' })
  @Post('memory')
  createMemory(@CurrentUser('id') userId: string, @Body() dto: NovaMemoryUpsertDto) {
    return this.prisma.novaMemory.create({
      data: { category: dto.category, fact: dto.fact, createdBy: userId },
    });
  }

  @RequirePermissions(PERMISSIONS.NOVA_MANAGE)
  @Audit({ action: 'NOVA_MEMORY_FORGOTTEN', entity: 'NovaMemory' })
  @Delete('memory/:id')
  forgetMemory(@Param('id') id: string) {
    return this.prisma.novaMemory.update({
      where: { id },
      data: { active: false },
    });
  }
}
