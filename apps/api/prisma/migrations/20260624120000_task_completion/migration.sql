-- Task completion state, powering the "Completed tasks" toggle in the
-- Task Overview Display menu (List / Board / Calendar views).
ALTER TABLE "TaskCard" ADD COLUMN "completed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskCard" ADD COLUMN "completedAt" TIMESTAMP(3);

-- Keep "hide completed" filtering fast.
CREATE INDEX "TaskCard_completed_idx" ON "TaskCard"("completed");
