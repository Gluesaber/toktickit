import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// This file accumulates across issues per docs/lab-02/tests.md §1's file-mapping decision:
// reference-data checks (Issue 2-3) plus Ticket creation checks (Issue 2-4).
//
// Issue 3-3 (Lab 3) — every request below now goes through an authenticated `agent` (a real
// session, established via POST /api/auth/login) instead of a bare `requesterId` query/body field,
// which no longer exists anywhere in this API (BR-03, BR-17). `GET /api/requesters` is gone
// entirely (the Development Requester Selector it served is removed — BR-39), so its tests are
// removed rather than adapted. The two "inactive/unknown requesterId" tests (former API-05) are
// removed for the same reason: a client can no longer supply a requesterId at all, so that failure
// mode doesn't exist anymore — INVALID_REQUESTER is unreachable through this endpoint now.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let categoryId: number;
let relatedSystemId: number;
let agent: ReturnType<typeof request.agent>;
let activeRequesterId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [requester, category, relatedSystem] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Create Ticket Test Requester",
        email: `create-ticket-${unique}@example.test`,
        role: "REQUESTER",
        passwordHash,
        isActive: true,
        mustChangePassword: false,
      },
    }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  activeRequesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;

  agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD });
});

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    categoryId,
    relatedSystemId,
    summary: "Laptop battery drains quickly",
    description: "Battery drops from 100% to 20% within an hour of unplugging, started this week.",
    requestedPriority: "MEDIUM",
    ...overrides,
  };
}

// API-08 — active-only reference data.
describe("GET /api/categories", () => {
  it("returns only active categories", async () => {
    const res = await agent.get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/related-systems", () => {
  it("returns only active related systems", async () => {
    const res = await agent.get("/api/related-systems");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });
});

describe("POST /api/tickets", () => {
  // API-01 (AC-01)
  it("creates a ticket with valid data and returns a generated ticket number", async () => {
    const res = await agent.post("/api/tickets").send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(/^TK-\d{4}-\d{6}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.requesterId).toBe(activeRequesterId);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload());
    expect(res.status).toBe(401);
  });

  // API-02 (AC-04, BR-19)
  it("rejects a blank summary with a field-level message", async () => {
    const res = await agent.post("/api/tickets").send(validPayload({ summary: "  " }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.summary).toBeDefined();
  });

  // API-03 (AC-05, BR-20)
  it("rejects a description under 10 characters with a field-level message", async () => {
    const res = await agent.post("/api/tickets").send(validPayload({ description: "too short" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.description).toBeDefined();
  });

  // API-04 (BR-06)
  it("ignores a client-supplied ticketNumber/currentStatus and generates its own", async () => {
    const res = await agent
      .post("/api/tickets")
      .send(validPayload({ ticketNumber: "TK-9999-999999", currentStatus: "RESOLVED" }));
    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).not.toBe("TK-9999-999999");
    expect(res.body.currentStatus).toBe("NEW");
  });

  // BR-03/BR-17 (Issue 3-3) — a forged requesterId in the body is silently ignored; the ticket is
  // still attributed to the authenticated session's user, never the forged value.
  it("ignores a forged requesterId in the body and uses the authenticated session's identity", async () => {
    const res = await agent.post("/api/tickets").send(validPayload({ requesterId: 999999 }));
    expect(res.status).toBe(201);
    expect(res.body.requesterId).toBe(activeRequesterId);
  });

  // API-06 (BR-21) — unknown category/related system
  it("rejects an unknown categoryId and relatedSystemId with field-level VALIDATION_ERROR", async () => {
    const res = await agent
      .post("/api/tickets")
      .send(validPayload({ categoryId: 999999, relatedSystemId: 999999 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.categoryId).toBeDefined();
    expect(res.body.error.fields.relatedSystemId).toBeDefined();
  });

  // API-07 (BR-23) — documents current behavior, not a bug
  it("creates two independent tickets for two identical submissions", async () => {
    const payload = validPayload({ summary: "Duplicate submission check" });
    const first = await agent.post("/api/tickets").send(payload);
    const second = await agent.post("/api/tickets").send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.ticketNumber).not.toBe(second.body.ticketNumber);
  });

  it("rejects an invalid requestedPriority value", async () => {
    const res = await agent.post("/api/tickets").send(validPayload({ requestedPriority: "SUPER_URGENT" }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requestedPriority).toBeDefined();
  });
});
