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
import { canTransition, type TransitionRole } from "./statusTransitions.js";
import {
  createSessionMiddleware,
  hashPassword,
  verifyPassword,
  requireAuth,
  requirePasswordChanged,
  requireRole,
  toSafeUser,
  MIN_PASSWORD_LENGTH,
  SESSION_COOKIE_NAME,
} from "./auth.js";

// Issue 3-3 (Lab 3) — every protected route below composes both of these, in this order
// (requirePasswordChanged reads req.currentUser, which requireAuth sets). Shortens every route
// declaration and keeps the "which two middlewares, which order" detail in exactly one place.
const requireFullAuth = [requireAuth, requirePasswordChanged] as const;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());
app.use(createSessionMiddleware()); // Issue 3-2 (Lab 3) — BR-09.

// ---------------------------------------------------------------------------
// Issue 3-2 (Lab 3) — Authentication. api-spec.md §1.
// A fixed dummy bcrypt hash for the "no such email" branch of login, so that branch still spends
// roughly the same time as a real password comparison — otherwise the two failure cases (unknown
// email vs. wrong password) would be distinguishable by response timing, undermining BR-07's
// "identical response either way" anti-enumeration guarantee. The plaintext behind this hash is
// never used or meant to be recovered; it exists only so bcrypt has something to compare against.
// ---------------------------------------------------------------------------
const DUMMY_HASH_FOR_TIMING_PARITY =
  "$2b$10$drDQciZU3F3ZrJDimv5u3O8L1r8XzGzcKT8BVATaMJA73mJONOWN6";

app.post("/api/auth/login", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const body = req.body ?? {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: { code: "VALIDATION_ERROR", message: "Email and password are required." } });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // BR-07: run the password comparison whether or not a user was actually found, so the two
    // "credentials didn't work" cases can't be told apart by response time either.
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH_FOR_TIMING_PARITY);

    if (!user || !passwordOk) {
      return res
        .status(401)
        .json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } });
    }

    // BR-08: only reachable once the password has already been proven correct — an inactive
    // account with a *wrong* password still gets the generic INVALID_CREDENTIALS message above.
    if (!user.isActive) {
      return res.status(401).json({
        error: { code: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact an administrator." },
      });
    }

    // Session-fixation hardening: issue a fresh session id on privilege change (anonymous -> authenticated)
    // rather than reusing whatever session id existed before login.
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
      }
      req.session.userId = user.id;
      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
        }
        res.status(200).json(toSafeUser(user));
      });
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});

// BR-10: always 200 and always clears the cookie, whether or not a session was present — logout is
// idempotent and doesn't require a prior valid session (api-spec.md §1).
app.post("/api/auth/logout", (req: Request, res: Response) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(200).json({});
  });
});

app.get("/api/auth/me", requireAuth, (req: Request, res: Response) => {
  res.status(200).json(req.currentUser);
});

// BR-13/BR-14/BR-15: deliberately NOT gated by requirePasswordChanged — this is one of the three
// endpoints that must stay reachable while mustChangePassword is true (the other two are
// GET /api/auth/me above and POST /api/auth/logout above).
app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        fields: { newPassword: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      },
    });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Passwords do not match.",
        fields: { confirmPassword: "Passwords do not match." },
      },
    });
  }

  try {
    const passwordHash = await hashPassword(newPassword);
    const updated = await getPrisma().user.update({
      where: { id: req.currentUser!.id },
      data: { passwordHash, mustChangePassword: false },
    });
    res.status(200).json(toSafeUser(updated));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});

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

// Issue 3-3 (Lab 3) — shared shape for one Public Comment across GET /api/tickets/:id and
// POST/GET /api/tickets/:id/comments (api-spec.md §4). `author`/`createdAt` are always
// backend-assigned (BR-28) — this formatter is what guarantees the response only ever reflects
// that, never anything the client sent.
type CommentRecord = {
  id: number;
  content: string;
  createdAt: Date;
  author: { id: number; name: string; role: string };
};

