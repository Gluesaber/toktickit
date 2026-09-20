import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Issue 3-3 (Lab 3) — /api/categories now requires a session (BR-11's blanket rule applies to every
// endpoint except login/logout/health, not just requesterId-bearing ones); a small fixture user +
// login replaces the previously-anonymous request. This predates Lab 2's own reference-data checks
// and needed the identical fix.
const FIXTURE_PASSWORD = "a-real-test-password-1";
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const user = await prisma.user.create({
    data: {
      name: "Categories Test User",
      email: `categories-test-${Date.now()}@example.test`,
      role: "REQUESTER",
      passwordHash,
      isActive: true,
      mustChangePassword: false,
    },
  });
  agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD });
});

describe("GET /api/categories", () => {
  it("returns the four seeded categories in id order", async () => {
    const res = await agent.get("/api/categories");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 3, name: "Software" },
      { id: 4, name: "Network" },
    ]);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/categories");
    expect(res.status).toBe(401);
  });
});
