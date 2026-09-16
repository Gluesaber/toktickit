-- Issue 3-5 (Lab 3) — Staff Ticket Operations: new `Note` model (Internal Notes).
--
-- Generated via `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma
-- --script` (`migrate dev` still refuses without a TTY in this environment) and hand-edited to
-- remove the same recurring `DROP TABLE "session"` hazard as every migration before it — that table
-- belongs to connect-pg-simple at runtime, not schema.prisma, and dropping it would delete every
-- active session. No other changes needed: `Note` is a brand-new table, so there's no backfill or
-- NOT NULL concern like Issue 3-4's `itPriority` column had.

CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Note_ticketId_idx" ON "Note"("ticketId");

ALTER TABLE "Note" ADD CONSTRAINT "Note_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
