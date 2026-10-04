import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";
import { formatTicketNumber } from "../../src/ticketNumber.js";
import { LAB4_MATRIX } from "./specMatrix.js";

// docs/lab-04/tests.md §2.4 — server/tests/lab-04/ticket-workflow.api.test.ts (API-21..33).
// Each test creates its own Ticket(s); nothing here depends on another test's state.

const FIXTURE_PASSWORD = "a-real-test-password-1";
type Agent = ReturnType<typeof request.agent>;

let staff: Agent;
let otherStaff: Agent;
let admin: Agent;
let requester: Agent;
let staffId: number;
let otherStaffId: number;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const make = (name: string, key: string, role: "IT_STAFF" | "ADMINISTRATOR" | "REQUESTER") =>
    prisma.user.create({
      data: { name, email: `workflow-${key}-${unique}@example.test`, role, passwordHash, mustChangePassword: false },
    });
  const [s, o, a, r] = await Promise.all([
    make("Workflow Staff", "staff", "IT_STAFF"),
    make("Workflow Other Staff", "staff2", "IT_STAFF"),
    make("Workflow Admin", "admin", "ADMINISTRATOR"),
    make("Workflow Requester", "req", "REQUESTER"),
  ]);
  staffId = s.id;
  otherStaffId = o.id;
  requesterId = r.id;
  staff = request.agent(app);
  otherStaff = request.agent(app);
  admin = request.agent(app);
  requester = request.agent(app);
  await Promise.all([
    staff.post("/api/auth/login").send({ email: s.email, password: FIXTURE_PASSWORD }),
    otherStaff.post("/api/auth/login").send({ email: o.email, password: FIXTURE_PASSWORD }),
    admin.post("/api/auth/login").send({ email: a.email, password: FIXTURE_PASSWORD }),
    requester.post("/api/auth/login").send({ email: r.email, password: FIXTURE_PASSWORD }),
  ]);
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
});

async function createTicket(): Promise<{ id: number; version: number }> {
  const res = await requester.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "Fixture ticket for workflow tests",
    description: "Fixture ticket description for workflow tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  expect(res.status).toBe(201);
  return res.body;
}

// Puts a fresh Ticket straight into `status` (bypassing the workflow) so each matrix row can be
// tested on its own. Returns the version a client would currently hold.
async function ticketAt(status: TicketStatus): Promise<{ id: number; version: number }> {
  const t = await createTicket();
  const updated = await getPrisma().ticket.update({ where: { id: t.id }, data: { currentStatus: status } });
  return { id: t.id, version: updated.version };
}

async function version(ticketId: number): Promise<number> {
  return (await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } })).version;
}

async function addAction(ticketId: number, status: "PLANNED" | "IN_PROGRESS" | "COMPLETED", agent: Agent = staff) {
  const res = await agent.post(`/api/staff/tickets/${ticketId}/actions`).send({
    clientRequestId: randomUUID(),
    actionAt: new Date().toISOString(),
    description: `A ${status.toLowerCase()} action`,
    result: status === "COMPLETED" ? "Done." : null,
    status,
  });
  expect(res.status).toBe(201);
  return res.body;
}

function setStatus(agent: Agent, ticketId: number, status: TicketStatus, v: number) {
  return agent.patch(`/api/tickets/${ticketId}/status`).send({ status, version: v });
}

