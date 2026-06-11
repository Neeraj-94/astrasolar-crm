-- ============================================================================
-- Lead lifecycle objects migration
--
-- Expands the Lead table to act as the single primary record for each
-- prospect/customer journey. Adds:
--
--   * Flat columns for the base lead fields (split name, full address,
--     classification, ownership, lead-gen rep, created-by).
--   * JSONB columns for grouped detail blobs (customerDetails,
--     contactDetails, addressDetails).
--   * JSONB columns for lifecycle workflow objects (scheduleLog, sales,
--     adminStatus, installStatus, financeStatus, postInstallStatus).
--
-- All additions are nullable so existing rows remain valid. Indexes added
-- for the new searchable columns.
-- ============================================================================

-- ----- Flat base columns -----------------------------------------------------
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "firstName"        TEXT,
  ADD COLUMN IF NOT EXISTS "lastName"         TEXT,
  ADD COLUMN IF NOT EXISTS "alternatePhone"   TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine1"     TEXT,
  ADD COLUMN IF NOT EXISTS "addressLine2"     TEXT,
  ADD COLUMN IF NOT EXISTS "suburb"           TEXT,
  ADD COLUMN IF NOT EXISTS "state"            TEXT,
  ADD COLUMN IF NOT EXISTS "country"          TEXT DEFAULT 'Australia',
  ADD COLUMN IF NOT EXISTS "companyOrType"    TEXT,
  ADD COLUMN IF NOT EXISTS "disposition"      TEXT,
  ADD COLUMN IF NOT EXISTS "ownerUserName"    TEXT,
  ADD COLUMN IF NOT EXISTS "assignedToName"   TEXT,
  ADD COLUMN IF NOT EXISTS "leadGenUserId"    TEXT,
  ADD COLUMN IF NOT EXISTS "leadGenUserName"  TEXT,
  ADD COLUMN IF NOT EXISTS "createdById"      TEXT,
  ADD COLUMN IF NOT EXISTS "createdByName"    TEXT;

-- ----- Grouped detail JSONB --------------------------------------------------
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "customerDetails"   JSONB,
  ADD COLUMN IF NOT EXISTS "contactDetails"    JSONB,
  ADD COLUMN IF NOT EXISTS "addressDetails"    JSONB;

-- ----- Lifecycle workflow JSONB ---------------------------------------------
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "scheduleLog"       JSONB,
  ADD COLUMN IF NOT EXISTS "sales"             JSONB,
  ADD COLUMN IF NOT EXISTS "adminStatus"       JSONB,
  ADD COLUMN IF NOT EXISTS "installStatus"     JSONB,
  ADD COLUMN IF NOT EXISTS "financeStatus"     JSONB,
  ADD COLUMN IF NOT EXISTS "postInstallStatus" JSONB;

-- ----- Indexes ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "Lead_disposition_idx"      ON "Lead" ("disposition");
CREATE INDEX IF NOT EXISTS "Lead_leadGenUserId_idx"    ON "Lead" ("leadGenUserId");
CREATE INDEX IF NOT EXISTS "Lead_createdById_idx"      ON "Lead" ("createdById");
CREATE INDEX IF NOT EXISTS "Lead_email_idx"            ON "Lead" ("email");
CREATE INDEX IF NOT EXISTS "Lead_phone_idx"            ON "Lead" ("phone");
CREATE INDEX IF NOT EXISTS "Lead_postcode_idx"         ON "Lead" ("postcode");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx"        ON "Lead" ("createdAt");
