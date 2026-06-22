-- Add MPPT tracker count and PV string count to InverterProduct (nullable integers)
ALTER TABLE "InverterProduct" ADD COLUMN "mppt" INTEGER;
ALTER TABLE "InverterProduct" ADD COLUMN "strings" INTEGER;
