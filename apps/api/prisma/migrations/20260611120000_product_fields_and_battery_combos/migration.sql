-- New enums
CREATE TYPE "PricingTier" AS ENUM ('BLOOME', 'BRIGHTE');
CREATE TYPE "ComboContext" AS ENUM ('SOLAR_BATTERY', 'BATTERY_ONLY');

-- New Product columns
ALTER TABLE "Product" ADD COLUMN "brand" TEXT,
                      ADD COLUMN "note" TEXT,
                      ADD COLUMN "profit" DECIMAL(12,2),
                      ADD COLUMN "systemSize" DECIMAL(10,3),
                      ADD COLUMN "pricingTier" "PricingTier",
                      ADD COLUMN "phase" INTEGER,
                      ADD COLUMN "unit" TEXT,
                      ADD COLUMN "perUnit" TEXT;

-- Inverter <-> battery compatibility/pricing matrix
CREATE TABLE "BatteryCombo" (
    "id" TEXT NOT NULL,
    "inverterId" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "phase" INTEGER NOT NULL,
    "states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "saleContext" "ComboContext" NOT NULL,
    "grossPrice" DECIMAL(12,2),
    "stc" DECIMAL(12,2),
    "rrp" DECIMAL(12,2),
    "profit" DECIMAL(12,2),
    "commission" DECIMAL(12,2),
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryCombo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BatteryComboLog" (
    "id" TEXT NOT NULL,
    "comboId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryComboLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatteryCombo_inverterId_idx" ON "BatteryCombo"("inverterId");
CREATE INDEX "BatteryCombo_batteryId_idx" ON "BatteryCombo"("batteryId");
CREATE INDEX "BatteryCombo_phase_idx" ON "BatteryCombo"("phase");
CREATE INDEX "BatteryCombo_saleContext_idx" ON "BatteryCombo"("saleContext");
CREATE INDEX "BatteryComboLog_comboId_idx" ON "BatteryComboLog"("comboId");
CREATE INDEX "BatteryComboLog_changedAt_idx" ON "BatteryComboLog"("changedAt");

ALTER TABLE "BatteryCombo" ADD CONSTRAINT "BatteryCombo_inverterId_fkey" FOREIGN KEY ("inverterId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatteryCombo" ADD CONSTRAINT "BatteryCombo_batteryId_fkey" FOREIGN KEY ("batteryId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BatteryComboLog" ADD CONSTRAINT "BatteryComboLog_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "BatteryCombo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
