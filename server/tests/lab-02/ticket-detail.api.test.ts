import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses a dedicated fixture Requester (deactivated after setup, same pattern as
// my-tickets.api.test.ts) rather than the shared seed Requesters, so this file's ownership
// assertions don't depend on what other test files happen to have created.

let ownerId: number;
let otherOwnerId: number;
let ownedTicketId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();

  const [owner, otherOwner] = await Promise.all([
    prisma.requester.create({ data: { name: "Ticket Detail Test Owner", email: `ticket-detail-owner-${unique}@example.test` } }),
    prisma.requester.create({ data: { name: "Ticket Detail Test Other", email: `ticket-detail-other-${unique}@example.test` } }),
  ]);
  ownerId = owner.id;
  otherOwnerId = otherOwner.id;

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  const createRes = await request(app).post("/api/tickets").send({
    requesterId: ownerId,
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: "Fixture ticket for Ticket Detail tests",
    description: "Fixture ticket description for Ticket Detail tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  ownedTicketId = createRes.body.id;

  // Deactivate now that the ticket exists (BR-21 only requires active at creation time) — keeps
  // these fixtures out of GET /api/requesters, same reasoning as my-tickets.api.test.ts.
  await prisma.requester.updateMany({
    where: { id: { in: [ownerId, otherOwnerId] } },
    data: { isActive: false },
  });
});

// API-30 (AC-20)
describe("GET /api/tickets/:id — owned", () => {
  it("returns the full ticket with nested requester/category/relatedSystem and an attachments array", async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketId}`).query({ requesterId: ownerId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ownedTicketId,
      summary: "Fixture ticket for Ticket Detail tests",
      requester: { id: ownerId },
      category: { id: expect.any(Number), name: expect.any(String) },
      relatedSystem: { id: expect.any(Number), name: expect.any(String) },
    });
    expect(res.body.requesterId).toBeUndefined();
    expect(res.body.categoryId).toBeUndefined();
    expect(res.body.attachments).toEqual([]);
  });
});

// API-31 (AC-03, AC-21, BR-12, BR-40)
describe("GET /api/tickets/:id — ownership enforcement", () => {
  it("returns 404 NOT_FOUND when requested by a Requester who doesn't own it", async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketId}`).query({ requesterId: otherOwnerId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // API-32 — identical shape for nonexistent vs. not-owned, so a probe can't tell them apart.
  it("returns the identical 404 NOT_FOUND for a nonexistent ticket id", async () => {
    const res = await request(app).get("/api/tickets/999999999").query({ requesterId: ownerId });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("rejects a missing requesterId", async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketId}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
