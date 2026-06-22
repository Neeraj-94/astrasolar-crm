/*
  Warnings:

  - The values [NEW,CONTACTED,NOT_QUALIFIED,BOOKED] on the enum `LeadOutcome` will be removed. If these variants are still used in the database, this will fail.
  - The values [MANUAL,GOOGLE_SHEETS] on the enum `LeadSource` will be removed. If these variants are still used in the database, this will fail.
  - The values [TO_BE_RESCHEDULED,RESCHEDULED,DID_NOT_QUALIFY] on the enum `SalesDisposition` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `contactId` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `currentConsultantId` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `estValue` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `externalRef` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `leadDate` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `ownerId` on the `Lead` table. All the data in the column will be lost.
  - You are about to drop the column `contactId` on the `Sale` table. All the data in the column will be lost.
  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Contact` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Customer` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `firstName` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leadGenId` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `surName` to the `Lead` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LeadOutcome_new" AS ENUM ('APPOINTMENT', 'HOT_CALL_BACK', 'NO_ANSWER', 'NOT_INTERESTED', 'DNQ', 'ALREADY_HAS_SOLAR', 'WRONG_NUMBER', 'RESCHEDULE');
ALTER TABLE "Lead" ALTER COLUMN "outcome" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "outcome" TYPE "LeadOutcome_new" USING ("outcome"::text::"LeadOutcome_new");
ALTER TABLE "LeadStateLog" ALTER COLUMN "outcome" TYPE "LeadOutcome_new" USING ("outcome"::text::"LeadOutcome_new");
ALTER TYPE "LeadOutcome" RENAME TO "LeadOutcome_old";
ALTER TYPE "LeadOutcome_new" RENAME TO "LeadOutcome";
DROP TYPE "LeadOutcome_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "LeadSource_new" AS ENUM ('BLOOM_ASTRA', 'REFERRAL', 'INBOUND', 'WEBSITE', 'BRIGHTE');
ALTER TABLE "Lead" ALTER COLUMN "source" DROP DEFAULT;
ALTER TABLE "Lead" ALTER COLUMN "source" TYPE "LeadSource_new" USING ("source"::text::"LeadSource_new");
ALTER TYPE "LeadSource" RENAME TO "LeadSource_old";
ALTER TYPE "LeadSource_new" RENAME TO "LeadSource";
DROP TYPE "LeadSource_old";
ALTER TABLE "Lead" ALTER COLUMN "source" SET DEFAULT 'BLOOM_ASTRA';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SalesDisposition_new" AS ENUM ('SOLD', 'PRES_PROP_CREATED', 'CALL_BACK', 'RESCHEDULE', 'BEEN_RESCHEDULED', 'NO_ANSWER', 'NOT_INTERESTED', 'DNQ', 'CANCELLED');
ALTER TABLE "Lead" ALTER COLUMN "disposition" TYPE "SalesDisposition_new" USING ("disposition"::text::"SalesDisposition_new");
ALTER TABLE "LeadStateLog" ALTER COLUMN "disposition" TYPE "SalesDisposition_new" USING ("disposition"::text::"SalesDisposition_new");
ALTER TYPE "SalesDisposition" RENAME TO "SalesDisposition_old";
ALTER TYPE "SalesDisposition_new" RENAME TO "SalesDisposition";
DROP TYPE "SalesDisposition_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Contact" DROP CONSTRAINT "Contact_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_userId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_contactId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_currentConsultantId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_contactId_fkey";

-- DropIndex
DROP INDEX "Lead_currentConsultantId_idx";

-- DropIndex
DROP INDEX "Lead_leadDate_idx";

-- DropIndex
DROP INDEX "Lead_ownerId_idx";

-- DropIndex
DROP INDEX "Lead_source_externalRef_key";

-- AlterTable
ALTER TABLE "Lead" DROP COLUMN "contactId",
DROP COLUMN "createdAt",
DROP COLUMN "currentConsultantId",
DROP COLUMN "estValue",
DROP COLUMN "externalRef",
DROP COLUMN "leadDate",
DROP COLUMN "notes",
DROP COLUMN "ownerId",
ADD COLUMN     "address" TEXT,
ADD COLUMN     "bookingDate" DATE,
ADD COLUMN     "bookingTime" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "consultantId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "leadGenId" TEXT NOT NULL,
ADD COLUMN     "leadGenNotes" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postCode" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "surName" TEXT NOT NULL,
ADD COLUMN     "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "source" SET DEFAULT 'BLOOM_ASTRA',
ALTER COLUMN "company" SET DEFAULT 'ASTRA',
ALTER COLUMN "outcome" DROP DEFAULT,
ALTER COLUMN "billSpend" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "contactId";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Contact";

-- DropTable
DROP TABLE "Customer";

-- CreateIndex
CREATE INDEX "Lead_leadGenId_idx" ON "Lead"("leadGenId");

-- CreateIndex
CREATE INDEX "Lead_consultantId_idx" ON "Lead"("consultantId");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_surName_idx" ON "Lead"("surName");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_leadGenId_fkey" FOREIGN KEY ("leadGenId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
