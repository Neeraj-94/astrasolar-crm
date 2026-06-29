-- Add free-text install attributes to SystemDetails, surfaced + editable
-- in the Sales Pipeline detail panel.
ALTER TABLE "SystemDetails" ADD COLUMN IF NOT EXISTS "backup" TEXT;
ALTER TABLE "SystemDetails" ADD COLUMN IF NOT EXISTS "hotWater" TEXT;
ALTER TABLE "SystemDetails" ADD COLUMN IF NOT EXISTS "aircon" TEXT;
