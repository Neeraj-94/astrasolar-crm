# Nova for AstraSolar v2 — Implementation Plan

Porting **Nova** (the AI assistant built in `astrasolar-app`) into `astrasolar-v2`
(NestJS API + Next.js web + PostgreSQL/Prisma), powered by **Anthropic (Claude)**.

This is a plan for review. Nothing is built yet — once you approve (or amend) it,
I implement Phase A first, then we iterate.

---

## 1. What Nova is today (in `astrasolar-app`)

Nova is a Claude-powered assistant wired into the old Firebase app. The pieces I
found and will be porting:

| Capability | Where it lives now | What it does |
|---|---|---|
| **Persona** | `index.html` `_novaPromptCore` | "NOVA — Astrasolar's in-house AI assistant", Aussie English, concise/warm, anti-fabrication rules, the team roster, product summary. |
| **Modular system prompt** | `_novaBuildSystemPrompt()` | A small CORE prompt + topic-detected modules injected on demand (data, learning, ACT rebates, sales coaching, PDF) to keep token cost down. |
| **Knowledge base** | `AI_KB` in Firebase | Q&A entries (category, question, answer, tags, authority, source, date). Keyword-ranked search injects the top 5 into the prompt. |
| **Permanent memory / learning** | `[LEARN::category::fact]` tags | Nova writes memory tags; they're parsed out, stored, and re-injected as ground truth on later chats. "Newer facts override older." |
| **Live data context** | `novaGatherDataContext()` | Pulls live dashboard numbers (sales, leads, targets) into the prompt when the question is data-shaped. |
| **Tools (function calling)** | `nova-tools.mjs` | `lookup_transcript_by_call_id`, `list_recent_calls`, `lookup_insights_by_call_id` — server-gated by RBAC on every call. |
| **Sales coaching** | `docs/nova/*` + `nova-coaching-prompt.mjs` | Fisher + Hughes playbooks, transcript review framework, compliance rules (AS/NZS 3000/4777.2/5139). |
| **Insight extraction** | `nova-extract-insights-background.mjs` | Distils a call transcript into structured coaching insights (background job). |
| **PDF generation** | `_novaPromptPdf` + `[[PDF:…]]` markers | Nova emits a fenced block the UI renders as a downloadable report. |
| **Secure backend** | `nova-chat.mjs` | Proxies to Anthropic so the key never touches the browser; verifies identity, checks role allowlist, rate-limits, audits usage, runs a tool-use loop (max 5 roundtrips). |
| **Voice/avatar** | `index.html` | ElevenLabs voice + D-ID avatar (optional polish). |
| **Model routing** | `aiCallClaude()` | Haiku for greetings/simple, Sonnet for analysis/attachments/coaching. |
| **Knowledge Brain admin** | `index.html` | UI to manage KB entries, review pending questions, resolve conflicts. |

The big architectural fact: **the old app is Firebase end-to-end** (RTDB storage,
Firebase ID-token auth). v2 is **PostgreSQL + self-managed JWT cookies**. So the
port is not copy-paste — it's a re-platform onto v2's stack and conventions.

---

## 2. How Nova fits v2's architecture

Nova becomes a first-class NestJS module that obeys v2's existing authorization
pipeline, plus a Prisma data layer and a Next.js chat UI.

```
astrasolar-v2/
├── apps/api/src/nova/                     # NEW NestJS module
│   ├── nova.module.ts
│   ├── nova.controller.ts                 # POST /nova/chat, conversations, KB admin
│   ├── nova.service.ts                    # Anthropic call + tool-use loop
│   ├── nova-anthropic.service.ts          # thin Anthropic SDK wrapper
│   ├── nova-prompt.ts                     # persona CORE + modules (ported)
│   ├── nova-tools.service.ts              # the tools Nova can call (see §4)
│   ├── nova-knowledge.service.ts          # KB search + memory read/write
│   └── dto.ts
├── apps/api/prisma/schema.prisma          # + Nova models (see §3)
├── packages/shared/src/permissions.ts     # + nova:use / nova:manage perms
└── apps/web/src/components/nova/          # NEW chat widget (FAB + panel)
    ├── nova-widget.tsx
    ├── nova-message.tsx
    └── use-nova-chat.ts
```