describe("API-21: the resolution gate (AC-17, BR-17)", () => {
  it.each(["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as TicketStatus[])(
    "refuses %s -> Resolved with no Actions, and with only Planned/Cancelled ones",
    async (from) => {
      const t = await ticketAt(from);
      const none = await setStatus(staff, t.id, "RESOLVED", t.version);
      expect(none.status).toBe(409);
      expect(none.body.error.code).toBe("RESOLUTION_REQUIRES_COMPLETED_ACTION");

      await addAction(t.id, "PLANNED");
      const planned = await addAction(t.id, "PLANNED");
      await staff.patch(`/api/staff/tickets/${t.id}/actions/${planned.id}`).send({ version: planned.version, status: "CANCELLED" });
      await addAction(t.id, "IN_PROGRESS");
      const stillNo = await setStatus(staff, t.id, "RESOLVED", t.version);
      expect(stillNo.status).toBe(409);
      expect(stillNo.body.error.code).toBe("RESOLUTION_REQUIRES_COMPLETED_ACTION");

      const stored = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
      expect(stored.currentStatus).toBe(from);
      expect(await getPrisma().ticketStatusHistory.count({ where: { ticketId: t.id, toStatus: "RESOLVED" } })).toBe(0);
    }
  );
});

describe("API-22: record a Completed Action, then resolve (AC-03)", () => {
  it("resolves, bumps version and records In Progress -> Resolved by the caller", async () => {
    const t = await ticketAt("IN_PROGRESS");
    await addAction(t.id, "COMPLETED");
    const res = await setStatus(staff, t.id, "RESOLVED", t.version);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, currentStatus: "RESOLVED", version: t.version + 1 });

    const last = await getPrisma().ticketStatusHistory.findFirstOrThrow({
      where: { ticketId: t.id },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    });
    expect(last).toMatchObject({ fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", changedById: staffId });
  });
});

describe("API-23: every permitted transition succeeds through the endpoint (AC-18, §5.2)", () => {
  const cases = LAB4_MATRIX.flatMap((row) => row.roles.map((role) => [row.from, row.to, role] as const));

  it.each(cases)("%s -> %s as %s", async (from, to, role) => {
    const agent = role === "REQUESTER" ? requester : role === "ADMINISTRATOR" ? admin : staff;
    const t = await ticketAt(from);
    if (to === "RESOLVED") await addAction(t.id, "COMPLETED");
    const res = await setStatus(agent, t.id, to, await version(t.id));
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe(to);
  });
});

describe("API-24: transitions outside the matrix are refused (AC-18, BR-16)", () => {
  it.each([
    ["NEW", "RESOLVED"],
    ["CLOSED", "IN_PROGRESS"],
    ["CANCELLED", "OPEN"],
    ["CANCELLED", "REOPENED"],
    ["REOPENED", "WAITING_FOR_REQUESTER"],
    ["RESOLVED", "IN_PROGRESS"],
  ] as [TicketStatus, TicketStatus][])("%s -> %s gets 409 TRANSITION_NOT_PERMITTED", async (from, to) => {
    const t = await ticketAt(from);
    // Make sure the gate can't be the reason for a refusal (Closed/Cancelled Tickets take no Actions).
    if (from !== "CLOSED" && from !== "CANCELLED") await addAction(t.id, "COMPLETED");
    const res = await setStatus(staff, t.id, to, await version(t.id));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSITION_NOT_PERMITTED");
  });
});

describe("API-25: append-only status history (AC-19, BR-20)", () => {
  it("starts with a creation entry, adds one row per change, and shows the same timeline to Requester and staff", async () => {
    const t = await createTicket();
    expect(t.version).toBe(1);
    let v = t.version;
    for (const to of ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"] as TicketStatus[]) {
      const res = await setStatus(staff, t.id, to, v);
      expect(res.status).toBe(200);
      v = res.body.version;
    }

    const staffView = await staff.get(`/api/staff/tickets/${t.id}`);
    const requesterView = await requester.get(`/api/tickets/${t.id}`);
    const steps = (h: { fromStatus: string | null; toStatus: string }[]) => h.map((e) => `${e.fromStatus}->${e.toStatus}`);
    expect(steps(staffView.body.statusHistory)).toEqual([
      "null->NEW",
      "NEW->OPEN",
      "OPEN->IN_PROGRESS",
      "IN_PROGRESS->WAITING_FOR_REQUESTER",
    ]);
    expect(requesterView.body.statusHistory).toEqual(staffView.body.statusHistory);
    expect(staffView.body.statusHistory[0].changedBy.id).toBe(requesterId);
    expect(staffView.body.statusHistory[1].changedBy).toMatchObject({ id: staffId, role: "IT_STAFF" });
  });

  it("does not write history for owner or IT Priority changes", async () => {
    const t = await createTicket();
    await staff.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staffId, version: 1 });
    await staff.patch(`/api/staff/tickets/${t.id}/priority`).send({ itPriority: "HIGH", version: 2 });
    expect(await getPrisma().ticketStatusHistory.count({ where: { ticketId: t.id } })).toBe(1);
  });
});

