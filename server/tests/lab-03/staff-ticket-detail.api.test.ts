import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/staff-ticket-detail.api.test.ts (API-34..40).
// Covers claim/reassign ownership, IT Priority, and the staff side of the shared
// PATCH /api/tickets/:id/status endpoint. The Requester's own Cancel case (API-56/57, AC-25) lives
// in requester-regression.api.test.ts instead, matching where every other Requester-specific
// assertion lives — this file stays Staff/Administrator-focused throughout.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let staffAgent: ReturnType<typeof request.agent>;
let otherStaffAgent: ReturnType<typeof request.agent>;
let requesterAgent: ReturnType<typeof request.agent>;
let categoryId: number;
let relatedSystemId: number;
let staffId: number;
let otherStaffId: number;
let inactiveStaffId: number;
let requesterUserId: number;

async function createTicket(overrides: Record<string, unknown> = {}) {
  const res = await requesterAgent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for Staff Ticket Detail tests",
    description: "Fixture ticket description for Staff Ticket Detail tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
    ...overrides,
  });
  return res.body as { id: number };
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [staff, otherStaff, inactiveStaff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: "Detail Test Staffer", email: `detail-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Detail Test Other Staffer", email: `detail-other-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Detail Test Inactive Staffer", email: `detail-inactive-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: false, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Detail Test Requester", email: `detail-req-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);
  staffId = staff.id;
  otherStaffId = otherStaff.id;
  inactiveStaffId = inactiveStaff.id;
  requesterUserId = requester.id;

  staffAgent = request.agent(app);
  otherStaffAgent = request.agent(app);
  requesterAgent = request.agent(app);
  await Promise.all([
    staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD }),
    otherStaffAgent.post("/api/auth/login").send({ email: otherStaff.email, password: FIXTURE_PASSWORD }),
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
  ]);

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

// Not a labsheet-planned ID — GET /api/staff/users is a small addition beyond api-spec.md's original
// §6 draft, added to unblock ui-spec.md §7.1's Reassign picker (see app.ts's comment above the route).
describe("GET /api/staff/users", () => {
  it("returns only active IT Staff/Administrator users, never a Requester or an inactive user", async () => {
    const res = await staffAgent.get("/api/staff/users");
    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: number }) => u.id);
    expect(ids).toContain(staffId);
    expect(ids).toContain(otherStaffId);
    expect(ids).not.toContain(inactiveStaffId);
    expect(ids).not.toContain(requesterUserId);
    for (const u of res.body) {
      expect(["IT_STAFF", "ADMINISTRATOR"]).toContain(u.role);
    }
  });

  it("rejects a Requester with 403", async () => {
    const res = await requesterAgent.get("/api/staff/users");
    expect(res.status).toBe(403);
  });
});

// API-34 (AC-20, BR-19, BR-20)
describe("PATCH /api/staff/tickets/:id/owner — claim", () => {
  it("claims an unassigned ticket for the caller", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: staffId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ticket.id, owner: { id: staffId, role: "IT_STAFF" } });
  });
});

// API-35 (AC-21)
describe("PATCH /api/staff/tickets/:id/owner — reassign", () => {
  it("reassigns an already-owned ticket to a different active IT Staff member, even from a non-owner caller", async () => {
    const ticket = await createTicket();
    await staffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: staffId });

    // BR-20: no "must be current owner to reassign" restriction — otherStaffAgent isn't the current
    // owner and can still reassign.
    const res = await otherStaffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: otherStaffId });
    expect(res.status).toBe(200);
    expect(res.body.owner).toMatchObject({ id: otherStaffId, role: "IT_STAFF" });
  });
});

// API-36 (BR-19)
describe("PATCH /api/staff/tickets/:id/owner — invalid target", () => {
  it("rejects a Requester id with 400 INVALID_OWNER", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: requesterUserId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_OWNER");
  });

  it("rejects an inactive IT Staff id with 400 INVALID_OWNER", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: inactiveStaffId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_OWNER");
  });

  it("rejects a missing/non-numeric ownerId with 400 VALIDATION_ERROR", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an id for a Ticket that doesn't exist with 404", async () => {
    const res = await staffAgent.patch("/api/staff/tickets/99999999/owner").send({ ownerId: staffId });
    expect(res.status).toBe(404);
  });
});

// API-37 (AC-23, BR-21, BR-22)
describe("PATCH /api/staff/tickets/:id/priority", () => {
  it("updates itPriority without touching requestedPriority, regardless of Current Status", async () => {
    const ticket = await createTicket({ requestedPriority: "LOW" });
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/priority`).send({ itPriority: "URGENT" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: ticket.id, itPriority: "URGENT" });

    const detail = await staffAgent.get(`/api/staff/tickets/${ticket.id}`);
    expect(detail.body.requestedPriority).toBe("LOW");
    expect(detail.body.itPriority).toBe("URGENT");
  });

  it("rejects a value outside LOW|MEDIUM|HIGH|URGENT", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/staff/tickets/${ticket.id}/priority`).send({ itPriority: "SUPER_URGENT" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-38 (AC-22, BR-23)
describe("PATCH /api/tickets/:id/status — illegal transition", () => {
  it("rejects New -> Resolved directly with 409 TRANSITION_NOT_PERMITTED", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/tickets/${ticket.id}/status`).send({ status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSITION_NOT_PERMITTED");
  });

  it("rejects an unrecognized status value with 400 VALIDATION_ERROR", async () => {
    const ticket = await createTicket();
    const res = await staffAgent.patch(`/api/tickets/${ticket.id}/status`).send({ status: "NOT_A_REAL_STATUS" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-39 (§5.2)
describe("PATCH /api/tickets/:id/status — every permitted staff transition succeeds", () => {
  it("walks New through the full forward chain back to In Progress", async () => {
    const ticket = await createTicket();
    const path = ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "IN_PROGRESS"];
    for (const status of path) {
      const res = await staffAgent.patch(`/api/tickets/${ticket.id}/status`).send({ status });
      expect(res.status).toBe(200);
      expect(res.body.currentStatus).toBe(status);
    }
  });

  it("also allows Cancelled from Open, In Progress, and Waiting for Requester", async () => {
    const prisma = getPrisma();
    for (const startStatus of ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"] as const) {
      const ticket = await createTicket();
      await prisma.ticket.update({ where: { id: ticket.id }, data: { currentStatus: startStatus } });
      const res = await staffAgent.patch(`/api/tickets/${ticket.id}/status`).send({ status: "CANCELLED" });
      expect(res.status).toBe(200);
      expect(res.body.currentStatus).toBe("CANCELLED");
    }
  });

  // API-17 (AC-26, §11) — Administrator has full parity across every 3-5 staff endpoint.
  it("an Administrator can claim, set priority, change status, and post a note identically to IT Staff", async () => {
    const prisma = getPrisma();
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const admin = await prisma.user.create({
      data: { name: "Detail Test Admin", email: `detail-admin-${Date.now()}@example.test`, role: "ADMINISTRATOR", passwordHash, isActive: true, mustChangePassword: false },
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login").send({ email: admin.email, password: FIXTURE_PASSWORD });

    const ticket = await createTicket();
    expect((await adminAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: admin.id })).status).toBe(200);
    expect((await adminAgent.patch(`/api/staff/tickets/${ticket.id}/priority`).send({ itPriority: "HIGH" })).status).toBe(200);
    expect((await adminAgent.patch(`/api/tickets/${ticket.id}/status`).send({ status: "OPEN" })).status).toBe(200);
    expect((await adminAgent.post(`/api/staff/tickets/${ticket.id}/notes`).send({ content: "Admin parity note." })).status).toBe(201);
  });
});

// API-40
describe("GET /api/staff/tickets/:id", () => {
  it("returns notes[] and the full requester object", async () => {
    const ticket = await createTicket();
    await staffAgent.post(`/api/staff/tickets/${ticket.id}/notes`).send({ content: "Internal note for API-40." });

    const res = await staffAgent.get(`/api/staff/tickets/${ticket.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.notes)).toBe(true);
    expect(res.body.notes.some((n: { content: string }) => n.content === "Internal note for API-40.")).toBe(true);
    expect(res.body.requester).toMatchObject({
      id: requesterUserId,
      name: expect.any(String),
      email: expect.any(String),
    });
  });

  it("is available for any ticket, not ownership- or claim-restricted", async () => {
    const ticket = await createTicket();
    const res = await otherStaffAgent.get(`/api/staff/tickets/${ticket.id}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for a ticket that doesn't exist", async () => {
    const res = await staffAgent.get("/api/staff/tickets/99999999");
    expect(res.status).toBe(404);
  });
});

describe("Staff-only endpoints reject non-staff callers", () => {
  it("GET detail: Requester gets 403, no session gets 401", async () => {
    const ticket = await createTicket();
    expect((await requesterAgent.get(`/api/staff/tickets/${ticket.id}`)).status).toBe(403);
    expect((await request(app).get(`/api/staff/tickets/${ticket.id}`)).status).toBe(401);
  });

  it("owner: Requester gets 403, no session gets 401", async () => {
    const ticket = await createTicket();
    const forbidden = await requesterAgent.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: staffId });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe("FORBIDDEN");
    expect((await request(app).patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: staffId })).status).toBe(401);
  });

  it("priority: Requester gets 403", async () => {
    const ticket = await createTicket();
    const res = await requesterAgent.patch(`/api/staff/tickets/${ticket.id}/priority`).send({ itPriority: "HIGH" });
    expect(res.status).toBe(403);
  });
});
