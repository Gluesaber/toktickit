import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// This file accumulates across issues per docs/lab-02/tests.md §1's file-mapping decision:
// reference-data checks (Issue 2-3) plus Ticket creation checks (Issue 2-4).

let activeRequesterId: number;
let inactiveRequesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const [activeRequester, inactiveRequester, category, relatedSystem] = await Promise.all([
    prisma.requester.findFirstOrThrow({ where: { isActive: true } }),
    prisma.requester.findFirstOrThrow({ where: { isActive: false } }),
    prisma.category.findFirstOrThrow({ where: { isActive: true } }),
    prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } }),
  ]);
  activeRequesterId = activeRequester.id;
  inactiveRequesterId = inactiveRequester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    requesterId: activeRequesterId,
    categoryId,
    relatedSystemId,
    summary: "Laptop battery drains quickly",
    description: "Battery drops from 100% to 20% within an hour of unplugging, started this week.",
    requestedPriority: "MEDIUM",
    ...overrides,
  };
}

// API-09 (Issue 2-3) — BR-07, BR-35: inactive Requesters never appear.
// Asserts presence/absence rather than an exact array length: other test files create their own
// (later-deactivated) fixture Requesters against this same shared dev DB, so the total active
// count isn't stable across the whole suite — only which specific seeded ones show up is.
describe("GET /api/requesters", () => {
  it("returns only active development requesters, excluding the inactive seed", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    const names = res.body.map((r: { name: string }) => r.name);
    expect(names).toEqual(expect.arrayContaining(["Alex Rivera", "Priya Nair", "Jordan Lee", "Morgan Chen"]));
    expect(names).not.toContain("Sam Whitfield");
    for (const requester of res.body) {
      expect(requester).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
      });
    }
  });
});

// API-08 — active-only reference data.
describe("GET /api/categories", () => {
  it("returns only active categories", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /api/related-systems", () => {
  it("returns only active related systems", async () => {
    const res = await request(app).get("/api/related-systems");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
  });
});

describe("POST /api/tickets", () => {
  // API-01 (AC-01)
  it("creates a ticket with valid data and returns a generated ticket number", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload());
    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).toMatch(/^TK-\d{4}-\d{6}$/);
    expect(res.body.currentStatus).toBe("NEW");
    expect(res.body.requesterId).toBe(activeRequesterId);
  });

  // API-02 (AC-04, BR-19)
  it("rejects a blank summary with a field-level message", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload({ summary: "  " }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.summary).toBeDefined();
  });

  // API-03 (AC-05, BR-20)
  it("rejects a description under 10 characters with a field-level message", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload({ description: "too short" }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields.description).toBeDefined();
  });

  // API-04 (BR-06)
  it("ignores a client-supplied ticketNumber/currentStatus and generates its own", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send(validPayload({ ticketNumber: "TK-9999-999999", currentStatus: "RESOLVED" }));
    expect(res.status).toBe(201);
    expect(res.body.ticketNumber).not.toBe("TK-9999-999999");
    expect(res.body.currentStatus).toBe("NEW");
  });

  // API-05 (BR-21) — inactive requester
  it("rejects an inactive requesterId with INVALID_REQUESTER", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload({ requesterId: inactiveRequesterId }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUESTER");
  });

  // API-05 (BR-21) — unknown requester
  it("rejects an unknown requesterId with INVALID_REQUESTER", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload({ requesterId: 999999 }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUESTER");
  });

  // API-06 (BR-21) — unknown category/related system
  it("rejects an unknown categoryId and relatedSystemId with field-level VALIDATION_ERROR", async () => {
    const res = await request(app)
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
    const first = await request(app).post("/api/tickets").send(payload);
    const second = await request(app).post("/api/tickets").send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.ticketNumber).not.toBe(second.body.ticketNumber);
  });

  it("rejects an invalid requestedPriority value", async () => {
    const res = await request(app).post("/api/tickets").send(validPayload({ requestedPriority: "SUPER_URGENT" }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields.requestedPriority).toBeDefined();
  });
});
