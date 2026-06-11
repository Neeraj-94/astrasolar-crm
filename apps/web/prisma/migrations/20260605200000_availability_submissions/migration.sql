-- Add HOLIDAY value to AvailabilityStatus enum
ALTER TYPE "AvailabilityStatus" ADD VALUE IF NOT EXISTS 'HOLIDAY';

-- Week-level submission record
CREATE TABLE "AvailabilitySubmission" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "consultantName" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "holidayDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "slotsCount" INTEGER NOT NULL DEFAULT 0,
    "submitted" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "AvailabilitySubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvailabilitySubmission_consultantId_weekStart_key"
  ON "AvailabilitySubmission"("consultantId", "weekStart");
CREATE INDEX "AvailabilitySubmission_weekStart_idx" ON "AvailabilitySubmission"("weekStart");
CREATE INDEX "AvailabilitySubmission_consultantId_idx" ON "AvailabilitySubmission"("consultantId");

ALTER TABLE "AvailabilitySubmission"
  ADD CONSTRAINT "AvailabilitySubmission_consultantId_fkey"
  FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