**Authorization** — reuse v2's four-stage pipeline, no parallel auth:
1. `JwtAuthGuard` already authenticates every request and builds `AuthUser`
   (union of permissions). Nova's endpoints sit behind it automatically.
2. `@RequirePermissions('nova:use')` gates the chat endpoint; `nova:manage`
   gates KB administration.
3. Nova's **tools call the existing services** (`LeadsService`, `SalesService`,
   `ProductsService`, `AnalyticsService`) and pass the caller's `AuthUser`, so
   `ScopeService` row-visibility ('all'/'team'/'own') applies unchanged. A
   consultant asking Nova about leads sees only their own — same as the UI.
4. Ownership checks remain in the services. Nova can't widen anyone's access.

**Provider** — `@anthropic-ai/sdk` server-side only. `ANTHROPIC_API_KEY` lives in
the API's env (Railway), never shipped to the browser. The web app talks to
`/api/v1/nova/chat` over the existing cookie-auth client.

---

## 3. Database model (Prisma / PostgreSQL)

New models, replacing the Firebase RTDB nodes. All scoped and audited like the
rest of v2.

```prisma
model NovaConversation {
  id        String        @id @default(uuid())
  userId    String                              // owner (AuthUser.id)
  title     String?                             // auto-summarised first message
  messages  NovaMessage[]
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  @@index([userId])
}

model NovaMessage {
  id             String           @id @default(uuid())
  conversationId String
  conversation   NovaConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           String                          // 'user' | 'assistant'
  content        String                          // text
  toolCalls      Json?                           // tool_use / tool_result trace
  model          String?
  inputTokens    Int?
  outputTokens   Int?
  createdAt      DateTime         @default(now())
  @@index([conversationId])
}

model NovaKnowledgeEntry {                        // the AI_KB port
  id          String   @id @default(uuid())
  category    String
  question    String
  answer      String
  tags        String[] @default([])
  authority   String?
  source      String?
  sourceDate  DateTime?
  status      String   @default("active")        // active | deprecated
  createdBy   String?                             // userId or 'system'
  embedding   Unsupported("vector(1536)")?        // optional, pgvector (Phase C)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([status])
  @@index([category])
}

model NovaMemory {                                // the [LEARN::...] port
  id        String   @id @default(uuid())
  category  String                                // sales_advice, commissions, pronunciation, …
  fact      String
  createdBy String?                               // who taught it
  supersedes String?                              // id of the fact it overrides
  createdAt DateTime @default(now())
  @@index([category])
}

model NovaUsageLog {                              // cost + audit (novaUsage port)
  id           String   @id @default(uuid())
  userId       String
  model        String?
  inputTokens  Int      @default(0)
  outputTokens Int      @default(0)
  toolCalls    Int      @default(0)
  status       String                             // ok | denied_role | upstream_error | rate_limited
  createdAt    DateTime @default(now())
  @@index([userId])
  @@index([createdAt])
}
```

Migrations run with v2's existing `npm run db:migrate` / `db:seed`. (Note: the
repo's own ARCHITECTURE.md flags that Prisma engine binaries need a networked
machine to generate — same caveat applies to these migrations.)

`pgvector` is already on the roadmap ("enabled later for AI phase"). I'll keep
keyword search as the default and make embeddings an opt-in Phase C so we're not
blocked on the extension.

---

## 4. "Nova can see all the specs" — the tools

This is the heart of your request. Instead of reading Firebase transcripts, Nova
in v2 gets **tools that read the live CRM**, each routed through the existing
services so RBAC/scope is enforced server-side (never trusting the model):

| Tool | Reads | Example question it answers |
|---|---|---|
| `search_products` | `ProductsService` (solar / inverter / battery / extras catalogues) | "What 10kW+ three-phase hybrid inverters do we sell?" |
| `get_product_specs` | `SolarProduct`, `InverterProduct`, battery + compatibility | "Panel wattage, STC value and RRP of the Jinko 9.975kW system?" |
| `check_compatibility` | `BatteryInverterCompat` allow-list | "Can this battery pair with a GoodWe GW9.999?" |
| `lookup_lead` | `LeadsService` (scoped) | "Where's the Smith lead up to?" |
| `lookup_sale` / `get_system_details` | `SalesService` (scoped) | "What system spec did we quote on sale #1234?" |
| `list_my_recent` | scoped leads/sales for the caller | "What did I sell this week?" |
| `get_dashboard_summary` | `AnalyticsService` (`/dashboards/summary`, funnels, commission) | "How's the team's conversion this month?" |
| `search_knowledge` | `NovaKnowledgeEntry` | company-specific facts (rebates, process) |

