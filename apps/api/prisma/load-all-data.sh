#!/usr/bin/env bash
#
# load-all-data.sh — populate the CRM database with real data, end to end.
#
# Runs every step in dependency order:
#   schema -> roles/super-admin -> staff users -> products -> leads (REPLACE)
#   -> lead appointments -> sales -> availability
#
# The leads step is DESTRUCTIVE (wipes leads + bookings + sales + their children
# and rebuilds them). It writes its own JSON backup first, but you should take a
# full DB dump before running this. Nothing runs until you type "yes".
#
# Usage:
#   cd apps/api
#   bash prisma/load-all-data.sh            # full run (asks for confirmation)
#   PREVIEW=1 bash prisma/load-all-data.sh  # dry-run/preview every step, writes nothing
#
set -euo pipefail
cd "$(dirname "$0")/.."           # -> apps/api
W="--workspace=@astra/api"
PREVIEW="${PREVIEW:-0}"
PROD="${PROD:-0}"   # PROD=1 → use forward-only `migrate deploy` (never `migrate dev`)

run() { echo; echo "▶ $*"; eval "$@"; }

echo "=================================================================="
echo " astrasolar-v2 — full data load   (PREVIEW=$PREVIEW)"
echo "=================================================================="

if [ "$PREVIEW" = "1" ]; then
  echo "PREVIEW MODE — every step is a dry-run; nothing is written."
else
  echo "LIVE MODE — this DELETES and REPLACES lead/sale/booking data."
  echo "Make sure you have a database backup (pg_dump) first."
  read -r -p "Type 'yes' to proceed: " ans
  [ "$ans" = "yes" ] || { echo "Aborted."; exit 1; }
fi

# 1. Schema + Prisma client
run "npx prisma generate"
if [ "$PREVIEW" != "1" ]; then
  if [ "$PROD" = "1" ]; then
    run "npm run db:deploy $W"   # forward-only, prod-safe (applies committed migrations)
  else
    run "npm run db:migrate $W"  # dev: creates/applies migrations
  fi
fi

# 2. Roles, permissions, super admin
run "npm run db:seed $W"

# 3. Real staff users (must exist BEFORE imports so owners resolve by email)
run "npm run db:seed-users $W"

# 4. Product catalogue.
#    SOLAR products come from the maintained seed scripts; inverter/battery/extra
#    catalogues come from the (now rewritten) import-products against the split
#    schema. Each step is non-fatal so a product glitch never blocks the leads
#    load below.
if [ "$PREVIEW" = "1" ]; then
  run "npm run db:import-products $W -- --dry-run   || true"
  echo "  (PREVIEW: solar seeds skipped — they have no dry-run mode)"
else
  run "npm run db:seed-solar-products $W            || true"
  run "npm run db:seed-solar-products-tas $W        || true"
  run "npm run db:seed-solar-products-brighte $W    || true"
  run "npm run db:seed-solar-products-tas-brighte $W|| true"
  run "npm run db:enrich-solar-products $W          || true"
  run "npm run db:set-solar-effective-date $W       || true"
  run "npm run db:import-products $W                || true"
fi

# 5. Leads — full REPLACE (destructive) + their stateLog
if [ "$PREVIEW" = "1" ]; then
  run "npm run db:replace-leads $W"                                   # dry-run is the default
else
  run "npm run db:replace-leads $W -- --confirm --yes-delete-all"
fi

# 6. Lead appointments — fills each consultant's schedule
if [ "$PREVIEW" = "1" ]; then run "npm run db:import-lead-appointments $W -- --dry-run"
else run "npm run db:import-lead-appointments $W"; fi

# 7. Sales — generated from SOLD leads (sales-from-sold-leads.json), linked by
#    the stable lead ids written into leads-deduped.json.
if [ "$PREVIEW" = "1" ]; then run "npm run db:import-sales $W -- --file=sales-from-sold-leads.json --dry-run || true"
else run "npm run db:import-sales $W -- --file=sales-from-sold-leads.json"; fi

# 8. Consultant availability
if [ "$PREVIEW" = "1" ]; then run "npm run db:import-availability $W -- --dry-run || true"
else run "npm run db:import-availability $W"; fi

echo
echo "=================================================================="
echo " Done. Open Prisma Studio to verify:  npm run db:studio $W"
echo "=================================================================="
