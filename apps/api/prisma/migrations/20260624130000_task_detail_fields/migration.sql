-- Todoist-style task detail panel: deadline, location, labels, reminders,
-- sub-tasks (self-relation), and a comment thread.

ALTER TABLE "TaskCard" ADD COLUMN "deadline" DATE;
ALTER TABLE "TaskCard" ADD COLUMN "location" TEXT;
ALTER TABLE "TaskCard" ADD COLUMN "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskCard" ADD COLUMN "reminders" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];
ALTER TABLE "TaskCard" ADD COLUMN "parentId" TEXT;

CREATE INDEX "TaskCard_parentId_idx" ON "TaskCard"("parentId");

ALTER TABLE "TaskCard"
  ADD CONSTRAINT "TaskCard_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "TaskCard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Comment thread on a card.
CREATE TABLE "TaskComment" (
  "id"        TEXT NOT NULL,
  "cardId"    TEXT NOT NULL,
  "authorId"  TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskComment_cardId_idx" ON "TaskComment"("cardId");

ALTER TABLE "TaskComment"
  ADD CONSTRAINT "TaskComment_cardId_fkey"
  FOREIGN KEY ("cardId") REFERENCES "TaskCard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskComment"
  ADD CONSTRAINT "TaskComment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
