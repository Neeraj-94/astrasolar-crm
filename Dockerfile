# =============================================================================
# AstraSolar CRM — NestJS API (apps/api) production image for Railway.
# Build context = repo root (npm workspaces monorepo).
# =============================================================================

# ---- base -------------------------------------------------------------------
FROM node:20-slim AS base
WORKDIR /app
# openssl is required by Prisma's query engine at runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ---- build ------------------------------------------------------------------
FROM base AS build
# Copy only manifests first so npm install is cached when source changes.
COPY package.json package-lock.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# --ignore-scripts skips each workspace's postinstall (e.g. web's prisma generate,
# whose schema isn't in this context). The API's own build runs prisma generate.
RUN npm ci --ignore-scripts

# Source for the two workspaces the API needs.
COPY packages/shared packages/shared
COPY apps/api apps/api

# Build the shared lib, then the API (prisma generate + nest build).
RUN npm run build --workspace=@astra/shared && \
    npm run build --workspace=@astra/api

# ---- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
# node_modules carries the generated Prisma client AND the prisma CLI used by
# `migrate deploy` at startup.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
# tsconfig is needed so `npm run db:seed` (ts-node) uses the project's
# CommonJS/Node module settings instead of ts-node's NodeNext default.
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

WORKDIR /app/apps/api
# The app binds to process.env.PORT (Railway injects PORT=8080). The public
# domain's target port must match that value, NOT the 4000 dev fallback.
EXPOSE 8080
# Apply pending migrations, sync the system-role → permission matrix into the
# DB (idempotent; keeps RBAC in step with code — no user/password changes),
# then boot. Remove a step from the chain if you'd rather run it manually.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:sync-roles && node dist/main.js"]
