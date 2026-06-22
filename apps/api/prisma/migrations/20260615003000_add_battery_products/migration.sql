-- New enum
CREATE TYPE "BatteryStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'ARCHIVED');

-- Battery catalogue (effective-dated pricing)
CREATE TABLE "BatteryProduct" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "batteryModel" TEXT,
    "batterySize" DECIMAL(10,2),
    "modules" INTEGER,
    "batteryStc" DECIMAL(12,2),
    "phase" INTEGER,
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "BatteryStatus" NOT NULL DEFAULT 'ACTIVE',
    "grossPrice" DECIMAL(12,2),
    "batteryRrp" DECIMAL(12,2),
    "batteryCommission" DECIMAL(12,2),
    "profit" DECIMAL(12,2),
    "effectiveDate" DATE,
    "notes" TEXT,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatteryProduct_status_idx" ON "BatteryProduct"("status");
CREATE INDEX "BatteryProduct_brand_idx" ON "BatteryProduct"("brand");
CREATE INDEX "BatteryProduct_effectiveDate_idx" ON "BatteryProduct"("effectiveDate");

-- Battery change log (effectiveDate REQUIRED)
CREATE TABLE "BatteryProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryProductLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatteryProductLog_productId_idx" ON "BatteryProductLog"("productId");
CREATE INDEX "BatteryProductLog_effectiveDate_idx" ON "BatteryProductLog"("effectiveDate");
CREATE INDEX "BatteryProductLog_changedAt_idx" ON "BatteryProductLog"("changedAt");

ALTER TABLE "BatteryProductLog"
    ADD CONSTRAINT "BatteryProductLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "BatteryProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