describe("API-26: history can't be edited or deleted (AC-19, BR-20)", () => {
  it("has no route that modifies or removes a history entry", async () => {
    const t = await ticketAt("NEW");
    const entry = await getPrisma().ticketStatusHistory.findFirstOrThrow({ where: { ticketId: t.id } });
    const paths = [
      `/api/tickets/${t.id}/status-history/${entry.id}`,
      `/api/tickets/${t.id}/history/${entry.id}`,
      `/api/staff/tickets/${t.id}/status-history/${entry.id}`,
      `/api/staff/tickets/${t.id}/history/${entry.id}`,
    ];
    for (const path of paths) {
      expect((await admin.delete(path)).status).toBe(404);
      expect((await admin.patch(path).send({ toStatus: "CLOSED" })).status).toBe(404);
      expect((await admin.put(path).send({ toStatus: "CLOSED" })).status).toBe(404);
    }
    const unchanged = await getPrisma().ticketStatusHistory.findUniqueOrThrow({ where: { id: entry.id } });
    expect(unchanged).toEqual(entry);
  });
});

describe("API-27: the Requester's indication is advisory and clears when work resumes (AC-20, BR-18)", () => {
  it("is kept through Waiting and Resolved/Closed, and cleared by In Progress and Reopened", async () => {
    const t = await createTicket();
    const indication = async () =>
      (await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } })).requesterConfirmedResolvedAt;
    const mark = async () => expect((await requester.patch(`/api/tickets/${t.id}/resolved-indication`)).status).toBe(200);
    const move = async (to: TicketStatus) => {
      const res = await setStatus(staff, t.id, to, await version(t.id));
      expect(res.status).toBe(200);
      return res.body;
    };

    await move("OPEN");
    await mark();
    const intoProgress = await move("IN_PROGRESS");
    expect(intoProgress.requesterConfirmedResolvedAt).toBeNull();

    await mark();
    await move("WAITING_FOR_REQUESTER");
    expect(await indication()).not.toBeNull();
    await move("IN_PROGRESS");
    expect(await indication()).toBeNull();

    await mark();
    await addAction(t.id, "COMPLETED");
    const resolved = await move("RESOLVED");
    expect(resolved.requesterConfirmedResolvedAt).not.toBeNull(); // advisory: never changes status itself, and isn't cleared by Resolved
    await move("CLOSED");
    expect(await indication()).not.toBeNull();
    const reopened = await move("REOPENED");
    expect(reopened.requesterConfirmedResolvedAt).toBeNull();
  });
});

describe("API-28: a Requester can't Resolve, Close or Reopen (AC-21, BR-19)", () => {
  it.each(["REOPENED", "RESOLVED", "CLOSED"] as TicketStatus[])("refuses %s on the Requester's own Resolved Ticket", async (to) => {
    const t = await ticketAt("RESOLVED");
    const res = await setStatus(requester, t.id, to, t.version);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSITION_NOT_PERMITTED");
  });
});

describe("API-29: stale workflow writes are refused (AC-22, BR-22)", () => {
  it("refuses an outdated version on status, owner and priority, changing nothing", async () => {
    const t = await createTicket();
    const fresh = await setStatus(otherStaff, t.id, "OPEN", 1);
    expect(fresh.status).toBe(200);

    const before = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    const stale = [
      await setStatus(staff, t.id, "CANCELLED", 1),
      await staff.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staffId, version: 1 }),
      await staff.patch(`/api/staff/tickets/${t.id}/priority`).send({ itPriority: "URGENT", version: 1 }),
    ];
    for (const res of stale) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("STALE_UPDATE");
      expect(res.body.error.current).toMatchObject({ id: t.id, currentStatus: "OPEN", version: 2 });
    }
    const after = await getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after).toEqual(before);
  });

  it("returns the new version from owner and priority changes, so the next write can use it", async () => {
    const t = await createTicket();
    const owner = await staff.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: otherStaffId, version: 1 });
    expect(owner.body).toMatchObject({ owner: { id: otherStaffId }, version: 2 });
    const priority = await staff.patch(`/api/staff/tickets/${t.id}/priority`).send({ itPriority: "LOW", version: owner.body.version });
    expect(priority.body).toMatchObject({ itPriority: "LOW", version: 3 });
  });
});

