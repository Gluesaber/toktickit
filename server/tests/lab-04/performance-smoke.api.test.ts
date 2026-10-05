import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";
import { formatTicketNumber } from "../../src/ticketNumber.js";

// docs/lab-04/tests.md §2.8 — PERF-01, PERF-02. A smoke test, not a benchmark: it catches an
// accidental fetch-everything or N+1 query on a developer machine (api-spec.md §5's target is
// < 1000 ms per dashboard with the seed plus 200 extra Tickets). Timings are the median of 5 calls,
// so one slow call (a cold cache, a busy machine) doesn't fail the run.
//
// The 200 extra Tickets are topped up, not added on every run: they are recognised by their summary
// prefix, and only the shortfall is created, so repeated runs don't keep growing the database.

const FIXTURE_PASSWORD = "a-real-test-password-1";
const PERF_PREFIX = "PERF smoke fixture";
const EXTRA_TICKETS = 200;
type Agent = ReturnType<typeof request.agent>;

let staff: Agent;
let requester: Agent;
let requesterId: number;
let staffId: number;
let detailTicketId: number;
let bulkRequester: Agent;

async function median(fn: () => Promise<unknown>, runs = 5): Promise<number> {
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[Math.floor(runs / 2)];
}

beforeAll(async () => {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [s, r] = await Promise.all([
    prisma.user.create({ data: { name: "Perf Staff", email: `perf-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, mustChangePassword: false } }),
    prisma.user.create({ data: { name: "Perf Requester", email: `perf-req-${unique}@example.test`, role: "REQUESTER", passwordHash, mustChangePassword: false } }),
  ]);
  staffId = s.id;
  requesterId = r.id;
  staff = request.agent(app);
  requester = request.agent(app);
  await staff.post("/api/auth/login").send({ email: s.email, password: FIXTURE_PASSWORD });
  await requester.post("/api/auth/login").send({ email: r.email, password: FIXTURE_PASSWORD });

  const categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  const relatedSystemId = (await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } })).id;

  const existing = await prisma.ticket.count({ where: { summary: { startsWith: PERF_PREFIX } } });
  const missing = Math.max(0, EXTRA_TICKETS - existing);
  if (missing > 0) {
    const ids = await prisma.$queryRaw<{ id: bigint }[]>`
      SELECT nextval(pg_get_serial_sequence('"Ticket"', 'id')) AS id FROM generate_series(1, ${missing})`;
    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"] as const;
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
    await prisma.ticket.createMany({
      data: ids.map(({ id }, i) => ({
        id: Number(id),
        ticketNumber: formatTicketNumber(Number(id)),
        requesterId,
        ownerId: i % 3 === 0 ? null : staffId,
        categoryId,
        relatedSystemId,
        summary: `${PERF_PREFIX} ${i}`,
        description: "Bulk ticket for the dashboard performance smoke test.",
        requestedPriority: priorities[i % 4],
        itPriority: priorities[(i + 1) % 4],
        currentStatus: statuses[i % 8],
        updatedAt: new Date(Date.now() - (i % 20) * 24 * 60 * 60 * 1000),
      })),
    });
  }

  // The requester-dashboard timing must use whoever actually owns the 200 bulk Tickets — after the
  // first run that's the Requester created by that run, not this one (fixtures share one password).
  const bulkOwner = await prisma.ticket.findFirstOrThrow({
    where: { summary: { startsWith: PERF_PREFIX } },
    include: { requester: { select: { email: true } } },
  });
  bulkRequester = request.agent(app);
  await bulkRequester.post("/api/auth/login").send({ email: bulkOwner.requester.email, password: FIXTURE_PASSWORD });

  // One Ticket with 20 Actions and 20 history rows for the detail timing.
  const detail = await requester.post("/api/tickets").send({
    categoryId,
    relatedSystemId,
    summary: "PERF detail ticket",
    description: "Ticket with many Actions and history rows for the detail timing.",
    requestedPriority: "MEDIUM",
  });
  detailTicketId = detail.body.id;
  await prisma.actionTaken.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      ticketId: detailTicketId,
      actionAt: new Date(),
      description: `Perf action ${i}`,
      status: "PLANNED" as const,
      performedById: staffId,
      assigneeId: staffId,
    })),
  });
  await prisma.ticketStatusHistory.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      ticketId: detailTicketId,
      fromStatus: i % 2 === 0 ? ("IN_PROGRESS" as const) : ("WAITING_FOR_REQUESTER" as const),
      toStatus: i % 2 === 0 ? ("WAITING_FOR_REQUESTER" as const) : ("IN_PROGRESS" as const),
      changedById: staffId,
    })),
  });
}, 60_000);

describe("PERF-01: dashboards respond quickly with the seed plus 200 extra Tickets", () => {
  it("staff dashboard: median < 1000 ms", async () => {
    expect((await staff.get("/api/staff/dashboard")).status).toBe(200);
    expect(await median(() => staff.get("/api/staff/dashboard"))).toBeLessThan(1000);
  });

  it("requester dashboard (a Requester owning 200+ Tickets): median < 1000 ms", async () => {
    const first = await bulkRequester.get("/api/dashboard/requester");
    expect(first.status).toBe(200);
    expect(first.body.metrics.find((m: { key: string }) => m.key === "openTickets").value).toBeGreaterThan(50);
    expect(await median(() => bulkRequester.get("/api/dashboard/requester"))).toBeLessThan(1000);
  });
});

describe("PERF-02: Queue and Ticket Detail stay fast", () => {
  it("Queue filtered to the open group: median < 1000 ms", async () => {
    expect(await median(() => staff.get("/api/staff/tickets").query({ statusGroup: "open", pageSize: 50 }))).toBeLessThan(1000);
  });

  it("staff Ticket Detail with 20 Actions and 20 history rows: median < 500 ms", async () => {
    const res = await staff.get(`/api/staff/tickets/${detailTicketId}`);
    expect(res.body.actions).toHaveLength(20);
    expect(res.body.statusHistory.length).toBeGreaterThanOrEqual(20);
    expect(await median(() => staff.get(`/api/staff/tickets/${detailTicketId}`))).toBeLessThan(500);
  });
});
