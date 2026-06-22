// ─────────────────────────────────────────────────────────────────────────────
// nova-settings — runtime-editable Nova credentials (the legacy AI_CONFIG port).
//
// A CEO / Super Admin can manage the ElevenLabs key + D-ID agent credentials
// from the UI; values are stored in the NovaSetting table. A stored value (when
// non-empty) overrides the matching env var, so env stays a fallback/default.
// The Anthropic key is deliberately NOT managed here — it remains env-only.
//
// Secrets are never returned to the client: `status()` exposes only booleans for
// secret fields (configured / not), while non-secret fields (agentId, voiceId,
// model) are returned in full so the UI can show/edit them.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const NOVA_SETTING_KEYS = {
  ELEVENLABS_API_KEY: 'elevenlabs_api_key',
  DID_AGENT_ID: 'did_agent_id',
  DID_CLIENT_KEY: 'did_client_key',
  VOICE_ID: 'nova_voice_id',
  TTS_MODEL: 'nova_tts_model',
} as const;

// DB key → env-var fallback + default.
const ENV_FALLBACK: Record<string, { env: string; dflt?: string }> = {
  [NOVA_SETTING_KEYS.ELEVENLABS_API_KEY]: { env: 'ELEVENLABS_API_KEY' },
  [NOVA_SETTING_KEYS.DID_AGENT_ID]: { env: 'DID_AGENT_ID' },
  [NOVA_SETTING_KEYS.DID_CLIENT_KEY]: { env: 'DID_CLIENT_KEY' },
  [NOVA_SETTING_KEYS.VOICE_ID]: { env: 'NOVA_VOICE_ID', dflt: 'eR40ATw9ArzDf9h3v7t7' },
  [NOVA_SETTING_KEYS.TTS_MODEL]: { env: 'NOVA_TTS_MODEL', dflt: 'eleven_multilingual_v2' },
};

@Injectable()
export class NovaSettingsService {
  private cache: Map<string, string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;
    const rows = await this.prisma.novaSetting.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    return this.cache;
  }

  /** Resolve a setting: DB value (if non-empty) → env var → default → ''. */
  async resolve(key: string): Promise<string> {
    const map = await this.load();
    const dbVal = (map.get(key) || '').trim();
    if (dbVal) return dbVal;
    const fb = ENV_FALLBACK[key];
    if (!fb) return '';
    return (process.env[fb.env] || fb.dflt || '').trim();
  }

  /** Upsert provided settings (empty string clears a key). Invalidates cache. */
  async setMany(updates: Record<string, string>, userId: string): Promise<void> {
    const allowed = new Set(Object.values(NOVA_SETTING_KEYS) as string[]);
    for (const [key, raw] of Object.entries(updates)) {
      if (!allowed.has(key)) continue;
      const value = (raw ?? '').trim();
      if (value === '') {
        await this.prisma.novaSetting.deleteMany({ where: { key } });
      } else {
        await this.prisma.novaSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: userId },
          update: { value, updatedBy: userId },
        });
      }
    }
    this.cache = null;
  }

  /** Client-safe view — secrets reported as booleans only, never echoed back. */
  async status() {
    return {
      elevenLabsKeyConfigured: !!(await this.resolve(NOVA_SETTING_KEYS.ELEVENLABS_API_KEY)),
      voiceId: await this.resolve(NOVA_SETTING_KEYS.VOICE_ID),
      ttsModel: await this.resolve(NOVA_SETTING_KEYS.TTS_MODEL),
      didAgentId: await this.resolve(NOVA_SETTING_KEYS.DID_AGENT_ID),
      didClientKeyConfigured: !!(await this.resolve(NOVA_SETTING_KEYS.DID_CLIENT_KEY)),
      avatarConfigured:
        !!(await this.resolve(NOVA_SETTING_KEYS.DID_AGENT_ID)) &&
        !!(await this.resolve(NOVA_SETTING_KEYS.DID_CLIENT_KEY)),
    };
  }
}