describe("API-30: two simultaneous status changes on the same version (AC-23, BR-24)", () => {
  it("lets exactly one through and writes exactly one history row", async () => {
    const t = await createTicket();
    const responses = await Promise.all([setStatus(staff, t.id, "OPEN", 1), setStatus(otherStaff, t.id, "CANCELLED", 1)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(responses.find((r) => r.status === 409)!.body.error.code).toBe("STALE_UPDATE");
    expect(await getPrisma().ticketStatusHistory.count({ where: { ticketId: t.id } })).toBe(2); // creation + the winner
  });
});

describe("API-31: version is required on every workflow write (BR-22)", () => {
  it.each([undefined, "x", 0])("rejects version=%s with 400 on status, owner and priority", async (bad) => {
    const t = await createTicket();
    const results = [
      await staff.patch(`/api/tickets/${t.id}/status`).send({ status: "OPEN", version: bad }),
      await staff.patch(`/api/staff/tickets/${t.id}/owner`).send({ ownerId: staffId, version: bad }),
      await staff.patch(`/api/staff/tickets/${t.id}/priority`).send({ itPriority: "HIGH", version: bad }),
    ];
    for (const res of results) {
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toHaveProperty("version");
    }
  });
});

describe("API-32: a legacy Ticket with no history (AC-34, BR-21)", () => {
  it("shows an empty timeline, starts recording on its first change, and still needs the gate", async () => {
    const prisma = getPrisma();
    const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Ticket"', 'id')) AS nextval`;
    const id = Number(nextval);
    await prisma.ticket.create({
      data: {
        id,
        ticketNumber: formatTicketNumber(id),
        requesterId,
        categoryId,
        relatedSystemId,
        summary: "Legacy ticket",
        description: "Created before Lab 4, so it has no status history.",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "IN_PROGRESS",
      },
    });

    const view = await staff.get(`/api/staff/tickets/${id}`);
    expect(view.body.statusHistory).toEqual([]);
    expect(view.body.version).toBe(1);

    const gated = await setStatus(staff, id, "RESOLVED", 1);
    expect(gated.body.error.code).toBe("RESOLUTION_REQUIRES_COMPLETED_ACTION");

    const waiting = await setStatus(staff, id, "WAITING_FOR_REQUESTER", 1);
    expect(waiting.status).toBe(200);
    const after = await staff.get(`/api/staff/tickets/${id}`);
    expect(after.body.statusHistory).toHaveLength(1);
    expect(after.body.statusHistory[0]).toMatchObject({ fromStatus: "IN_PROGRESS", toStatus: "WAITING_FOR_REQUESTER" });
  });
});

describe("API-33: what counts as visible activity (BR-26)", () => {
  it("a Public Comment moves Ticket.updatedAt; an Internal Note doesn't; neither changes version", async () => {
    const t = await createTicket();
    const read = () => getPrisma().ticket.findUniqueOrThrow({ where: { id: t.id } });
    const pause = () => new Promise((r) => setTimeout(r, 20));

    const start = await read();
    await pause();
    expect((await staff.post(`/api/staff/tickets/${t.id}/notes`).send({ content: "Internal only." })).status).toBe(201);
    const afterNote = await read();
    expect(afterNote.updatedAt).toEqual(start.updatedAt);

    await pause();
    expect((await requester.post(`/api/tickets/${t.id}/comments`).send({ content: "Any news?" })).status).toBe(201);
    const afterComment = await read();
    expect(afterComment.updatedAt.getTime()).toBeGreaterThan(start.updatedAt.getTime());
    expect(afterComment.version).toBe(start.version);
  });
});
