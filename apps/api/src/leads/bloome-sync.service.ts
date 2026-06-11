import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Live sync of Bloome setter leads from the "ASTRA - MASTER BLASTER" Google
 * Sheet into the `BloomeLead` table.
 *
 * Transport: a Google Apps Script web app (see
 * `apps/api/scripts/bloome-sheets-webapp.gs`) deployed by someone with access
 * to the sheet. It returns a tab's raw rows as JSON; this service normalises
 * them with the same rules as the original CSV import and mirrors them in:
 *
 *   - upsert on the (sourceTab, rowNum) key — new rows are inserted, edited
 *     rows (outcome / dials / notes changes) are updated in place
 *   - rows past the end of the sheet are pruned, so the table converges to
 *     the sheet's current state even after row deletions shift rowNums
 *
 * Config (env):
 *   BLOOME_SYNC_URL              Apps Script /exec URL (sync disabled if unset)
 *   BLOOME_SYNC_TOKEN            shared secret, sent as ?token=
 *   BLOOME_SYNC_TABS             JSON, default [{"tab":"ACT:Live","region":"ACT"}]
 *   BLOOME_SYNC_INTERVAL_SECONDS poll interval, default 60, "0" disables polling
 */
@Injectable()
export class BloomeSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BloomeSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private lastRun: {
    at: Date;
    ok: boolean;
    message: string;
    inserted: number;
    updated: number;
    pruned: number;
    durationMs: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ---- lifecycle -----------------------------------------------------------

  onModuleInit() {
    const url = process.env.BLOOME_SYNC_URL;
    const interval = Number(process.env.BLOOME_SYNC_INTERVAL_SECONDS ?? '60');
    if (!url) {
      this.logger.log('BLOOME_SYNC_URL not set — sheet polling disabled.');
      return;
    }
    if (!interval) {
      this.logger.log('BLOOME_SYNC_INTERVAL_SECONDS=0 — polling disabled (manual sync only).');
      return;
    }
    this.timer = setInterval(() => {
      void this.syncAll().catch((e) =>
        this.logger.error(`Scheduled Bloome sync failed: ${e instanceof Error ? e.message : e}`),
      );
    }, Math.max(15, interval) * 1000);
    this.timer.unref?.();
    this.logger.log(`Bloome sheet polling every ${Math.max(15, interval)}s.`);
    // Prime once at startup (after the app is up).
    setTimeout(() => void this.syncAll().catch(() => undefined), 5_000).unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  status() {
    return {
      configured: Boolean(process.env.BLOOME_SYNC_URL),
      polling:
        Boolean(process.env.BLOOME_SYNC_URL) &&
        Number(process.env.BLOOME_SYNC_INTERVAL_SECONDS ?? '60') > 0,
      running: this.running,
      lastRun: this.lastRun,
    };
  }

  // ---- sync ----------------------------------------------------------------

  private tabs(): { tab: string; region: string }[] {
    const raw = process.env.BLOOME_SYNC_TABS;
    if (!raw) return [{ tab: 'ACT:Live', region: 'ACT' }];
    try {
      const parsed = JSON.parse(raw) as { tab: string; region: string }[];
      return parsed.filter((t) => t.tab && t.region);
    } catch {
      this.logger.error('BLOOME_SYNC_TABS is not valid JSON — using default.');
      return [{ tab: 'ACT:Live', region: 'ACT' }];
    }
  }

  /** Run a full sync of every configured tab. Serialised; concurrent calls no-op. */
  async syncAll() {
    const url = process.env.BLOOME_SYNC_URL;
    if (!url) {
      throw new ServiceUnavailableException(
        'Sheet sync is not configured (BLOOME_SYNC_URL is unset).',
      );
    }
    if (this.running) return { skipped: true as const, ...this.statusTotals() };

    this.running = true;
    const started = Date.now();
    let inserted = 0;
    let updated = 0;
    let pruned = 0;
    try {
      for (const { tab, region } of this.tabs()) {
        const res = await this.syncTab(url, tab, region);
        inserted += res.inserted;
        updated += res.updated;
        pruned += res.pruned;
      }
      this.lastRun = {
        at: new Date(),
        ok: true,
        message: 'ok',
        inserted,
        updated,
        pruned,
        durationMs: Date.now() - started,
      };
      return { skipped: false as const, inserted, updated, pruned };
    } catch (e) {
      this.lastRun = {
        at: new Date(),
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        inserted,
        updated,
        pruned,
        durationMs: Date.now() - started,
      };
      throw e;
    } finally {
      this.running = false;
    }
  }

  private statusTotals() {
    return {
      inserted: this.lastRun?.inserted ?? 0,
      updated: this.lastRun?.updated ?? 0,
      pruned: this.lastRun?.pruned ?? 0,
    };
  }

  private async syncTab(baseUrl: string, tab: string, region: string) {
    const token = process.env.BLOOME_SYNC_TOKEN ?? '';
    const url = `${baseUrl}?tab=${encodeURIComponent(tab)}&token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Sheet endpoint returned ${res.status} for tab "${tab}"`);
    }
    const body = (await res.json()) as {
      ok?: boolean;
      error?: string;
      rows?: unknown[][];
    };
    if (!body.ok || !Array.isArray(body.rows)) {
      throw new Error(body.error ?? `Sheet endpoint returned no rows for tab "${tab}"`);
    }

