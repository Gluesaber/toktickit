import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-04/tests.md §2.3 — server/tests/lab-04/actions-taken.api.test.ts (API-01..20).
// Every describe block that changes state works on its own freshly created Ticket, so no test
// depends on (or is broken by) another test's Actions — the Lab 2 shared-fixture lesson.

const FIXTURE_PASSWORD = "a-real-test-password-1";
type Agent = ReturnType<typeof request.agent>;

let staffA: Agent;
let staffB: Agent;
let adminAgent: Agent;
let requesterAgent: Agent;
let otherRequesterAgent: Agent;
let anonymous: ReturnType<typeof request>;
let staffAId: number;
let staffBId: number;
let inactiveStaffId: number;
let requesterUserId: number;
let categoryId: number;
let relatedSystemId: number;

async function createTicket(agent: Agent = requesterAgent): Promise<{ id: number; createdAt: string }> {
  const res = await agent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for Actions Taken tests",
    description: "Fixture ticket description for Actions Taken tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  expect(res.status).toBe(201);
  return res.body;
}

function validAction(overrides: Record<string, unknown> = {}) {
  return {
    clientRequestId: randomUUID(),
    actionAt: new Date().toISOString(),
    description: "Replaced the faulty RAM module (slot 2).",
    result: "Laptop boots normally; memory test passes.",
    status: "COMPLETED",
    ...overrides,
  };
}

async function createAction(ticketId: number, overrides: Record<string, unknown> = {}, agent: Agent = staffA) {
  const res = await agent.post(`/api/staff/tickets/${ticketId}/actions`).send(validAction(overrides));
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const make = (name: string, key: string, role: "IT_STAFF" | "ADMINISTRATOR" | "REQUESTER", isActive = true) =>
    prisma.user.create({
      data: { name, email: `actions-${key}-${unique}@example.test`, role, passwordHash, isActive, mustChangePassword: false },
    });

  const [a, b, admin, inactive, requester, otherRequester] = await Promise.all([
    make("Actions Staff A", "staff-a", "IT_STAFF"),
    make("Actions Staff B", "staff-b", "IT_STAFF"),
    make("Actions Admin", "admin", "ADMINISTRATOR"),
    make("Actions Inactive Staff", "inactive", "IT_STAFF", false),
    make("Actions Requester", "req", "REQUESTER"),
    make("Actions Other Requester", "req2", "REQUESTER"),
  ]);
  staffAId = a.id;
  staffBId = b.id;
  inactiveStaffId = inactive.id;
  requesterUserId = requester.id;

  staffA = request.agent(app);
  staffB = request.agent(app);
  adminAgent = request.agent(app);
  requesterAgent = request.agent(app);
  otherRequesterAgent = request.agent(app);
  anonymous = request(app);
  await Promise.all([
    staffA.post("/api/auth/login").send({ email: a.email, password: FIXTURE_PASSWORD }),
    staffB.post("/api/auth/login").send({ email: b.email, password: FIXTURE_PASSWORD }),
    adminAgent.post("/api/auth/login").send({ email: admin.email, password: FIXTURE_PASSWORD }),
    requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD }),
    otherRequesterAgent.post("/api/auth/login").send({ email: otherRequester.email, password: FIXTURE_PASSWORD }),
  ]);

  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

describe("API-01: a Requester can't create an Action (AC-04, BR-03)", () => {
  it("rejects with 403 even on the Requester's own Ticket, and creates nothing", async () => {
    const ticket = await createTicket();
    const res = await requesterAgent.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction());
    expect(res.status).toBe(403);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });
});

