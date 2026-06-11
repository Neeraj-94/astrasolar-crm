# AstraSolar CRM — Architecture

Implementation of the Solar/Battery CRM build plan as an **npm + Turborepo
monorepo**: a NestJS API (system of record) and the existing Next.js app as its
client, sharing one typed contract package.

```
astrasolar-v2/
├── apps/
│   ├── api/        # NestJS  → Railway   (auth, RBAC, CRM, dashboards, storage)
│   └── web/        # Next.js → Netlify   (dashboards UI; PWA)
├── packages/
│   └── shared/     # enums, permission vocabulary, role seed, DTO contracts
├── package.json    # npm workspaces: apps/*, packages/*
└── turbo.json
```

## Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js (App Router) → Netlify |
| Backend | NestJS → Railway |
| DB | PostgreSQL + Prisma (`pgvector` later for AI) |
| Auth | Self-managed JWT (Passport), access + refresh, httpOnly cookies |
| Storage | Cloudflare R2 (S3-compatible), presigned uploads |
| Shared | `@astra/shared` — domain types written once |

## The authorization pipeline (the backbone)

Every protected request passes four stages — defence in depth:

1. **JwtAuthGuard** (`common/guards/jwt-auth.guard.ts`) — validates the access
   token, `JwtStrategy` loads the user **and all roles** and builds the request
   principal (`AuthUser`) with the UNION of permissions.
2. **PermissionsGuard** (`common/guards/permissions.guard.ts`) —
   `@RequirePermissions('leads:write:team')`; passes if the user's merged
   permissions include every required key.
3. **Visibility scope** (`common/scope.service.ts`) — `getVisibilityScope`
   equivalent: returns a Prisma `WHERE` filter (`all` / `team` / `own`) applied
   to every list/read query. The dashboard `?userId=` selector is **intersected**
   with this scope server-side — it can only narrow, never broaden.
4. **Ownership** (`common/ownership.ts`) — for `:own` actions the service
   verifies the record belongs to the user (e.g. only the owning consultant may
   mark a sale SOLD; break-glass: super admin).

Guards 1–2 run globally (`APP_GUARD` in `app.module.ts`). Stages 3–4 run inside
services because they need the query/record. Effective access = **UNION** of all
the user's roles' permissions ("union always wins").

## RBAC as data

Roles and permissions are **runtime-editable rows**, not enums. The permission
**keys are fixed in code** (`packages/shared/src/permissions.ts`) because each is
enforced somewhere; admins compose roles from that vocabulary. The 10 built-in
roles are seeded `isSystem` (undeletable). `prisma/seed.ts` seeds the vocabulary,
the 10 roles with their exact permission sets (from `permission-matrix.md`), and
a bootstrap super admin.

Super-Admin-only RBAC admin lives in `rbac/` (roles/permissions CRUD) and
`users/` (create/deactivate, assign roles) — gated by `roles:manage` /
`users:manage`.

## Data model

The normalized schema (`apps/api/prisma/schema.prisma`, 28 models) is the source
of truth: RBAC (User/Team/Role/Permission/UserRole/RolePermission), People
(Account/Contact), Leads (Lead/Booking/LeadStateLog), Products
(Product/ProductLog), Sales (Sale + 1:1 SystemDetails/SaleStatusDetails/Payment/
Commissioning/Installation and 1:n SaleExtra/SaleFinance/PostInstallIssue/
SaleLog/SaleStageHistory), Activity, AuditLog, and Document (R2 metadata).

### Invariants enforced in code
- **1 Lead → at most 1 Sale** (`Sale.leadId @unique`).
- The Lead/Sale row is current truth; log tables are copied **from** it.
- Every lead/sale/product mutation runs in a **transaction** that also writes its
  history row — routed through `history/*HistoryService` so logging can't be
  skipped (`LeadHistoryService`, `SaleHistoryService`, `ProductHistoryService`).
