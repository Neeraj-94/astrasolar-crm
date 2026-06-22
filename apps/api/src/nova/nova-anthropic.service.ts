import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Thin singleton wrapper around the Anthropic SDK. The API key lives ONLY in
 * the server env (ANTHROPIC_API_KEY) — it is never sent to the browser, exactly
 * as the legacy nova-chat.mjs guaranteed. All Nova traffic goes through here so
 * the key handling, model defaults, and version pinning live in one place.
 */
@Injectable()
export class NovaAnthropicService {
  private readonly logger = new Logger(NovaAnthropicService.name);
  private client: Anthropic | null = null;

  get configured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /** Smart (analysis/coaching/specs) and fast (greetings) model ids. */
  get smartModel(): string {
    return process.env.NOVA_MODEL_SMART || 'claude-sonnet-4-6';
  }
  get fastModel(): string {
    return process.env.NOVA_MODEL_FAST || 'claude-haiku-4-5-20251001';
  }

  /**
   * Web access. When enabled, Nova gets Anthropic's server-side web search tool
   * so she can answer with live, current info (latest rebate changes, news,
   * weather, competitor pricing, general facts) rather than guessing. The search
   * is executed by Anthropic and billed against the same ANTHROPIC_API_KEY — no
   * extra search-provider key is required. Defaults ON; set NOVA_WEB_SEARCH=off
   * (or 0/false/no) to disable.
   */
  get webSearchEnabled(): boolean {
    const v = (process.env.NOVA_WEB_SEARCH ?? 'on').toLowerCase().trim();
    return !['0', 'false', 'off', 'no', ''].includes(v);
  }

  /** Cap on web searches per chat turn (cost control). */
  get webSearchMaxUses(): number {
    const v = parseInt(process.env.NOVA_WEB_SEARCH_MAX_USES || '', 10);
    return Number.isFinite(v) && v > 0 ? Math.min(v, 10) : 5;
  }

  /**
   * The Anthropic server-side web search tool definition. Typed loosely (the
   * pinned SDK version predates the web_search type, but the runtime API accepts
   * it). user_location biases results to Australia, where Astrasolar operates.
   */
  get webSearchTool(): any {
    return {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: this.webSearchMaxUses,
      user_location: {
        type: 'approximate',
        country: 'AU',
        timezone: 'Australia/Sydney',
      },
    };
  }

  private getClient(): Anthropic {
    if (!this.client) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
      }
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  /**
   * One non-streaming Messages call. We run non-streaming internally so the
   * service can inspect stop_reason + tool_use blocks synchronously inside the
   * tool loop (same design as the original backend).
   */
  async createMessage(params: Anthropic.MessageCreateParamsNonStreaming) {
    return this.getClient().messages.create(params);
  }
}
