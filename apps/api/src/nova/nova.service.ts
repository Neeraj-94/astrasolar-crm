// ─────────────────────────────────────────────────────────────────────────────
// nova.service — orchestrates one Nova chat turn.
//
// Ported behaviour from astrasolar-app/netlify/functions/nova-chat.mjs +
// index.html aiCallClaude():
//   1. per-user rate limit (in-memory sliding windows)
//   2. build the modular system prompt (persona + topic modules + KB + memory)
//   3. run the tool-use loop (max 5 roundtrips) against NovaToolsService
//   4. strip [LEARN::] tags from the reply and persist them as memory
//   5. persist the conversation + messages, write a usage/audit row
//
// The Anthropic key never leaves the server (NovaAnthropicService).
// ─────────────────────────────────────────────────────────────────────────────

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/auth-user';
import { PERMISSIONS } from '@astra/shared';
import { NovaAnthropicService } from './nova-anthropic.service';
import { NovaToolsService, TOOL_DEFINITIONS } from './nova-tools.service';
import { NovaKnowledgeService } from './nova-knowledge.service';
import { buildNovaSystem } from './nova-prompt';
import type { NovaChatDto } from './dto';

const MAX_TOOL_LOOPS = 8;
const HISTORY_LIMIT = 8;

interface RlBucket {
  minStart: number;
  minCount: number;
  dayStart: number;
  dayCount: number;
}

