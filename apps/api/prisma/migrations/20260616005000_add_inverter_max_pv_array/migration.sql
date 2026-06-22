-- Add maxPVArray to InverterProduct (nullable, kW, matches systemSize precision)
ALTER TABLE "InverterProduct" ADD COLUMN "maxPVArray" DECIMAL(10,3);
