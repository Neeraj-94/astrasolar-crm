-- One-off repair: availability rows written before the UTC date-boundary fix
-- were stored one day EARLY. Shift everything forward one day.
--
-- The shift is two-phase (jump far forward, then back) because a direct
-- `date + 1` trips the (consultantId, date, hour) unique index while adjacent
-- days are mid-update.
--
-- Run once:
--   npx dotenv -e .env -- prisma db execute --file prisma/fix-availability-dates.sql --schema prisma/schema.prisma

-- Remove the diagnostic probe row written while debugging (next-Monday 9am).
DELETE FROM "AvailabilitySlot" WHERE "date" = '2026-06-14' AND "hour" = 9 AND "status" = 'AVAILABLE';

UPDATE "AvailabilitySlot" SET "date" = "date" + INTERVAL '36500 days';
UPDATE "AvailabilitySlot" SET "date" = "date" - INTERVAL '36499 days';

UPDATE "AvailabilitySubmission" SET "weekStart" = "weekStart" + INTERVAL '36500 days', "weekEnd" = "weekEnd" + INTERVAL '36500 days';
UPDATE "AvailabilitySubmission" SET "weekStart" = "weekStart" - INTERVAL '36499 days', "weekEnd" = "weekEnd" - INTERVAL '36499 days';

UPDATE "AvailabilitySubmission"
SET "holidayDays" = (
  SELECT COALESCE(array_agg(to_char(d::date + 1, 'YYYY-MM-DD') ORDER BY d), '{}')
  FROM unnest("holidayDays") AS d
)
WHERE cardinality("holidayDays") > 0;
