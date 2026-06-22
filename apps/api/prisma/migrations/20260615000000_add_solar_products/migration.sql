-- New enum
CREATE TYPE "SolarProductStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'ARCHIVED');

-- Solar product catalogue (effective-dated pricing)
CREATE TABLE "SolarProduct" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "brand" TEXT,
    "panelModel" TEXT,
    "panelWatt" INTEGER,
    "systemSize" DECIMAL(10,3),
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "SolarProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "solarRrp" DECIMAL(12,2),
    "solarCommission" DECIMAL(12,2),
    "profit" DECIMAL(12,2),
    "effectiveDate" DATE,
    "notes" TEXT,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolarProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SolarProduct_status_idx" ON "SolarProduct"("status");
CREATE INDEX "SolarProduct_brand_idx" ON "SolarProduct"("brand");
CREATE INDEX "SolarProduct_effectiveDate_idx" ON "SolarProduct"("effectiveDate");

-- Solar product change log (effectiveDate REQUIRED)
CREATE TABLE "SolarProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolarProductLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SolarProductLog_productId_idx" ON "SolarProductLog"("productId");
CREATE INDEX "SolarProductLog_effectiveDate_idx" ON "SolarProductLog"("effectiveDate");
CREATE INDEX "SolarProductLog_changedAt_idx" ON "SolarProductLog"("changedAt");

ALTER TABLE "SolarProductLog"
    ADD CONSTRAINT "SolarProductLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "SolarProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
