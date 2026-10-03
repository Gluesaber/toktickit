-- Issue 4-2 (Lab 4) — manual rollback for 20261003120000_lab4_actions_taken
-- (docs/lab-04/specification.md §7 "Rollback and recovery"). Prisma never runs this file —
-- `migrate deploy` only reads migration.sql. Run it by hand, and only after taking a backup:
--
--   docker exec toktickit-db-maii pg_dump -U toktickit -d toktickit -Fc -f /tmp/pre-rollback.dump
--   docker cp server/prisma/migrations/20261003120000_lab4_actions_taken/rollback.sql toktickit-db-maii:/tmp/rollback.sql
--   docker exec toktickit-db-maii psql -U toktickit -d toktickit -v ON_ERROR_STOP=1 -f /tmp/rollback.sql
--
-- Returns the schema to exactly Lab 3's (20260916180000_lab3_staff_ticket_ops). Every Lab 1–3
-- table, column and row is untouched. What is lost is only Lab 4 data: every Action Taken, every
-- status-history row, each Ticket's `version` and `seedKey`. Seed Tickets themselves stay as ordinary
-- Tickets. Re-applying the migration afterwards (`npx prisma migrate deploy`) works because the
-- `_prisma_migrations` row is deleted below.

BEGIN;

DROP TABLE IF EXISTS "TicketStatusHistory";
DROP TABLE IF EXISTS "ActionTaken";
DROP TYPE IF EXISTS "ActionStatus";

DROP INDEX IF EXISTS "Ticket_seedKey_key";
DROP INDEX IF EXISTS "Ticket_updatedAt_idx";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "seedKey";
ALTER TABLE "Ticket" DROP COLUMN IF EXISTS "version";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261003120000_lab4_actions_taken';

COMMIT;
