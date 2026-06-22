-- Combo (inverter+battery) context pricing: gross + RRP per combo per context.
CREATE TABLE "BatteryComboContextPrice" (
    "id" TEXT NOT NULL,
    "compatId" TEXT NOT NULL,
    "context" "BatteryPriceContext" NOT NULL,
    "grossPrice" DECIMAL(12,2),
    "batteryRrp" DECIMAL(12,2),
    "effectiveDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryComboContextPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatteryComboContextPrice_compatId_context_key"
    ON "BatteryComboContextPrice"("compatId", "context");
CREATE INDEX "BatteryComboContextPrice_compatId_idx"
    ON "BatteryComboContextPrice"("compatId");

ALTER TABLE "BatteryComboContextPrice"
    ADD CONSTRAINT "BatteryComboContextPrice_compatId_fkey"
    FOREIGN KEY ("compatId") REFERENCES "BatteryInverterCompat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Effective-dated change log for combo pricing.
CREATE TABLE "BatteryComboContextPriceLog" (
    "id" TEXT NOT NULL,
    "comboPriceId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BatteryComboContextPriceLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BatteryComboContextPriceLog_comboPriceId_idx"
    ON "BatteryComboContextPriceLog"("comboPriceId");
CREATE INDEX "BatteryComboContextPriceLog_effectiveDate_idx"
    ON "BatteryComboContextPriceLog"("effectiveDate");
CREATE INDEX "BatteryComboContextPriceLog_changedAt_idx"
    ON "BatteryComboContextPriceLog"("changedAt");

ALTER TABLE "BatteryComboContextPriceLog"
    ADD CONSTRAINT "BatteryComboContextPriceLog_comboPriceId_fkey"
    FOREIGN KEY ("comboPriceId") REFERENCES "BatteryComboContextPrice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
