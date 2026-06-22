-- Scheduling (availability + Leads Schedule appointments) migrated from the
-- legacy web database, plus self-profile fields on User.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "phones" JSONB;

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'HOLIDAY');

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySubmission" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "consultantName" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnd" DATE NOT NULL,
    "holidayDays" TEXT[],
    "slotsCount" INTEGER NOT NULL DEFAULT 0,
    "submitted" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,

    CONSTRAINT "AvailabilitySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "consultantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "disposition" TEXT,
    "bookedByUserId" TEXT,
    "bookedByName" TEXT,
    "source" TEXT,
    "company" TEXT,
    "bills" TEXT,
    "notes" TEXT,
    "customerName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "suburb" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "originalDate" DATE,
    "originalHour" INTEGER,
    "originalMinute" INTEGER,
    "rescheduleReason" TEXT,
    "rescheduledAt" TIMESTAMP(3),
    "isAdditional" BOOLEAN NOT NULL DEFAULT false,
    "cancelPending" TEXT,
    "cancelPendingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "AvailabilitySlot_consultantId_date_hour_key" ON "AvailabilitySlot"("consultantId", "date", "hour");
CREATE INDEX "AvailabilitySlot_date_idx" ON "AvailabilitySlot"("date");
CREATE INDEX "AvailabilitySlot_consultantId_date_idx" ON "AvailabilitySlot"("consultantId", "date");
CREATE UNIQUE INDEX "AvailabilitySubmission_consultantId_weekStart_key" ON "AvailabilitySubmission"("consultantId", "weekStart");
CREATE INDEX "AvailabilitySubmission_weekStart_idx" ON "AvailabilitySubmission"("weekStart");
CREATE INDEX "AvailabilitySubmission_consultantId_idx" ON "AvailabilitySubmission"("consultantId");
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");
CREATE INDEX "Appointment_consultantId_date_idx" ON "Appointment"("consultantId", "date");
CREATE INDEX "Appointment_leadId_idx" ON "Appointment"("leadId");

-- Foreign keys
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AvailabilitySubmission" ADD CONSTRAINT "AvailabilitySubmission_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
