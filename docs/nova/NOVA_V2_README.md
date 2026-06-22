# Nova in AstraSolar v2 — build notes & setup

**Nova** — *Nextgen Operations Virtual Assistant* — the AI assistant from the
legacy `astrasolar-app`, re-platformed onto v2:
NestJS API + Postgres/Prisma + Next.js, powered by Anthropic (Claude). This is
the operational reference; the design rationale is in `NOVA_V2_PLAN.md`.

## What shipped

**Backend** — `apps/api/src/nova/`
- `nova.module.ts` — wires Nova into the app (pulls in products/leads/sales/analytics).
- `nova.controller.ts` — `/api/v1/nova/*`: `chat`, `conversations`, and the
  Knowledge Brain admin (`knowledge`, `memory`). Behind the global JWT guard;
  chat needs `nova:use`, admin needs `nova:manage`.
- `nova.service.ts` — one chat turn: rate-limit → build prompt → Claude tool-use
  loop (max 5) → capture `[LEARN::]` memory → persist conversation → usage log.
- `nova-anthropic.service.ts` — the Anthropic SDK wrapper (key server-side only).
- `nova-tools.service.ts` — **the "see all the specs" layer.** Tools that read
  live v2 data through the existing services, RBAC/scope enforced on every call:
  `search_products`, `get_product_specs`, `check_compatibility`, `lookup_lead`,
  `lookup_sale`, `list_my_recent`, `get_dashboard_summary`, `search_knowledge`.
- **Web access** — Nova also has Anthropic's server-side `web_search` tool, so she
  can answer with live/external info (latest rebate or regulation changes, news,
  weather, competitor pricing). Anthropic runs the search and bills it against the
  existing `ANTHROPIC_API_KEY` — no separate search-provider key. The prompt
  steers her to use internal tools first for our own data and to cite web sources.
  On by default (`NOVA_WEB_SEARCH`); a runtime breaker auto-disables it and retries
  without it if the upstream API ever rejects the tool, so chat never breaks.
- `nova-prompt.ts` — Nova's persona + modular system prompt (ported).
- `nova-coaching.ts` — Fisher/Hughes coaching framework (ported, chat-oriented).
- `nova-knowledge.service.ts` — KB search + `[LEARN::]` memory read/write.

**Database** — `apps/api/prisma/schema.prisma` (5 new models): `NovaConversation`,
`NovaMessage`, `NovaKnowledgeEntry`, `NovaMemory`, `NovaUsageLog`.

**Frontend** — `apps/web/src/components/nova/`
- `nova-widget.tsx` — floating assistant (FAB + chat panel), mounted in
  `DashboardChrome`, shown to internal staff on every dashboard.
- `use-nova-chat.ts` — chat state, talks to `/api/v1/nova/chat`.
- `nova-pdf.ts` — `[[PDF:…]]` report blocks → one-click PDF (jsPDF).
- `knowledge-brain.tsx` + `app/(dashboard)/nova/knowledge/page.tsx` — KB/memory
  admin for CEO / Super Admin.
- **Voice** — `use-speech-recognition.ts` (talk to Nova; browser speech
  recognition, push-to-talk, auto-send) + `nova-speak.ts` (Nova speaks her
  replies). The mic button and a mute toggle live in the widget header.

**Voice backend** — `nova-voice.service.ts` + `POST /api/v1/nova/speak`: proxies
ElevenLabs server-side (key never reaches the browser) using the original custom
NOVA voice. Returns `204` when ElevenLabs isn't configured, so the browser's
built-in speech synthesis takes over — voice works with or without a key.

**Permissions** — `packages/shared/src/permissions.ts`: `nova:use` (all internal
staff) and `nova:manage` (Super Admin + CEO).

## Setup

1. **Install deps** (adds `@anthropic-ai/sdk` and `jspdf`):
   ```bash
   npm install
   ```
