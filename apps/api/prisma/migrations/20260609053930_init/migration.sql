-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'GOOGLE_SHEETS');

-- CreateEnum
CREATE TYPE "Company" AS ENUM ('ASTRA', 'DC');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('INTAKE', 'BOOKED', 'CONVERTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LeadOutcome" AS ENUM ('NEW', 'CONTACTED', 'NOT_INTERESTED', 'NOT_QUALIFIED', 'BOOKED');

-- CreateEnum
CREATE TYPE "SalesDisposition" AS ENUM ('NO_ANSWER', 'TO_BE_RESCHEDULED', 'RESCHEDULED', 'DID_NOT_QUALIFY', 'CANCELLED', 'NOT_INTERESTED', 'SOLD');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('BATTERIES', 'INVERTER', 'SOLAR', 'EXTRAS');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'DISCONTINUED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('NEGOTIATION', 'CONTRACT', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('SOLAR_ONLY', 'BATTERY_ONLY', 'SOLAR_BATTERY');

-- CreateEnum
CREATE TYPE "SystemType" AS ENUM ('NEW', 'REPLACEMENT', 'ADDITIONAL', 'ADDITIONAL_REPLACEMENT');

-- CreateEnum
CREATE TYPE "StageState" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "teamId" TEXT,
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "surname" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "streetAddress" TEXT,
    "state" TEXT,
    "postcode" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "source" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "externalRef" TEXT,
    "company" "Company" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'INTAKE',
    "outcome" "LeadOutcome" DEFAULT 'NEW',
    "disposition" "SalesDisposition",
    "convertedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "currentConsultantId" TEXT,
    "dials" INTEGER NOT NULL DEFAULT 0,
    "billSpend" DECIMAL(12,2),
    "estValue" DECIMAL(12,2),
    "notes" TEXT,
    "consultantNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadDate" DATE NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "bookedById" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "rescheduledFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "productRef" TEXT,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "category" "ProductCategory" NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "stc" INTEGER,
    "commission" DECIMAL(12,2),
    "rrp" DECIMAL(12,2),
    "grossPrice" DECIMAL(12,2),
    "commissionDate" DATE,
    "panelWatt" INTEGER,
    "batterySize" DECIMAL(10,2),
    "batteryModules" INTEGER,
    "inverterType" TEXT,
    "optimisers" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "saleRef" TEXT,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "company" "Company" NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'NEGOTIATION',
    "saleType" "SaleType",
    "systemType" "SystemType",
    "energyProvider" TEXT,
    "referral" TEXT,
    "soldPrice" DECIMAL(12,2),
    "totalRRP" DECIMAL(12,2),
    "totalCommission" DECIMAL(12,2),
    "saleDate" DATE,
    "closedAt" TIMESTAMP(3),
    "installNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemDetails" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "batteryProductId" TEXT,
    "panelProductId" TEXT,
    "inverterProductId" TEXT,
    "batteryBrand" TEXT,
    "batteryModel" TEXT,
    "batterySTC" INTEGER,
    "batteryModules" INTEGER,
    "batterySize" DECIMAL(10,2),
    "batteryRRP" DECIMAL(12,2),
    "batteryCommission" DECIMAL(12,2),
    "panelModel" TEXT,
    "panelWatt" INTEGER,
    "numPanels" INTEGER,
    "systemSize" DECIMAL(10,2),
    "solarRRP" DECIMAL(12,2),
    "solarSTC" INTEGER,
    "solarCommission" DECIMAL(12,2),
    "inverterModel" TEXT,
    "inverterType" TEXT,
    "optimisers" BOOLEAN,
    "tilts" INTEGER,
    "roofType" TEXT,
    "storeys" INTEGER,
    "switchboard" TEXT,
    "nmi" TEXT,
    "phase" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleStatusDetails" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "financeStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "preapprovalStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "meterChangeStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "installStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "commissioningStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "cesStatus" "StageState" NOT NULL DEFAULT 'PENDING',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleStatusDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleExtra" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "itemName" TEXT NOT NULL,
    "itemRef" TEXT,
    "itemPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "SaleExtra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleFinance" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "lender" TEXT,
    "amount" DECIMAL(12,2),
    "termMonths" INTEGER,
    "status" "StageState" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "SaleFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentDetails" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentNotes" TEXT,
    "paymentDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissioningDetails" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "commissioningNotes" TEXT,
    "commissionDate" DATE,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissioningDetails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostInstallIssue" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "issueLogDate" DATE,
    "issueNotes" TEXT,
    "solution" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostInstallIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLog" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleStageHistory" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "fromStage" "SaleStatus",
    "toStage" "SaleStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "installerId" TEXT,
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "installDate" DATE,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "postInstallNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leadId" TEXT,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadStateLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stage" "LeadStage" NOT NULL,
    "leadGenId" TEXT,
    "consultantId" TEXT,
    "outcome" "LeadOutcome",
    "disposition" "SalesDisposition",
    "changedBy" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadStateLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'app',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_managerId_key" ON "Team"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_surname_idx" ON "Contact"("surname");

-- CreateIndex
CREATE INDEX "Lead_stage_idx" ON "Lead"("stage");

-- CreateIndex
CREATE INDEX "Lead_ownerId_idx" ON "Lead"("ownerId");

-- CreateIndex
CREATE INDEX "Lead_currentConsultantId_idx" ON "Lead"("currentConsultantId");

-- CreateIndex
CREATE INDEX "Lead_outcome_idx" ON "Lead"("outcome");

-- CreateIndex
CREATE INDEX "Lead_disposition_idx" ON "Lead"("disposition");

-- CreateIndex
CREATE INDEX "Lead_leadDate_idx" ON "Lead"("leadDate");

-- CreateIndex
CREATE INDEX "Lead_company_idx" ON "Lead"("company");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_source_externalRef_key" ON "Lead"("source", "externalRef");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_leadId_key" ON "Booking"("leadId");

-- CreateIndex
CREATE INDEX "Booking_consultantId_idx" ON "Booking"("consultantId");

-- CreateIndex
CREATE INDEX "Booking_scheduledAt_idx" ON "Booking"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_productRef_key" ON "Product"("productRef");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX "ProductLog_productId_idx" ON "ProductLog"("productId");

-- CreateIndex
CREATE INDEX "ProductLog_changedAt_idx" ON "ProductLog"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_saleRef_key" ON "Sale"("saleRef");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_leadId_key" ON "Sale"("leadId");

-- CreateIndex
CREATE INDEX "Sale_status_idx" ON "Sale"("status");

-- CreateIndex
CREATE INDEX "Sale_ownerId_idx" ON "Sale"("ownerId");

-- CreateIndex
CREATE INDEX "Sale_saleDate_idx" ON "Sale"("saleDate");

-- CreateIndex
CREATE INDEX "Sale_company_idx" ON "Sale"("company");

-- CreateIndex
CREATE UNIQUE INDEX "SystemDetails_saleId_key" ON "SystemDetails"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleStatusDetails_saleId_key" ON "SaleStatusDetails"("saleId");

-- CreateIndex
CREATE INDEX "SaleExtra_saleId_idx" ON "SaleExtra"("saleId");

-- CreateIndex
CREATE INDEX "SaleExtra_productId_idx" ON "SaleExtra"("productId");

-- CreateIndex
CREATE INDEX "SaleFinance_saleId_idx" ON "SaleFinance"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentDetails_saleId_key" ON "PaymentDetails"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissioningDetails_saleId_key" ON "CommissioningDetails"("saleId");

-- CreateIndex
CREATE INDEX "PostInstallIssue_saleId_idx" ON "PostInstallIssue"("saleId");

-- CreateIndex
CREATE INDEX "SaleLog_saleId_idx" ON "SaleLog"("saleId");

-- CreateIndex
CREATE INDEX "SaleLog_changedAt_idx" ON "SaleLog"("changedAt");

-- CreateIndex
CREATE INDEX "SaleStageHistory_saleId_idx" ON "SaleStageHistory"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_saleId_key" ON "Installation"("saleId");

-- CreateIndex
CREATE INDEX "Installation_installerId_idx" ON "Installation"("installerId");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_contactId_key" ON "Customer"("contactId");

-- CreateIndex
CREATE INDEX "Activity_leadId_idx" ON "Activity"("leadId");

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "LeadStateLog_leadId_idx" ON "LeadStateLog"("leadId");

-- CreateIndex
CREATE INDEX "LeadStateLog_changedAt_idx" ON "LeadStateLog"("changedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_key_key" ON "Document"("key");

-- CreateIndex
CREATE INDEX "Document_entity_entityId_idx" ON "Document"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "Document"("uploadedById");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_currentConsultantId_fkey" FOREIGN KEY ("currentConsultantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLog" ADD CONSTRAINT "ProductLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDetails" ADD CONSTRAINT "SystemDetails_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDetails" ADD CONSTRAINT "SystemDetails_batteryProductId_fkey" FOREIGN KEY ("batteryProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDetails" ADD CONSTRAINT "SystemDetails_panelProductId_fkey" FOREIGN KEY ("panelProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemDetails" ADD CONSTRAINT "SystemDetails_inverterProductId_fkey" FOREIGN KEY ("inverterProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStatusDetails" ADD CONSTRAINT "SaleStatusDetails_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExtra" ADD CONSTRAINT "SaleExtra_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleExtra" ADD CONSTRAINT "SaleExtra_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleFinance" ADD CONSTRAINT "SaleFinance_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentDetails" ADD CONSTRAINT "PaymentDetails_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissioningDetails" ADD CONSTRAINT "CommissioningDetails_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostInstallIssue" ADD CONSTRAINT "PostInstallIssue_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostInstallIssue" ADD CONSTRAINT "PostInstallIssue_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLog" ADD CONSTRAINT "SaleLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleStageHistory" ADD CONSTRAINT "SaleStageHistory_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_installerId_fkey" FOREIGN KEY ("installerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadStateLog" ADD CONSTRAINT "LeadStateLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
