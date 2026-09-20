import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/authorization.api.test.ts (API-12..18).
// Closed out in Issue 3-6: API-16 needed GET /api/admin/users, which didn't exist until this issue.
// API-17 (Administrator parity on claim/priority/status/notes) already has its primary coverage in
// staff-ticket-detail.api.test.ts (Issue 3-5) — not duplicated in full here, just cross-referenced.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let requesterAgent: ReturnType<typeof request.agent>;
let otherRequesterAgent: ReturnType<typeof request.agent>;
let staffAgent: ReturnType<typeof request.agent>;
let categoryId: number;
let relatedSystemId: number;
let ownTicketId: number;
let otherTicketId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [requester, otherRequester, staff] = await Promise.all([
    prisma.user.create({
      data: { name: "Authz Test Requester", email: `authz-req-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Authz Test Other Requester", email: `authz-req-other-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Authz Test Staffer", email: `authz-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  requesterAgent = request.agent(app);
  otherRequesterAgent = request.agent(app);
  staffAgent = request.agent(app);
  await Promise.all([
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
    otherRequesterAgent.post("/api/auth/login").send({ email: otherRequester.email, password: FIXTURE_PASSWORD }),
    staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD }),
  ]);

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  const ownTicket = await requesterAgent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for authorization tests (own)",
    description: "Fixture ticket description for authorization tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  ownTicketId = ownTicket.body.id;

  const otherTicket = await otherRequesterAgent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for authorization tests (other)",
    description: "Fixture ticket description for authorization tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  otherTicketId = otherTicket.body.id;
});

// API-12 (AC-03, AC-12, BR-03, BR-17)
describe("POST /api/tickets — forged requesterId ignored", () => {
  it("uses the session user's id regardless of a client-supplied requesterId", async () => {
    const res = await requesterAgent.post("/api/tickets").send({
      categoryId,
      relatedSystemId,
      summary: "Forged requesterId attempt",
      description: "Fixture ticket description, long enough to pass validation for this test.",
      requestedPriority: "LOW",
      requesterId: 999999,
    });
    expect(res.status).toBe(201);

    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(ticket.requesterId).not.toBe(999999);

    const me = await requesterAgent.get("/api/auth/me");
    expect(ticket.requesterId).toBe(me.body.id);
  });
});

// API-13 (AC-13, BR-18)
describe("GET /api/tickets/:id — cross-Requester access", () => {
  it("returns 404 for a ticket owned by a different Requester, no data exposed", async () => {
    const res = await requesterAgent.get(`/api/tickets/${otherTicketId}`);
    expect(res.status).toBe(404);
    expect(res.body.summary).toBeUndefined();
  });
});

// API-14 (AC-04, BR-29)
describe("POST /api/staff/tickets/:id/notes — Requester rejected", () => {
  it("rejects with 403, no note content in the response", async () => {
    const res = await requesterAgent.post(`/api/staff/tickets/${ownTicketId}/notes`).send({ content: "A secret note attempt." });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toContain("A secret note attempt");
  });
});

// API-15 (AC-17, §5.1)
describe("GET /api/staff/tickets — Requester rejected", () => {
  it("rejects with 403", async () => {
    const res = await requesterAgent.get("/api/staff/tickets");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

// API-16 (AC-31, §5.1)
describe("GET /api/admin/users — non-Administrator rejected", () => {
  it("rejects a Requester with 403", async () => {
    const res = await requesterAgent.get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects IT Staff with 403 — Administrator-only, not covered by staff parity", async () => {
    const res = await staffAgent.get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});

// API-17 (AC-26, §11) — primary coverage in staff-ticket-detail.api.test.ts (Issue 3-5); this is a
// pointer, not a duplicate of that full walkthrough.
describe("Administrator parity on staff Ticket operations (see staff-ticket-detail.api.test.ts)", () => {
  it("an Administrator can reach GET /api/staff/tickets identically to IT Staff", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const admin = await prisma.user.create({
      data: { name: "Authz Test Admin", email: `authz-admin-${Date.now()}@example.test`, role: "ADMINISTRATOR", passwordHash, isActive: true, mustChangePassword: false },
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login").send({ email: admin.email, password: FIXTURE_PASSWORD });

    const res = await adminAgent.get("/api/staff/tickets");
    expect(res.status).toBe(200);
  });
});

// API-18 (BR-39)
describe("Legacy requesterId param is ignored everywhere (BR-39)", () => {
  it("GET /api/tickets ignores a requesterId query param, still scoped to the session", async () => {
    const res = await requesterAgent.get("/api/tickets").query({ requesterId: 999999 });
    expect(res.status).toBe(200);
    expect(res.body.data.every((t: { id: number }) => t.id !== otherTicketId)).toBe(true);
  });

  it("PATCH /api/tickets/:id/resolved-indication ignores a requesterId in the body", async () => {
    const res = await requesterAgent.patch(`/api/tickets/${ownTicketId}/resolved-indication`).send({ requesterId: 999999 });
    expect(res.status).toBe(200);
  });
});
