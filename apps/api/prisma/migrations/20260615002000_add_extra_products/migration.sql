-- Extras catalogue
CREATE TABLE "ExtraProduct" (
    "id" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemSize" TEXT,
    "unitPrice" DECIMAL(12,2),
    "notes" TEXT,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraProduct_pkey" PRIMARY KEY ("id")
);

-- Extras change log (effectiveDate REQUIRED)
CREATE TABLE "ExtraProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "effectiveDate" DATE NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraProductLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExtraProductLog_productId_idx" ON "ExtraProductLog"("productId");
CREATE INDEX "ExtraProductLog_effectiveDate_idx" ON "ExtraProductLog"("effectiveDate");
CREATE INDEX "ExtraProductLog_changedAt_idx" ON "ExtraProductLog"("changedAt");

ALTER TABLE "ExtraProductLog"
    ADD CONSTRAINT "ExtraProductLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "ExtraProduct"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