- Sale spec/price columns are **point-of-sale snapshots**; product FKs say
  *which* product, snapshots preserve *what it cost then*. Selecting a catalogue
  product in `sales.updateSystemDetails` copies its spec/price into the sale.
- Product **"delete" = soft ARCHIVE**; archiving is **blocked while any sale
  references the product**.

## The two transactional triggers

In `leads/leads.service.ts`, each is one atomic transaction:
- **Booked** (`outcome → BOOKED`): create `Booking`, set `stage=BOOKED` +
  `currentConsultantId`, write `LeadStateLog` + `AuditLog`.
- **Sold** (`disposition → SOLD`, owner-only): set `stage=CONVERTED` +
  `convertedAt`, create `Sale` (+ default `SaleStatusDetails` + initial
  `SaleStageHistory`), write `LeadStateLog` + `AuditLog`.

## Dashboards & the scope selector

Dashboards are one role-scoped view of shared data (`analytics/`). Endpoints
(`/dashboards/summary`, `/lead-funnel`, `/fulfilment-funnel`,
`/commission-summary`) compute over the **same scoped rows** the viewer can see.
The view-only `?userId=` selector is re-validated against the viewer's scope and
writes a `DASHBOARD_VIEW` audit entry when targeting another user.
`GET /users/selectable` returns only in-scope users to populate the dropdown.

## API surface (versioned `/api/v1`, Swagger at `/api/docs`)

`auth` (login/refresh/logout/me, register=users:manage) · `users` · `rbac` ·
`contacts`/`accounts` · `leads` (outcome/book/disposition/reassign/activities) ·
`bookings` · `sales` (status/core/system-details/status-details/extras) ·
`products` (CRUD/discontinue/archive/reactivate) · `installations` ·
`dashboards` · `integrations/sheets/sync` · `storage` (presigned upload/download).

## Web ↔ API integration

`apps/web/src/lib/api/` — `client.ts` (cookie auth + auto-refresh on 401),
`endpoints.ts` (typed helpers using `@astra/shared`), `session.ts`
(`getServerUser` via `/auth/me`, plus `accessibleDashboards` /
`primaryDashboard` / `shouldShowSideNav` from the shared dashboard catalog).

## Local setup

```bash
npm install
# apps/api/.env  ← copy from apps/api/.env.example (set DATABASE_URL, JWT secrets)
npm run build --workspace=@astra/shared
npm run db:migrate                       # creates tables (root script → @astra/api)
npm run db:seed                          # permissions + 10 roles + super admin
npm run dev                              # turbo runs web + api
```

> Prisma engine binaries could not be downloaded in the build sandbox, so
> `prisma generate`/`migrate` must run on a machine with network access to
> `binaries.prisma.sh` (any normal dev/CI environment).

## What this pass delivered vs. what remains

**Delivered (Phases 0–4):** monorepo, shared contract package, normalized schema,
full auth + RBAC backbone, core CRM (contacts, leads w/ both triggers, bookings,
sales, products), history + audit choke points, Sheets intake, R2 storage,
dashboards/analytics with scope selector, and the web API-client layer.

**Remaining:**
- **Web screen migration** — the existing Next.js screens still read Prisma /
  Firebase directly (legacy `apps/web/prisma`, `src/lib/rbac.ts`). Migrate them
  screen-by-screen onto `apps/web/src/lib/api/*`, then retire the web Prisma/
  Firebase data layer and switch `middleware.ts` to the JWT cookie flow.
- **BullMQ/Redis** — Sheets polling currently runs via `SheetsService.importRows`
  (driven by the manual `/integrations/sheets/sync` endpoint). Wire the
  repeatable poll job + nightly analytics aggregation when Redis is provisioned.
- **Phases 5–7** — AI (RAG + tools), Voice (JARVIS), predictive scoring &
  hardening (throttler, Helmet, CI/CD), per the build plan.
```
