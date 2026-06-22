/*
  Warnings:

  - You are about to drop the column `productId` on the `SaleExtra` table. All the data in the column will be lost.
  - You are about to drop the column `batteryProductId` on the `SystemDetails` table. All the data in the column will be lost.
  - You are about to drop the column `inverterProductId` on the `SystemDetails` table. All the data in the column will be lost.
  - You are about to drop the column `panelProductId` on the `SystemDetails` table. All the data in the column will be lost.
  - You are about to drop the `BatteryCombo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `BatteryComboLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Product` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ProductLog` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BatteryCombo" DROP CONSTRAINT "BatteryCombo_batteryId_fkey";

-- DropForeignKey
ALTER TABLE "BatteryCombo" DROP CONSTRAINT "BatteryCombo_inverterId_fkey";

-- DropForeignKey
ALTER TABLE "BatteryComboLog" DROP CONSTRAINT "BatteryComboLog_comboId_fkey";

-- DropForeignKey
ALTER TABLE "ProductLog" DROP CONSTRAINT "ProductLog_productId_fkey";

-- DropForeignKey
ALTER TABLE "SaleExtra" DROP CONSTRAINT "SaleExtra_productId_fkey";

-- DropForeignKey
ALTER TABLE "SystemDetails" DROP CONSTRAINT "SystemDetails_batteryProductId_fkey";

-- DropForeignKey
ALTER TABLE "SystemDetails" DROP CONSTRAINT "SystemDetails_inverterProductId_fkey";

-- DropForeignKey
ALTER TABLE "SystemDetails" DROP CONSTRAINT "SystemDetails_panelProductId_fkey";

-- DropIndex
DROP INDEX "SaleExtra_productId_idx";

-- AlterTable
ALTER TABLE "SaleExtra" DROP COLUMN "productId";

-- AlterTable
ALTER TABLE "SystemDetails" DROP COLUMN "batteryProductId",
DROP COLUMN "inverterProductId",
DROP COLUMN "panelProductId";

-- DropTable
DROP TABLE "BatteryCombo";

-- DropTable
DROP TABLE "BatteryComboLog";

-- DropTable
DROP TABLE "Product";

-- DropTable
DROP TABLE "ProductLog";

-- DropEnum
DROP TYPE "ComboContext";

-- DropEnum
DROP TYPE "PricingTier";

-- DropEnum
DROP TYPE "ProductCategory";

-- DropEnum
DROP TYPE "ProductStatus";
