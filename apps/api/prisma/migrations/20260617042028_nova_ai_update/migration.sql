-- CreateTable
CREATE TABLE "NovaSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovaSetting_pkey" PRIMARY KEY ("key")
);