function formatComment(c: CommentRecord) {
  return {
    id: c.id,
    author: { id: c.author.id, name: c.author.name, role: c.author.role },
    content: c.content,
    createdAt: c.createdAt,
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
// Issue 3-3 (Lab 3) — gated behind a session (BR-11's "every endpoint except login/logout/health"
// is a blanket rule, not limited to endpoints that carry a requesterId) — closes part of the gap
// PR #40's review flagged (Lab 2 routes were reachable with no session at all).
// ---------------------------------------------------------------------------
app.get("/api/categories", ...requireFullAuth, async (_req: Request, res: Response) => {
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
// Issue 3-3 (Lab 3) — gated, same reasoning as /api/categories above.
// ---------------------------------------------------------------------------
app.get("/api/related-systems", ...requireFullAuth, async (_req: Request, res: Response) => {
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

// Issue 2-3 (Lab 2) introduced GET /api/requesters for the Development Requester Selection screen.
// Issue 3-3 (Lab 3) removes that screen entirely (BR-39), and nothing else ever called this
// endpoint — deleted rather than left as dead code. Administrator's user list is a different,
// purpose-built endpoint (GET /api/admin/users, Issue 3-6), not a revival of this one.

// ---------------------------------------------------------------------------
// Issue 2-5 (Lab 2) — the current Requester's ticket list: search/filter/sort/pagination.
// api-spec.md §4 is the exact per-parameter contract this implements.
// Issue 3-3 (Lab 3) — `requesterId` is no longer a query parameter at all (BR-03, BR-17): the
// authenticated session determines whose tickets these are. A `requesterId` in the query string is
// simply not read anymore, not validated-and-ignored — there's no code path left that looks at it.
// ---------------------------------------------------------------------------
const SORTABLE_FIELDS = ["createdAt", "ticketNumber", "currentStatus", "requestedPriority"] as const;
type SortableField = (typeof SORTABLE_FIELDS)[number];
// Issue 3-4 (Lab 3) — extended to all 8 values now that the enum has them (schema.prisma). A
// Requester filtering their own list by OPEN/WAITING_FOR_REQUESTER just gets zero matches today
// (nothing produces those statuses until Issue 3-5) — same "well-formed but currently unmatched"
// treatment as any other valid-but-empty filter, not a 400.
const VALID_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REOPENED",
];

app.get("/api/tickets", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const q = req.query;
  const requesterId = req.currentUser!.id;

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

// Issue 3-3 (Lab 3) — requesterId is now the authenticated session's user id (BR-03, BR-17); any
// requesterId present in the request body is simply never read, let alone validated — there is no
// forging it. That also removes the old "does this requesterId reference an active Requester" check
// entirely: requireAuth already guarantees req.currentUser is active before this handler ever runs,
// so INVALID_REQUESTER (api-spec.md's Lab 2-era error code for that case) is no longer reachable
// through this endpoint — see docs/lab-03/api-spec.md for the corresponding doc update.
app.post("/api/tickets", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const body = req.body ?? {};
  const requesterId = req.currentUser!.id;

  // BR-06: ticketNumber/currentStatus/createdAt are never read from the body even if present —
  // only the fields below are ever consulted.
  const categoryId = Number(body.categoryId);
  const relatedSystemId = Number(body.relatedSystemId);
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const requestedPriority = typeof body.requestedPriority === "string" ? body.requestedPriority : "";

  // Pass 1 — shape/presence validation (BR-19, BR-20, BR-21). Every problem is collected so the
  // client can show all field messages from one response, not one-at-a-time.
  const fields: Record<string, string> = {};
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
    // Pass 2 — existence/active checks (BR-21) for category/relatedSystem only now — the
    // equivalent requester check is gone, see this route's top-of-file comment.
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
        // Issue 3-4 (Lab 3) — BR-21: itPriority initializes equal to requestedPriority and is never
        // client-supplied at creation; only IT Staff/Administrator can change it afterward
        // (Issue 3-5's PATCH /api/staff/tickets/:id/priority).
        itPriority: requestedPriority as Priority,
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
app.get("/api/tickets/:id", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = req.currentUser!.id;

  const ticketId = parseRouteId(req.params.id);
  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }

  try {
    // Issue 3-3 (Lab 3) — `comments` added per api-spec.md §2 (Public Comments, oldest first).
    // `ownerId`/`itPriority` are NOT part of this response yet — those fields don't exist until
    // Issue 3-4's migration; api-spec.md's documented shape describes the cumulative end state,
    // not what's true after any one issue (same pattern as Issue 3-2's schema-scope decision).
    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, requesterId },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        attachments: { orderBy: { uploadedAt: "asc" } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    // api-spec.md's shape nests requester/category/relatedSystem as objects and doesn't repeat
    // the raw foreign-key columns alongside them, so those are left out here.
    const { attachments, comments, requesterId: _requesterId, categoryId: _categoryId, relatedSystemId: _relatedSystemId, ...rest } = ticket;
    res.status(200).json({
      ...rest,
      attachments: attachments.map(formatAttachment),
      comments: comments.map(formatComment),
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
app.post("/api/tickets/:id/attachments", ...requireFullAuth, (req: Request, res: Response) => {
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
    const requesterId = req.currentUser!.id;
    const ticketId = parseRouteId(req.params.id);

    if (!req.file) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "A file is required." } });
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
app.get("/api/tickets/:id/attachments", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = req.currentUser!.id;
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
app.get("/api/attachments/:id/download", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = req.currentUser!.id;
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
    res.download(filePath, attachment.originalFileName, (err: NodeJS.ErrnoException | undefined) => {
      if (!err || res.headersSent) return;
      // Still 500 (this is a server-side data integrity problem, not the caller's fault), but
      // distinguished from other download failures: the file is permanently gone, so — unlike the
      // generic message — this one doesn't tell the Requester to retry something that can't
      // succeed. No path or raw fs error text is exposed either way.
      if (err.code === "ENOENT") {
        return res.status(500).json({
          error: {
            code: "ATTACHMENT_FILE_MISSING",
            message: "This attachment's file could not be found and cannot be recovered.",
          },
        });
      }
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to download the attachment." } });
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
app.delete("/api/attachments/:id", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = req.currentUser!.id;
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

// ---------------------------------------------------------------------------
// Issue 3-3 (Lab 3) — Public Comments. api-spec.md §4. Requester-only-on-own-ticket at first.
// Issue 3-5 (Lab 3) — extends this *same* route with an IT Staff/Administrator branch: any ticket,
// no ownership check (specification.md §5.1) — `isStaff` below picks the `where` clause, everything
// else (validation, the 404-on-not-visible shape, response format) is shared code, not duplicated.
// ---------------------------------------------------------------------------
const COMMENT_CONTENT_MAX = 2000;

function ticketVisibilityWhere(ticketId: number, currentUser: { id: number; role: string }) {
  const isStaff = currentUser.role === "IT_STAFF" || currentUser.role === "ADMINISTRATOR";
  return isStaff ? { id: ticketId } : { id: ticketId, requesterId: currentUser.id };
}

app.post("/api/tickets/:id/comments", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const currentUser = req.currentUser!;
  const ticketId = parseRouteId(req.params.id);
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }
  // BR-26: empty/whitespace-only rejected; author/createdAt are never read from the body (BR-28) —
  // this handler doesn't even look for them.
  if (!content || content.length > COMMENT_CONTENT_MAX) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: `Comment must be 1-${COMMENT_CONTENT_MAX} characters.`,
        fields: { content: `Comment must be 1-${COMMENT_CONTENT_MAX} characters.` },
      },
    });
  }

  try {
    const ticket = await prisma.ticket.findFirst({ where: ticketVisibilityWhere(ticketId, currentUser) });
    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    const comment = await prisma.comment.create({
      data: { ticketId, authorId: currentUser.id, content },
      include: { author: { select: { id: true, name: true, role: true } } },
    });

    res.status(201).json(formatComment(comment));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to post the comment." } });
  }
});

app.get("/api/tickets/:id/comments", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const currentUser = req.currentUser!;
  const ticketId = parseRouteId(req.params.id);
  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }

  try {
    const ticket = await prisma.ticket.findFirst({
      where: ticketVisibilityWhere(ticketId, currentUser),
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
          include: { author: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    res.status(200).json(ticket.comments.map(formatComment));
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve comments." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 3-3 (Lab 3) — "Problem Appears Resolved" (BR-25). Purely informational: never touches
// currentStatus. The TICKET_ALREADY_TERMINAL branch below can't actually be reached through the
// live app yet in this issue — every Ticket stays NEW until Issue 3-5 introduces the
// status-transition endpoint — but BR-25 is still enforced now so it doesn't silently regress once
// 3-5 lands (server/tests/lab-03/requester-regression.api.test.ts forces the status directly via
// Prisma in its test setup to exercise this branch ahead of that).
// ---------------------------------------------------------------------------
app.patch("/api/tickets/:id/resolved-indication", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const requesterId = req.currentUser!.id;
  const ticketId = parseRouteId(req.params.id);
  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }

  try {
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus)) {
      return res.status(409).json({
        error: { code: "TICKET_ALREADY_TERMINAL", message: "This ticket has already been resolved, closed, or cancelled." },
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { requesterConfirmedResolvedAt: new Date() },
    });

    res.status(200).json({ id: updated.id, requesterConfirmedResolvedAt: updated.requesterConfirmedResolvedAt });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to update the ticket." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 3-5 (Lab 3) — Current Status changes (BR-22, BR-23, BR-24, §5.2). Shared by both roles on
// the same route, per the Cancel-scope decision (specification.md §11): a Requester may only target
// Cancelled from New/Open on their own ticket; IT Staff/Administrator may make any transition listed
// in the matrix, on any ticket. `ticketVisibilityWhere` (defined above the Comments routes) is what
// enforces "own ticket only" for a Requester here, identically to how it gates Comments visibility.
// `canTransition` is the single source of truth for what's allowed — this handler never encodes the
// matrix itself, so it can't drift from status-transition.unit.test.ts's coverage of the same table.
// ---------------------------------------------------------------------------
app.patch("/api/tickets/:id/status", ...requireFullAuth, async (req: Request, res: Response) => {
  const prisma = getPrisma();
  const currentUser = req.currentUser!;
  const ticketId = parseRouteId(req.params.id);
  const status = typeof req.body?.status === "string" ? req.body.status : "";

  if (ticketId === null) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
  }
  if (!VALID_STATUSES.includes(status as TicketStatus)) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid status value." } });
  }

  try {
    const ticket = await prisma.ticket.findFirst({ where: ticketVisibilityWhere(ticketId, currentUser) });
    if (!ticket) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    // BR-23/BR-24: a Requester's illegal target and an IT Staff's illegal target return the exact
    // same code — the caller can't tell which rule tripped.
    if (!canTransition(ticket.currentStatus, status as TicketStatus, currentUser.role as TransitionRole)) {
      return res.status(409).json({
        error: { code: "TRANSITION_NOT_PERMITTED", message: "That status change isn't permitted right now." },
      });
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: { currentStatus: status as TicketStatus },
      select: { id: true, currentStatus: true, updatedAt: true },
    });

    res.status(200).json(updated);
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to update the ticket's status." } });
  }
});

// ---------------------------------------------------------------------------
// Issue 3-4 (Lab 3) — the Staff Ticket Queue. api-spec.md §6/§7 is the full contract this
// implements. First route in the app to actually compose requireRole — scaffolded since Issue 3-2,
// unused until now. Full IT Staff/Administrator parity (specification.md §11): both roles see the
// exact same Queue, no ownership restriction at all (every Ticket is visible to both).
// Read-only: no claim/reassign/priority/notes here — those, plus GET /api/staff/tickets/:id, are
// Issue 3-5's job (server/tests/lab-03/staff-ticket-detail.api.test.ts, not this file).
// ---------------------------------------------------------------------------
const STAFF_SORTABLE_FIELDS = ["createdAt", "currentStatus", "itPriority", "updatedAt"] as const;
type StaffSortableField = (typeof STAFF_SORTABLE_FIELDS)[number];

app.get(
  "/api/staff/tickets",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const q = req.query;

    const fields: Record<string, string> = {};

    let categoryId: number | undefined;
    if (typeof q.categoryId === "string" && q.categoryId !== "") {
      categoryId = Number(q.categoryId);
      if (!Number.isInteger(categoryId)) fields.categoryId = "categoryId must be a number.";
    }

    let priority: Priority | undefined;
    if (typeof q.requestedPriority === "string" && q.requestedPriority !== "") {
      if (!VALID_PRIORITIES.includes(q.requestedPriority as Priority)) {
        fields.requestedPriority = "Invalid requestedPriority value.";
      } else {
        priority = q.requestedPriority as Priority;
      }
    }

    let itPriority: Priority | undefined;
    if (typeof q.itPriority === "string" && q.itPriority !== "") {
      if (!VALID_PRIORITIES.includes(q.itPriority as Priority)) {
        fields.itPriority = "Invalid itPriority value.";
      } else {
        itPriority = q.itPriority as Priority;
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

    // api-spec.md §7: ownerId is either a numeric id or the literal string "unassigned".
    let ownerId: number | null | undefined;
    if (typeof q.ownerId === "string" && q.ownerId !== "") {
      if (q.ownerId === "unassigned") {
        ownerId = null;
      } else {
        const parsed = Number(q.ownerId);
        if (!Number.isInteger(parsed)) {
          fields.ownerId = 'ownerId must be a number or "unassigned".';
        } else {
          ownerId = parsed;
        }
      }
    }

    const sortByRaw = typeof q.sortBy === "string" && q.sortBy !== "" ? q.sortBy : "createdAt";
    if (!STAFF_SORTABLE_FIELDS.includes(sortByRaw as StaffSortableField)) {
      fields.sortBy = "Invalid sortBy value.";
    }
    const sortBy: StaffSortableField = STAFF_SORTABLE_FIELDS.includes(sortByRaw as StaffSortableField)
      ? (sortByRaw as StaffSortableField)
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

    const page = clampPage(q.page);
    const pageSize = clampPageSize(q.pageSize);
    const search = typeof q.search === "string" ? q.search.trim() : "";

    // No requesterId filter at all — the Queue is shared across every Requester (AC-16), unlike
    // GET /api/tickets above.
    const where: Record<string, unknown> = {};
    if (categoryId !== undefined) where.categoryId = categoryId;
    if (priority) where.requestedPriority = priority;
    if (itPriority) where.itPriority = itPriority;
    if (status) where.currentStatus = status;
    if (ownerId !== undefined) where.ownerId = ownerId;
    if (search) {
      where.OR = [
        { ticketNumber: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    // Same tie-break rule as GET /api/tickets (BR-16): createdAt desc, id desc, regardless of sortBy.
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
          include: {
            requester: { select: { name: true } },
            owner: { select: { id: true, name: true, role: true } },
          },
        }),
        prisma.ticket.count({ where }),
      ]);

      const data = tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        requesterName: t.requester.name,
        requestedPriority: t.requestedPriority,
        itPriority: t.itPriority,
        currentStatus: t.currentStatus,
        owner: t.owner ? { id: t.owner.id, name: t.owner.name, role: t.owner.role } : null,
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
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve the ticket queue." } });
    }
  }
);

// ---------------------------------------------------------------------------
// Issue 3-5 (Lab 3) — a small addition beyond api-spec.md's original §6 draft: ui-spec.md §7.1's
// Reassign control needs a list of active IT Staff/Administrator users to populate its <select>, and
// nothing else in the current API contract provides one — GET /api/admin/users (§8) is
// Administrator-only and doesn't exist until Issue 3-6. Scoped to exactly that lookup (id/name/role,
// no email/password/activation-state), not a preview of admin user management.
// ---------------------------------------------------------------------------
app.get(
  "/api/staff/users",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (_req: Request, res: Response) => {
    const prisma = getPrisma();
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true, role: { in: ["IT_STAFF", "ADMINISTRATOR"] } },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      });
      res.status(200).json(users);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve staff users." } });
    }
  }
);

// ---------------------------------------------------------------------------
// Issue 3-5 (Lab 3) — Staff Ticket Detail (GET) plus claim/reassign, IT Priority, and Internal
// Notes. api-spec.md §6 is the full contract. Not ownership-restricted — the role check from
// requireRole is the only gate (specification.md §5.1's "any Ticket, not just owned ones" rule).
// ---------------------------------------------------------------------------
app.get(
  "/api/staff/tickets/:id",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const ticketId = parseRouteId(req.params.id);
    if (ticketId === null) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          owner: { select: { id: true, name: true, role: true } },
          category: { select: { id: true, name: true } },
          relatedSystem: { select: { id: true, name: true } },
          attachments: { orderBy: { uploadedAt: "asc" } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, role: true } } },
          },
          notes: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, role: true } } },
          },
        },
      });

      if (!ticket) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }

      // Same raw-FK-stripping rule as GET /api/tickets/:id: `ownerId` is dropped since the `owner`
      // relation object above already carries it (api-spec.md §6.1's "full requester object, not
      // just a name" applies the same way to owner here).
      const {
        attachments,
        comments,
        notes,
        requesterId: _requesterId,
        categoryId: _categoryId,
        relatedSystemId: _relatedSystemId,
        ownerId: _ownerId,
        ...rest
      } = ticket;
      res.status(200).json({
        ...rest,
        attachments: attachments.map(formatAttachment),
        comments: comments.map(formatComment),
        notes: notes.map(formatComment),
      });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve the ticket." } });
    }
  }
);

