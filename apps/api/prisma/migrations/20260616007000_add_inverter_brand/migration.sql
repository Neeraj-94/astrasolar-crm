-- Add brand to InverterProduct (nullable) + supporting index
ALTER TABLE "InverterProduct" ADD COLUMN "brand" TEXT;
CREATE INDEX "InverterProduct_brand_idx" ON "InverterProduct"("brand");
