-- Add manual drag-and-drop row ordering to the user-facing list entities.
-- NULL means "no manual position" — list queries sort NULLs last and fall
-- back to the entity's default ordering.

ALTER TABLE "User" ADD COLUMN "sortOrder" INTEGER;
ALTER TABLE "Lead" ADD COLUMN "sortOrder" INTEGER;
ALTER TABLE "Product" ADD COLUMN "sortOrder" INTEGER;
ALTER TABLE "Sale" ADD COLUMN "sortOrder" INTEGER;
ALTER TABLE "Installation" ADD COLUMN "sortOrder" INTEGER;
