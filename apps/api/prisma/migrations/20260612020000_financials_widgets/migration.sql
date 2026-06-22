-- CreateEnum
CREATE TYPE "RrpRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');

-- CreateTable
CREATE TABLE "OperatingCost" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatingCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RrpRequest" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "status" "RrpRequestStatus" NOT NULL DEFAULT 'PENDING',
    "items" JSONB NOT NULL,
    "requestedById" TEXT,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RrpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatingCost_weekStart_idx" ON "OperatingCost"("weekStart");

-- CreateIndex
CREATE INDEX "RrpRequest_status_idx" ON "RrpRequest"("status");

-- CreateIndex
CREATE INDEX "RrpRequest_saleId_idx" ON "RrpRequest"("saleId");

-- AddForeignKey
ALTER TABLE "RrpRequest" ADD CONSTRAINT "RrpRequest_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
