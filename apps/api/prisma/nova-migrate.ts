/**
 * Nova migration — port the legacy Firebase knowledge base + learned memory
 * into Postgres (NovaKnowledgeEntry + NovaMemory).
 *
 * Source nodes in the legacy app's Firebase RTDB:
 *   - aiKnowledgeBase/{id} = { category, question, answer, tags, authority,
 *                              source, sourceDate, status, createdBy,
 *                              createdAt, updatedAt }
 *   - aiMemory/{id}        = { fact, category, learnedFrom, learnedFromName,
 *                              learnedAt, context, approved }
 *
 * Two input modes (pick whichever is easier):
 *
 *  A) LIVE FIREBASE — set in apps/api/.env:
 *       NOVA_MIGRATE_FIREBASE_SERVICE_ACCOUNT_JSON='<one-line service account json>'
 *       NOVA_MIGRATE_FIREBASE_DATABASE_URL='https://<project>-default-rtdb.firebaseio.com'
 *     Requires `firebase-admin` to be installed (npm i -w @astra/api firebase-admin).
 *
 *  B) JSON EXPORT — export the two nodes from the Firebase console (or the CLI:
 *       firebase database:get /aiKnowledgeBase > kb.json
 *       firebase database:get /aiMemory > memory.json
 *     ) then run with:
 *       NOVA_MIGRATE_KB_JSON=./kb.json NOVA_MIGRATE_MEMORY_JSON=./memory.json \
 *         npm run db:nova-migrate -w @astra/api
 *
 * Idempotent: an entry is skipped if an identical question (KB) or fact (memory)
 * already exists. Safe to run repeatedly.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '../src/db';

const prisma = new PrismaClient();

type KbNode = Record<string, any>;
type MemNode = Record<string, any>;

async function loadFromFirebase(): Promise<{ kb: KbNode; mem: MemNode } | null> {
  const saJson = process.env.NOVA_MIGRATE_FIREBASE_SERVICE_ACCOUNT_JSON;
  const dbUrl = process.env.NOVA_MIGRATE_FIREBASE_DATABASE_URL;
  if (!saJson || !dbUrl) return null;

  let admin: any;
  try {
    // Dynamic require so the API doesn't carry firebase-admin as a hard dep.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    admin = require('firebase-admin');
  } catch {
    throw new Error(
      'firebase-admin is not installed. Run `npm i -w @astra/api firebase-admin`, ' +
        'or use the JSON-export mode (NOVA_MIGRATE_KB_JSON / NOVA_MIGRATE_MEMORY_JSON).',
    );
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(saJson)),
      databaseURL: dbUrl,
    });
  }
  const kbSnap = await admin.database().ref('aiKnowledgeBase').once('value');
  const memSnap = await admin.database().ref('aiMemory').once('value');
  return { kb: kbSnap.val() || {}, mem: memSnap.val() || {} };
}

function loadFromJson(): { kb: KbNode; mem: MemNode } | null {
  const kbPath = process.env.NOVA_MIGRATE_KB_JSON;
  const memPath = process.env.NOVA_MIGRATE_MEMORY_JSON;
  if (!kbPath && !memPath) return null;
  const kb = kbPath ? JSON.parse(readFileSync(kbPath, 'utf8')) || {} : {};
  const mem = memPath ? JSON.parse(readFileSync(memPath, 'utf8')) || {} : {};
  return { kb, mem };
}

function toDate(v: any): Date | null {
  if (!v) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function toTags(v: any): string[] {
  if (Array.isArray(v)) return v.map((t) => String(t).trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

async function migrateKb(kb: KbNode): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const [id, raw] of Object.entries(kb)) {
    const e = raw as KbNode;
    if (!e || !e.question || !e.answer) {
      skipped++;
      continue;
    }
    const exists = await prisma.novaKnowledgeEntry.findFirst({
      where: { question: String(e.question) },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.novaKnowledgeEntry.create({
      data: {
        category: String(e.category || 'general'),
        question: String(e.question),
        answer: String(e.answer),
        tags: toTags(e.tags),
        authority: e.authority ? String(e.authority) : null,
        source: e.source ? String(e.source) : null,
        sourceDate: toDate(e.sourceDate),
        status: e.status === 'deprecated' ? 'deprecated' : 'active',
        createdBy: e.createdBy ? String(e.createdBy) : 'import',
      },
    });
    added++;
  }
  return { added, skipped };
}

async function migrateMemory(mem: MemNode): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const [id, raw] of Object.entries(mem)) {
    const m = raw as MemNode;
    if (!m || !m.fact) {
      skipped++;
      continue;
    }
    // Only migrate approved facts (CEO-taught / approved) — mirrors the legacy
    // "approved" gate that decided whether a fact was ground truth.
    if (m.approved === false) {
      skipped++;
      continue;
    }
    const fact = String(m.fact).trim();
    const category = String(m.category || 'general');
    const exists = await prisma.novaMemory.findFirst({
      where: { fact, category, active: true },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.novaMemory.create({
      data: {
        category,
        fact,
        createdBy: m.learnedFrom ? String(m.learnedFrom) : 'import',
      },
    });
    added++;
  }
  return { added, skipped };
}

async function main() {
  const source = (await loadFromFirebase()) || loadFromJson();
  if (!source) {
    console.error(
      'No migration source configured. Set either:\n' +
        '  • NOVA_MIGRATE_FIREBASE_SERVICE_ACCOUNT_JSON + NOVA_MIGRATE_FIREBASE_DATABASE_URL (live), or\n' +
        '  • NOVA_MIGRATE_KB_JSON and/or NOVA_MIGRATE_MEMORY_JSON (exported JSON files).',
    );
    process.exit(1);
  }

  console.log('Migrating Nova knowledge base...');
  const kbRes = await migrateKb(source.kb || {});
  console.log(`  KB:     +${kbRes.added} added, ${kbRes.skipped} skipped`);

  console.log('Migrating Nova learned memory...');
  const memRes = await migrateMemory(source.mem || {});
  console.log(`  Memory: +${memRes.added} added, ${memRes.skipped} skipped`);

  console.log('Nova migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