app.patch(
  "/api/staff/tickets/:id/owner",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const ticketId = parseRouteId(req.params.id);
    const ownerId = Number(req.body?.ownerId);

    if (ticketId === null) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    if (!Number.isInteger(ownerId)) {
      return res
        .status(400)
        .json({ error: { code: "VALIDATION_ERROR", message: "ownerId is required and must be a number." } });
    }

    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }

      // BR-19: checked here (not left to the FK constraint alone) so an invalid target gets a
      // meaningful 400 INVALID_OWNER instead of a generic 500. BR-20: no "must be current owner to
      // reassign" check — any active IT Staff/Administrator can claim or reassign.
      const candidate = await prisma.user.findUnique({ where: { id: ownerId } });
      const validOwner =
        !!candidate && candidate.isActive && (candidate.role === "IT_STAFF" || candidate.role === "ADMINISTRATOR");
      if (!validOwner) {
        return res.status(400).json({
          error: { code: "INVALID_OWNER", message: "ownerId must reference an active IT Staff or Administrator user." },
        });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: { ownerId },
        select: { id: true, owner: { select: { id: true, name: true, role: true } } },
      });

      res.status(200).json(updated);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to update the ticket's owner." } });
    }
  }
);

app.patch(
  "/api/staff/tickets/:id/priority",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const ticketId = parseRouteId(req.params.id);
    const itPriority = typeof req.body?.itPriority === "string" ? req.body.itPriority : "";

    if (ticketId === null) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    // BR-22: itPriority is changeable at any Current Status — no status check here.
    if (!VALID_PRIORITIES.includes(itPriority as Priority)) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid itPriority value." } });
    }

    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }

      const updated = await prisma.ticket.update({
        where: { id: ticketId },
        data: { itPriority: itPriority as Priority },
        select: { id: true, itPriority: true },
      });

      res.status(200).json(updated);
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to update IT Priority." } });
    }
  }
);

