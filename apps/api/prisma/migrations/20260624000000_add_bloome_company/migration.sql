-- Add the assigned-company column to Bloome setter leads.
-- Mirrors the astrasolar-app Bloome tab "Company" facet (Astra default | DCsolar).
ALTER TABLE "BloomeLead" ADD COLUMN "company" TEXT;

-- Index to keep the Company filter / facet counts fast.
CREATE INDEX "BloomeLead_company_idx" ON "BloomeLead"("company");