    // Row 0 is the header; data starts at sheet row 2.
    const records: NormalisedRow[] = [];
    for (let i = 1; i < body.rows.length; i++) {
      const rec = normaliseRow(body.rows[i], i + 1, tab, region);
      if (rec) records.push(rec);
    }
    const maxRowNum = body.rows.length; // last sheet row in this snapshot

    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      const values = batch.map(
        (r) =>
          Prisma.sql`(gen_random_uuid(), ${region}, ${tab}, ${r.rowNum}, ${r.wc}, ${r.timestamp}, ${r.firstName}, ${r.lastName}, ${r.mobile}, ${r.email}, ${r.address}, ${r.postcode}, ${r.suburb}, ${r.billSpend}, ${r.code}, ${r.agent}, ${r.dials}, ${r.outcome}, ${r.notes}, ${r.lastCalled}, ${r.appDate}, ${r.appTime}, ${r.existingSystem}, CURRENT_TIMESTAMP)`,
      );
      // Insert new rows; update existing ones only when something changed
      // (the WHERE clause keeps updatedAt stable for untouched rows).
      const result = await this.prisma.$queryRaw<{ inserted: boolean }[]>(Prisma.sql`
        INSERT INTO "BloomeLead"
          ("id","region","sourceTab","rowNum","wc","timestamp","firstName","lastName","mobile","email","address","postcode","suburb","billSpend","code","agent","dials","outcome","notes","lastCalled","appDate","appTime","existingSystem","updatedAt")
        VALUES ${Prisma.join(values)}
        ON CONFLICT ("sourceTab","rowNum") DO UPDATE SET
          "region" = EXCLUDED."region",
          "wc" = EXCLUDED."wc",
          "timestamp" = EXCLUDED."timestamp",
          "firstName" = EXCLUDED."firstName",
          "lastName" = EXCLUDED."lastName",
          "mobile" = EXCLUDED."mobile",
          "email" = EXCLUDED."email",
          "address" = EXCLUDED."address",
          "postcode" = EXCLUDED."postcode",
          "suburb" = EXCLUDED."suburb",
          "billSpend" = EXCLUDED."billSpend",
          "code" = EXCLUDED."code",
          "agent" = EXCLUDED."agent",
          "dials" = EXCLUDED."dials",
          "outcome" = EXCLUDED."outcome",
          "notes" = EXCLUDED."notes",
          "lastCalled" = EXCLUDED."lastCalled",
          "appDate" = EXCLUDED."appDate",
          "appTime" = EXCLUDED."appTime",
          "existingSystem" = EXCLUDED."existingSystem",
          "updatedAt" = CURRENT_TIMESTAMP
        WHERE
          ("BloomeLead"."wc", "BloomeLead"."timestamp", "BloomeLead"."firstName",
           "BloomeLead"."lastName", "BloomeLead"."mobile", "BloomeLead"."email",
           "BloomeLead"."address", "BloomeLead"."postcode", "BloomeLead"."suburb",
           "BloomeLead"."billSpend", "BloomeLead"."code", "BloomeLead"."agent",
           "BloomeLead"."dials", "BloomeLead"."outcome", "BloomeLead"."notes",
           "BloomeLead"."lastCalled", "BloomeLead"."appDate", "BloomeLead"."appTime",
           "BloomeLead"."existingSystem")
          IS DISTINCT FROM
          (EXCLUDED."wc", EXCLUDED."timestamp", EXCLUDED."firstName",
           EXCLUDED."lastName", EXCLUDED."mobile", EXCLUDED."email",
           EXCLUDED."address", EXCLUDED."postcode", EXCLUDED."suburb",
           EXCLUDED."billSpend", EXCLUDED."code", EXCLUDED."agent",
           EXCLUDED."dials", EXCLUDED."outcome", EXCLUDED."notes",
           EXCLUDED."lastCalled", EXCLUDED."appDate", EXCLUDED."appTime",
           EXCLUDED."existingSystem")
        RETURNING (xmax = 0) AS inserted
      `);
      for (const r of result) {
        if (r.inserted) inserted++;
        else updated++;
      }
    }

    // Mirror deletions: drop rows beyond the sheet's current length.
    const prunedRes = await this.prisma.bloomeLead.deleteMany({
      where: { sourceTab: tab, rowNum: { gt: maxRowNum } },
    });

    this.logger.log(
      `Synced "${tab}": ${records.length} rows (+${inserted} new, ~${updated} updated, -${prunedRes.count} pruned).`,
    );
    return { inserted, updated, pruned: prunedRes.count };
  }
}

