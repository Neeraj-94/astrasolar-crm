# AstraSolar CRM

Internal CRM platform for a solar company. Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui**, **Firebase Auth**, **PostgreSQL via Prisma**, and deployed on **Netlify**.

## What's in this scaffold

A complete role- and permission-based access control foundation:

- Eight dashboards: Leads, Sales, Manager, CEO, Finance, Admin, Customer, Installer.
- Per-dashboard tab navigation (Overview / records / reports / etc), gated by permissions.
- Side nav that **only shows dashboards the user has access to**, and **hides entirely** when the user has access to a single dashboard.
- Firebase email/password login that exchanges the ID token for a httpOnly session cookie.
- Edge middleware that gates every protected route on cookie presence; full permission verification happens in React server components.
- Prisma schema covering Users, Roles, Permissions, RolePermissions, UserRoles, Dashboards, Tabs, Audit Logs, plus light domain models (Lead, Sale, Invoice, Customer, Installer, Consultant).
- Idempotent seed script that builds the dashboard catalog, permissions, roles, and role-permission grants from `src/lib/permissions.ts` (the single source of truth).
- Audit logging helper used on every login.

## Quick start

```bash
# 1. Install
npm install

# 2. Configure environment
cp .env.example .env.local
# fill in Firebase + Postgres values (see "Configuration" below)
# Note: the db:* scripts load both .env.local and .env via dotenv-cli,
# so either file works.

# 3. Database
npm run db:push      # create tables in your Postgres DB
npm run db:seed      # seed dashboards / permissions / roles

# 4. Start
npm run dev
# open http://localhost:3000
```

You will land on `/login`. Sign in with a Firebase user. On first login the app
auto-creates a `User` row in Postgres. To grant access, assign that user one or
more roles via `prisma studio`:

```bash
npm run db:studio
# → UserRole table → add row with the userId and roleId you want
```

## Configuration

### Firebase

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Email/Password** under Authentication → Sign-in method.
3. Add a Web app under Project Settings → General → Your apps. Copy the config object into the `NEXT_PUBLIC_FIREBASE_*` env vars.
4. Under Project Settings → Service accounts → Generate new private key. Open the JSON file and copy:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (keep the literal `\n` characters)

### PostgreSQL

Any Postgres works locally (Docker, Postgres.app, brew install postgresql). For production, recommended hosts: Neon, Supabase, Railway, Render. Set `DATABASE_URL` to a `postgresql://...` connection string with `?schema=public`.

### Session cookies

- `SESSION_COOKIE_NAME` defaults to `__astra_session`.
- `SESSION_COOKIE_MAX_AGE` defaults to 5 days.

## Access rules (implemented)

| Role | Access |
|---|---|
| **Super Admin / CEO** | All dashboards, all tabs |
| **Finance** | All dashboards **except CEO** + finance entity permissions |
| **Manager** | Manager + Leads + Sales dashboards (consultant + lead-gen oversight) |
| **Lead Generation** | Leads dashboard only |
| **Sales Consultant** | Sales dashboard only |
| **Admin** | Admin dashboard only + user/role management |
| **Installer** | Installer dashboard only |
| **Customer** | Customer dashboard only |

These mappings live in `src/lib/permissions.ts` under `ROLE_PERMISSIONS`. Re-run `npm run db:seed` after editing.

## How the access control works

1. **Cookie presence** is checked by `src/middleware.ts` on every protected route (Edge runtime, no Firebase calls).
2. **Cookie verification + user load** happens once per render in `getCurrentUser()` (React `cache()`), in `src/lib/rbac.ts`. It verifies the Firebase session cookie with `firebase-admin` and loads the local `User` with their roles + permissions in a single query.
3. **Dashboard layout** (`src/app/(dashboard)/layout.tsx`) calls `accessibleDashboards(user)` to build the side-nav and decides whether to render it at all (>= 2 dashboards).
4. **Each per-dashboard layout** wraps its children with `<DashboardShell dashboard="...">`, which redirects to `/no-access` if the user lacks the dashboard permission, renders the dashboard heading, and shows only tabs they can access in the top nav.
5. **Each `[tab]/page.tsx`** calls `requireTab(dashboard, tab)`, which redirects to the user's default accessible tab if they don't have this one (preventing direct-URL bypass).
6. **Mutations** should call `hasPermission(user, key)` from `src/lib/rbac.ts` before executing, and `logAudit(...)` from `src/lib/audit.ts` afterwards.

