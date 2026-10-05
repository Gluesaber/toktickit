import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import type { Priority, TicketStatus } from "@prisma/client";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";

// docs/lab-04/tests.md §2.6 — server/tests/lab-04/staff-dashboard.api.test.ts (API-42..49).
//
// The staff dashboard counts *all* Tickets, and other test files create Tickets in parallel on the
// same database. So global numbers are never asserted as constants (tests.md §1): each comparison
// against an independent Prisma count is retried until the two agree (untilConsistent below), and
// fails only if they never do. "My" metrics use a freshly created staff member and are exact. The §5.5 definitions are re-stated here as Prisma queries, not imported from src/dashboard.ts.

const FIXTURE_PASSWORD = "a-real-test-password-1";
const OPEN: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const ALL: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"];
const PRIORITIES: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
type Agent = ReturnType<typeof request.agent>;

let categoryId: number;
let relatedSystemId: number;
let requester: Agent;
let requesterAgentOther: Agent;

async function makeUser(role: "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR", key: string) {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const user = await getPrisma().user.create({
    data: {
      name: `Staff Dashboard ${key}`,
      email: `staff-dash-${key}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`,
      role,
      passwordHash,
      mustChangePassword: false,
    },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD });
  return { user, agent };
}

async function createTicket(summary = "Staff dashboard fixture"): Promise<number> {
  const res = await requester.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary,
    description: "Fixture ticket description for staff dashboard tests, long enough to pass validation.",
    requestedPriority: "MEDIUM",
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function addAction(agent: Agent, ticketId: number, data: Record<string, unknown>) {
  const res = await agent.post(`/api/staff/tickets/${ticketId}/actions`).send({
    clientRequestId: randomUUID(),
    actionAt: new Date().toISOString(),
    description: "Dashboard fixture action",
    status: "PLANNED",
    ...data,
  });
  expect(res.status).toBe(201);
  return res.body;
}

// Comparing a global number to an independent count is only meaningful at a moment when nothing
// else is writing — and while the full suite runs, other test files write constantly (they even
// create a Ticket and change its status within milliseconds, so a count can rise and fall *during*
// one API call). So each global comparison is retried until the API and the independent count agree,
// for up to 45 s (by then the other files have finished). A real bug never agrees and still fails.
async function untilConsistent(check: () => Promise<void>, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastError;
}

const metricValue = (body: { metrics: { key: string; value: number }[] }, key: string) =>
  body.metrics.find((m) => m.key === key)!.value;

beforeAll(async () => {
  const prisma = getPrisma();
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;
  requester = (await makeUser("REQUESTER", "req")).agent;
  requesterAgentOther = (await makeUser("REQUESTER", "req2")).agent;
});

describe("API-42: every staff metric equals an independent count (AC-25, BR-28)", () => {
  it("matches §5.5 for the global cards and both breakdowns", { timeout: 60_000 }, async () => {
    const staff = await makeUser("IT_STAFF", "counts");
    const prisma = getPrisma();
    const globalCounts = async () => ({
      unassignedOpen: await prisma.ticket.count({ where: { currentStatus: { in: OPEN }, ownerId: null } }),
      waitingForRequester: await prisma.ticket.count({ where: { currentStatus: "WAITING_FOR_REQUESTER" } }),
      resolvedAwaitingClose: await prisma.ticket.count({ where: { currentStatus: "RESOLVED" } }),
      requesterSaysResolved: await prisma.ticket.count({
        where: { currentStatus: { in: OPEN }, requesterConfirmedResolvedAt: { not: null } },
      }),
      byStatus: await Promise.all(ALL.map((s) => prisma.ticket.count({ where: { currentStatus: s } }))),
      byPriority: await Promise.all(
        PRIORITIES.map((p) => prisma.ticket.count({ where: { currentStatus: { in: OPEN }, itPriority: p } }))
      ),
    });

    await untilConsistent(async () => {
      const expected = await globalCounts();
      const response = await staff.agent.get("/api/staff/dashboard");
      expect(response.status).toBe(200);
      const body = response.body;
      expect(metricValue(body, "unassignedOpen")).toBe(expected.unassignedOpen);
      expect(metricValue(body, "waitingForRequester")).toBe(expected.waitingForRequester);
      expect(metricValue(body, "resolvedAwaitingClose")).toBe(expected.resolvedAwaitingClose);
      expect(metricValue(body, "requesterSaysResolved")).toBe(expected.requesterSaysResolved);
      expect(body.byStatus.map((x: { value: number }) => x.value)).toEqual(expected.byStatus);
      expect(body.openByItPriority.map((x: { value: number }) => x.value)).toEqual(expected.byPriority);
      expect(body.timeZone).toBe("Asia/Bangkok");
    });
  });

  it("counts 'my open tickets' exactly for the session user", async () => {
    const staff = await makeUser("IT_STAFF", "mine");
    for (const status of ["OPEN", "IN_PROGRESS", "RESOLVED"] as TicketStatus[]) {
      const id = await createTicket();
      await getPrisma().ticket.update({ where: { id }, data: { ownerId: staff.user.id, currentStatus: status } });
    }
    const body = (await staff.agent.get("/api/staff/dashboard")).body;
    expect(metricValue(body, "myOpenTickets")).toBe(2); // Resolved isn't open (BR-27)
  });
});

describe("API-43: every drill-down opens a Queue with the same total (AC-26)", () => {
  it("GET /api/staff/tickets with each card's drillDown query returns that card's value", { timeout: 120_000 }, async () => {
    const staff = await makeUser("IT_STAFF", "drill");
    const id = await createTicket();
    await getPrisma().ticket.update({ where: { id }, data: { ownerId: staff.user.id, currentStatus: "IN_PROGRESS" } });

    const dash = (await staff.agent.get("/api/staff/dashboard")).body;
    const links: { key: string; drillDown: string }[] = [
      ...dash.metrics.filter((m: { drillDown: string | null }) => m.drillDown),
      ...dash.byStatus.map((s: { status: string; drillDown: string }) => ({ key: `status:${s.status}`, drillDown: s.drillDown })),
      ...dash.openByItPriority.map((p: { itPriority: string; drillDown: string }) => ({ key: `priority:${p.itPriority}`, drillDown: p.drillDown })),
    ];
    expect(links.length).toBe(5 + 8 + 4);

    const valueOf = (body: typeof dash, key: string): number => {
      if (key.startsWith("status:")) return body.byStatus.find((s: { status: string }) => `status:${s.status}` === key).value;
      if (key.startsWith("priority:")) return body.openByItPriority.find((p: { itPriority: string }) => `priority:${p.itPriority}` === key).value;
      return metricValue(body, key);
    };

    for (const link of links) {
      expect(link.drillDown.startsWith("/queue?")).toBe(true);
      const query = Object.fromEntries(new URL(link.drillDown, "http://x").searchParams);
      await untilConsistent(async () => {
        const dashboardValue = valueOf((await staff.agent.get("/api/staff/dashboard")).body, link.key);
        const queue = await staff.agent.get("/api/staff/tickets").query(query);
        expect(queue.status).toBe(200);
        expect(queue.body.pagination.totalItems).toBe(dashboardValue);
      });
    }
  });
});

describe("API-44: 'my' Actions belong to the session user only (AC-31)", () => {
  it("counts and lists only Actions assigned to the caller", async () => {
    const a = await makeUser("IT_STAFF", "act-a");
    const b = await makeUser("IT_STAFF", "act-b");
    const t1 = await createTicket();
    const t2 = await createTicket();
    await addAction(a.agent, t1, { assigneeId: a.user.id }); // A: open (Planned)
    await addAction(a.agent, t1, { assigneeId: a.user.id, status: "IN_PROGRESS" }); // A: open
    await addAction(b.agent, t2, { assigneeId: a.user.id, status: "COMPLETED", result: "Done.", followUpRequired: true, followUpNote: "Check Friday." }); // A: follow-up
    await addAction(a.agent, t2, { assigneeId: b.user.id }); // B's, created by A

    const bodyA = (await a.agent.get("/api/staff/dashboard")).body;
    expect(metricValue(bodyA, "myOpenActions")).toBe(2);
    expect(metricValue(bodyA, "myFollowUps")).toBe(1);
    expect(bodyA.lists.myActions).toHaveLength(3);
    expect(bodyA.lists.myActions.every((x: { ticketId: number }) => [t1, t2].includes(x.ticketId))).toBe(true);

    const bodyB = (await b.agent.get("/api/staff/dashboard")).body;
    expect(metricValue(bodyB, "myOpenActions")).toBe(1);
    expect(metricValue(bodyB, "myFollowUps")).toBe(0);
    expect(bodyB.lists.myActions).toHaveLength(1);
  });

  it("drops follow-ups once their Ticket is Closed", async () => {
    const a = await makeUser("IT_STAFF", "act-closed");
    const t = await createTicket();
    await addAction(a.agent, t, { assigneeId: a.user.id, status: "COMPLETED", result: "Done.", followUpRequired: true, followUpNote: "Re-check." });
    expect(metricValue((await a.agent.get("/api/staff/dashboard")).body, "myFollowUps")).toBe(1);
    await getPrisma().ticket.update({ where: { id: t }, data: { currentStatus: "CLOSED" } });
    expect(metricValue((await a.agent.get("/api/staff/dashboard")).body, "myFollowUps")).toBe(0);
  });
});

describe("API-45: user counts for Administrators only (AC-30, BR-34)", () => {
  it("includes users for an Administrator (matching the database) and omits the key for IT Staff", { timeout: 60_000 }, async () => {
    const admin = await makeUser("ADMINISTRATOR", "admin");
    const staff = await makeUser("IT_STAFF", "noadmin");
    const prisma = getPrisma();
    const userCounts = async () => ({
      REQUESTER: await prisma.user.count({ where: { isActive: true, role: "REQUESTER" } }),
      IT_STAFF: await prisma.user.count({ where: { isActive: true, role: "IT_STAFF" } }),
      ADMINISTRATOR: await prisma.user.count({ where: { isActive: true, role: "ADMINISTRATOR" } }),
      inactive: await prisma.user.count({ where: { isActive: false } }),
    });
    await untilConsistent(async () => {
      const expected = await userCounts();
      const users = (await admin.agent.get("/api/staff/dashboard")).body.users;
      expect(users.activeByRole).toEqual([
        { role: "REQUESTER", value: expected.REQUESTER, drillDown: "/admin/users?role=REQUESTER" },
        { role: "IT_STAFF", value: expected.IT_STAFF, drillDown: "/admin/users?role=IT_STAFF" },
        { role: "ADMINISTRATOR", value: expected.ADMINISTRATOR, drillDown: "/admin/users?role=ADMINISTRATOR" },
      ]);
      expect(users.inactive).toEqual({ value: expected.inactive, drillDown: "/admin/users" });
    });

    const staffBody = (await staff.agent.get("/api/staff/dashboard")).body;
    expect(staffBody).not.toHaveProperty("users");
  });
});

describe("API-46: Requesters can't open the staff dashboard (AC-29)", () => {
  it("refuses a Requester with 403 and no session with 401", async () => {
    expect((await requester.get("/api/staff/dashboard")).status).toBe(403);
    expect((await request(app).get("/api/staff/dashboard")).status).toBe(401);
  });
});

describe("API-47: fixed breakdown shape (BR-31)", () => {
  it("always returns all 8 statuses and all 4 priorities, in fixed order", async () => {
    const staff = await makeUser("IT_STAFF", "shape");
    const body = (await staff.agent.get("/api/staff/dashboard")).body;
    expect(body.byStatus.map((s: { status: string }) => s.status)).toEqual(ALL);
    expect(body.openByItPriority.map((p: { itPriority: string }) => p.itPriority)).toEqual(PRIORITIES);
    expect(body.lists.urgentAndRecent.length).toBeLessThanOrEqual(5);
    expect(body.lists.myActions).toEqual([]);
  });
});

describe("API-48: Queue drill-down filters (FR-16)", () => {
  it("statusGroup=open and requesterResolved=true filter correctly, and bad values are 400", async () => {
    const staff = await makeUser("IT_STAFF", "queue");
    const tag = `QF-${Date.now()}`;
    const ids: Record<string, number> = {};
    for (const s of ["NEW", "IN_PROGRESS", "RESOLVED", "CANCELLED"] as TicketStatus[]) {
      ids[s] = await createTicket(`${tag} ${s}`);
      await getPrisma().ticket.update({ where: { id: ids[s] }, data: { currentStatus: s } });
    }
    await getPrisma().ticket.update({ where: { id: ids.IN_PROGRESS }, data: { requesterConfirmedResolvedAt: new Date() } });

    const openRes = await staff.agent.get("/api/staff/tickets").query({ search: tag, statusGroup: "open", pageSize: 50 });
    expect(openRes.body.data.map((t: { id: number }) => t.id).sort()).toEqual([ids.NEW, ids.IN_PROGRESS].sort());

    const saysRes = await staff.agent.get("/api/staff/tickets").query({ search: tag, requesterResolved: "true", statusGroup: "open" });
    expect(saysRes.body.data.map((t: { id: number }) => t.id)).toEqual([ids.IN_PROGRESS]);
    expect(saysRes.body.data[0].requesterConfirmedResolvedAt).toBeTruthy();

    const both = await staff.agent.get("/api/staff/tickets").query({ search: tag, statusGroup: "open", currentStatus: "RESOLVED" });
    expect(both.body.pagination.totalItems).toBe(0);

    expect((await staff.agent.get("/api/staff/tickets").query({ statusGroup: "closed" })).status).toBe(400);
    expect((await staff.agent.get("/api/staff/tickets").query({ requesterResolved: "yes" })).status).toBe(400);
  });
});

describe("API-49: My Tickets drill-down filters (FR-16)", () => {
  it("supports statusGroup=open and sortBy=updatedAt", async () => {
    const own = requesterAgentOther;
    const tag = `MF-${Date.now()}`;
    const make = async (s: TicketStatus) => {
      const res = await own.post("/api/tickets").send({
        categoryId,
        relatedSystemId,
        summary: `${tag} ${s}`,
        description: "Fixture ticket description for My Tickets filter tests, long enough to pass validation.",
        requestedPriority: "LOW",
      });
      await getPrisma().ticket.update({ where: { id: res.body.id }, data: { currentStatus: s } });
      return res.body.id as number;
    };
    const openId = await make("OPEN");
    const closedId = await make("CLOSED");
    const reopenedId = await make("REOPENED");

    const open = await own.get("/api/tickets").query({ search: tag, statusGroup: "open" });
    expect(open.body.data.map((t: { id: number }) => t.id).sort()).toEqual([openId, reopenedId].sort());

    await getPrisma().$executeRaw`UPDATE "Ticket" SET "updatedAt" = now() + interval '1 minute' WHERE id = ${closedId}`;
    const sorted = await own.get("/api/tickets").query({ search: tag, sortBy: "updatedAt", sortDir: "desc" });
    expect(sorted.status).toBe(200);
    expect(sorted.body.data[0].id).toBe(closedId);

    expect((await own.get("/api/tickets").query({ statusGroup: "everything" })).status).toBe(400);
  });
});
