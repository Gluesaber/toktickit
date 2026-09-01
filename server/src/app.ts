import express, { Request, Response } from "express";
import cors from "cors";
import { Priority, TicketStatus } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { formatTicketNumber } from "./ticketNumber.js";
import { clampPage, clampPageSize } from "./ticketQuery.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

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

  let priority: Priority | undefined;
  if (typeof q.priority === "string" && q.priority !== "") {
    if (!VALID_PRIORITIES.includes(q.priority as Priority)) {
      fields.priority = "Invalid priority value.";
    } else {
      priority = q.priority as Priority;
    }
  }

  let status: TicketStatus | undefined;
  if (typeof q.status === "string" && q.status !== "") {
    if (!VALID_STATUSES.includes(q.status as TicketStatus)) {
      fields.status = "Invalid status value.";
    } else {
      status = q.status as TicketStatus;
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

export default app;
