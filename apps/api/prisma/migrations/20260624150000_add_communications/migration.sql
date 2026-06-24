-- Communications: outbound/inbound SMS (ClickSend) + calls (Aircall).
-- Loose link to leads (no FK) mirrors the Document/AuditLog polymorphic pattern.

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'RECEIVED');
CREATE TYPE "CallDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CallStatus" AS ENUM ('INITIAL', 'RINGING', 'ANSWERED', 'ENDED', 'MISSED', 'VOICEMAIL', 'FAILED');

-- CreateTable: SmsMessage
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "direction" "SmsDirection" NOT NULL DEFAULT 'OUTBOUND',
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT,
    "body" TEXT NOT NULL,
    "leadId" TEXT,
    "sentById" TEXT,
    "brand" "Company",
    "senderId" TEXT,
    "providerMessageId" TEXT,
    "messagePrice" TEXT,
    "errorCode" TEXT,
    "errorText" TEXT,
    "segments" INTEGER,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmsMessage_leadId_idx" ON "SmsMessage"("leadId");
CREATE INDEX "SmsMessage_sentById_idx" ON "SmsMessage"("sentById");
CREATE INDEX "SmsMessage_status_idx" ON "SmsMessage"("status");
CREATE INDEX "SmsMessage_providerMessageId_idx" ON "SmsMessage"("providerMessageId");
CREATE INDEX "SmsMessage_toNumber_idx" ON "SmsMessage"("toNumber");

-- CreateTable: CallLog
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "direction" "CallDirection" NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'INITIAL',
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "leadId" TEXT,
    "agentId" TEXT,
    "providerCallId" TEXT NOT NULL,
    "aircallUserEmail" TEXT,
    "aircallNumberId" TEXT,
    "durationSeconds" INTEGER,
    "recordingUrl" TEXT,
    "voicemailUrl" TEXT,
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CallLog_providerCallId_key" ON "CallLog"("providerCallId");
CREATE INDEX "CallLog_leadId_idx" ON "CallLog"("leadId");
CREATE INDEX "CallLog_agentId_idx" ON "CallLog"("agentId");
CREATE INDEX "CallLog_status_idx" ON "CallLog"("status");
CREATE INDEX "CallLog_direction_idx" ON "CallLog"("direction");
