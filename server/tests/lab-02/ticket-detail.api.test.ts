import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses dedicated fixture Requesters rather than the shared seed Requesters, so this file's
// ownership assertions don't depend on what other test files happen to have created.
//
// Issue 3-3 (Lab 3) — two authenticated agents (owner/other) instead of `requesterId` query params,
// which no longer exist on this endpoint (BR-03, BR-17). Fixtures stay active for the whole file
// (an inactive account can't log in at all, unlike Lab 2 where deactivation only affected the now-
// removed GET /api/requesters listing).

const FIXTURE_PASSWORD = "a-real-test-password-1";
let ownedTicketId: number;
let ownerAgent: ReturnType<typeof request.agent>;
let otherAgent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [owner, otherOwner] = await Promise.all([
    prisma.user.create({
      data: { name: "Ticket Detail Test Owner", email: `ticket-detail-owner-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Ticket Detail Test Other", email: `ticket-detail-other-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  ownerAgent = request.agent(app);
  otherAgent = request.agent(app);
  await Promise.all([
    ownerAgent.post("/api/auth/login").send({ email: owner.email, password: FIXTURE_PASSWORD }),
    otherAgent.post("/api/auth/login").send({ email: otherOwner.email, password: FIXTURE_PASSWORD }),
  ]);

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });

  const createRes = await ownerAgent.post("/api/tickets").send({
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: "Fixture ticket for Ticket Detail tests",
    description: "Fixture ticket description for Ticket Detail tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  ownedTicketId = createRes.body.id;
});

// API-30 (AC-20)
describe("GET /api/tickets/:id — owned", () => {
  it("returns the full ticket with nested requester/category/relatedSystem, attachments, and comments arrays", async () => {
    const res = await ownerAgent.get(`/api/tickets/${ownedTicketId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ownedTicketId,
      summary: "Fixture ticket for Ticket Detail tests",
      requester: { id: expect.any(Number) },
      category: { id: expect.any(Number), name: expect.any(String) },
      relatedSystem: { id: expect.any(Number), name: expect.any(String) },
    });
    expect(res.body.requesterId).toBeUndefined();
    expect(res.body.categoryId).toBeUndefined();
    expect(res.body.attachments).toEqual([]);
    // Issue 3-3 — new fields on this response.
    expect(res.body.comments).toEqual([]);
    expect(res.body.requesterConfirmedResolvedAt).toBeNull();
  });
});

// API-31 (AC-03, AC-21, BR-12, BR-40)
describe("GET /api/tickets/:id — ownership enforcement", () => {
  it("returns 404 NOT_FOUND when requested by a Requester who doesn't own it", async () => {
    const res = await otherAgent.get(`/api/tickets/${ownedTicketId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // API-32 — identical shape for nonexistent vs. not-owned, so a probe can't tell them apart.
  it("returns the identical 404 NOT_FOUND for a nonexistent ticket id", async () => {
    const res = await ownerAgent.get("/api/tickets/999999999");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  // Issue 3-3 — no session at all, rather than a missing requesterId (that param is gone).
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get(`/api/tickets/${ownedTicketId}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  // PR #26 review finding — a malformed (non-numeric) :id previously reached Prisma as NaN and
  // threw, surfacing as 500 INTERNAL_ERROR instead of a clean 404.
  it("returns 404, not 500, for a malformed (non-numeric) ticket id", async () => {
    const res = await ownerAgent.get("/api/tickets/not-a-number");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
