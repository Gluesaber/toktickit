import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/staff-queue.api.test.ts (API-28..33, 55).
// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses dedicated fixture Requesters/tickets + one IT Staff/one Requester agent, so this file's
// assertions don't depend on other files' fixture data.

// The Queue is deliberately unscoped (AC-16 — every Requester's tickets, not just one session's), so
// unlike this project's other fixture files (which isolate by owning a fresh Requester each run),
// a *static* search string here would match every previous run's leftover fixture tickets too, on
// this shared, never-reset dev DB. FIXTURE_SUMMARY folds in a per-run timestamp so each run's search
// only ever matches its own 12 tickets.
const FIXTURE_PASSWORD = "a-real-test-password-1";
const FIXTURE_SUMMARY = `Fixture ticket for Staff Queue tests ${Date.now()}`;
let staffAgent: ReturnType<typeof request.agent>;
let requesterAgent: ReturnType<typeof request.agent>;
let categoryId: number;
let otherCategoryId: number;
let relatedSystemId: number;
let searchableTicketNumber: string;

async function createTicketFor(agent: ReturnType<typeof request.agent>, overrides: Record<string, unknown> = {}) {
  const res = await agent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: FIXTURE_SUMMARY,
    description: "Fixture ticket description for Staff Queue tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
    ...overrides,
  });
  return res.body as { id: number; ticketNumber: string };
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: "Staff Queue Test Staffer", email: `staff-queue-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Staff Queue Test Requester", email: `staff-queue-req-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  staffAgent = request.agent(app);
  requesterAgent = request.agent(app);
  await Promise.all([
    staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD }),
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
  ]);

  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  categoryId = categories[0].id;
  otherCategoryId = categories[1].id;
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  relatedSystemId = relatedSystem.id;

  // 12 tickets across categories/priorities, all created by the one fixture Requester — the Queue
  // must show all of them regardless of who created them (AC-16), unlike GET /api/tickets.
  for (let i = 0; i < 12; i++) {
    const ticket = await createTicketFor(requesterAgent, {
      categoryId: i < 3 ? categoryId : otherCategoryId,
      requestedPriority: i % 2 === 0 ? "LOW" : "HIGH",
    });
    if (i === 0) searchableTicketNumber = ticket.ticketNumber;
  }
});

describe("GET /api/staff/tickets — authorization", () => {
  it("rejects a Requester with 403 FORBIDDEN", async () => {
    const res = await requesterAgent.get("/api/staff/tickets");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/staff/tickets");
    expect(res.status).toBe(401);
  });

  it("allows an Administrator identically to IT Staff (full parity)", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const admin = await prisma.user.create({
      data: { name: "Staff Queue Test Admin", email: `staff-queue-admin-${Date.now()}@example.test`, role: "ADMINISTRATOR", passwordHash, isActive: true, mustChangePassword: false },
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login").send({ email: admin.email, password: FIXTURE_PASSWORD });

    const res = await adminAgent.get("/api/staff/tickets");
    expect(res.status).toBe(200);
  });
});

// API-28 (AC-16)
describe("GET /api/staff/tickets — visibility across Requesters", () => {
  it("returns tickets from the queue regardless of which Requester created them", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ pageSize: 25, search: FIXTURE_SUMMARY });
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBeGreaterThanOrEqual(12);
    const row = res.body.data[0];
    expect(row).toMatchObject({
      id: expect.any(Number),
      ticketNumber: expect.any(String),
      requesterName: expect.any(String),
      requestedPriority: expect.any(String),
      itPriority: expect.any(String),
      currentStatus: "NEW",
    });
    expect(row.owner).toBeNull();
  });
});

// API-29 (AC-18)
describe("GET /api/staff/tickets — pagination", () => {
  it("returns the second page with correct metadata", async () => {
    const res = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_SUMMARY, page: 2, pageSize: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 2, pageSize: 10, totalItems: 12, totalPages: 2 });
  });
});

// API-30 (AC-19)
describe("GET /api/staff/tickets — no-results state", () => {
  it("returns an empty list when a filter matches nothing", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ search: "no-such-ticket-exists-98765" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});

// API-31 (§7)
describe("GET /api/staff/tickets — ownerId=unassigned filter", () => {
  it("returns only tickets with a null owner", async () => {
    const res = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_SUMMARY, ownerId: "unassigned", pageSize: 25 });
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBeGreaterThanOrEqual(12);
    expect(res.body.data.every((t: { owner: unknown }) => t.owner === null)).toBe(true);
  });
});

// API-32 (§7)
describe("GET /api/staff/tickets — invalid query parameters", () => {
  it("rejects an invalid sortBy value", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ sortBy: "notARealField" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid ownerId value", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ ownerId: "not-a-number" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid currentStatus value", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ currentStatus: "NOT_A_REAL_STATUS" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-33 (§7)
describe("GET /api/staff/tickets — page clamping", () => {
  it("clamps a non-numeric page to 1 rather than erroring", async () => {
    const res = await staffAgent.get("/api/staff/tickets").query({ page: "not-a-number" });
    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
  });
});

// API-55 (§7, ui-spec.md §6.3)
describe("GET /api/staff/tickets — categoryId filter", () => {
  it("returns only tickets in the given category", async () => {
    const res = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_SUMMARY, categoryId });
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(3);
  });
});

describe("GET /api/staff/tickets — sorting by itPriority", () => {
  it("sorts ascending (LOW before HIGH)", async () => {
    const res = await staffAgent
      .get("/api/staff/tickets")
      .query({ search: FIXTURE_SUMMARY, pageSize: 25, sortBy: "itPriority", sortDir: "asc" });
    expect(res.status).toBe(200);
    const priorities = res.body.data.map((t: { itPriority: string }) => t.itPriority);
    const firstHighIndex = priorities.indexOf("HIGH");
    const lastLowIndex = priorities.lastIndexOf("LOW");
    expect(lastLowIndex).toBeLessThan(firstHighIndex);
  });
});