@Injectable()
export class NovaService {
  private readonly logger = new Logger(NovaService.name);
  private readonly buckets = new Map<string, RlBucket>();
  // Circuit breaker: if the upstream API ever rejects the web_search tool (e.g.
  // an older API version), we disable it for the rest of the process so chats
  // keep working without it instead of failing on every turn.
  private webSearchRuntimeDisabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: NovaAnthropicService,
    private readonly tools: NovaToolsService,
    private readonly knowledge: NovaKnowledgeService,
  ) {}

  // ── rate limiter (ported) ───────────────────────────────────────────────────
  private rateLimit(uid: string) {
    const perMin = intEnv('NOVA_RATE_LIMIT_PER_MIN', 30);
    const perDay = intEnv('NOVA_RATE_LIMIT_PER_DAY', 500);
    const now = Date.now();
    let b = this.buckets.get(uid);
    if (!b) {
      b = { minStart: now, minCount: 0, dayStart: now, dayCount: 0 };
      this.buckets.set(uid, b);
    }
    if (now - b.minStart >= 60_000) { b.minStart = now; b.minCount = 0; }
    if (now - b.dayStart >= 86_400_000) { b.dayStart = now; b.dayCount = 0; }
    if (b.minCount >= perMin) return { ok: false, reason: 'per_minute', retryAfter: 60 };
    if (b.dayCount >= perDay) return { ok: false, reason: 'per_day', retryAfter: 3600 };
    b.minCount += 1;
    b.dayCount += 1;
    return { ok: true as const };
  }

  // ── conversation helpers ────────────────────────────────────────────────────
  async listConversations(user: AuthUser) {
    return this.prisma.novaConversation.findMany({
      where: { userId: user.id, archived: false },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      take: 50,
    });
  }

  async getConversation(user: AuthUser, id: string) {
    const convo = await this.prisma.novaConversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!convo) throw new HttpException('conversation_not_found', HttpStatus.NOT_FOUND);
    return convo;
  }

  // ── the chat turn ───────────────────────────────────────────────────────────
  async chat(user: AuthUser, dto: NovaChatDto) {
    if (!this.anthropic.configured) {
      throw new HttpException(
        { error: 'server_misconfigured', reason: 'missing_anthropic_key' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const rl = this.rateLimit(user.id);
    if (!rl.ok) {
      await this.logUsage(user.id, { status: 'rate_limited', detail: rl.reason });
      throw new HttpException(
        { error: 'rate_limited', reason: rl.reason, retry_after_seconds: rl.retryAfter },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const text = (dto.message || '').trim();
    const hasAttachment = Array.isArray(dto.attachments) && dto.attachments.length > 0;
    if (!text && !hasAttachment) {
      throw new HttpException('empty_message', HttpStatus.BAD_REQUEST);
    }

    // 1. resolve / create conversation
    let conversationId = dto.conversationId || null;
    if (conversationId) {
      const exists = await this.prisma.novaConversation.findFirst({
        where: { id: conversationId, userId: user.id },
        select: { id: true },
      });
      if (!exists) conversationId = null;
    }
    if (!conversationId) {
      const created = await this.prisma.novaConversation.create({
        data: { userId: user.id, title: text.slice(0, 80) || 'New chat' },
        select: { id: true },
      });
      conversationId = created.id;
    }

    // 2. prior history for context
    const prior = await this.prisma.novaMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { role: true, content: true },
    });
    prior.reverse();

    // 3. build the system prompt with KB + memory injected
    const canManage = user.permissions.has(PERMISSIONS.NOVA_MANAGE);
    const kbResults = await this.knowledge.searchKb(text, 5);
    const knowledgeContext = this.knowledge.formatKbContext(kbResults);
    const memoryContext = await this.knowledge.formatMemoryContext();
    const webEnabled = this.anthropic.webSearchEnabled && !this.webSearchRuntimeDisabled;
    const { system, needsSmart } = buildNovaSystem(
      text,
      { name: user.name, roleKeys: user.roleKeys, canManage },
      { hasAttachment, memoryContext, knowledgeContext, webEnabled },
    );
    const model = needsSmart ? this.anthropic.smartModel : this.anthropic.fastModel;
    const maxTokens = intEnv('NOVA_MAX_TOKENS_CAP', 4000);

    // 4. assemble the conversation for Anthropic
    const baseMessages: Anthropic.MessageParam[] = prior.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
    baseMessages.push({ role: 'user', content: this.buildUserContent(text, dto.attachments) });

    // 5. tool-use loop (with an optional web-search retry-without fallback)
    let loop: ToolLoopResult;
    try {
      loop = await this.runToolLoop(user, model, system, maxTokens, baseMessages, webEnabled);
    } catch (e: any) {
      // If the web search tool was the culprit, trip the breaker and retry once
      // without it so the chat still succeeds.
      if (webEnabled && this.looksLikeWebSearchRejection(e)) {
        this.webSearchRuntimeDisabled = true;
        this.logger.warn(
          `web_search rejected by upstream (${String(e?.message).slice(0, 120)}); disabling for this process and retrying without it`,
        );
        try {
          loop = await this.runToolLoop(user, model, system, maxTokens, baseMessages, false);
        } catch (e2: any) {
          this.logger.error(`anthropic call failed (no-web retry): ${e2?.message}`);
          await this.logUsage(user.id, { status: 'upstream_error', model, detail: String(e2?.message).slice(0, 200) });
          throw new HttpException({ error: 'upstream_error' }, HttpStatus.BAD_GATEWAY);
        }
      } else {
        this.logger.error(`anthropic call failed: ${e?.message}`);
        await this.logUsage(user.id, { status: 'upstream_error', model, detail: String(e?.message).slice(0, 200) });
        throw new HttpException({ error: 'upstream_error' }, HttpStatus.BAD_GATEWAY);
      }
    }

    const { finalText, modelUsed, inputTokens, outputTokens, toolCallsMade, webSearches, toolTrace } = loop;

    // 6. capture learned facts, strip tags from the visible reply
    const { clean, tags } = this.knowledge.parseLearnTags(finalText);
    let learned = 0;
    if (tags.length) {
      try { learned = await this.knowledge.saveMemories(tags, user.id); }
      catch (e: any) { this.logger.warn(`memory save failed: ${e?.message}`); }
    }

    // 7. persist messages + bump conversation
    await this.prisma.novaMessage.create({
      data: { conversationId, role: 'user', content: text || '(attachment)' },
    });
    await this.prisma.novaMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: clean,
        toolCalls: toolTrace.length ? (toolTrace as any) : undefined,
        model: modelUsed,
        inputTokens,
        outputTokens,
      },
    });
    await this.prisma.novaConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // 8. usage/audit row
    await this.logUsage(user.id, {
      status: 'ok',
      model: modelUsed,
      inputTokens,
      outputTokens,
      toolCalls: toolCallsMade + webSearches,
    });

    return {
      conversationId,
      text: clean,
      model: modelUsed,
      toolCalls: toolCallsMade,
      webSearches,
      learned,
      usage: { inputTokens, outputTokens },
    };
  }

  // ── tool-use loop (extracted so it can be retried without web search) ─────────
  private async runToolLoop(
    user: AuthUser,
    model: string,
    system: string,
    maxTokens: number,
    baseMessages: Anthropic.MessageParam[],
    withWeb: boolean,
  ): Promise<ToolLoopResult> {
    // Fresh copy each attempt — the loop appends assistant/tool turns to it.
    const messages: Anthropic.MessageParam[] = [...baseMessages];
    const tools: any[] = withWeb
      ? [...TOOL_DEFINITIONS, this.anthropic.webSearchTool]
      : [...TOOL_DEFINITIONS];

    let finalText = '';
    let modelUsed = model;
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCallsMade = 0;
    let webSearches = 0;
    const toolTrace: any[] = [];

    for (let iter = 0; iter < MAX_TOOL_LOOPS; iter++) {
      const resp = await this.anthropic.createMessage({
        model,
        max_tokens: maxTokens,
        system,
        messages,
        tools,
      });
      modelUsed = resp.model || modelUsed;
      inputTokens += resp.usage?.input_tokens || 0;
      outputTokens += resp.usage?.output_tokens || 0;

      const turnText = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      if (turnText) finalText += (finalText ? '\n\n' : '') + turnText;

      // Count Anthropic-executed web searches for the audit/cost log. These are
      // `server_tool_use` blocks the API runs itself (not our client tools).
      for (const b of resp.content as any[]) {
        if (b?.type === 'server_tool_use' && b?.name === 'web_search') webSearches += 1;
      }

      // The API ran a server tool (e.g. web search) and wants to keep going —
      // hand its content back and continue; there are no client results to add.
      // 'pause_turn' is a newer stop_reason (server-tool continuation) not yet in
      // the pinned SDK's union type — compare as a string.
      if ((resp.stop_reason as string) === 'pause_turn') {
        messages.push({ role: 'assistant', content: resp.content });
        continue;
      }

      if (resp.stop_reason !== 'tool_use') break;

      const toolUses = resp.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (toolUses.length === 0) break;

      messages.push({ role: 'assistant', content: resp.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        toolCallsMade += 1;
        const r = await this.tools.execute(user, tu.name, (tu.input as any) || {});
        toolTrace.push({ tool: tu.name, input: tu.input, ok: r.ok });
        results.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: r.content,
          ...(r.ok ? {} : { is_error: true }),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    return { finalText, modelUsed, inputTokens, outputTokens, toolCallsMade, webSearches, toolTrace };
  }

  /** Heuristic: did this upstream error come from the web_search tool param? */
  private looksLikeWebSearchRejection(e: any): boolean {
    const msg = `${e?.message || ''} ${safeErr(e)}`.toLowerCase();
    return (
      msg.includes('web_search') ||
      msg.includes('web search') ||
      (msg.includes('tool') && (msg.includes('not supported') || msg.includes('invalid') || msg.includes('unsupported') || msg.includes('unexpected')))
    );
  }

  // Build the user turn: plain string, or content blocks when attachments exist.
  private buildUserContent(
    text: string,
    attachments?: NovaChatDto['attachments'],
  ): Anthropic.MessageParam['content'] {
    if (!attachments || attachments.length === 0) return text || '(no text)';
    // Build the multimodal blocks loosely — the document (PDF) block param is
    // not part of the stable top-level types in this SDK version, so we cast.
    const blocks: any[] = [];
    for (const a of attachments) {
      if (a.type === 'image') {
        blocks.push({
          type: 'image',
          source: { type: 'base64', media_type: a.mediaType, data: a.dataBase64 },
        });
      } else {
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: a.dataBase64 },
        });
      }
    }
    blocks.push({ type: 'text', text: text || 'Please review the attached file.' });
    return blocks as Anthropic.MessageParam['content'];
  }

  private async logUsage(
    userId: string,
    p: {
      status: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      toolCalls?: number;
      detail?: string;
    },
  ) {
    try {
      await this.prisma.novaUsageLog.create({
        data: {
          userId,
          status: p.status,
          model: p.model ?? null,
          inputTokens: p.inputTokens ?? 0,
          outputTokens: p.outputTokens ?? 0,
          toolCalls: p.toolCalls ?? 0,
          detail: p.detail ?? null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`usage log failed: ${e?.message}`);
    }
  }
}

function intEnv(name: string, dflt: number): number {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

function safeErr(e: any): string {
  try {
    return JSON.stringify(e?.error ?? e?.response?.data ?? '');
  } catch {
    return '';
  }
}

interface ToolLoopResult {
  finalText: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  toolCallsMade: number;
  webSearches: number;
  toolTrace: any[];
}
