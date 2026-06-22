#!/usr/bin/env bash
# ============================================================================
# One-off data migration: legacy web database (astrasolar) → API database
# (astra_crm). Copies the scheduling data the web app used to own:
#
#   AvailabilitySlot, AvailabilitySubmission, Appointment
#
# Consultant ids are remapped: rows already keyed by an API user id pass
# through; legacy web user ids are matched to API users BY EMAIL. Rows whose
# consultant can't be matched are skipped (counts reported).
#
# Appointment dates get +1 day: the legacy writer stored local-midnight dates,
# which Postgres kept as the previous UTC day. (Availability rows were already
# repaired by prisma/fix-availability-dates.sql, so they copy as-is.)
#
# Idempotent: re-runs skip existing rows via ON CONFLICT / NOT EXISTS.
#
# Usage:
#   WEB_DB="postgresql://user:pass@localhost:5432/astrasolar" \
#   API_DB="postgresql://user:pass@localhost:5432/astra_crm" \
#   bash apps/api/scripts/migrate-web-db.sh
#
# Defaults read DATABASE_URL from apps/web/.env and apps/api/.env if unset.
# ============================================================================
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../../.." && pwd)"

# Read DATABASE_URL from an env file and strip Prisma-only query params
# (psql rejects "?schema=public").
env_url() {
  grep -E '^DATABASE_URL=' "$1" | head -1 \
    | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/' \
    | sed -E 's/\?.*$//'
}

