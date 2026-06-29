// ─────────────────────────────────────────────────────────────────────────────
// integration-settings — runtime-editable third-party integration credentials.
//
// CEO / Super Admin / Finance manage the ClickSend, Aircall, Google Sheets and
// Anthropic keys from the Integrations panel; values are stored in the
// IntegrationSetting table. A stored value (when non-empty) overrides the
// matching env var, so env stays a fallback/default.
//
// Secrets are never returned to the client: `status()` exposes only booleans for
// secret fields (configured / not), while non-secret identifiers (ClickSend
// username, Aircall API ID, Sheets spreadsheet id) are returned in full so the
// UI can show / edit them.
//
// The Anthropic key is additionally mirrored into process.env on load + save so
// the existing (synchronous) NovaAnthropicService getters keep working without
// per-call resolution.
// ─────────────────────────────────────────────────────────────────────────────

import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const INTEGRATION_SETTING_KEYS = {
  CLICKSEND_USERNAME: 'clicksend_username',
  CLICKSEND_API_KEY: 'clicksend_api_key',
  AIRCALL_API_ID: 'aircall_api_id',
  AIRCALL_API_TOKEN: 'aircall_api_token',
  SHEETS_API_KEY: 'sheets_api_key',
  SHEETS_SPREADSHEET_ID: 'sheets_spreadsheet_id',
  ANTHROPIC_API_KEY: 'anthropic_api_key',
} as const;

export type IntegrationSettingKey =
  (typeof INTEGRATION_SETTING_KEYS)[keyof typeof INTEGRATION_SETTING_KEYS];

