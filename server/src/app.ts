import express, { Request, Response } from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { Priority, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { formatTicketNumber } from "./ticketNumber.js";
import { clampPage, clampPageSize } from "./ticketQuery.js";
import { UPLOAD_DIR, MAX_ACTIVE_ATTACHMENTS, upload } from "./upload.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// Issue 2-7 (Lab 2) — shared shape for one Attachment across GET /api/tickets/:id,
// GET/POST .../attachments, and DELETE /api/attachments/:id (BR-32: removed ones keep their
// metadata visible, only download/preview is blocked).
type AttachmentRecord = {
  id: number;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: Date;
  removedAt: Date | null;
  removalReason: string | null;
};

// PR #26 review — a non-numeric `:id` (e.g. `/api/tickets/abc`) previously reached Prisma as
// `NaN`, which throws rather than matching zero rows, surfacing as a misleading `500
// INTERNAL_ERROR` instead of `404`. Every route with an `:id`/`:ticketId` param parses it through
// this first, so a malformed id gets the same "not found" treatment as a well-formed one that
// doesn't exist (consistent with BR-12's existing doesn't-exist/not-owned-are-identical design —
// no new status code or doc change needed).
function parseRouteId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

// PR #26 review — BR-29's 5-active-attachment cap was checked (`count`) and enforced (`create`)
// as two separate, non-transactional queries, so two concurrent uploads for the same Ticket could
// both read a count under the limit and both insert, exceeding 5. Thrown inside the
// `$transaction` in the upload route below (see there) to roll back the insert without leaking a
// generic 500 for what is really a 409.
class AttachmentLimitReachedError extends Error {}

function formatAttachment(a: AttachmentRecord) {
  return {
    id: a.id,
    originalFileName: a.originalFileName,
    mimeType: a.mimeType,
    fileSizeBytes: a.fileSizeBytes,
    uploadedAt: a.uploadedAt,
    removedAt: a.removedAt,
    removalReason: a.removalReason,
    active: a.removedAt === null,
  };
}

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 (Lab 1) — Category list.
// Issue 2-4 (Lab 2) — now filters to isActive=true and uses the api-spec.md §0 error envelope
// (specification.md §11: Category gained isActive in Issue 2-2).
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve categories." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-4 (Lab 2) — active Related Systems. api-spec.md §1: same rules as /api/categories.
// ---------------------------------------------------------------------------
app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const relatedSystems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true },
    });
    res.status(200).json(relatedSystems);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve related systems." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-3 (Lab 2) — active Development Requesters, for the Selection screen.
// api-spec.md §1: only isActive=true rows, ordered by id. Inactive Requesters
// (BR-35) are never included.
// ---------------------------------------------------------------------------
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requester.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve development requesters." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-5 (Lab 2) — the current Requester's ticket list: search/filter/sort/pagination.
// api-spec.md §4 is the exact per-parameter contract this implements.
// ---------------------------------------------------------------------------
const SORTABLE_FIELDS = ["createdAt", "ticketNumber", "currentStatus", "requestedPriority"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];
const VALID_STATUSES: TicketStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"];