WEB_DB="${WEB_DB:-$(env_url "$repo/apps/web/.env")}"
API_DB="${API_DB:-$(env_url "$repo/apps/api/.env")}"
[ -n "$WEB_DB" ] && [ -n "$API_DB" ] || { echo "WEB_DB / API_DB not resolved"; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Staging CSVs in $tmp"

# ---- 1. Export from the web DB (joined with legacy user emails) ------------

psql "$WEB_DB" -v ON_ERROR_STOP=1 <<SQL
\\copy (SELECT u.id, lower(u.email) FROM "User" u) TO '$tmp/web_users.csv' CSV
\\copy (SELECT s.id, s."consultantId", s.date, s.hour, s.status::text, s.note, s."createdById", s."createdAt", s."updatedAt" FROM "AvailabilitySlot" s) TO '$tmp/slots.csv' CSV
\\copy (SELECT b.id, b."consultantId", b."consultantName", b."weekStart", b."weekEnd", array_to_string(b."holidayDays", '|'), b."slotsCount", b.submitted, b."submittedAt", b."updatedAt", b."updatedById", b."updatedByName" FROM "AvailabilitySubmission" b) TO '$tmp/subs.csv' CSV
\\copy (SELECT a.id, a."consultantId", a.date, a.hour, a.minute, a."durationMinutes", a.disposition, a."bookedByUserId", a."bookedByName", a.source, a.company, a.bills, a.notes, l."fullName", l."firstName", l."lastName", l.phone, l.email, l."addressLine1", l.suburb, l.state, l.postcode, a."isAdditional", a."cancelPending", a."cancelPendingAt", a."createdAt", a."updatedAt" FROM "Appointment" a JOIN "Lead" l ON l.id = a."leadId") TO '$tmp/appointments.csv' CSV
SQL

# ---- 2. Load into the API DB with id remapping ------------------------------

psql "$API_DB" -v ON_ERROR_STOP=1 <<SQL
BEGIN;

CREATE TEMP TABLE _web_users (legacy_id TEXT PRIMARY KEY, email TEXT);
\\copy _web_users FROM '$tmp/web_users.csv' CSV

-- legacy web user id (or already-API id) → API user id
CREATE TEMP VIEW _user_map AS
SELECT w.legacy_id, COALESCE(direct.id, byemail.id) AS api_id
FROM _web_users w
LEFT JOIN "User" direct ON direct.id = w.legacy_id
LEFT JOIN "User" byemail ON lower(byemail.email) = w.email;

CREATE TEMP TABLE _slots (
  id TEXT, consultant_id TEXT, date DATE, hour INT, status TEXT, note TEXT,
  created_by TEXT, created_at TIMESTAMP, updated_at TIMESTAMP);
\\copy _slots FROM '$tmp/slots.csv' CSV

INSERT INTO "AvailabilitySlot"
  ("id","consultantId","date","hour","status","note","createdById","createdAt","updatedAt")
SELECT s.id,
       COALESCE(u.id, m.api_id),
       s.date, s.hour, s.status::"AvailabilityStatus", s.note, s.created_by,
       s.created_at, s.updated_at
FROM _slots s
LEFT JOIN "User" u ON u.id = s.consultant_id
LEFT JOIN _user_map m ON m.legacy_id = s.consultant_id
WHERE COALESCE(u.id, m.api_id) IS NOT NULL
ON CONFLICT ("consultantId","date","hour") DO NOTHING;

CREATE TEMP TABLE _subs (
  id TEXT, consultant_id TEXT, consultant_name TEXT, week_start DATE, week_end DATE,
  holiday_days TEXT, slots_count INT, submitted BOOLEAN, submitted_at TIMESTAMP,
  updated_at TIMESTAMP, updated_by_id TEXT, updated_by_name TEXT);
\\copy _subs FROM '$tmp/subs.csv' CSV

INSERT INTO "AvailabilitySubmission"
  ("id","consultantId","consultantName","weekStart","weekEnd","holidayDays",
   "slotsCount","submitted","submittedAt","updatedAt","updatedById","updatedByName")
SELECT s.id, COALESCE(u.id, m.api_id), s.consultant_name, s.week_start, s.week_end,
       CASE WHEN s.holiday_days = '' THEN '{}'::TEXT[]
            ELSE string_to_array(s.holiday_days, '|') END,
       s.slots_count, s.submitted, s.submitted_at, s.updated_at,
       s.updated_by_id, s.updated_by_name
FROM _subs s
LEFT JOIN "User" u ON u.id = s.consultant_id
LEFT JOIN _user_map m ON m.legacy_id = s.consultant_id
WHERE COALESCE(u.id, m.api_id) IS NOT NULL
ON CONFLICT ("consultantId","weekStart") DO NOTHING;

CREATE TEMP TABLE _appts (
  id TEXT, consultant_id TEXT, date DATE, hour INT, minute INT, duration INT,
  disposition TEXT, booked_by_id TEXT, booked_by_name TEXT, source TEXT,
  company TEXT, bills TEXT, notes TEXT, full_name TEXT, first_name TEXT,
  last_name TEXT, phone TEXT, email TEXT, address TEXT, suburb TEXT,
  state TEXT, postcode TEXT, is_additional BOOLEAN, cancel_pending TEXT,
  cancel_pending_at TIMESTAMP, created_at TIMESTAMP, updated_at TIMESTAMP);
\\copy _appts FROM '$tmp/appointments.csv' CSV

INSERT INTO "Appointment"
  ("id","leadId","consultantId","date","hour","minute","durationMinutes",
   "disposition","bookedByUserId","bookedByName","source","company","bills",
   "notes","customerName","firstName","lastName","phone","email","address",
   "suburb","state","postcode","isAdditional","cancelPending","cancelPendingAt",
   "createdAt","updatedAt")
SELECT a.id, NULL, COALESCE(u.id, m.api_id),
       a.date + 1,                       -- repair legacy local-midnight shift
       a.hour, a.minute, a.duration, a.disposition, a.booked_by_id,
       a.booked_by_name, a.source, a.company, a.bills, a.notes, a.full_name,
       a.first_name, a.last_name, a.phone, a.email, a.address, a.suburb,
       a.state, a.postcode, a.is_additional, a.cancel_pending,
       a.cancel_pending_at, a.created_at, a.updated_at
FROM _appts a
LEFT JOIN "User" u ON u.id = a.consultant_id
LEFT JOIN _user_map m ON m.legacy_id = a.consultant_id
WHERE COALESCE(u.id, m.api_id) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Appointment" e WHERE e.id = a.id);

-- ---- report ----------------------------------------------------------------
SELECT 'slots copied' AS what, count(*) FROM "AvailabilitySlot"
UNION ALL SELECT 'submissions copied', count(*) FROM "AvailabilitySubmission"
UNION ALL SELECT 'appointments copied', count(*) FROM "Appointment";

SELECT 'slots skipped (no matching API user)' AS what, count(*)
FROM _slots s
LEFT JOIN "User" u ON u.id = s.consultant_id
LEFT JOIN _user_map m ON m.legacy_id = s.consultant_id
WHERE COALESCE(u.id, m.api_id) IS NULL
UNION ALL
SELECT 'appointments skipped (no matching API user)', count(*)
FROM _appts a
LEFT JOIN "User" u ON u.id = a.consultant_id
LEFT JOIN _user_map m ON m.legacy_id = a.consultant_id
WHERE COALESCE(u.id, m.api_id) IS NULL;

COMMIT;
SQL

echo "Done."