// Internal Notes (BR-04, BR-26–BR-28, AC-24). Same request/response shape and validation as the
// Public Comments routes above, on the Note model instead, and gated by requireRole rather than a
// visibility check — a Requester never reaches this handler at all, so no Note content, nor even
// its existence, can leak through this route to that role (BR-29/AC-04).
app.post(
  "/api/staff/tickets/:id/notes",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const authorId = req.currentUser!.id;
    const ticketId = parseRouteId(req.params.id);
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";

    if (ticketId === null) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }
    if (!content || content.length > COMMENT_CONTENT_MAX) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Note must be 1-${COMMENT_CONTENT_MAX} characters.`,
          fields: { content: `Note must be 1-${COMMENT_CONTENT_MAX} characters.` },
        },
      });
    }

    try {
      const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }

      const note = await prisma.note.create({
        data: { ticketId, authorId, content },
        include: { author: { select: { id: true, name: true, role: true } } },
      });

      res.status(201).json(formatComment(note));
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to post the note." } });
    }
  }
);

app.get(
  "/api/staff/tickets/:id/notes",
  ...requireFullAuth,
  requireRole("IT_STAFF", "ADMINISTRATOR"),
  async (req: Request, res: Response) => {
    const prisma = getPrisma();
    const ticketId = parseRouteId(req.params.id);
    if (ticketId === null) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
    }

    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          notes: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, role: true } } },
          },
        },
      });
      if (!ticket) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Ticket not found." } });
      }
      res.status(200).json(ticket.notes.map(formatComment));
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to retrieve notes." } });
    }
  }
);

export default app;
