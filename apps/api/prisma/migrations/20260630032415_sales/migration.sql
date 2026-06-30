/*
  Warnings:

  - The `financeStatus` column on the `SaleStatusDetails` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `preapprovalStatus` column on the `SaleStatusDetails` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PreapprovalStatus" AS ENUM ('APPROVED', 'NEEDS_APPLYING', 'SUBMITTED', 'AWAITING_PAYMENT', 'AWAITING_INFO', 'INCOMPLETE_INFORMATION', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceStatus" AS ENUM ('APPLIED', 'DOCS_SUBMITTED', 'APPROVED', 'DECLINED', 'WITHDRAWN', 'UNDER_REVIEW', 'PENDING_ACCEPTANCE', 'NOT_APPLIED', 'AWAITING_DOCS');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "difference" DECIMAL(12,2),
ADD COLUMN     "totalProfit" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "SaleStatusDetails" DROP COLUMN "financeStatus",
ADD COLUMN     "financeStatus" "FinanceStatus",
DROP COLUMN "preapprovalStatus",
ADD COLUMN     "preapprovalStatus" "PreapprovalStatus";