// Following the project's pre-`prisma generate` convention (see
// clicksend.service.ts / notifications.service.ts), the new delegate is
// referenced through a narrow interface so this compiles before the client is
// regenerated. After `prisma generate`, `prisma.integrationSetting` exists at
// runtime and satisfies it.
interface IntegrationSettingRow {
  key: string;
  value: string;
}
interface IntegrationSettingDelegate {
  findMany(args?: Record<string, unknown>): Promise<IntegrationSettingRow[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
  upsert(args: {
    where: Record<string, unknown>;
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<IntegrationSettingRow>;
}

// DB key → env-var fallback.
const ENV_FALLBACK: Record<string, string> = {
  [INTEGRATION_SETTING_KEYS.CLICKSEND_USERNAME]: 'CLICKSEND_USERNAME',
  [INTEGRATION_SETTING_KEYS.CLICKSEND_API_KEY]: 'CLICKSEND_API_KEY',
  [INTEGRATION_SETTING_KEYS.AIRCALL_API_ID]: 'AIRCALL_API_ID',
  [INTEGRATION_SETTING_KEYS.AIRCALL_API_TOKEN]: 'AIRCALL_API_TOKEN',
  [INTEGRATION_SETTING_KEYS.SHEETS_API_KEY]: 'GOOGLE_SHEETS_API_KEY',
  [INTEGRATION_SETTING_KEYS.SHEETS_SPREADSHEET_ID]: 'GOOGLE_SHEETS_SPREADSHEET_ID',
  [INTEGRATION_SETTING_KEYS.ANTHROPIC_API_KEY]: 'ANTHROPIC_API_KEY',
};

// Which keys are secrets (reported as booleans, never echoed back).
const SECRET_KEYS = new Set<string>([
  INTEGRATION_SETTING_KEYS.CLICKSEND_API_KEY,
  INTEGRATION_SETTING_KEYS.AIRCALL_API_TOKEN,
  INTEGRATION_SETTING_KEYS.SHEETS_API_KEY,
  INTEGRATION_SETTING_KEYS.ANTHROPIC_API_KEY,
]);

@Injectable()
export class IntegrationSettingsService implements OnModuleInit {
  private cache: Map<string, string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private get store(): IntegrationSettingDelegate {
    return (
      this.prisma as unknown as { integrationSetting: IntegrationSettingDelegate }
    ).integrationSetting;
  }

  async onModuleInit(): Promise<void> {
    // Mirror stored secrets that legacy sync consumers read from env.
    try {
      await this.applyToEnv();
    } catch {
      // DB may be unavailable at boot (e.g. during migration) — ignore; the
      // first save / resolve will populate the cache.
    }
  }

  private async load(): Promise<Map<string, string>> {
    if (this.cache) return this.cache;
    const rows = await this.store.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    return this.cache;
  }

  /** Resolve a setting: DB value (if non-empty) → env var → ''. */
  async resolve(key: IntegrationSettingKey): Promise<string> {
    const map = await this.load();
    const dbVal = (map.get(key) || '').trim();
    if (dbVal) return dbVal;
    const env = ENV_FALLBACK[key];
    return (env ? process.env[env] : '')?.trim() || '';
  }

  /** Push DB-resolved values that have synchronous env consumers into env. */
  private async applyToEnv(): Promise<void> {
    const anthropic = await this.resolve(
      INTEGRATION_SETTING_KEYS.ANTHROPIC_API_KEY,
    );
    if (anthropic) process.env.ANTHROPIC_API_KEY = anthropic;
  }

  /** Upsert provided settings (empty string clears a key). Invalidates cache. */
  async setMany(
    updates: Record<string, string>,
    userId: string,
  ): Promise<void> {
    const allowed = new Set(
      Object.values(INTEGRATION_SETTING_KEYS) as string[],
    );
    for (const [key, raw] of Object.entries(updates)) {
      if (!allowed.has(key)) continue;
      const value = (raw ?? '').trim();
      if (value === '') {
        await this.store.deleteMany({ where: { key } });
      } else {
        await this.store.upsert({
          where: { key },
          create: { key, value, updatedBy: userId },
          update: { value, updatedBy: userId },
        });
      }
    }
    this.cache = null;
    await this.applyToEnv();
  }

  /** Client-safe view — secrets reported as booleans only, never echoed back. */
  async status() {
    const keys = Object.values(INTEGRATION_SETTING_KEYS);
    const resolved = await Promise.all(
      keys.map((k) => this.resolve(k as IntegrationSettingKey)),
    );
    const val: Record<string, string> = {};
    keys.forEach((k, i) => (val[k] = resolved[i]));

    return {
      clicksend: {
        username: val[INTEGRATION_SETTING_KEYS.CLICKSEND_USERNAME],
        apiKeyConfigured: !!val[INTEGRATION_SETTING_KEYS.CLICKSEND_API_KEY],
        configured:
          !!val[INTEGRATION_SETTING_KEYS.CLICKSEND_USERNAME] &&
          !!val[INTEGRATION_SETTING_KEYS.CLICKSEND_API_KEY],
      },
      aircall: {
        apiId: val[INTEGRATION_SETTING_KEYS.AIRCALL_API_ID],
        apiTokenConfigured: !!val[INTEGRATION_SETTING_KEYS.AIRCALL_API_TOKEN],
        configured:
          !!val[INTEGRATION_SETTING_KEYS.AIRCALL_API_ID] &&
          !!val[INTEGRATION_SETTING_KEYS.AIRCALL_API_TOKEN],
      },
      sheets: {
        spreadsheetId: val[INTEGRATION_SETTING_KEYS.SHEETS_SPREADSHEET_ID],
        apiKeyConfigured: !!val[INTEGRATION_SETTING_KEYS.SHEETS_API_KEY],
        configured: !!val[INTEGRATION_SETTING_KEYS.SHEETS_API_KEY],
      },
      anthropic: {
        apiKeyConfigured: !!val[INTEGRATION_SETTING_KEYS.ANTHROPIC_API_KEY],
        configured: !!val[INTEGRATION_SETTING_KEYS.ANTHROPIC_API_KEY],
      },
    };
  }

  static isSecret(key: string): boolean {
    return SECRET_KEYS.has(key);
  }
}
