-- New enum
CREATE TYPE "InverterStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'ARCHIVED');

-- Inverter catalogue
CREATE TABLE "InverterProduct" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "inverterModel" TEXT,
    "type" TEXT,
    "phase" INTEGER,
    "systemSize" DECIMAL(10,3),
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "InverterStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InverterProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InverterProduct_status_idx" ON "InverterProduct"("status");
CREATE INDEX "InverterProduct_type_idx" ON "InverterProduct"("type");
CREATE INDEX "InverterProduct_phase_idx" ON "InverterProduct"("phase");

-- Inverter change log (effectiveDate REQUIRED)
CREATE TABLE "InverterProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InverterProductLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InverterProductLog_productId_idx" ON "InverterProductLog"("productId");
CREATE INDEX "InverterProductLog_effectiveDate_idx" ON "InverterProductLog"("effectiveDate");
CREATE INDEX "InverterProductLog_changedAt_idx" ON "InverterProductLog"("changedAt");

ALTER TABLE "InverterProductLog"
    ADD CONSTRAINT "InverterProductLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "InverterProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
