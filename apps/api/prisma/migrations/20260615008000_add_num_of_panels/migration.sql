-- Derived panel count: round(systemSize * 1000 / panelWatt).
ALTER TABLE "SolarProduct" ADD COLUMN "numOfPanels" INTEGER;

-- Backfill rows that already have both inputs.
UPDATE "SolarProduct"
SET "numOfPanels" = ROUND("systemSize" * 1000 / "panelWatt")::int
WHERE "systemSize" IS NOT NULL AND "panelWatt" IS NOT NULL AND "panelWatt" > 0;