describe("API-02: a Requester can't edit an Action; no session gets 401 (AC-04, BR-03)", () => {
  it("rejects a Requester's edit with 403 and leaves the Action unchanged", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const res = await requesterAgent
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "Requester rewrite" });
    expect(res.status).toBe(403);
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.description).toBe(action.description);
  });

  it("rejects both endpoints with 401 without a session", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    expect((await anonymous.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction())).status).toBe(401);
    expect(
      (await anonymous.patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`).send({ version: 1 })).status
    ).toBe(401);
  });
});

describe("API-03: create a valid Actions Taken (AC-01, BR-01, BR-04)", () => {
  it("is saved under the correct Ticket with the authenticated creator and the approved assignee", async () => {
    const ticket = await createTicket();
    const res = await staffA
      .post(`/api/staff/tickets/${ticket.id}/actions`)
      .send(
        validAction({
          assigneeId: staffBId,
          performedById: staffBId, // forged — must be ignored (BR-04)
          followUpRequired: true,
          followUpNote: "Re-check in one week that the crash hasn't returned.",
          attachmentNotes: "See memtest-result.png on this ticket.",
        })
      );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ticketId: ticket.id,
      status: "COMPLETED",
      performedBy: { id: staffAId, role: "IT_STAFF" },
      assignee: { id: staffBId, role: "IT_STAFF", isActive: true },
      followUpRequired: true,
      attachmentNotes: "See memtest-result.png on this ticket.",
      version: 1,
      updatedBy: null,
    });
    expect(res.body).not.toHaveProperty("clientRequestId");

    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.ticketId).toBe(ticket.id);
    expect(stored.performedById).toBe(staffAId);
  });

  it("works identically for an Administrator (parity)", async () => {
    const ticket = await createTicket();
    const res = await adminAgent.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction());
    expect(res.status).toBe(201);
    expect(res.body.performedBy.role).toBe("ADMINISTRATOR");
  });
});

describe("API-04: the assignee defaults to the creator (BR-05)", () => {
  it("assigns the Action to the caller when assigneeId is omitted", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, {}, staffB);
    expect(action.assignee.id).toBe(staffBId);
    expect(action.performedBy.id).toBe(staffBId);
  });
});

describe("API-05: an invalid assignee is rejected (AC-05, BR-05)", () => {
  it.each([
    ["an inactive staff member", () => inactiveStaffId],
    ["a Requester", () => requesterUserId],
    ["an unknown user id", () => 99999999],
  ])("rejects %s on create with 400 INVALID_ASSIGNEE", async (_label, id) => {
    const ticket = await createTicket();
    const res = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction({ assigneeId: id() }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ASSIGNEE");
    expect(res.body.error.fields).toHaveProperty("assigneeId");
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(0);
  });

  it("rejects an inactive assignee on edit too, leaving the Action unchanged", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const res = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, assigneeId: inactiveStaffId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ASSIGNEE");
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.assigneeId).toBe(staffAId);
  });
});

describe("API-06: Follow-up Note is required only when follow-up is needed (AC-06, BR-09)", () => {
  it("rejects followUpRequired: true with a blank note", async () => {
    const ticket = await createTicket();
    const res = await staffA
      .post(`/api/staff/tickets/${ticket.id}/actions`)
      .send(validAction({ followUpRequired: true, followUpNote: "   " }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("followUpNote");
  });

  it("stores the note as null when follow-up isn't required", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { followUpRequired: false, followUpNote: "should be dropped" });
    expect(action.followUpNote).toBeNull();
  });
});

describe("API-07: Result is required once the Action is Completed (AC-07, BR-08)", () => {
  it("rejects creating a Completed Action with a blank result", async () => {
    const ticket = await createTicket();
    const res = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction({ result: "" }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("result");
  });

  it("checks the merged result on edit: completing needs a stored or sent result", async () => {
    const ticket = await createTicket();
    const noResult = await createAction(ticket.id, { status: "IN_PROGRESS", result: null });
    const rejected = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${noResult.id}`)
      .send({ version: noResult.version, status: "COMPLETED" });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.fields).toHaveProperty("result");

    const withResult = await createAction(ticket.id, { status: "IN_PROGRESS", result: "Driver reinstalled." });
    const accepted = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${withResult.id}`)
      .send({ version: withResult.version, status: "COMPLETED" });
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("COMPLETED");
  });
});

describe("API-08: Action Date/Time bounds (AC-08, BR-07)", () => {
  it("rejects a date before the Ticket was created", async () => {
    const ticket = await createTicket();
    const before = new Date(new Date(ticket.createdAt).getTime() - 2 * 60 * 1000).toISOString();
    const res = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction({ actionAt: before }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("actionAt");
  });

  it("rejects a Completed Action dated 10 minutes in the future", async () => {
    const ticket = await createTicket();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction({ actionAt: future }));
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty("actionAt");
  });

  it("accepts a Planned Action scheduled 30 days ahead", async () => {
    const ticket = await createTicket();
    const ahead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await createAction(ticket.id, { status: "PLANNED", result: null, actionAt: ahead });
  });
});

describe("API-09: field-length and create-status rules (BR-08, BR-10)", () => {
  it.each([
    ["a blank description", { description: "   " }, "description"],
    ["a 2001-character description", { description: "x".repeat(2001) }, "description"],
    ["501-character attachment notes", { attachmentNotes: "x".repeat(501) }, "attachmentNotes"],
    ["status CANCELLED at creation", { status: "CANCELLED" }, "status"],
    ["a missing clientRequestId", { clientRequestId: undefined }, "clientRequestId"],
  ])("rejects %s with 400 and the field named", async (_label, overrides, field) => {
    const ticket = await createTicket();
    const res = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.fields).toHaveProperty(field);
  });
});

describe("API-10: another staff member can edit a non-locked Action (AC-09, BR-06)", () => {
  it("records the editor in updatedBy, keeps performedBy, and increments version", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const res = await staffB
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "Replace RAM module and run a memory test." });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      description: "Replace RAM module and run a memory test.",
      performedBy: { id: staffAId },
      updatedBy: { id: staffBId },
      version: action.version + 1,
    });
  });
});

describe("API-11: Completed and Cancelled Actions are locked (AC-10, BR-10)", () => {
  it("rejects any edit to a Completed Action with 409 ACTION_LOCKED", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id);
    const res = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "Rewriting history" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_LOCKED");
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.description).toBe(action.description);
  });

  it("rejects any edit to a Cancelled Action with 409 ACTION_LOCKED", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const cancelled = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    const res = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: cancelled.body.version, status: "PLANNED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_LOCKED");
  });
});

describe("API-12: Action status lifecycle (AC-11, §5.3)", () => {
  it("moves Planned -> In Progress -> Completed, and Planned -> Cancelled", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const started = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, status: "IN_PROGRESS" });
    expect(started.body.status).toBe("IN_PROGRESS");
    const done = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: started.body.version, status: "COMPLETED", result: "Fixed." });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("COMPLETED");

    const other = await createAction(ticket.id, { status: "PLANNED", result: null });
    const cancelled = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${other.id}`)
      .send({ version: other.version, status: "CANCELLED" });
    expect(cancelled.body.status).toBe("CANCELLED");
  });

  it("rejects In Progress -> Planned with 409 ACTION_TRANSITION_NOT_PERMITTED", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "IN_PROGRESS", result: null });
    const res = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, status: "PLANNED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTION_TRANSITION_NOT_PERMITTED");
  });
});

