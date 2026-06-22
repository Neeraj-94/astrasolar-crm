// ─────────────────────────────────────────────────────────────────────────────
// nova-voice — server-side text-to-speech proxy (ElevenLabs).
//
// Ported from the legacy app's astraSpeakElevenLabs(): same custom NOVA voice,
// model, and voice settings. The ElevenLabs key stays server-side (never in the
// browser), mirroring how the Anthropic key is handled. If no key is configured
// the service returns null and the frontend falls back to the browser's built-in
// speech synthesis — so voice works out of the box, and upgrades to the premium
// Nova voice the moment ELEVENLABS_API_KEY is set.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, Logger } from '@nestjs/common';
import { NovaSettingsService, NOVA_SETTING_KEYS } from './nova-settings.service';

@Injectable()
export class NovaVoiceService {
  private readonly logger = new Logger(NovaVoiceService.name);

  constructor(private readonly settings: NovaSettingsService) {}

  /**
   * Synthesise speech for `text`. Returns the MP3 bytes, or null when no key is
   * configured (caller signals the client to use the browser fallback). The key
   * resolves from the DB settings first, then the ELEVENLABS_API_KEY env var.
   */
  async synthesize(text: string): Promise<Buffer | null> {
    const apiKey = await this.settings.resolve(NOVA_SETTING_KEYS.ELEVENLABS_API_KEY);
    if (!apiKey) return null;
    const clean = (text || '').slice(0, 5000); // cap — TTS cost + latency guard
    if (!clean.trim()) return null;

    const voiceId = await this.settings.resolve(NOVA_SETTING_KEYS.VOICE_ID);
    const model = await this.settings.resolve(NOVA_SETTING_KEYS.TTS_MODEL);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clean,
        model_id: model,
        voice_settings: { stability: 0.72, similarity_boost: 0.8 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`ElevenLabs TTS failed ${res.status}: ${detail.slice(0, 200)}`);
      return null; // fall back to browser voice rather than erroring the user
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
}
