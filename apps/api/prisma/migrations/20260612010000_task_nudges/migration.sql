-- Task nudges: assigners can nudge the assignee of a task. Stores the most
-- recent nudge only (in-app indicator; cleared when the assignee acts on the
-- card). Rate-limited in TasksService to one nudge per task per hour.

-- AlterTable
ALTER TABLE "TaskCard" ADD COLUMN "nudgedAt" TIMESTAMP(3);
ALTER TABLE "TaskCard" ADD COLUMN "nudgedById" TEXT;

-- AddForeignKey
ALTER TABLE "TaskCard" ADD CONSTRAINT "TaskCard_nudgedById_fkey" FOREIGN KEY ("nudgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
