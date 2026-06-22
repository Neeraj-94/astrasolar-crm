-- New enum
CREATE TYPE "BatteryPriceContext" AS ENUM ('BATTERY_ONLY', 'SOLAR_BATTERY');

-- Per-context battery RRP
CREATE TABLE "BatteryContextPrice" (
    "id" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "context" "BatteryPriceContext" NOT NULL,
    "batteryRrp" DECIMAL(12,2),
    "effectiveDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryContextPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatteryContextPrice_batteryId_context_key" ON "BatteryContextPrice"("batteryId", "context");
CREATE INDEX "BatteryContextPrice_batteryId_idx" ON "BatteryContextPrice"("batteryId");

ALTER TABLE "BatteryContextPrice"
    ADD CONSTRAINT "BatteryContextPrice_batteryId_fkey"
    FOREIGN KEY ("batteryId") REFERENCES "BatteryProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Context-price change log (effectiveDate REQUIRED)
CREATE TABLE "BatteryContextPriceLog" (
    "id" TEXT NOT NULL,
    "contextPriceId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryContextPriceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatteryContextPriceLog_contextPriceId_idx" ON "BatteryContextPriceLog"("contextPriceId");
CREATE INDEX "BatteryContextPriceLog_effectiveDate_idx" ON "BatteryContextPriceLog"("effectiveDate");
CREATE INDEX "BatteryContextPriceLog_changedAt_idx" ON "BatteryContextPriceLog"("changedAt");

ALTER TABLE "BatteryContextPriceLog"
    ADD CONSTRAINT "BatteryContextPriceLog_contextPriceId_fkey"
    FOREIGN KEY ("contextPriceId") REFERENCES "BatteryContextPrice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: move any existing per-battery RRP into a BATTERY_ONLY context row.
INSERT INTO "BatteryContextPrice" ("id", "batteryId", "context", "batteryRrp", "effectiveDate", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'BATTERY_ONLY', "batteryRrp", "effectiveDate", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "BatteryProduct"
WHERE "batteryRrp" IS NOT NULL;

-- batteryRrp is now context-dependent; drop it from the battery row.
ALTER TABLE "BatteryProduct" DROP COLUMN "batteryRrp";