app.get("/api/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const q = req.query;

  const requesterId = Number(q.requesterId);
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
  }

  // BR-18/api-spec.md §4: sortBy/sortDir/priority/status come from fixed dropdowns, so an
  // unrecognized value is a client bug worth a 400 — collected together like POST /api/tickets.
  const fields: Record<string, string> = {};

  let categoryId: number | undefined;
  if (typeof q.categoryId === "string" && q.categoryId !== "") {
    categoryId = Number(q.categoryId);
    if (!Number.isInteger(categoryId)) fields.categoryId = "categoryId must be a number.";
  }

  let relatedSystemId: number | undefined;
  if (typeof q.relatedSystemId === "string" && q.relatedSystemId !== "") {
    relatedSystemId = Number(q.relatedSystemId);
    if (!Number.isInteger(relatedSystemId)) fields.relatedSystemId = "relatedSystemId must be a number.";
  }

  // api-spec.md §4: filter params reuse the exact Ticket field names (requestedPriority,
  // currentStatus), not shorter aliases, so the same name means the same thing in the request
  // body, sortBy values, and filter params alike.
  let priority: Priority | undefined;
  if (typeof q.requestedPriority === "string" && q.requestedPriority !== "") {
    if (!VALID_PRIORITIES.includes(q.requestedPriority as Priority)) {
      fields.requestedPriority = "Invalid requestedPriority value.";
    } else {
      priority = q.requestedPriority as Priority;
    }
  }

  let status: TicketStatus | undefined;
  if (typeof q.currentStatus === "string" && q.currentStatus !== "") {
    if (!VALID_STATUSES.includes(q.currentStatus as TicketStatus)) {
      fields.currentStatus = "Invalid currentStatus value.";
    } else {
      status = q.currentStatus as TicketStatus;
    }
  }

  const sortByRaw = typeof q.sortBy === "string" && q.sortBy !== "" ? q.sortBy : "createdAt";
  if (!SORTABLE_FIELDS.includes(sortByRaw as SortableField)) {
    fields.sortBy = "Invalid sortBy value.";
  }
  const sortBy: SortableField = SORTABLE_FIELDS.includes(sortByRaw as SortableField)
    ? (sortByRaw as SortableField)
    : "createdAt";

  const sortDirRaw = typeof q.sortDir === "string" && q.sortDir !== "" ? q.sortDir : "desc";
  if (sortDirRaw !== "asc" && sortDirRaw !== "desc") {
    fields.sortDir = "Invalid sortDir value.";
  }
  const sortDir: "asc" | "desc" = sortDirRaw === "asc" ? "asc" : "desc";

  if (Object.keys(fields).length > 0) {
    return res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "Invalid query parameters.", fields } });
  }

  // BR-17: page/pageSize are user/URL-driven, so they clamp to a safe default instead of erroring.
  const page = clampPage(q.page);
  const pageSize = clampPageSize(q.pageSize);
  const search = typeof q.search === "string" ? q.search.trim() : "";

  const where: Record<string, unknown> = { requesterId };
  if (categoryId !== undefined) where.categoryId = categoryId;
  if (relatedSystemId !== undefined) where.relatedSystemId = relatedSystemId;
  if (priority) where.requestedPriority = priority;
  if (status) where.currentStatus = status;
  if (search) {
    where.OR = [
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { summary: { contains: search, mode: "insensitive" } },
    ];
  }

  // BR-16: whatever sortBy is chosen, ties break by createdAt desc then id desc, so pagination
  // order stays deterministic even when many tickets share a sort value.
  const orderBy =
    sortBy === "createdAt"
      ? [{ createdAt: sortDir }, { id: "desc" as const }]
      : [{ [sortBy]: sortDir }, { createdAt: "desc" as const }, { id: "desc" as const }];

  try {
    const [tickets, totalItems] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { name: true } }, relatedSystem: { select: { name: true } } },
      }),
      prisma.ticket.count({ where }),
    ]);

    const data = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      categoryName: t.category.name,
      relatedSystemName: t.relatedSystem.name,
      requestedPriority: t.requestedPriority,
      currentStatus: t.currentStatus,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));

    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    res.status(200).json({
      data,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve tickets." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-4 (Lab 2) — create a Ticket. api-spec.md "POST /api/tickets".
// Two-step design (api-spec.md §2): Attachments are added afterward via a separate endpoint
// (Issue 2-7), so a Ticket can be saved successfully even if a later attachment upload fails
// (BR-26).
// ---------------------------------------------------------------------------
const SUMMARY_MIN = 5;
const SUMMARY_MAX = 120;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;
const VALID_PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

app.post("/api/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const body = req.body ?? {};

  // BR-06: ticketNumber/currentStatus/createdAt are never read from the body even if present —
  // only the fields below are ever consulted.
  const requesterId = Number(body.requesterId);
  const categoryId = Number(body.categoryId);
  const relatedSystemId = Number(body.relatedSystemId);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const requestedPriority = typeof body.requestedPriority === "string" ? body.requestedPriority : "";

  // Pass 1 — shape/presence validation (BR-19, BR-20, BR-21). Every problem is collected so the
  // client can show all field messages from one response, not one-at-a-time.
  const fields: Record<string, string> = {};
  if (!Number.isInteger(requesterId)) fields.requesterId = "requesterId is required.";
  if (!Number.isInteger(categoryId)) fields.categoryId = "Please select a category.";
  if (!Number.isInteger(relatedSystemId)) fields.relatedSystemId = "Please select a related system.";
  if (!summary) {
    fields.summary = "Summary is required.";
  } else if (summary.length < SUMMARY_MIN || summary.length > SUMMARY_MAX) {
    fields.summary = `Summary must be ${SUMMARY_MIN}-${SUMMARY_MAX} characters.`;
  }
  if (!description) {
    fields.description = "Description is required.";
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    fields.description = `Description must be ${DESCRIPTION_MIN}-${DESCRIPTION_MAX} characters.`;
  }
  if (!VALID_PRIORITIES.includes(requestedPriority as Priority)) {
    fields.requestedPriority = "Please select a priority.";
  }

  if (Object.keys(fields).length > 0) {
    return res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", fields } });
  }

  try {
    // Pass 2 — existence/active checks (BR-21). requesterId gets its own error code
    // (INVALID_REQUESTER) per api-spec.md; category/relatedSystem stay VALIDATION_ERROR.
    const requester = await prisma.requester.findUnique({ where: { id: requesterId } });
    if (!requester || !requester.isActive) {
      return res
        .status(400)
        .json({ error: { code: "INVALID_REQUESTER", message: "Selected requester is not valid." } });
    }

    const [category, relatedSystem] = await Promise.all([
      prisma.category.findUnique({ where: { id: categoryId } }),
      prisma.relatedSystem.findUnique({ where: { id: relatedSystemId } }),
    ]);
    const refFields: Record<string, string> = {};
    if (!category || !category.isActive) refFields.categoryId = "Please select a valid category.";
    if (!relatedSystem || !relatedSystem.isActive) {
      refFields.relatedSystemId = "Please select a valid related system.";
    }
    if (Object.keys(refFields).length > 0) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Please correct the highlighted fields.", fields: refFields },
      });
    }

    // BR-05: pre-fetch the next id from Postgres's own sequence so the Ticket Number can be
    // generated and persisted in the same insert — no separate create-then-update step, and no
    // uniqueness race since the sequence itself is what guarantees BR-01.
    const [{ nextval }] = await prisma.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval(pg_get_serial_sequence('"Ticket"', 'id')) AS nextval`;
    const id = Number(nextval);
    const ticketNumber = formatTicketNumber(id);

    const ticket = await prisma.ticket.create({
      data: {
        id,
        ticketNumber,
        requesterId,
        categoryId,
        relatedSystemId,
        summary,
        description,
        requestedPriority: requestedPriority as Priority,
      },
    });

    res.status(201).json(ticket);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to create the ticket." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-6 (Lab 2) — one owned Ticket + its Attachments, for Ticket Detail.
// api-spec.md "GET /api/tickets/:id": doesn't-exist and not-owned return the identical 404
// (BR-12, BR-40, AC-21) so a foreign-ticket probe can't distinguish the two — achieved here by
// putting both `id` and `requesterId` in the same `findFirst` `where` clause, rather than
// checking existence and ownership as two separate queries with two separate failure paths.
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = Number(req.query.requesterId);
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
  }

  const ticketId = parseRouteId(req.params.id);
  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, requesterId },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        attachments: { orderBy: { uploadedAt: "asc" } },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    // api-spec.md's shape nests requester/category/relatedSystem as objects and doesn't repeat
    // the raw foreign-key columns alongside them, so those are left out here.
    const { attachments, requesterId: _requesterId, categoryId: _categoryId, relatedSystemId: _relatedSystemId, ...rest } = ticket;
    res.status(200).json({
      ...rest,
      attachments: attachments.map(formatAttachment),
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve the ticket." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-7 (Lab 2) — add an Attachment to an owned Ticket. api-spec.md "POST
// /api/tickets/:id/attachments". Uses the callback form of `upload.single(...)` (rather than
// mounting it as route middleware) so multer's errors (wrong type, too large) are handled right
// here alongside the rest of this route's validation, in the same style as every other route in
// this file.
// ---------------------------------------------------------------------------
app.post("/api/tickets/:id/attachments", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err: unknown) => {
    const cleanupOrphanedFile = async () => {
      if (req.file) await fs.unlink(req.file.path).catch(() => {});
    };

    if (err) {
      await cleanupOrphanedFile();
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res
          .status(413)
          .json({ error: { code: "FILE_TOO_LARGE", message: "File exceeds the 5 MB limit." } });
      }
      if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
        return res.status(415).json({
          error: { code: "UNSUPPORTED_FILE_TYPE", message: "File type not allowed. Use JPG, PNG, WEBP, or PDF." },
        });
      }
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to upload the attachment." } });
    }

    const prisma = getPrisma();
    const requesterId = Number(req.body.requesterId);
    const ticketId = parseRouteId(req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A file is required." } });
    }
    if (!Number.isInteger(requesterId)) {
      await cleanupOrphanedFile();
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
    }
    if (ticketId === null) {
      await cleanupOrphanedFile();
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    try {
      // BR-34: a rejected upload never touches the existing Attachment list — every check below
      // that fails cleans up the file multer already wrote to disk and returns without creating
      // a row.
      const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
      if (!ticket) {
        await cleanupOrphanedFile();
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }

      // PR #26 review — count-then-create was two separate, non-transactional queries, letting
      // concurrent uploads both pass the check and exceed BR-29's 5-active cap. `FOR UPDATE` locks
      // this Ticket's row for the duration of the transaction, so a second concurrent upload for
      // the *same* Ticket blocks until the first commits and re-counts against the now-current
      // state — uploads to different Tickets are untouched, no global serialization.
      const attachment = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;
        const activeCount = await tx.attachment.count({ where: { ticketId, removedAt: null } });
        if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
          throw new AttachmentLimitReachedError();
        }
        return tx.attachment.create({
          data: {
            ticketId,
            originalFileName: req.file!.originalname,
            storedFileName: req.file!.filename,
            mimeType: req.file!.mimetype,
            fileSizeBytes: req.file!.size,
          },
        });
      });

      res.status(201).json(formatAttachment(attachment));
    } catch (err) {
      await cleanupOrphanedFile();
      if (err instanceof AttachmentLimitReachedError) {
        return res.status(409).json({
          error: { code: "ATTACHMENT_LIMIT_REACHED", message: "This ticket already has 5 active attachments." },
        });
      }
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to upload the attachment." } });
    }
  });
});

// ---------------------------------------------------------------------------
// Issue 2-7 (Lab 2) — Attachment metadata for a Ticket (active and removed both included, per
// BR-32). api-spec.md "GET /api/tickets/:id/attachments".
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id/attachments", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = Number(req.query.requesterId);
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
  }
  const ticketId = parseRouteId(req.params.id);
  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, requesterId },
      include: { attachments: { orderBy: { uploadedAt: "asc" } } },
    });
    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    res.status(200).json(ticket.attachments.map(formatAttachment));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve attachments." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-7 (Lab 2) — download an active Attachment. api-spec.md "GET
// /api/attachments/:id/download". Ownership check via the relation filter below gives the same
// identical-404 treatment as GET /api/tickets/:id (BR-12); a removed-but-owned Attachment gets
// 410 Gone instead, since the Requester already knows it exists (its metadata is visible in
// Ticket Detail per BR-32) — no existence-leak risk there.
// ---------------------------------------------------------------------------
app.get("/api/attachments/:id/download", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = Number(req.query.requesterId);
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
  }
  const attachmentId = parseRouteId(req.params.id);
  if (attachmentId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found." } });
  }

  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticket: { requesterId } },
    });
    if (!attachment) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found." } });
    }
    if (attachment.removedAt !== null) {
      return res
        .status(410)
        .json({ error: { code: "ATTACHMENT_REMOVED", message: "This attachment has been removed." } });
    }

    const filePath = path.join(UPLOAD_DIR, attachment.storedFileName);
    res.download(filePath, attachment.originalFileName, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download the attachment." } });
      }
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download the attachment." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 2-7 (Lab 2) — soft-remove an owned, active Attachment. api-spec.md "DELETE
// /api/attachments/:id". Never a hard delete (BR-31); `reason` is optional (BR-31 allows but
// doesn't require it).
// ---------------------------------------------------------------------------
app.delete("/api/attachments/:id", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = Number(req.body.requesterId);
  if (!Number.isInteger(requesterId)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "requesterId is required." } });
  }
  const attachmentId = parseRouteId(req.params.id);
  const reason = typeof req.body.reason === "string" && req.body.reason.trim() ? req.body.reason.trim() : null;
  if (attachmentId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found." } });
  }

  try {
    const attachment = await prisma.attachment.findFirst({
      where: { id: attachmentId, ticket: { requesterId } },
    });
    if (!attachment) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Attachment not found." } });
    }
    if (attachment.removedAt !== null) {
      return res
        .status(409)
        .json({ error: { code: "ALREADY_REMOVED", message: "This attachment was already removed." } });
    }

    const updated = await prisma.attachment.update({
      where: { id: attachmentId },
      data: { removedAt: new Date(), removalReason: reason },
    });

    res.status(200).json(formatAttachment(updated));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to remove the attachment." } });
  }
});

export default app;