## Adding a new dashboard or tab

1. Add it to `DASHBOARDS` in `src/lib/permissions.ts`.
2. (If new dashboard) create the routes:
   ```
   src/app/(dashboard)/<key>/layout.tsx     # <DashboardShell dashboard="<key>">
   src/app/(dashboard)/<key>/page.tsx       # await redirectToDefaultTab("<key>")
   src/app/(dashboard)/<key>/[tab]/page.tsx # await requireTab("<key>", params.tab)
   ```
3. Grant the new permissions to the appropriate roles in `ROLE_PERMISSIONS`.
4. Run `npm run db:seed`.

That's it — the side nav, top nav, and permission checks pick it up automatically.

## Deploy to Netlify

```bash
# Push to Git, then in the Netlify UI:
# 1. New site from Git → connect repo
# 2. Build command: npm run build  (set by netlify.toml)
# 3. Publish directory: .next       (set by netlify.toml)
# 4. Add env vars (Site settings → Environment variables):
#    DATABASE_URL
#    NEXT_PUBLIC_FIREBASE_* (all six)
#    FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
#    SESSION_COOKIE_NAME, SESSION_COOKIE_MAX_AGE, NEXT_PUBLIC_APP_URL
# 5. Deploy.
```

The `@netlify/plugin-nextjs` plugin (declared in `netlify.toml`) is installed automatically by Netlify on first build.

After the first deploy: SSH into a one-off shell or run from local with the production `DATABASE_URL` set:

```bash
DATABASE_URL="<prod url>" npm run db:push
DATABASE_URL="<prod url>" npm run db:seed
```

## Project layout

```
prisma/
  schema.prisma          # Postgres schema
  seed.ts                # idempotent seed from src/lib/permissions.ts
src/
  app/
    layout.tsx           # root html
    page.tsx             # redirects to user's first accessible dashboard
    login/               # Firebase email/password sign-in
    no-access/           # shown when user has no dashboards
    api/auth/session/    # POST = exchange ID token for cookie, DELETE = sign out
    (dashboard)/         # route group — shared shell layout
      layout.tsx         # side-nav + header
      leads/             # one folder per dashboard
        layout.tsx
        page.tsx         # redirect to default tab
        [tab]/page.tsx   # tab gate + placeholder body
      sales/ ... (same pattern x 8)
  components/
    side-nav.tsx
    top-nav.tsx
    dashboard-shell.tsx  # server component: gates + heading + top nav
    user-menu.tsx
    ui/                  # shadcn-style primitives (button, input, label, card, dropdown)
  lib/
    permissions.ts       # SINGLE SOURCE OF TRUTH for dashboards/tabs/roles/perms
    rbac.ts              # getCurrentUser, hasPermission, accessibleDashboards, ...
    audit.ts             # logAudit() helper
    prisma.ts            # cached Prisma client
    firebase/
      client.ts          # client-side Firebase
      admin.ts           # firebase-admin (server only)
    utils.ts             # cn() helper
  middleware.ts          # session cookie presence gate
```

## Future work

- Build out the real per-tab UIs (the placeholders are scaffolding).
- Admin UI for managing users / roles / permissions (the schema is ready; just needs the screens).
- Email magic-link / SSO / phone-OTP login (Firebase supports these — just enable + add a flow).
- Per-row authorization (e.g. consultants only see their own leads). The `ownerUserId` / `consultantId` / `assignedToId` columns are already in place.
- Tests (unit for `rbac.ts`, integration for the session route).