// ---- row normalisation (kept in lock-step with the original CSV import) ----

interface NormalisedRow {
  rowNum: number;
  wc: string | null;
  timestamp: Date | null;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  email: string | null;
  address: string | null;
  postcode: string | null;
  suburb: string | null;
  billSpend: string | null;
  code: string | null;
  agent: string | null;
  dials: number;
  outcome: string | null;
  notes: string | null;
  lastCalled: string | null;
  appDate: string | null;
  appTime: string | null;
  existingSystem: string | null;
}

function clean(v: unknown, maxLen = 2000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .trim()
    .slice(0, maxLen);
  return s || null;
}

function parseTimestamp(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = clean(v, 40);
  if (!s) return null;
  // ISO (Apps Script serialises Date cells as ISO strings)
  const iso = new Date(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(iso.getTime())) return iso;
  // dd/mm/yyyy[ hh:mm[:ss]] and dd/mm/yy hh:mm(AM|PM)
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );
  if (!m) return null;
  let [, d, mo, y, h = '0', mi = '0', se = '0', ap] = m;
  let year = Number(y);
  if (year < 100) year += 2000;
  let hour = Number(h);
  if (ap?.toUpperCase() === 'PM' && hour < 12) hour += 12;
  if (ap?.toUpperCase() === 'AM' && hour === 12) hour = 0;
  const date = new Date(year, Number(mo) - 1, Number(d), hour, Number(mi), Number(se));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Map one raw sheet row (columns A..U of the Bloome live tabs) onto a
 * BloomeLead. Returns null for rows with no identity (no name/phone/email).
 */
function normaliseRow(
  raw: unknown[],
  rowNum: number,
  _tab: string,
  _region: string,
): NormalisedRow | null {
  const col = (i: number) => (i < raw.length ? raw[i] : null);
  const firstName = clean(col(2), 200);
  const lastName = clean(col(3), 200);
  const mobile = clean(col(4), 50);
  const email = clean(col(5), 200);
  if (!firstName && !lastName && !mobile && !email) return null;

  const dialsDigits = String(col(12) ?? '').replace(/\D/g, '');
  return {
    rowNum,
    wc: clean(col(0), 50),
    timestamp: parseTimestamp(col(1)),
    firstName,
    lastName,
    mobile,
    email,
    address: clean(col(6), 500),
    postcode: clean(col(7), 20),
    suburb: clean(col(8), 100),
    billSpend: clean(col(9), 50),
    code: clean(col(10), 30),
    agent: clean(col(11), 60),
    dials: dialsDigits ? Number(dialsDigits) : 0,
    outcome: clean(col(13), 60),
    notes: clean(col(14), 4000),
    lastCalled: clean(col(15), 100),
    appDate: clean(col(16), 50),
    appTime: clean(col(17), 50),
    existingSystem: clean(col(20), 1000),
  };
}
