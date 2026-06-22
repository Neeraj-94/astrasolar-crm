-- POS profit snapshots copied from the catalogue at sale time (for financials).
ALTER TABLE "SystemDetails" ADD COLUMN "solarProfit" DECIMAL(12,2);
ALTER TABLE "SystemDetails" ADD COLUMN "batteryProfit" DECIMAL(12,2);
ALTER TABLE "SaleExtra" ADD COLUMN "profit" DECIMAL(12,2);
