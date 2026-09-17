import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-03/tests.md — server/tests/lab-03/comments-notes.api.test.ts (API-41..44).
// Also covers the Issue 3-5 widening of POST/GET /api/tickets/:id/comments to IT Staff/
// Administrator on any ticket (specification.md §5.1), and BR-29/AC-04's "Requester never reaches
// Internal Notes" rule.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let staffAgent: ReturnType<typeof request.agent>;
let requesterAgent: ReturnType<typeof request.agent>;
let ticketId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);

  const [staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: "Comments Notes Test Staffer", email: `comments-notes-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, isActive: true, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Comments Notes Test Requester", email: `comments-notes-req-${unique}@example.test`, role: "REQUESTER", passwordHash, isActive: true, mustChangePassword: false },
    }),
  ]);

  staffAgent = request.agent(app);
  requesterAgent = request.agent(app);
  await Promise.all([
    staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD }),
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
  ]);

  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const relatedSystem = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
  const createRes = await requesterAgent.post("/api/tickets").send({
    categoryId: category.id,
    relatedSystemId: relatedSystem.id,
    summary: "Fixture ticket for Comments/Notes tests",
    description: "Fixture ticket description for Comments/Notes tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  ticketId = createRes.body.id;
});

// API-41 (AC-24, BR-04)
describe("POST /api/staff/tickets/:id/notes", () => {
  it("posts a note as IT Staff, visible on the staff GET, absent from the Requester's own ticket view", async () => {
    const res = await staffAgent.post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "Vendor ticket opened, ETA Thursday." });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: "Vendor ticket opened, ETA Thursday." });
    expect(res.body.author.role).toBe("IT_STAFF");

    const staffList = await staffAgent.get(`/api/staff/tickets/${ticketId}/notes`);
    expect(staffList.status).toBe(200);
    expect(staffList.body.some((n: { content: string }) => n.content === "Vendor ticket opened, ETA Thursday.")).toBe(true);

    // api-spec.md §2: `notes` is never included in this response shape, at any status.
    const requesterView = await requesterAgent.get(`/api/tickets/${ticketId}`);
    expect(requesterView.status).toBe(200);
    expect(requesterView.body.notes).toBeUndefined();
  });
});

// API-42 (BR-26)
describe("POST /api/staff/tickets/:id/notes — validation", () => {
  it("rejects blank/whitespace-only content", async () => {
    const res = await staffAgent.post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects content over 2000 characters", async () => {
    const res = await staffAgent.post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "x".repeat(2001) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

// API-43 (BR-27) — append-only: no edit/delete route exists for either model.
describe("Comments/Notes are append-only", () => {
  it("no PATCH/DELETE route exists for a Comment", async () => {
    const comment = await requesterAgent.post(`/api/tickets/${ticketId}/comments`).send({ content: "Original comment." });
    expect((await requesterAgent.patch(`/api/tickets/${ticketId}/comments/${comment.body.id}`).send({ content: "Edited." })).status).toBe(404);
    expect((await requesterAgent.delete(`/api/tickets/${ticketId}/comments/${comment.body.id}`)).status).toBe(404);
  });

  it("no PATCH/DELETE route exists for a Note", async () => {
    const note = await staffAgent.post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "Original note." });
    expect((await staffAgent.patch(`/api/staff/tickets/${ticketId}/notes/${note.body.id}`).send({ content: "Edited." })).status).toBe(404);
    expect((await staffAgent.delete(`/api/staff/tickets/${ticketId}/notes/${note.body.id}`)).status).toBe(404);
  });
});

// API-44 (BR-04)
describe("GET /api/tickets/:id/comments — IT Staff, not ownership-restricted", () => {
  it("returns the full list even though the caller doesn't own the ticket", async () => {
    await requesterAgent.post(`/api/tickets/${ticketId}/comments`).send({ content: "Requester comment for API-44." });
    const res = await staffAgent.get(`/api/tickets/${ticketId}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.some((c: { content: string }) => c.content === "Requester comment for API-44.")).toBe(true);
  });
});

describe("POST /api/tickets/:id/comments — IT Staff on any ticket", () => {
  it("posts successfully on a ticket the staff member doesn't own", async () => {
    const res = await staffAgent.post(`/api/tickets/${ticketId}/comments`).send({ content: "Staff public reply." });
    expect(res.status).toBe(201);
    expect(res.body.author.role).toBe("IT_STAFF");
  });
});

describe("Internal Notes stay hidden from a Requester (BR-29, AC-04)", () => {
  it("rejects POST with 403, no note content leaked into the response", async () => {
    const res = await requesterAgent.post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "Trying to post a note." });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(res.body)).not.toContain("Trying to post a note");
  });

  it("rejects GET with 403", async () => {
    const res = await requesterAgent.get(`/api/staff/tickets/${ticketId}/notes`);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated caller with 401 on both routes", async () => {
    expect((await request(app).post(`/api/staff/tickets/${ticketId}/notes`).send({ content: "x" })).status).toBe(401);
    expect((await request(app).get(`/api/staff/tickets/${ticketId}/notes`)).status).toBe(401);
  });
});
