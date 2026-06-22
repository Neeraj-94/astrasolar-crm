-- Battery <-> Inverter compatibility (explicit allow-list, many-to-many)
CREATE TABLE "BatteryInverterCompat" (
    "id" TEXT NOT NULL,
    "inverterId" TEXT NOT NULL,
    "batteryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatteryInverterCompat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BatteryInverterCompat_inverterId_batteryId_key" ON "BatteryInverterCompat"("inverterId", "batteryId");
CREATE INDEX "BatteryInverterCompat_inverterId_idx" ON "BatteryInverterCompat"("inverterId");
CREATE INDEX "BatteryInverterCompat_batteryId_idx" ON "BatteryInverterCompat"("batteryId");

ALTER TABLE "BatteryInverterCompat"
    ADD CONSTRAINT "BatteryInverterCompat_inverterId_fkey"
    FOREIGN KEY ("inverterId") REFERENCES "InverterProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BatteryInverterCompat"
    ADD CONSTRAINT "BatteryInverterCompat_batteryId_fkey"
    FOREIGN KEY ("batteryId") REFERENCES "BatteryProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
