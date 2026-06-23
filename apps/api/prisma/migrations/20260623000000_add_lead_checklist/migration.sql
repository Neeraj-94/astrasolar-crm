-- CreateEnum
CREATE TYPE "ChecklistStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable
CREATE TABLE "LeadChecklist" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "ChecklistStatus" NOT NULL DEFAULT 'DRAFT',
    "state" TEXT,
    "nmi" TEXT,
    "roofType" TEXT,
    "storeys" INTEGER,
    "orientation" TEXT,
    "shadingNotes" TEXT,
    "phase" TEXT,
    "switchboard" TEXT,
    "spendAmount" DECIMAL(12,2),
    "spendPeriod" TEXT,
    "usageSplit" JSONB,
    "drivers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "budgetPosture" TEXT,
    "category" TEXT,
    "priorSystem" JSONB,
    "preferredBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "batteryPref" TEXT,
    "evChargerPref" TEXT,
    "budgetCeiling" DECIMAL(12,2),
    "result" JSONB,
    "recommendedOptionId" TEXT,
    "selectedOptionId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadChecklist_leadId_key" ON "LeadChecklist"("leadId");

-- CreateIndex
CREATE INDEX "LeadChecklist_status_idx" ON "LeadChecklist"("status");

-- CreateIndex
CREATE INDEX "LeadChecklist_createdById_idx" ON "LeadChecklist"("createdById");

-- AddForeignKey
ALTER TABLE "LeadChecklist" ADD CONSTRAINT "LeadChecklist_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadChecklist" ADD CONSTRAINT "LeadChecklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