describe("API-13: different staff record Actions on one Ticket, in stable order (AC-12, BR-02, BR-13)", () => {
  it("lists every Action by actionAt then id, each with its own performer and assignee, for staff and Requester", async () => {
    const ticket = await createTicket();
    await staffA.patch(`/api/staff/tickets/${ticket.id}/owner`).send({ ownerId: staffAId });

    // Planned, so dates ahead of "now" are allowed (BR-07) and the order can be set freely.
    const base = new Date(ticket.createdAt).getTime() + 60 * 60 * 1000;
    const at = (minutes: number) => new Date(base + minutes * 60 * 1000).toISOString();
    const planned = { status: "PLANNED", result: null };
    const late = await createAction(ticket.id, { ...planned, actionAt: at(30), description: "Late step by B" }, staffB);
    const tieFirst = await createAction(ticket.id, { ...planned, actionAt: at(10), description: "Tie 1 by A", assigneeId: staffBId });
    const tieSecond = await createAction(ticket.id, { ...planned, actionAt: at(10), description: "Tie 2 by B" }, staffB);

    const staffView = await staffA.get(`/api/staff/tickets/${ticket.id}`);
    expect(staffView.status).toBe(200);
    expect(staffView.body.actions.map((a: { id: number }) => a.id)).toEqual([tieFirst.id, tieSecond.id, late.id]);
    const byId = Object.fromEntries(staffView.body.actions.map((a: { id: number }) => [a.id, a]));
    expect(byId[tieFirst.id]).toMatchObject({ performedBy: { id: staffAId }, assignee: { id: staffBId } });
    expect(byId[late.id]).toMatchObject({ performedBy: { id: staffBId }, assignee: { id: staffBId } });
    expect(staffView.body.owner.id).toBe(staffAId); // the owner coordinates; others still record work

    const requesterView = await requesterAgent.get(`/api/tickets/${ticket.id}`);
    expect(requesterView.body.actions.map((a: { id: number }) => a.id)).toEqual([tieFirst.id, tieSecond.id, late.id]);
  });
});

describe("API-14: no Actions on a Closed or Cancelled Ticket (AC-13, BR-12)", () => {
  it.each(["CLOSED", "CANCELLED"] as const)("rejects create and edit on a %s Ticket with 409 TICKET_NOT_ACTIONABLE", async (status) => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    // Set directly: reaching Closed through the workflow needs Issue 4-3's history/gate plumbing,
    // which isn't what this rule is about.
    await getPrisma().ticket.update({ where: { id: ticket.id }, data: { currentStatus: status } });

    const create = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(validAction());
    expect(create.status).toBe(409);
    expect(create.body.error.code).toBe("TICKET_NOT_ACTIONABLE");

    const edit = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "Too late" });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("TICKET_NOT_ACTIONABLE");

    const view = await staffA.get(`/api/staff/tickets/${ticket.id}`);
    expect(view.body.actions).toHaveLength(1); // still readable at every status
  });
});

