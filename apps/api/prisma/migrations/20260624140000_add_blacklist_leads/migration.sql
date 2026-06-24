-- Blacklist Leads (Leads -> Blacklist Leads). Ported from astrasolar-app's
-- Firebase `/blacklistLeads` node. Entries block a person from appearing in
-- Bloome / No Answers / Leads Schedule; a sweep flags matching records
-- (>=2 normalised fields) and writes a removal-log row.

-- ---- Blacklist entries -----------------------------------------------------
CREATE TABLE "BlacklistEntry" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "addedById" TEXT,
    "addedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlacklistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlacklistEntry_phone_idx" ON "BlacklistEntry"("phone");
CREATE INDEX "BlacklistEntry_email_idx" ON "BlacklistEntry"("email");

-- ---- Removal log -----------------------------------------------------------
CREATE TABLE "BlacklistRemovalLog" (
    "id" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "matchedFirstName" TEXT,
    "matchedLastName" TEXT,
    "matchedPhone" TEXT,
    "matchedEmail" TEXT,
    "matchedAddress" TEXT,
    "matchedOn" TEXT NOT NULL,
    "entryId" TEXT,
    "removedById" TEXT,
    "removedByName" TEXT,

    CONSTRAINT "BlacklistRemovalLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlacklistRemovalLog_detectedAt_idx" ON "BlacklistRemovalLog"("detectedAt");
CREATE INDEX "BlacklistRemovalLog_entryId_idx" ON "BlacklistRemovalLog"("entryId");
ALTER TABLE "BlacklistRemovalLog"
    ADD CONSTRAINT "BlacklistRemovalLog_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "BlacklistEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---- Soft-delete flags on the three swept sources --------------------------
ALTER TABLE "Lead" ADD COLUMN "blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Lead" ADD COLUMN "blacklistedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "blacklistEntryId" TEXT;

ALTER TABLE "BloomeLead" ADD COLUMN "blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BloomeLead" ADD COLUMN "blacklistedAt" TIMESTAMP(3);
ALTER TABLE "BloomeLead" ADD COLUMN "blacklistEntryId" TEXT;

ALTER TABLE "Appointment" ADD COLUMN "blacklisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN "blacklistedAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "blacklistEntryId" TEXT;
