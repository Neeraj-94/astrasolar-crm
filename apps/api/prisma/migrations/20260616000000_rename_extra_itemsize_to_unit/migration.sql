-- Rename ExtraProduct.itemSize -> ExtraProduct.unit (preserves existing data)
ALTER TABLE "ExtraProduct" RENAME COLUMN "itemSize" TO "unit";
