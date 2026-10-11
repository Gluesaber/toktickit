import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import type { TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-04/tests.md §2.5 — server/tests/lab-04/requester-dashboard.api.test.ts (API-34..41).
// Every Requester here is created fresh, so their numbers are exact and unaffected by other test
// files running in parallel. The §5.5 definitions are re-stated below as independent Prisma queries
// rather than imported from src/dashboard.ts.

const FIXTURE_PASSWORD = "a-real-test-password-1";
const OPEN: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
type Agent = ReturnType<typeof request.agent>;

let categoryId: number;
let relatedSystemId: number;
let staffAgent: Agent;
let adminAgent: Agent;
let staffId: number;

async function makeUser(role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", key: string) {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const user = await prisma.user.create({
    data: {
      name: `Dashboard ${key}`,
      email: `req-dash-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      role,
      passwordHash,
      mustChangePassword: false,
    },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD });
  return { user, agent };
}

async function createTicket(agent: Agent, summary = "Dashboard fixture ticket"): Promise<number> {
  const res = await agent.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary,
    description: "Fixture ticket description for dashboard tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function setStatus(ticketId: number, currentStatus: TicketStatus) {
  await getPrisma().ticket.update({ where: { id: ticketId }, data: { currentStatus } });
}

async function setUpdatedAt(ticketId: number, at: Date) {
  await getPrisma().$executeRaw`UPDATE "Ticket" SET "updatedAt" = ${at} WHERE id = ${ticketId}`;
}

function metric(body: { metrics: { key: string; value: number; drillDown: string }[] }, key: string) {
  const m = body.metrics.find((x) => x.key === key);
  if (!m) throw new Error(`metric ${key} missing`);
  return m;
}

beforeAll(async () => {
  const prisma = getPrisma();
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  const staff = await makeUser("IT_STAFF", "staff");
  staffAgent = staff.agent;
  staffId = staff.user.id;
  adminAgent = (await makeUser("ADMINISTRATOR", "admin")).agent;
});

describe("API-34: each Requester sees only their own Tickets (AC-02, BR-30)", () => {
  it("scopes every metric and list row to the session's Requester", async () => {
    const a = await makeUser("REQUESTER", "a");
    const b = await makeUser("REQUESTER", "b");
    const aTickets = [await createTicket(a.agent), await createTicket(a.agent)];
    const bTicket = await createTicket(b.agent);

    const resA = await a.agent.get("/api/dashboard/requester");
    const resB = await b.agent.get("/api/dashboard/requester");
    expect(resA.status).toBe(200);
    expect(metric(resA.body, "openTickets").value).toBe(2);
    expect(metric(resB.body, "openTickets").value).toBe(1);
    expect(resA.body.lists.recentlyUpdated.map((t: { id: number }) => t.id).sort()).toEqual([...aTickets].sort());
    expect(resB.body.lists.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual([bTicket]);
  });

  it("ignores any query parameter that tries to widen the scope", async () => {
    const a = await makeUser("REQUESTER", "a2");
    const b = await makeUser("REQUESTER", "b2");
    await createTicket(b.agent);
    const res = await a.agent.get("/api/dashboard/requester").query({ requesterId: b.user.id });
    expect(metric(res.body, "openTickets").value).toBe(0);
  });
});

describe("API-35: every metric equals an independent count (AC-02, BR-28, BR-32)", () => {
  it("matches the §5.5 definitions for a Requester with Tickets in many statuses", async () => {
    const r = await makeUser("REQUESTER", "counts");
    const statuses: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"];
    for (const s of statuses) await setStatus(await createTicket(r.agent), s);

    const res = await r.agent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    const windowStart = new Date(res.body.windowStart);
    const prisma = getPrisma();
    const mine = { requesterId: r.user.id };
    expect(metric(res.body, "openTickets").value).toBe(await prisma.ticket.count({ where: { ...mine, currentStatus: { in: OPEN } } }));
    expect(metric(res.body, "waitingForMe").value).toBe(await prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }));
    expect(metric(res.body, "resolvedAwaitingClose").value).toBe(await prisma.ticket.count({ where: { ...mine, currentStatus: "RESOLVED" } }));
    expect(metric(res.body, "updatedRecently").value).toBe(await prisma.ticket.count({ where: { ...mine, updatedAt: { gte: windowStart } } }));
    // and the spot values, so a wrong-but-consistent definition can't hide behind the comparison
    expect(metric(res.body, "openTickets").value).toBe(6);
    expect(metric(res.body, "waitingForMe").value).toBe(2);
    expect(metric(res.body, "resolvedAwaitingClose").value).toBe(1);
    expect(res.body.timeZone).toBe("Asia/Bangkok");
  });
});

describe("API-36: a Requester with no Tickets (AC-28, BR-31)", () => {
  it("returns zeros and empty lists, not an error", async () => {
    const e = await makeUser("REQUESTER", "empty");
    const res = await e.agent.get("/api/dashboard/requester");
    expect(res.status).toBe(200);
    for (const m of res.body.metrics) expect(m.value).toBe(0);
    expect(res.body.lists).toEqual({ recentlyUpdated: [], recentlyResolved: [] });
  });
});

describe("API-37: only Requesters, only with a session (AC-29)", () => {
  it("refuses IT Staff and Administrators with 403, and no session with 401", async () => {
    expect((await staffAgent.get("/api/dashboard/requester")).status).toBe(403);
    expect((await adminAgent.get("/api/dashboard/requester")).status).toBe(403);
    expect((await request(app).get("/api/dashboard/requester")).status).toBe(401);
  });
});

describe("API-38: the recent-window boundary (AC-33, BR-29)", () => {
  it("counts a Ticket updated 1s after windowStart and not one updated 1s before", async () => {
    const r = await makeUser("REQUESTER", "window");
    const before = await createTicket(r.agent, "Just outside the window");
    const after = await createTicket(r.agent, "Just inside the window");
    const { windowStart } = (await r.agent.get("/api/dashboard/requester")).body;
    const start = new Date(windowStart).getTime();
    await setUpdatedAt(before, new Date(start - 1000));
    await setUpdatedAt(after, new Date(start + 1000));

    const res = await r.agent.get("/api/dashboard/requester");
    expect(res.body.windowStart).toBe(windowStart);
    expect(metric(res.body, "updatedRecently").value).toBe(1);
    expect(res.body.lists.recentlyUpdated.map((t: { id: number }) => t.id)).toEqual([after]);
  });
});

describe("API-39: 'recently resolved' uses the status history (BR-33, BR-21)", () => {
  it("lists a Ticket resolved now, but not a legacy Resolved Ticket or one reopened since", async () => {
    const prisma = getPrisma();
    const r = await makeUser("REQUESTER", "resolved");
    const resolvedNow = await createTicket(r.agent, "Resolved this week");
    const legacy = await createTicket(r.agent, "Resolved before Lab 4");
    const reopened = await createTicket(r.agent, "Resolved then reopened");

    for (const id of [resolvedNow, reopened]) {
      await prisma.ticketStatusHistory.create({ data: { ticketId: id, fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", changedById: staffId } });
    }
    await setStatus(resolvedNow, "RESOLVED");
    await setStatus(reopened, "REOPENED");
    await setStatus(legacy, "RESOLVED"); // no history row: a pre-Lab 4 resolution

    const res = await r.agent.get("/api/dashboard/requester");
    const ids = res.body.lists.recentlyResolved.map((t: { id: number }) => t.id);
    expect(ids).toEqual([resolvedNow]);
    expect(res.body.lists.recentlyResolved[0].resolvedAt).toBeTruthy();
  });
});

describe("API-40: every drill-down opens a list with the same total (AC-27)", () => {
  it("GET /api/tickets with each card's drillDown query returns that card's value", async () => {
    const r = await makeUser("REQUESTER", "drill");
    for (const s of ["NEW", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED"] as TicketStatus[]) {
      await setStatus(await createTicket(r.agent), s);
    }
    const old = await createTicket(r.agent);
    await setUpdatedAt(old, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // outside the window

    const dash = (await r.agent.get("/api/dashboard/requester")).body;
    for (const m of dash.metrics) {
      const query = Object.fromEntries(new URL(m.drillDown, "http://x").searchParams);
      expect(m.drillDown.startsWith("/tickets?")).toBe(true);
      const list = await r.agent.get("/api/tickets").query(query);
      expect(list.status).toBe(200);
      if (m.key === "updatedRecently") {
        // This drill-down is a sort (most recent first), not a filter: the window's Tickets are its
        // leading rows. Check exactly those lead and the rest are older.
        const all = await r.agent.get("/api/tickets").query({ ...query, pageSize: 50 });
        const recent = all.body.data.filter((t: { updatedAt: string }) => new Date(t.updatedAt) >= new Date(dash.windowStart));
        expect(recent).toHaveLength(m.value);
        expect(all.body.data.slice(0, m.value)).toEqual(recent);
      } else {
        expect(list.body.pagination.totalItems).toBe(m.value);
      }
    }
  });
});

describe("API-41: lists are capped at 5 and stably ordered (BR-31)", () => {
  it("returns the 5 most recently updated, ties broken by id, identically on repeat calls", async () => {
    const r = await makeUser("REQUESTER", "order");
    const ids: number[] = [];
    for (let i = 0; i < 7; i++) ids.push(await createTicket(r.agent, `Ordering fixture ${i}`));
    const base = Date.now() - 60 * 60 * 1000;
    for (let i = 0; i < 7; i++) await setUpdatedAt(ids[i], new Date(base + i * 1000));
    await setUpdatedAt(ids[5], new Date(base + 6 * 1000)); // ids[5] and ids[6] now tie

    const first = (await r.agent.get("/api/dashboard/requester")).body.lists.recentlyUpdated.map((t: { id: number }) => t.id);
    const second = (await r.agent.get("/api/dashboard/requester")).body.lists.recentlyUpdated.map((t: { id: number }) => t.id);
    expect(first).toEqual([ids[6], ids[5], ids[4], ids[3], ids[2]]);
    expect(second).toEqual(first);
  });
});
