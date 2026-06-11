-- ============================================================================
-- Lead Appointment migration (NO-OP)
--
-- The Appointment table is already created by 0_init/migration.sql. This file
-- previously re-declared the same table, which broke shadow-database validation
-- during `prisma migrate dev`. It is now intentionally empty so the migration
-- history stays linear without conflicting with 0_init.
-- ============================================================================

SELECT 1;
