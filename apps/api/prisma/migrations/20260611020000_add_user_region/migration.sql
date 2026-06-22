-- Consultant home region ("ACT" | "TAS" | ...). Drives grouping/filtering in
-- Team Availability and the Leads Schedule. NULL = not set.
ALTER TABLE "User" ADD COLUMN "region" TEXT;