Every tool re-checks the caller's permissions/scope — exactly the discipline the
old `nova-tools.mjs` used, but pointed at Postgres + v2 services. "All the specs"
= the product catalogue specs + per-sale system snapshots, surfaced through these
tools so Nova answers from real data rather than guessing.

---

## 5. The system prompt (ported, adapted)

`nova-prompt.ts` keeps Nova's voice verbatim from `_novaPromptCore` (persona,
Aussie English, anti-fabrication, team roster) and ports the modules:

- **data** — "you have live access via tools; never say you can't see data"
- **learning** — the `[LEARN::category::fact]` memory protocol → `NovaMemory`
- **rebates** — the ACT HESP/SHS knowledge block (verbatim)
- **coaching** — Fisher + Hughes condensed framework (from `nova-coaching-prompt.mjs`)
- **pdf** — the `[[PDF:…]]` report protocol

Topic-detection regexes decide which modules load per message (cheap prompts).
The team roster and product summary get refreshed from the DB so they don't go
stale. Model routing (Haiku ↔ Sonnet) is preserved.

---

## 6. Frontend

A floating Nova widget (FAB bottom-right + slide-in panel), matching v2's Tailwind
design system, mounted once in `DashboardChrome` so it's available on every
dashboard the user can open. It:

- streams responses from `/api/v1/nova/chat`,
- shows the persona, conversation history, and tool-use indicators,
- renders `[[PDF:…]]` blocks as a download button,
- only appears for users with `nova:use`.

Voice/avatar (ElevenLabs + D-ID) is treated as optional polish in Phase D — the
text assistant ships first.

---

## 7. Security & cost controls (ported)

- Key server-side only (`ANTHROPIC_API_KEY`), never in the browser.
- Per-user rate limits (30/min, 500/day; env-configurable) — ported from `nova-chat.mjs`.
- `NovaUsageLog` row per call (model, tokens, status) for cost tracking; readable
  by finance/CEO/admin via the existing audit patterns.
- Tool-use loop capped (max 5 roundtrips) to stop runaway token burn.
- Every tool call obeys `ScopeService` + ownership — Nova cannot leak cross-team data.

---

## 8. Build phases

| Phase | Scope | Outcome |
|---|---|---|
| **A. Core chat** | Nova module, Anthropic wrapper, persona + modules, `NovaConversation/Message/UsageLog`, `nova:use` perm, chat endpoint, web widget, rate limits + audit. | Nova answers in-app, in her voice, with history. |
| **B. Tools / "see the specs"** | `search_products`, `get_product_specs`, `check_compatibility`, `lookup_lead/sale`, `get_dashboard_summary`, scoped via existing services. | Nova answers from live CRM data + product specs. |
| **C. Knowledge & memory** | `NovaKnowledgeEntry` + `NovaMemory`, KB search, `[LEARN::…]` capture, Knowledge Brain admin UI (`nova:manage`), optional pgvector RAG. | Nova learns, remembers, cites company facts. |
| **D. Coaching & polish** | Coaching framework prompt, transcript review, PDF export, optional voice/avatar, insight extraction. | Full feature parity with the old Nova. |

I'd build **A → B** first (that delivers the "see all the specs" ask end-to-end),
then C and D.

---

## 9. Open questions before/while building

1. **Aircall transcripts** — the old coaching pipeline depended on Aircall call
   transcripts in Firebase. Is Aircall (or another call source) wired into v2, or
   should coaching in v2 work from pasted/uploaded transcripts for now?
2. **Knowledge base content** — do you want me to migrate the existing `AI_KB`
   entries and `[LEARN::…]` memories out of Firebase into the new tables, or start
   the v2 knowledge base fresh?
3. **Who gets Nova** — give `nova:use` to all staff roles (CEO, finance, managers,
   consultants, lead-gen, admin), or a subset? (Customers/installers excluded by
   default — easy to change.)
4. **Voice/avatar** — keep ElevenLabs + D-ID in scope (Phase D), or text-only?

Defaults if you don't specify: (1) pasted/uploaded transcripts, (2) start fresh
KB with an importer available later, (3) all internal staff roles, (4) text-only
first.
