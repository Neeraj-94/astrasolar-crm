# AstraSolar CRM — Deployment Runbook

Two pieces ship separately:

| Piece | Code | Host | URL |
|-------|------|------|-----|
| Web (Next.js) | `apps/web` | **Netlify** (already connected: site `astrasolar`) | https://astrasolar.app |
| API (NestJS) | `apps/api` | **Railway** (new) | `https://<your-service>.up.railway.app` |
| Database | Prisma schema in `apps/api/prisma` | **Railway Postgres** (new) | internal |

The browser only ever talks to `astrasolar.app`. Next.js rewrites `/api/v1/*`
to the API origin server-side (see `apps/web/next.config.mjs`), so auth cookies
stay first-party. That means **the web app must know the API URL** via the
`API_ORIGIN` env var on Netlify.

---

## 0. Before you start — security

Your git remote currently has a GitHub personal access token embedded in plain
text. **Revoke it** at https://github.com/settings/tokens, then reset the remote
to a clean URL and let git's credential manager handle auth:

```bash
git remote set-url origin https://github.com/Neeraj-94/astrasolar-crm.git
```

Never commit `.env` / `.env.local` — `.gitignore` already excludes them. All
real secrets live in the Railway and Netlify dashboards only.

---

## 1. Provision the database + API on Railway

1. Create a Railway account and a **New Project** at https://railway.app.
2. In the project: **+ New → Database → PostgreSQL**. Railway creates it and
   exposes `DATABASE_URL` as a variable on that DB service.
3. **+ New → GitHub Repo → `Neeraj-94/astrasolar-crm`** to add the API service.
   - Railway reads `railway.json` at the repo root and builds the root
     `Dockerfile` (the NestJS API). No "root directory" change needed.
