-- Link a schedule Appointment back to the Bloome row it was booked from, so
-- inline edits to the Bloome lead can be propagated to the booked snapshot.
ALTER TABLE "Appointment" ADD COLUMN "bloomeLeadId" TEXT;

CREATE INDEX "Appointment_bloomeLeadId_idx" ON "Appointment"("bloomeLeadId");
