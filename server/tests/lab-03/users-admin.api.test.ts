import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/users-admin.api.test.ts (API-45..52).

const FIXTURE_PASSWORD = "a-real-test-password-1";
let adminAgent: ReturnType<typeof request.agent>;
let staffAgent: ReturnType<typeof request.agent>;
let requesterAgent: ReturnType<typeof request.agent>;
let adminId: number;

async function createAdmin(overrides: Record<string, unknown> = {}) {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  return prisma.user.create({
    data: {
      name: "Extra Admin",
      email: `users-admin-extra-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
      role: "ADMINISTRATOR",
      passwordHash,
      isActive: true,
      mustChangePassword: false,
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [admin, staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: "Users Admin Test Admin", email: `users-admin-admin-${unique}@example.test`, role: "ADMINISTRATOR", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Users Admin Test Staffer", email: `users-admin-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Users Admin Test Requester", email: `users-admin-req-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);
  adminId = admin.id;

  adminAgent = request.agent(app);
  staffAgent = request.agent(app);
  requesterAgent = request.agent(app);
  await Promise.all([
    adminAgent.post("/api/auth/login").send({ email: admin.email, password: FIXTURE_PASSWORD }),
    staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD }),
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
  ]);
});

describe("GET /api/admin/users — authorization", () => {
  it("rejects a Requester with 403", async () => {
    const res = await requesterAgent.get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  // API-16 also covers this pair, but a direct check belongs alongside every other route in this
  // file too.
  it("rejects IT Staff with 403 (Administrator-only, not staff-parity)", async () => {
    const res = await staffAgent.get("/api/admin/users");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects an unauthenticated request with 401", async () => {
    const res = await request(app).get("/api/admin/users");
    expect(res.status).toBe(401);
  });
});

// API-45 (AC-27, BR-31)
describe("POST /api/admin/users — duplicate email", () => {
  it("rejects an email already in use, case-insensitively", async () => {
    const email = `dup-check-${Date.now()}@example.test`;
    const first = await adminAgent.post("/api/admin/users").send({
      name: "First User",
      email,
      role: "REQUESTER",
      isActive: true,
      initialPassword: "a-real-test-password-1",
    });
    expect(first.status).toBe(201);

    const second = await adminAgent.post("/api/admin/users").send({
      name: "Second User",
      email: email.toUpperCase(),
      role: "REQUESTER",
      isActive: true,
      initialPassword: "a-real-test-password-1",
    });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("DUPLICATE_EMAIL");
  });
});

// API-46 (BR-30)
describe("POST /api/admin/users — valid create", () => {
  it("creates a user with mustChangePassword true regardless of request body", async () => {
    const res = await adminAgent.post("/api/admin/users").send({
      name: "New Staffer",
      email: `new-staffer-${Date.now()}@example.test`,
      role: "IT_STAFF",
      isActive: true,
      initialPassword: "a-real-test-password-1",
      mustChangePassword: false, // ignored — always forced true
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "New Staffer", role: "IT_STAFF", isActive: true, mustChangePassword: true });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects a missing required field", async () => {
    const res = await adminAgent.post("/api/admin/users").send({ email: `incomplete-${Date.now()}@example.test`, role: "REQUESTER", initialPassword: "a-real-test-password-1" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an initialPassword shorter than 8 characters", async () => {
    const res = await adminAgent.post("/api/admin/users").send({
      name: "Short Pw",
      email: `short-pw-${Date.now()}@example.test`,
      role: "REQUESTER",
      isActive: true,
      initialPassword: "short",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-47 (AC-28, BR-33)
describe("POST /api/admin/users/:id/reset-password", () => {
  it("forces mustChangePassword, and the user is routed to Change Password on next login", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const target = await prisma.user.create({
      data: { name: "Reset Target", email: `reset-target-${Date.now()}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    });

    const resetRes = await adminAgent.post(`/api/admin/users/${target.id}/reset-password`).send({ newInitialPassword: "a-brand-new-password-1" });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toMatchObject({ id: target.id, mustChangePassword: true });

    const loginRes = await request(app).post("/api/auth/login").send({ email: target.email, password: "a-brand-new-password-1" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.mustChangePassword).toBe(true);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await adminAgent.post(`/api/admin/users/${adminId}/reset-password`).send({ newInitialPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a nonexistent user with 404", async () => {
    const res = await adminAgent.post("/api/admin/users/99999999/reset-password").send({ newInitialPassword: "a-real-test-password-1" });
    expect(res.status).toBe(404);
  });
});

// API-48 (AC-29, BR-34)
describe("PATCH /api/admin/users/:id — self-deactivation blocked", () => {
  it("rejects the caller deactivating their own account", async () => {
    const res = await adminAgent.patch(`/api/admin/users/${adminId}`).send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_DEACTIVATION_BLOCKED");
  });

  it("rejects the caller changing their own role away from Administrator", async () => {
    const res = await adminAgent.patch(`/api/admin/users/${adminId}`).send({ role: "IT_STAFF" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_DEACTIVATION_BLOCKED");
  });
});

// API-49 (AC-30, BR-35)
//
// Found during implementation: LAST_ADMINISTRATOR_PROTECTED, though implemented exactly per BR-35's
// literal "would leave zero active Administrator accounts" wording, is unreachable through any real
// authenticated request. `PATCH /api/admin/users/:id` requires the caller to be an active
// Administrator (requireAuth + requireRole), so whenever caller != target there are always >= 2
// active Administrators at request time — deactivating the target can never actually reach zero.
// When caller == target, BR-34 fires first and unconditionally ("independent of the
// last-Administrator rule" — specification.md §11), so self-deactivation never falls through to the
// BR-35 branch either. The check in app.ts is kept as defense-in-depth against a theoretical
// concurrent-request race (two requests both passing the count check before either commits), not
// because it's reachable in a single-request test. See docs/lab-03/tests.md §7.
describe("PATCH /api/admin/users/:id — last Administrator protected (see note above)", () => {
  it("allows deactivating a fellow active Administrator when it would NOT leave zero active (correct, not over-blocking)", async () => {
    const prisma = getPrisma();
    const solo = await createAdmin();
    await prisma.user.update({ where: { id: adminId }, data: { isActive: true } });

    // adminAgent and solo are both active Administrators here — deactivating solo leaves adminAgent
    // still active, so BR-35 correctly does NOT block this (only self-deactivation and the truly
    // unreachable "would leave zero" case are blocked).
    const res = await adminAgent.patch(`/api/admin/users/${solo.id}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it("the sole active Administrator's own self-deactivation attempt is still blocked, via BR-34's unconditional precedence", async () => {
    const prisma = getPrisma();
    const solo = await createAdmin();
    const soloAgent = request.agent(app);
    await soloAgent.post("/api/auth/login").send({ email: solo.email, password: FIXTURE_PASSWORD });
    // Make `solo` genuinely the only active Administrator, so BR-35's condition is also literally
    // true here — confirms BR-34's code wins regardless (specification.md §11).
    await prisma.user.updateMany({ where: { role: "ADMINISTRATOR", isActive: true, id: { not: solo.id } }, data: { isActive: false } });

    const res = await soloAgent.patch(`/api/admin/users/${solo.id}`).send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SELF_DEACTIVATION_BLOCKED");

    // Restore for any later tests in this file.
    await prisma.user.updateMany({ where: { role: "ADMINISTRATOR" }, data: { isActive: true } });
  });
});

// API-50 (AC-32)
describe("GET /api/admin/users — search", () => {
  it("returns only name/email matches", async () => {
    const unique = `SearchTarget${Date.now()}`;
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    await prisma.user.create({
      data: { name: unique, email: `search-target-${Date.now()}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    });

    const res = await adminAgent.get("/api/admin/users").query({ search: unique });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((u: { name: string; email: string }) => u.name.includes(unique) || u.email.includes(unique.toLowerCase()))).toBe(true);
  });
});

// API-51 (AC-33)
describe("GET /api/admin/users — role filter", () => {
  it("returns only users with the given role", async () => {
    const res = await adminAgent.get("/api/admin/users").query({ role: "ADMINISTRATOR" });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((u: { role: string }) => u.role === "ADMINISTRATOR")).toBe(true);
  });

  it("rejects an invalid role value", async () => {
    const res = await adminAgent.get("/api/admin/users").query({ role: "NOT_A_ROLE" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-52 (BR-32)
describe("PATCH /api/admin/users/:id — edits fields, never touches password state", () => {
  it("updates name/email/role/isActive without changing passwordHash/mustChangePassword", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const target = await prisma.user.create({
      data: { name: "Before Edit", email: `before-edit-${Date.now()}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    });

    const res = await adminAgent.patch(`/api/admin/users/${target.id}`).send({ name: "After Edit", role: "IT_STAFF" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "After Edit", role: "IT_STAFF" });
    expect(res.body.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(stored.passwordHash).toBe(passwordHash);
    expect(stored.mustChangePassword).toBe(false);
  });

  it("rejects an id that doesn't exist", async () => {
    const res = await adminAgent.patch("/api/admin/users/99999999").send({ name: "Nobody" });
    expect(res.status).toBe(404);
  });

  it("rejects a duplicate email from another user", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const [a, b] = await Promise.all([
      prisma.user.create({ data: { name: "User A", email: `user-a-${Date.now()}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false } }),
      prisma.user.create({ data: { name: "User B", email: `user-b-${Date.now()}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false } }),
    ]);

    const res = await adminAgent.patch(`/api/admin/users/${b.id}`).send({ email: a.email });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_EMAIL");
  });
});
