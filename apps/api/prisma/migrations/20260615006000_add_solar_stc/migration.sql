-- Solar rebate STC value (fractional, so DECIMAL not INTEGER)
ALTER TABLE "SolarProduct" ADD COLUMN "solarStc" DECIMAL(12,2);
