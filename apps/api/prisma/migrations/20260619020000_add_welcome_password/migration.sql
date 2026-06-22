-- Retain the plaintext temp password set at creation / admin reset so a super
-- admin can manually (re)send the welcome email. Cleared when the user changes
-- their own password. welcomeEmailSentAt records the last successful send.
ALTER TABLE "User" ADD COLUMN "welcomePassword" TEXT;
ALTER TABLE "User" ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);