describe("API-15: a repeated create returns the same Action (AC-14, BR-14)", () => {
  it("answers a sequential retry with 200 and the original Action", async () => {
    const ticket = await createTicket();
    const body = validAction();
    const first = await staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(body);
    const retry = await staffA
      .post(`/api/staff/tickets/${ticket.id}/actions`)
      .send({ ...body, description: "A changed body must not be applied on retry" });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(first.body.id);
    expect(retry.body.description).toBe(first.body.description);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("creates exactly one row from two parallel identical requests, never a 500", async () => {
    const ticket = await createTicket();
    const body = validAction();
    const responses = await Promise.all([
      staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(body),
      staffA.post(`/api/staff/tickets/${ticket.id}/actions`).send(body),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.id).toBe(responses[1].body.id);
    expect(await getPrisma().actionTaken.count({ where: { ticketId: ticket.id } })).toBe(1);
  });

  it("treats the same clientRequestId on a different Ticket as a new Action", async () => {
    const [t1, t2] = [await createTicket(), await createTicket()];
    const body = validAction();
    expect((await staffA.post(`/api/staff/tickets/${t1.id}/actions`).send(body)).status).toBe(201);
    expect((await staffA.post(`/api/staff/tickets/${t2.id}/actions`).send(body)).status).toBe(201);
  });
});

describe("API-16: Actions can't be deleted (AC-16, BR-11)", () => {
  it.each([
    ["IT Staff", () => staffA],
    ["Administrator", () => adminAgent],
  ])("returns 404 for a DELETE by %s and keeps the row", async (_label, agent) => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id);
    const res = await agent().delete(`/api/staff/tickets/${ticket.id}/actions/${action.id}`);
    expect(res.status).toBe(404);
    expect(await getPrisma().actionTaken.findUnique({ where: { id: action.id } })).not.toBeNull();
  });
});

describe("API-17: an Action must belong to the Ticket in the path (BR-01)", () => {
  it("returns 404 when the actionId belongs to another Ticket", async () => {
    const [t1, t2] = [await createTicket(), await createTicket()];
    const action = await createAction(t1.id, { status: "PLANNED", result: null });
    const res = await staffA
      .patch(`/api/staff/tickets/${t2.id}/actions/${action.id}`)
      .send({ version: action.version, description: "Cross-ticket edit" });
    expect(res.status).toBe(404);
  });
});

describe("API-18: stale Action edits are detected (AC-24, BR-23, BR-24)", () => {
  it("rejects an outdated version with 409 STALE_UPDATE and returns the current Action", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const winner = await staffB
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "B got here first" });
    expect(winner.status).toBe(200);

    const loser = await staffA
      .patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`)
      .send({ version: action.version, description: "A overwrites B?" });
    expect(loser.status).toBe(409);
    expect(loser.body.error.code).toBe("STALE_UPDATE");
    expect(loser.body.error.current).toMatchObject({ id: action.id, description: "B got here first", version: 2 });
  });

  it("lets exactly one of two parallel edits with the same version through", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    const responses = await Promise.all([
      staffA.patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`).send({ version: 1, description: "Edit one" }),
      staffB.patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`).send({ version: 1, description: "Edit two" }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const stored = await getPrisma().actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect(stored.version).toBe(2);
  });

  it("rejects a missing or malformed version with 400", async () => {
    const ticket = await createTicket();
    const action = await createAction(ticket.id, { status: "PLANNED", result: null });
    for (const body of [{ description: "no version" }, { version: "1", description: "string version" }]) {
      const res = await staffA.patch(`/api/staff/tickets/${ticket.id}/actions/${action.id}`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty("version");
    }
  });
});

describe("API-19: the Requester sees Actions on their own Ticket only (AC-15, BR-15)", () => {
  it("returns the full Action shape on the Requester's own Ticket, without Internal Notes", async () => {
    const ticket = await createTicket();
    await createAction(ticket.id, { followUpRequired: true, followUpNote: "Check again Friday.", attachmentNotes: "photo-1.jpg" });
    await staffA.post(`/api/staff/tickets/${ticket.id}/notes`).send({ content: "Internal only." });

    const res = await requesterAgent.get(`/api/tickets/${ticket.id}`);
    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.actions[0]).toMatchObject({
      followUpNote: "Check again Friday.",
      attachmentNotes: "photo-1.jpg",
      performedBy: { id: staffAId },
      assignee: { id: staffAId },
    });
    expect(res.body).not.toHaveProperty("notes");
    expect(res.body).not.toHaveProperty("seedKey");
  });

  it("returns 404 for another Requester's Ticket", async () => {
    const ticket = await createTicket();
    await createAction(ticket.id);
    const res = await otherRequesterAgent.get(`/api/tickets/${ticket.id}`);
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("actions");
  });
});

describe("API-20: creating an Action is activity but not a workflow change (BR-25, BR-26)", () => {
  it("advances Ticket.updatedAt and leaves Ticket.version unchanged", async () => {
    const ticket = await createTicket();
    const before = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    await new Promise((r) => setTimeout(r, 20));
    await createAction(ticket.id);
    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.version).toBe(before.version);
  });
});
