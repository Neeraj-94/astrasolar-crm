-- CreateTable
CREATE TABLE "NovaConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovaConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovaMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovaKnowledgeEntry" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authority" TEXT,
    "source" TEXT,
    "sourceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovaKnowledgeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovaMemory" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "fact" TEXT NOT NULL,
    "createdBy" TEXT,
    "supersedes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovaMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovaUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "toolCalls" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovaUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NovaConversation_userId_idx" ON "NovaConversation"("userId");

-- CreateIndex
CREATE INDEX "NovaConversation_updatedAt_idx" ON "NovaConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "NovaMessage_conversationId_idx" ON "NovaMessage"("conversationId");

-- CreateIndex
CREATE INDEX "NovaKnowledgeEntry_status_idx" ON "NovaKnowledgeEntry"("status");

-- CreateIndex
CREATE INDEX "NovaKnowledgeEntry_category_idx" ON "NovaKnowledgeEntry"("category");

-- CreateIndex
CREATE INDEX "NovaMemory_category_idx" ON "NovaMemory"("category");

-- CreateIndex
CREATE INDEX "NovaMemory_active_idx" ON "NovaMemory"("active");

-- CreateIndex
CREATE INDEX "NovaUsageLog_userId_idx" ON "NovaUsageLog"("userId");

-- CreateIndex
CREATE INDEX "NovaUsageLog_createdAt_idx" ON "NovaUsageLog"("createdAt");

-- AddForeignKey
ALTER TABLE "NovaMessage" ADD CONSTRAINT "NovaMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "NovaConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
