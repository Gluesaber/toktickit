import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { execSync } from "node:child_process";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/auth.js";
import { formatTicketNumber } from "../../src/ticketNumber.js";
import { USERS } from "../../prisma/seedData.js";

// docs/lab-04/tests.md §2.7 — MIG-01, MIG-02, MIG-04. MIG-03 (rollback rehearsal) is scripted
// against a disposable database copy rather than run here — it drops tables, which must never happen
// to the shared dev DB from inside `npm test`. Its evidence is recorded in tests.md §7.

const FIXTURE_PASSWORD = "a-real-test-password-1";
let staffAgent: ReturnType<typeof request.agent>;
let requesterAgent: ReturnType<typeof request.agent>;
let requesterId: number;

beforeAll(async () => {
  const prisma = getPrisma();
  const unique = Date.now();
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const [staff, requester] = await Promise.all([
    prisma.user.create({
      data: { name: "Migration Staff", email: `mig-staff-${unique}@example.test`, role: "IT_STAFF", passwordHash, mustChangePassword: false },
    }),
    prisma.user.create({
      data: { name: "Migration Requester", email: `mig-req-${unique}@example.test`, role: "REQUESTER", passwordHash, mustChangePassword: false },
    }),
  ]);
  requesterId = requester.id;
  staffAgent = request.agent(app);
  requesterAgent = request.agent(app);
  await staffAgent.post("/api/auth/login").send({ email: staff.email, password: FIXTURE_PASSWORD });
  await requesterAgent.post("/api/auth/login").send({ email: requester.email, password: FIXTURE_PASSWORD });
});

describe("MIG-01: the Lab 4 migration keeps existing data valid (AC-34, BR-35)", () => {
  it("has applied the Lab 4 migration, and every Ticket has a version", async () => {
    const prisma = getPrisma();
    const applied = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "_prisma_migrations"
      WHERE migration_name LIKE '%_lab4_actions_taken' AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(Number(applied[0].n)).toBe(1);
    expect(await prisma.ticket.count({ where: { version: { lt: 1 } } })).toBe(0);
  });

  it("gives a Ticket written the Lab 3 way (no Lab 4 columns) version 1, no seedKey, and keeps it workable", async () => {
    const prisma = getPrisma();
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
    const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true } });
    // Exactly the column list a Lab 3 INSERT used — so `version`/`seedKey` come only from the
    // migration's column defaults, which is what every pre-existing row received.
    const [{ nextval }] = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Ticket"', 'id')) AS nextval`;
    const id = Number(nextval);
    await prisma.$executeRaw`
      INSERT INTO "Ticket" ("id", "ticketNumber", "requesterId", "categoryId", "relatedSystemId", "summary",
                            "description", "requestedPriority", "itPriority", "currentStatus", "updatedAt")
      VALUES (${id}, ${formatTicketNumber(id)}, ${requesterId}, ${category.id}, ${system.id}, 'Legacy-style ticket',
              'Inserted with the Lab 3 column list only, to prove the migration defaults.', 'MEDIUM'::"Priority",
              'MEDIUM'::"Priority", 'IN_PROGRESS'::"TicketStatus", now())`;

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(stored.version).toBe(1);
    expect(stored.seedKey).toBeNull();

    const staffView = await staffAgent.get(`/api/staff/tickets/${id}`);
    expect(staffView.status).toBe(200);
    expect(staffView.body).toMatchObject({ id, version: 1, actions: [] });
    const requesterView = await requesterAgent.get(`/api/tickets/${id}`);
    expect(requesterView.status).toBe(200);
    expect(requesterView.body.actions).toEqual([]);

    // Still workable: staff can record an Action on it straight away (BR-21).
    const action = await staffAgent.post(`/api/staff/tickets/${id}/actions`).send({
      clientRequestId: `legacy-${id}-${Date.now()}`,
      actionAt: new Date().toISOString(),
      description: "First recorded work on a pre-Lab 4 ticket.",
      status: "PLANNED",
    });
    expect(action.status).toBe(201);
  });
});

// Scoped to what the seed itself owns. Vitest runs the other test files in parallel, and they insert
// their own fixture rows meanwhile, so whole-table counts could drift for reasons unrelated to the
// seed (the shared-DB isolation rule, tests.md §1).
async function seedOwnedCounts(): Promise<Record<string, number>> {
  const prisma = getPrisma();
  const seedTicket = { ticket: { seedKey: { not: null } } };
  return {
    users: await prisma.user.count({ where: { email: { in: USERS.map((u) => u.email) } } }),
    categories: await prisma.category.count(),
    relatedSystems: await prisma.relatedSystem.count(),
    tickets: await prisma.ticket.count({ where: { seedKey: { not: null } } }),
    actions: await prisma.actionTaken.count({ where: seedTicket }),
    history: await prisma.ticketStatusHistory.count({ where: seedTicket }),
    comments: await prisma.comment.count({ where: seedTicket }),
    notes: await prisma.note.count({ where: seedTicket }),
  };
}

