import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses dedicated, freshly-created Requesters (rather than the shared seed Requesters other test
// files also use) so exact ticket-count assertions here stay reliable across repeated runs.
//
// Issue 3-3 (Lab 3) — one authenticated `agent` per fixture Requester (BR-03/BR-17: identity comes
// from the session, not a `requesterId` param, which no longer exists on this endpoint). These
// fixture users stay active for the whole file — unlike Lab 2's version, they can't be deactivated
// after creating their tickets anymore, since an inactive account can no longer even log in.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let categoryId: number;
let otherCategoryId: number;
let relatedSystemId: number;
let searchableTicketNumber: string;
let agentA: ReturnType<typeof request.agent>;
let agentB: ReturnType<typeof request.agent>;
let agentEmpty: ReturnType<typeof request.agent>;

async function createTicketFor(agent: ReturnType<typeof request.agent>, overrides: Record<string, unknown> = {}) {
  const res = await agent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for My Tickets list tests",
    description: "Fixture ticket description for My Tickets list tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
    ...overrides,
  });
  return res.body as { id: number; ticketNumber: string };
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [requesterA, requesterB, requesterEmpty] = await Promise.all([
    prisma.user.create({
      data: { name: "My Tickets Test A", email: `my-tickets-a-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "My Tickets Test B", email: `my-tickets-b-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "My Tickets Test Empty", email: `my-tickets-empty-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  agentA = request.agent(app);
  agentB = request.agent(app);
  agentEmpty = request.agent(app);
  await Promise.all([
    agentA.post("/api/auth/login").send({ email: requesterA.email, password: FIXTURE_PASSWORD }),
    agentB.post("/api/auth/login").send({ email: requesterB.email, password: FIXTURE_PASSWORD }),
    agentEmpty.post("/api/auth/login").send({ email: requesterEmpty.email, password: FIXTURE_PASSWORD }),
  ]);

  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  categoryId = categories[0].id;
  otherCategoryId = categories[1].id;
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  relatedSystemId = relatedSystem.id;

  // Requester A: 12 tickets — 3 in `categoryId`, alternating LOW/HIGH priority.
  for (let i = 0; i < 12; i++) {
    const ticket = await createTicketFor(agentA, {
      categoryId: i < 3 ? categoryId : otherCategoryId,
      requestedPriority: i % 2 === 0 ? "LOW" : "HIGH",
    });
    if (i === 0) searchableTicketNumber = ticket.ticketNumber;
  }

  // Requester B: 3 tickets — ownership isolation (API-20/AC-12, BR-13).
  for (let i = 0; i < 3; i++) {
    await createTicketFor(agentB);
  }
});

// API-20 (AC-12, BR-13)
describe("GET /api/tickets — ownership scoping", () => {
  it("returns only the requesting Requester's tickets", async () => {
    const resA = await agentA.get("/api/tickets").query({ pageSize: 25 });
    expect(resA.status).toBe(200);
    expect(resA.body.pagination.totalItems).toBe(12);

    const resB = await agentB.get("/api/tickets").query({ pageSize: 25 });
    expect(resB.status).toBe(200);
    expect(resB.body.pagination.totalItems).toBe(3);

    const idsFromA = resA.body.data.map((t: { id: number }) => t.id);
    const idsFromB = resB.body.data.map((t: { id: number }) => t.id);
    expect(idsFromA.some((id: number) => idsFromB.includes(id))).toBe(false);
  });
});

// API-21 (AC-13, BR-14)
describe("GET /api/tickets — search", () => {
  it("matches by Ticket Number substring", async () => {
    const res = await agentA.get("/api/tickets").query({ search: searchableTicketNumber });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((t: { ticketNumber: string }) => t.ticketNumber === searchableTicketNumber)).toBe(
      true
    );
  });
});

// API-22 (AC-14, BR-15)
describe("GET /api/tickets — category filter", () => {
  it("returns only tickets in the given category", async () => {
    const res = await agentA.get("/api/tickets").query({ categoryId });
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(3);
  });
});

// API-23 (AC-15, BR-37)
describe("GET /api/tickets — empty state", () => {
  it("returns an empty list for a Requester with zero tickets", async () => {
    const res = await agentEmpty.get("/api/tickets");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});

// API-24 (AC-16, BR-38)
describe("GET /api/tickets — no-results state", () => {
  it("returns an empty list when a filter matches nothing", async () => {
    const res = await agentA.get("/api/tickets").query({ search: "no-such-ticket-exists-12345" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});

// API-25 (AC-17, BR-17)
describe("GET /api/tickets — pagination", () => {
  it("returns the second page with correct metadata", async () => {
    const res = await agentA.get("/api/tickets").query({ page: 2, pageSize: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({
      page: 2,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  // API-27 (BR-17)
  it("returns an empty list (not an error) for a page beyond the last", async () => {
    const res = await agentA.get("/api/tickets").query({ page: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// API-26 (AC-18, BR-16)
describe("GET /api/tickets — sorting", () => {
  it("sorts by requestedPriority ascending (LOW before HIGH)", async () => {
    const res = await agentA.get("/api/tickets").query({ pageSize: 25, sortBy: "requestedPriority", sortDir: "asc" });
    expect(res.status).toBe(200);
    const priorities = res.body.data.map((t: { requestedPriority: string }) => t.requestedPriority);
    const firstHighIndex = priorities.indexOf("HIGH");
    const lastLowIndex = priorities.lastIndexOf("LOW");
    expect(lastLowIndex).toBeLessThan(firstHighIndex);
  });
});

// API-28 (BR-18)
describe("GET /api/tickets — invalid query parameters", () => {
  it("rejects an invalid sortBy value", async () => {
    const res = await agentA.get("/api/tickets").query({ sortBy: "notARealField" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // API-29 (Issue 3-3) — no session at all, rather than a missing requesterId (that param no
  // longer exists on this endpoint).
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
