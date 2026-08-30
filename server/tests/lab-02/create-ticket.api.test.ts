import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// This file accumulates across issues per docs/lab-02/tests.md §1's file-mapping decision:
// reference-data checks land here (Issue 2-3), Ticket creation checks (API-01..07) are added
// by Issue 2-4.

// API-09 (docs/lab-02/tests.md) — BR-07, BR-35: inactive Requesters never appear.
describe("GET /api/requesters", () => {
  it("returns only active development requesters, excluding the inactive seed", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body.map((r: { name: string }) => r.name)).not.toContain("Sam Whitfield");
    for (const requester of res.body) {
      expect(requester).toMatchObject({
        id: expect.any(Number),
        name: expect.any(String),
        email: expect.any(String),
      });
    }
  });
});
