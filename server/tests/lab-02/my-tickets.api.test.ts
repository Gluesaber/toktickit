import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses dedicated, freshly-created Requesters (rather than the shared seed Requesters other test
// files also use) so exact ticket-count assertions here stay reliable across repeated runs.

let requesterAId: number;
let requesterBId: number;
let requesterEmptyId: number;
let categoryId: number;
let otherCategoryId: number;
let relatedSystemId: number;
let searchableTicketNumber: string;

async function createTicketFor(requesterId: number, overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/tickets")
    .send({
      requesterId,
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

  const [requesterA, requesterB, requesterEmpty] = await Promise.all([
    prisma.requester.create({ data: { name: "My Tickets Test A", email: `my-tickets-a-${unique}@example.test` } }),
    prisma.requester.create({ data: { name: "My Tickets Test B", email: `my-tickets-b-${unique}@example.test` } }),
    prisma.requester.create({
      data: { name: "My Tickets Test Empty", email: `my-tickets-empty-${unique}@example.test` },
    }),
  ]);
  requesterAId = requesterA.id;
  requesterBId = requesterB.id;
  requesterEmptyId = requesterEmpty.id;

  const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { id: "asc" } });
  categoryId = categories[0].id;
  otherCategoryId = categories[1].id;
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  relatedSystemId = relatedSystem.id;

  // Requester A: 12 tickets — 3 in `categoryId`, alternating LOW/HIGH priority.
  for (let i = 0; i < 12; i++) {
    const ticket = await createTicketFor(requesterAId, {
      categoryId: i < 3 ? categoryId : otherCategoryId,
      requestedPriority: i % 2 === 0 ? "LOW" : "HIGH",
    });
    if (i === 0) searchableTicketNumber = ticket.ticketNumber;
  }

  // Requester B: 3 tickets — ownership isolation (API-20/AC-12, BR-13).
  for (let i = 0; i < 3; i++) {
    await createTicketFor(requesterBId);
  }

  // Deactivate these fixture Requesters now that their tickets exist: they only needed to be
  // active long enough for POST /api/tickets to accept them (BR-21). Deactivating afterward keeps
  // them out of GET /api/requesters — their tickets stay fully queryable regardless (BR-36) — so
  // this file doesn't permanently pollute the active-Requester list other tests/screens see.
  await prisma.requester.updateMany({
    where: { id: { in: [requesterAId, requesterBId, requesterEmptyId] } },
    data: { isActive: false },
  });
});

// API-20 (AC-12, BR-13)
describe("GET /api/tickets — ownership scoping", () => {
  it("returns only the requesting Requester's tickets", async () => {
    const resA = await request(app).get("/api/tickets").query({ requesterId: requesterAId, pageSize: 25 });
    expect(resA.status).toBe(200);
    expect(resA.body.pagination.totalItems).toBe(12);

    const resB = await request(app).get("/api/tickets").query({ requesterId: requesterBId, pageSize: 25 });
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
    const res = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId, search: searchableTicketNumber });
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
    const res = await request(app).get("/api/tickets").query({ requesterId: requesterAId, categoryId });
    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(3);
  });
});

// API-23 (AC-15, BR-37)
describe("GET /api/tickets — empty state", () => {
  it("returns an empty list for a Requester with zero tickets", async () => {
    const res = await request(app).get("/api/tickets").query({ requesterId: requesterEmptyId });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});

// API-24 (AC-16, BR-38)
describe("GET /api/tickets — no-results state", () => {
  it("returns an empty list when a filter matches nothing", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId, search: "no-such-ticket-exists-12345" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.totalItems).toBe(0);
  });
});

// API-25 (AC-17, BR-17)
describe("GET /api/tickets — pagination", () => {
  it("returns the second page with correct metadata", async () => {
    const res = await request(app).get("/api/tickets").query({ requesterId: requesterAId, page: 2, pageSize: 10 });
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
    const res = await request(app).get("/api/tickets").query({ requesterId: requesterAId, page: 999 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

// API-26 (AC-18, BR-16)
describe("GET /api/tickets — sorting", () => {
  it("sorts by requestedPriority ascending (LOW before HIGH)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId, pageSize: 25, sortBy: "requestedPriority", sortDir: "asc" });
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
    const res = await request(app)
      .get("/api/tickets")
      .query({ requesterId: requesterAId, sortBy: "notARealField" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  // API-29
  it("rejects a missing requesterId", async () => {
    const res = await request(app).get("/api/tickets");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
