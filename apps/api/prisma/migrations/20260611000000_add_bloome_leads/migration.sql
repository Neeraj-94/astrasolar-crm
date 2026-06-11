-- CreateTable: raw Bloome appointment-setter leads imported from Google Sheets.
CREATE TABLE "BloomeLead" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "sourceTab" TEXT NOT NULL,
    "rowNum" INTEGER NOT NULL,
    "wc" TEXT,
    "timestamp" TIMESTAMP(3),
    "firstName" TEXT,
    "lastName" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "postcode" TEXT,
    "suburb" TEXT,
    "billSpend" TEXT,
    "code" TEXT,
    "agent" TEXT,
    "dials" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT,
    "notes" TEXT,
    "lastCalled" TEXT,
    "appDate" TEXT,
    "appTime" TEXT,
    "existingSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BloomeLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BloomeLead_sourceTab_rowNum_key" ON "BloomeLead"("sourceTab", "rowNum");
CREATE INDEX "BloomeLead_region_idx" ON "BloomeLead"("region");
CREATE INDEX "BloomeLead_outcome_idx" ON "BloomeLead"("outcome");
CREATE INDEX "BloomeLead_agent_idx" ON "BloomeLead"("agent");
CREATE INDEX "BloomeLead_mobile_idx" ON "BloomeLead"("mobile");
CREATE INDEX "BloomeLead_timestamp_idx" ON "BloomeLead"("timestamp");
