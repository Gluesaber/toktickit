-- Issue 3-4 (Lab 3) — Staff Ticket Queue: Ticket.ownerId/itPriority, TicketStatus gains OPEN and
-- WAITING_FOR_REQUESTER.
--
-- Generated via `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma
-- --script` (`migrate dev` still refuses outright without a TTY) and hand-edited for two problems
-- in the raw output:
--   1. `DROP TABLE "session"` — same recurring hazard as the last two migrations: that table
--      belongs to connect-pg-simple at runtime, not to schema.prisma, and dropping it would delete
--      every active session as a side effect. Removed.
--   2. `ADD COLUMN "itPriority" "Priority" NOT NULL` with no default — this would fail outright
--      against the 678 existing Ticket rows (Postgres refuses a NOT NULL column addition with no
--      default on a non-empty table). Rewritten below as: add nullable, backfill each existing row
--      from its own requestedPriority (BR-21's "itPriority initializes equal to requestedPriority"
--      applies just as sensibly to pre-existing tickets as to new ones), then enforce NOT NULL.

-- Two new statuses, purely additive — nothing produces either value until Issue 3-5's transition
-- endpoint exists, so no existing row is affected. Postgres 16 (this project's dev image) allows
-- ADD VALUE inside the same migration transaction as long as the new value isn't used by it, which
-- this migration doesn't.
ALTER TYPE "TicketStatus" ADD VALUE 'OPEN';
ALTER TYPE "TicketStatus" ADD VALUE 'WAITING_FOR_REQUESTER';

-- ownerId: nullable from the start (BR-19 — "may initially be unassigned"), so no backfill needed.
ALTER TABLE "Ticket" ADD COLUMN "ownerId" INTEGER;
CREATE INDEX "Ticket_ownerId_idx" ON "Ticket"("ownerId");
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- itPriority: add nullable, backfill from requestedPriority, then enforce NOT NULL to match
-- schema.prisma (which has no @default — every future insert must set it explicitly, per BR-21).
ALTER TABLE "Ticket" ADD COLUMN "itPriority" "Priority";
UPDATE "Ticket" SET "itPriority" = "requestedPriority" WHERE "itPriority" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "itPriority" SET NOT NULL;