describe("MIG-02: running the seed again changes nothing (AC-35, BR-36)", () => {
  it(
    "leaves every table's row count identical after two more full seed runs",
    async () => {
      // Run the real script, exactly as the README does, so this tests what a developer runs.
      // The first run makes sure the seed has run at least once before the counts are taken.
      execSync("npx tsx prisma/seed.ts", { stdio: "pipe" });
      const before = await seedOwnedCounts();
      execSync("npx tsx prisma/seed.ts", { stdio: "pipe" });
      const after = await seedOwnedCounts();
      expect(after).toEqual(before);
    },
    120_000
  );
});

describe("MIG-04: seed coverage (AC-36, BR-37)", () => {
  it("covers every status and priority, owned and unassigned, and zero/one/many Actions — all for Alex Rivera", async () => {
    const prisma = getPrisma();
    const seed = await prisma.ticket.findMany({
      where: { seedKey: { not: null } },
      include: { requester: true, owner: true, actions: true },
    });
    expect(seed.length).toBeGreaterThanOrEqual(14);

    expect(new Set(seed.map((t) => t.currentStatus)).size).toBe(8);
    expect(new Set(seed.map((t) => t.itPriority)).size).toBe(4);
    expect(seed.some((t) => t.ownerId === null)).toBe(true);
    expect(seed.some((t) => t.ownerId !== null)).toBe(true);

    const actionCounts = seed.map((t) => t.actions.length);
    expect(actionCounts).toContain(0);
    expect(actionCounts).toContain(1);
    expect(actionCounts.some((n) => n > 1)).toBe(true);
    // BR-02: work recorded by someone other than the coordinating owner.
    expect(seed.some((t) => t.actions.some((a) => t.ownerId !== null && a.performedById !== t.ownerId))).toBe(true);

    for (const t of seed) expect(t.requester.email).toBe("alex.rivera@example.edu");
  });

  it("never involves Morgan Chen or Riley Osei, so the zero/empty dashboard states stay demonstrable", async () => {
    const prisma = getPrisma();
    const reserved = await prisma.user.findMany({
      where: { email: { in: ["morgan.chen@example.edu", "riley.osei@example.edu"] } },
    });
    expect(reserved).toHaveLength(2);
    const ids = reserved.map((u) => u.id);
    const seedWhere = { ticket: { seedKey: { not: null } } };

    expect(await prisma.ticket.count({ where: { seedKey: { not: null }, OR: [{ requesterId: { in: ids } }, { ownerId: { in: ids } }] } })).toBe(0);
    expect(
      await prisma.actionTaken.count({
        where: { ...seedWhere, OR: [{ performedById: { in: ids } }, { assigneeId: { in: ids } }, { updatedById: { in: ids } }] },
      })
    ).toBe(0);
    expect(await prisma.comment.count({ where: { ...seedWhere, authorId: { in: ids } } })).toBe(0);
    expect(await prisma.note.count({ where: { ...seedWhere, authorId: { in: ids } } })).toBe(0);
  });

  it("gives every resolved seed Ticket a Completed Action dated before it was first resolved (BR-17)", async () => {
    const prisma = getPrisma();
    const resolvedOnce = await prisma.ticket.findMany({
      where: { seedKey: { not: null }, statusHistory: { some: { toStatus: "RESOLVED" } } },
      include: {
        actions: { where: { status: "COMPLETED" } },
        statusHistory: { where: { toStatus: "RESOLVED" }, orderBy: { changedAt: "asc" } },
      },
    });
    expect(resolvedOnce.length).toBeGreaterThan(0);
    for (const t of resolvedOnce) {
      const firstResolved = t.statusHistory[0].changedAt.getTime();
      expect(t.actions.some((a) => a.actionAt.getTime() < firstResolved)).toBe(true);
    }
  });

  it("records a status history that ends at each seed Ticket's current status", async () => {
    const prisma = getPrisma();
    const seed = await prisma.ticket.findMany({
      where: { seedKey: { not: null } },
      include: { statusHistory: { orderBy: [{ changedAt: "asc" }, { id: "asc" }] } },
    });
    for (const t of seed) {
      expect(t.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: "NEW" });
      expect(t.statusHistory[t.statusHistory.length - 1].toStatus).toBe(t.currentStatus);
    }
  });
});
