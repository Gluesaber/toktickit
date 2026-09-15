import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword, requireAuth, requirePasswordChanged } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/auth.api.test.ts (API-01..11).
// Requires the DB to be migrated and seeded first (see server/prisma/seed.ts).
// Uses dedicated fixture Users (own unique emails) rather than the shared seed accounts, same
// pattern Lab 2's own test files established, so these assertions don't depend on seed state.

const FIXTURE_PASSWORD = "a-real-test-password-1";

let activeUserEmail: string;
let inactiveUserEmail: string;
let mustChangeUserId: number;
let mustChangeUserEmail: string;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  activeUserEmail = `auth-active-${unique}@example.test`;
  inactiveUserEmail = `auth-inactive-${unique}@example.test`;
  mustChangeUserEmail = `auth-mustchange-${unique}@example.test`;

  await prisma.user.create({
    data: { name: "Auth Test Active", email: activeUserEmail, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
  });
  await prisma.user.create({
    data: { name: "Auth Test Inactive", email: inactiveUserEmail, role: "REQUESTER", passwordHash, isActive: false, mustChangePassword: false },
  });
  const mustChangeUser = await prisma.user.create({
    data: { name: "Auth Test MustChange", email: mustChangeUserEmail, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: true },
  });
  mustChangeUserId = mustChangeUser.id;
});

describe("POST /api/auth/login", () => {
  it("API-01: valid credentials — 200, session cookie set, correct role in body", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/login").send({ email: activeUserEmail, password: FIXTURE_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("REQUESTER");
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("API-02: unknown email — 401 INVALID_CREDENTIALS", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "no-such-user@example.test", password: "whatever" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("API-03: known email, wrong password — 401 INVALID_CREDENTIALS, identical message to API-02", async () => {
    const wrongEmailRes = await request(app).post("/api/auth/login").send({ email: "no-such-user@example.test", password: "whatever" });
    const wrongPasswordRes = await request(app).post("/api/auth/login").send({ email: activeUserEmail, password: "definitely-wrong" });
    expect(wrongPasswordRes.status).toBe(401);
    expect(wrongPasswordRes.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPasswordRes.body.error.message).toBe(wrongEmailRes.body.error.message);
  });

  it("API-04: correct credentials, isActive=false — 401 ACCOUNT_INACTIVE, distinct from API-02/03", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: inactiveUserEmail, password: FIXTURE_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ACCOUNT_INACTIVE");
    expect(res.body.error.message).not.toBe("Invalid email or password.");
  });

  it("missing email/password — 400 VALIDATION_ERROR", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("PASSWORD_CHANGE_REQUIRED gate (API-05)", () => {
  // No Lab 3 business route is gated by requirePasswordChanged yet as of Issue 3-2 — every route
  // that exists so far (GET /api/auth/me, POST /api/auth/change-password, POST /api/auth/logout) is
  // deliberately exempt from it by never composing it on (BR-13). Issue 3-3+ will compose it onto
  // real protected routes as those are added. Tested here against a throwaway route mounted only in
  // this test file, so the middleware itself is verified now rather than left untested until 3-3.
  const testApp = express();
  testApp.use(express.json());
  testApp.use((req, _res, next) => {
    // Minimal stand-in for the real session middleware: attaches a fake session-like userId so
    // requireAuth can run against the fixture user without needing a real cookie round-trip here.
    (req as unknown as { session: { userId?: number } }).session = { userId: mustChangeUserId };
    next();
  });
  testApp.get("/protected", requireAuth, requirePasswordChanged, (_req, res) => res.status(200).json({ ok: true }));

  it("API-05: a route gated by requirePasswordChanged rejects a mustChangePassword=true user", async () => {
    const res = await request(testApp).get("/protected");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });
});

describe("POST /api/auth/change-password", () => {
  it("API-06: new password shorter than 8 chars — 400 VALIDATION_ERROR", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: mustChangeUserEmail, password: FIXTURE_PASSWORD });
    const res = await agent.post("/api/auth/change-password").send({ newPassword: "short1", confirmPassword: "short1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("API-07: mismatched confirmation — 400 VALIDATION_ERROR", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: mustChangeUserEmail, password: FIXTURE_PASSWORD });
    const res = await agent
      .post("/api/auth/change-password")
      .send({ newPassword: "a-brand-new-password", confirmPassword: "does-not-match" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("API-08: valid — 200, mustChangePassword false, same session still authenticates", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: mustChangeUserEmail, password: FIXTURE_PASSWORD });

    const res = await agent
      .post("/api/auth/change-password")
      .send({ newPassword: "a-brand-new-password", confirmPassword: "a-brand-new-password" });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);

    // Same session (same agent, no re-login) still authenticates (BR-15).
    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(200);
    expect(meRes.body.mustChangePassword).toBe(false);
  });

  it("requires a session — 401 UNAUTHENTICATED with no cookie", async () => {
    const res = await request(app).post("/api/auth/change-password").send({ newPassword: "irrelevant1", confirmPassword: "irrelevant1" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/auth/logout + GET /api/auth/me (API-09, API-10, API-11)", () => {
  it("API-09: logout invalidates the session — old cookie gets 401 on the next request", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: activeUserEmail, password: FIXTURE_PASSWORD });

    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);

    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
    expect(meRes.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("logout is idempotent — 200 even with no prior session", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });

  it("API-10: any protected endpoint with no cookie — 401 UNAUTHENTICATED", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("API-11: GET /api/auth/me returns the safe shape, never passwordHash", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: activeUserEmail, password: FIXTURE_PASSWORD });

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      email: activeUserEmail,
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: false,
    });
    expect(res.body.passwordHash).toBeUndefined();
  });
});