2. **Env** — in `apps/api/.env` set at least:
   ```
   ANTHROPIC_API_KEY="sk-ant-…"
   ```
   Optional overrides: `NOVA_MODEL_SMART`, `NOVA_MODEL_FAST`,
   `NOVA_RATE_LIMIT_PER_MIN`, `NOVA_RATE_LIMIT_PER_DAY`, `NOVA_MAX_TOKENS_CAP`,
   `NOVA_WEB_SEARCH` (web access, default `on`), `NOVA_WEB_SEARCH_MAX_USES`
   (searches per turn, default `5`).
   **Voice & avatar credentials can be set two ways** (DB value wins over env):
   - **In the app (recommended):** CEO / Super Admin → `/nova/knowledge` →
     **Voice & Avatar** tab. Paste the ElevenLabs key and the D-ID Agent ID +
     Client Key, hit Save. No redeploy needed; secrets are write-only (never read
     back to the browser).
   - **Or via env:** `ELEVENLABS_API_KEY` (and optional `NOVA_VOICE_ID`,
     `NOVA_TTS_MODEL`) for the voice; `DID_AGENT_ID` + `DID_CLIENT_KEY` for the
     avatar. The proxy already uses the original voice (`eR40ATw9ArzDf9h3v7t7`)
     and model (`eleven_multilingual_v2`), so the key alone matches the old
     app's voice. For the avatar, create an Agent in D-ID Studio
     (studio.d-id.com) with the Nova presenter + the ElevenLabs Nova voice.
3. **Migrate + regenerate the Prisma client** (needs network for Prisma engines —
   this is the same constraint the rest of the repo has):
   ```bash
   npm run build --workspace=@astra/shared
   npm run db:migrate   --workspace=@astra/api   # creates the 5 Nova tables
   npm run db:seed      --workspace=@astra/api   # re-seeds roles incl. nova:use / nova:manage
   ```
   > The build sandbox can't download Prisma engine binaries, so `prisma generate`
   > and `migrate` must run on a normal dev/CI machine. Until then, the API
   > typecheck shows ~20 "Property 'novaX' does not exist on PrismaService"
   > errors — they vanish the moment the client is regenerated.
4. **Run**: `npm run dev` (turbo runs web + api).

## Migrate the legacy knowledge base + memory (optional)

Bring the old Firebase `aiKnowledgeBase` + `aiMemory` into Postgres:

```bash
# Option A — live Firebase (needs firebase-admin):
npm i -w @astra/api firebase-admin
NOVA_MIGRATE_FIREBASE_SERVICE_ACCOUNT_JSON='<one-line sa json>' \
NOVA_MIGRATE_FIREBASE_DATABASE_URL='https://<project>-default-rtdb.firebaseio.com' \
  npm run db:nova-migrate -w @astra/api

# Option B — exported JSON (firebase database:get /aiKnowledgeBase > kb.json etc.):
NOVA_MIGRATE_KB_JSON=./kb.json NOVA_MIGRATE_MEMORY_JSON=./memory.json \
  npm run db:nova-migrate -w @astra/api
```

Idempotent — re-running skips entries that already exist.

## Security model (ported from the legacy backend)

- Anthropic key is **server-side only**; never reaches the browser.
- Every tool re-applies the caller's RBAC + visibility scope via `ScopeService`
  and the domain services — Nova can never see data the user couldn't.
- Per-user rate limits + a `NovaUsageLog` row per call for cost/audit.
- Tool loop capped at 5 roundtrips.

## Not included / follow-ups

- **Streaming** — replies are delivered in one shot (the tool loop runs
  non-streaming internally, as the original did). Token-by-token streaming can be
  layered on later.
- **Aircall transcript pipeline / automated insight extraction** — v2 has no call
  feed yet, so coaching works from pasted/uploaded transcripts. Wire the pipeline
  if/when Aircall is integrated.
- **Voice + avatar** — shipped: talk to Nova (browser speech recognition), she
  speaks back (ElevenLabs server-side, browser-voice fallback), and the animated
  D-ID avatar lip-syncs her replies when `DID_AGENT_ID`/`DID_CLIENT_KEY` are set.
- **pgvector RAG** — KB uses keyword search; embeddings can be added later via a
  raw migration (the schema already anticipates it).
