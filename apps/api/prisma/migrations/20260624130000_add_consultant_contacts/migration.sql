-- Per-consultant callback number + ClickSend sender ID, one pair per brand
-- (Astra Solar / DC Solar). Ported from the astrasolar-app Firebase node
-- `/consultantContacts/{consultantId}`. NULL means "use the system default"
-- for that brand. Managed in Leads -> Consultant Contacts.

CREATE TABLE "ConsultantContact" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "contactPhoneAstra" TEXT,
    "senderIdAstra" TEXT,
    "contactPhoneDc" TEXT,
    "senderIdDc" TEXT,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantContact_pkey" PRIMARY KEY ("id")
);

-- One override row per consultant.
CREATE UNIQUE INDEX "ConsultantContact_consultantId_key" ON "ConsultantContact"("consultantId");
CREATE INDEX "ConsultantContact_consultantId_idx" ON "ConsultantContact"("consultantId");

-- Cascade so removing a user cleans up their contact override.
ALTER TABLE "ConsultantContact"
    ADD CONSTRAINT "ConsultantContact_consultantId_fkey"
    FOREIGN KEY ("consultantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
