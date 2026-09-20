-- Issue 3-3 (Lab 3) — Public Comments + "Problem Appears Resolved" flag.
--
-- Generated via `prisma migrate diff --from-url ... --to-schema-datamodel prisma/schema.prisma
-- --script` (not `prisma migrate dev`, which refuses outright in a non-interactive environment) and
-- then hand-edited: the raw diff also proposed `DROP TABLE "session"`, which is NOT a Prisma-managed
-- table — it belongs to `connect-pg-simple` (server/src/auth.ts, `createTableIfMissing: true`),
-- created at runtime and intentionally absent from schema.prisma. Applying that line would have
-- deleted every active session as a side effect of an unrelated migration. Removed before applying.

-- Cosmetic cleanup left over from Issue 3-2's Requester -> User rename (deliberately deferred then —
-- see that migration's own comments — since constraint/index names have no functional effect):
ALTER TABLE "User" RENAME CONSTRAINT "Requester_pkey" TO "User_pkey";
ALTER INDEX "Requester_email_key" RENAME TO "User_email_key";

-- BR-25: the Requester's "Problem Appears Resolved" indication. Never touches currentStatus.
ALTER TABLE "Ticket" ADD COLUMN "requesterConfirmedResolvedAt" TIMESTAMP(3);

-- Public Comments (BR-04, BR-26-BR-28). Append-only — no updatedAt, no edit/delete route.
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_ticketId_idx" ON "Comment"("ticketId");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