4. Open the API service → **Variables** and set everything in section 2 below.
   - For `DATABASE_URL`, reference the Postgres service:
     `${{Postgres.DATABASE_URL}}` (Railway's variable-reference syntax).
5. The container's start command runs `prisma migrate deploy` automatically on
   every boot, then starts the server. Railway injects `PORT`; the app reads it.
6. After the first successful deploy, open **Settings → Networking → Generate
   Domain** to get the public `https://<service>.up.railway.app` URL.

### Seed the first admin + reference data (one time)

Migrations run automatically, but seeding does not. From the Railway service
shell (or locally with the production `DATABASE_URL` exported), run:

```bash
cd apps/api
npm run db:deploy        # already auto-run on boot; safe to repeat
npm run db:seed          # creates the SEED_SUPERADMIN_* user + roles/permissions
# optional catalogue/data imports, as needed:
# npm run db:seed-solar-products
```

The bootstrap super admin comes from `SEED_SUPERADMIN_EMAIL` /
`SEED_SUPERADMIN_PASSWORD`. **Change the default password** before seeding prod.

---

## 2. API environment variables (Railway)

Set these on the **API service** (not the DB service). Values marked _generate_
should be long random strings — e.g. `openssl rand -base64 48`.

```
DATABASE_URL              = ${{Postgres.DATABASE_URL}}
JWT_ACCESS_SECRET         = <generate>
JWT_REFRESH_SECRET        = <generate>
JWT_ACCESS_TTL            = 900s
JWT_REFRESH_TTL           = 7d

# CORS — must list the live web origin (comma-separated for multiple)
WEB_ORIGIN                = https://astrasolar.app

# Cookies — domain shared by web + API responses, secure in prod
COOKIE_DOMAIN             = astrasolar.app
COOKIE_SECURE             = true

# Seed bootstrap admin (used once by `npm run db:seed`)
SEED_SUPERADMIN_EMAIL     = neeraj@astrasolar.com.au
SEED_SUPERADMIN_PASSWORD  = <choose a strong password>
SEED_SUPERADMIN_NAME      = Neeraj
```

Optional integrations — set only the ones you use (all listed in
`apps/api/.env.example`): SMTP mail (`SMTP_*`, `MAIL_FROM`), Cloudflare R2
storage (`R2_*`), Google Sheets intake (`GOOGLE_*`, `BLOOME_*`), and Nova AI
(`ANTHROPIC_API_KEY`, `NOVA_*`, `ELEVENLABS_*`, `DID_*`).

> Cookie note: because the web app proxies `/api/v1/*` to Railway server-side,
> the API's `Set-Cookie` flows back through `astrasolar.app`. Keep
> `COOKIE_DOMAIN=astrasolar.app` and `COOKIE_SECURE=true` so cookies are
> first-party and HTTPS-only in production.

---

## 3. Web environment variables (Netlify)

Site **astrasolar** → **Site configuration → Environment variables**. Add:

```
# Point the Next.js proxy at your Railway API (no trailing slash)
API_ORIGIN                          = https://<service>.up.railway.app

NEXT_PUBLIC_APP_URL                 = https://astrasolar.app

# Firebase client (NEXT_PUBLIC_* are exposed to the browser — expected)
NEXT_PUBLIC_FIREBASE_API_KEY        = ...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN    = ...
NEXT_PUBLIC_FIREBASE_PROJECT_ID     = ...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = ...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = ...
NEXT_PUBLIC_FIREBASE_APP_ID         = ...

# Firebase admin (server-side only)
FIREBASE_PROJECT_ID                 = ...
FIREBASE_CLIENT_EMAIL               = ...
FIREBASE_PRIVATE_KEY                = "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

SESSION_COOKIE_NAME                 = __astra_session
SESSION_COOKIE_MAX_AGE              = 432000
```

`FIREBASE_PRIVATE_KEY` must keep the literal `\n` sequences. If the web app also
needs `DATABASE_URL` at build for `prisma generate`, the schema in
`apps/web/prisma` is used for client generation only — a valid connection string
(can be the same Railway Postgres) avoids build errors.

---

## 4. Ship the web app

Netlify auto-builds on push to its **production branch** (verify under Site
configuration → Build & deploy → Branches; almost certainly `main`).

Your changes are uncommitted on `leads/features` (191 files). To release:

```bash
cd <repo root>
git status                       # review what's changing
git add -A
git commit -m "Deploy: API host config + leads features"
git push origin leads/features   # triggers a branch DEPLOY PREVIEW first

# When the preview looks good, promote to production:
git checkout main
git merge leads/features
git push origin main             # triggers the PRODUCTION build → astrasolar.app
```

Prefer a branch preview before production: pushing `leads/features` gives a
preview URL (Netlify already showed one). Merge to `main` only when it checks
out.

---

## 5. Order of operations (important)

1. Railway API + Postgres live, with a public domain → you have the API URL.
2. Set `API_ORIGIN` on Netlify to that URL.
3. Set the remaining web + API env vars.
4. Run `npm run db:seed` once against prod Postgres.
5. Push web code → production build picks up `API_ORIGIN`.

If you set `API_ORIGIN` after a web build, **trigger a redeploy** so the new
value is baked in.

---

## 6. Verify

- `https://<service>.up.railway.app/api/docs` → Swagger UI loads (API up).
- `https://astrasolar.app` → app loads; log in with the seeded super admin.
- Open DevTools → Network: `/api/v1/...` calls return 200 (proxy + CORS OK).
- Confirm role-based nav: super admin sees all dashboards; a single-role user is
  taken straight to their one dashboard with the side nav hidden.
- Railway logs show `API listening on :<PORT>` and a clean `migrate deploy`.

## 7. Rollback

- **Web:** Netlify → Deploys → pick the last good deploy → **Publish deploy**.
- **API:** Railway → service → Deployments → **Redeploy** a previous build.
- **DB:** `prisma migrate deploy` is forward-only. Take a Railway Postgres
  backup/snapshot before shipping new migrations.
