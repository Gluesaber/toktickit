import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/requester-regression.api.test.ts.
// API-25/26/27 (Requester self-Cancel) are NOT here — deferred to Issue 3-5 in full, along with
// every other status transition, per specification.md §11's "Cancel scope" decision (confirmed
// with the user ahead of implementation: Issue #33's own text never mentions status/cancel at all).

const FIXTURE_PASSWORD = "a-real-test-password-1";
let agent: ReturnType<typeof request.agent>;
let otherAgent: ReturnType<typeof request.agent>;
let ticketId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [requester, other] = await Promise.all([
    prisma.user.create({
      data: { name: "Regression Test Requester", email: `regression-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Regression Test Other", email: `regression-other-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  agent = request.agent(app);
  otherAgent = request.agent(app);
  await Promise.all([
    agent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
    otherAgent.post("/api/auth/login").send({ email: other.email, password: FIXTURE_PASSWORD }),
  ]);

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const createRes = await agent.post("/api/tickets").send({
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: "Fixture ticket for Requester regression tests",
    description: "Fixture ticket description for Requester regression tests, long enough to pass.",
    requestedPriority: "MEDIUM",
  });
  ticketId = createRes.body.id;
});

// API-19 (AC-11) — already covered thoroughly by my-tickets.api.test.ts's ownership-scoping
// describe block; kept here as one direct assertion for traceability to this specific AC.
describe("GET /api/tickets — session-derived scoping (API-19, AC-11)", () => {
  it("returns only the authenticated Requester's own tickets, with no requesterId param needed", async () => {
    const res = await agent.get("/api/tickets");
    expect(res.status).toBe(200);
    expect(res.body.data.some((t: { id: number }) => t.id === ticketId)).toBe(true);
  });
});

// API-21/22 (AC-14, BR-26–BR-28)
describe("POST /api/tickets/:id/comments", () => {
  it("API-21: posts a valid comment with author/createdAt backend-assigned", async () => {
    const res = await agent.post(`/api/tickets/${ticketId}/comments`).send({ content: "Still happening today." });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: "Still happening today." });
    expect(res.body.author).toMatchObject({ role: "REQUESTER" });
    expect(res.body.createdAt).toBeDefined();
  });

  it("API-22: rejects blank/whitespace-only content", async () => {
    const res = await agent.post(`/api/tickets/${ticketId}/comments`).send({ content: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("ignores a forged author/createdAt in the body", async () => {
    const res = await agent
      .post(`/api/tickets/${ticketId}/comments`)
      .send({ content: "Legit comment.", author: { id: 999999, name: "Forged" }, createdAt: "2000-01-01T00:00:00.000Z" });
    expect(res.status).toBe(201);
    expect(res.body.author.id).not.toBe(999999);
    expect(res.body.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
  });

  it("rejects a non-owning Requester with 404, not 403", async () => {
    const res = await otherAgent.post(`/api/tickets/${ticketId}/comments`).send({ content: "Trying to peek." });
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post(`/api/tickets/${ticketId}/comments`).send({ content: "No session." });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/tickets/:id/comments", () => {
  it("lists comments oldest-first for the owning Requester", async () => {
    const res = await agent.get(`/api/tickets/${ticketId}/comments`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2); // the two posted above
    const timestamps = res.body.map((c: { createdAt: string }) => new Date(c.createdAt).getTime());
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });

  it("rejects a non-owning Requester with 404", async () => {
    const res = await otherAgent.get(`/api/tickets/${ticketId}/comments`);
    expect(res.status).toBe(404);
  });
});

// API-23/24 (AC-15, BR-25)
describe("PATCH /api/tickets/:id/resolved-indication", () => {
  it("API-23: sets requesterConfirmedResolvedAt without touching currentStatus", async () => {
    const res = await agent.patch(`/api/tickets/${ticketId}/resolved-indication`);
    expect(res.status).toBe(200);
    expect(res.body.requesterConfirmedResolvedAt).not.toBeNull();

    const detail = await agent.get(`/api/tickets/${ticketId}`);
    expect(detail.body.currentStatus).toBe("NEW");
    expect(detail.body.requesterConfirmedResolvedAt).not.toBeNull();
  });

  // BR-25 blocks this while the ticket is already Resolved/Closed/Cancelled. Nothing in Issue 3-3
  // can actually drive a ticket to one of those statuses yet (the status-transition endpoint is
  // Issue 3-5's job) — forced directly via Prisma here so this rule is proven now rather than left
  // untested until 3-5 lands.
  it("API-24: rejects with 409 TICKET_ALREADY_TERMINAL once the ticket is Resolved", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    const createRes = await agent.post("/api/tickets").send({
      categoryId: category.id,
      relatedSystemId: relatedSystem.id,
      summary: "Fixture ticket forced to Resolved for API-24",
      description: "Fixture ticket description, long enough to pass validation for this test.",
      requestedPriority: "LOW",
    });
    await prisma.ticket.update({ where: { id: createRes.body.id }, data: { currentStatus: "RESOLVED" } });

    const res = await agent.patch(`/api/tickets/${createRes.body.id}/resolved-indication`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TICKET_ALREADY_TERMINAL");
  });

  it("rejects a non-owning Requester with 404", async () => {
    const res = await otherAgent.patch(`/api/tickets/${ticketId}/resolved-indication`);
    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).patch(`/api/tickets/${ticketId}/resolved-indication`);
    expect(res.status).toBe(401);
  });
});
