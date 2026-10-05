import type { ActionStatus, Prisma, PrismaClient, Priority, Role, TicketStatus } from "@prisma/client";

// Issue 4-5 (Lab 4) — dashboard metrics, docs/lab-04/specification.md §5.5 and BR-27–BR-34,
// api-spec.md §5. Every number is a count computed from the database at request time (BR-28): no
// stored totals, nothing derived from a fetched list. Each metric's query lives here once, so the
// API tests can compare it against an independent Prisma count of the same §5.5 definition.

// BR-27 — the "Open" group. Resolved/Closed/Cancelled are not open.
export const OPEN_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

export const ALL_STATUSES: TicketStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "REOPENED",
];
export const PRIORITIES_HIGH_FIRST: Priority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const ROLES: Role[] = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];
const OPEN_ACTION_STATUSES: ActionStatus[] = ["PLANNED", "IN_PROGRESS"];

export const DASHBOARD_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 all year — Thailand has no daylight saving
export const LIST_LIMIT = 5; // BR-31

// BR-29 — the "recent" window: from 00:00 Asia/Bangkok six calendar days before today, up to now,
// i.e. seven calendar days including today. Computed with a fixed +7h offset rather than a time-zone
// database, which is exact for Bangkok since it never changes offset.
export function recentWindowStart(now: Date): Date {
  const bangkok = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const midnightSixDaysAgo = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() - 6);
  return new Date(midnightSixDaysAgo - BANGKOK_OFFSET_MS);
}

interface Metric {
  key: string;
  label: string;
  value: number;
  drillDown: string | null;
}

// ---------------------------------------------------------------------------
// Requester Dashboard — always scoped to the session user's own Tickets (BR-30). There is no
// parameter that could change `requesterId`; the route passes the session user's id and nothing else.
// ---------------------------------------------------------------------------
export async function requesterDashboard(prisma: PrismaClient, requesterId: number, now = new Date()) {
  const windowStart = recentWindowStart(now);
  const mine: Prisma.TicketWhereInput = { requesterId };

  const [openTickets, waitingForMe, resolvedAwaitingClose, updatedRecently, recentlyUpdated, resolvedRows] =
    await Promise.all([
      prisma.ticket.count({ where: { ...mine, currentStatus: { in: OPEN_STATUSES } } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "WAITING_FOR_REQUESTER" } }),
      prisma.ticket.count({ where: { ...mine, currentStatus: "RESOLVED" } }),
      prisma.ticket.count({ where: { ...mine, updatedAt: { gte: windowStart } } }),
      prisma.ticket.findMany({
        where: { ...mine, updatedAt: { gte: windowStart } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: LIST_LIMIT,
        select: { id: true, ticketNumber: true, summary: true, currentStatus: true, updatedAt: true },
      }),
      recentlyResolvedRows(prisma, mine, windowStart),
    ]);

  const metrics: Metric[] = [
    { key: "openTickets", label: "Open tickets", value: openTickets, drillDown: "/tickets?statusGroup=open" },
    { key: "waitingForMe", label: "Waiting for you", value: waitingForMe, drillDown: "/tickets?currentStatus=WAITING_FOR_REQUESTER" },
    { key: "resolvedAwaitingClose", label: "Resolved", value: resolvedAwaitingClose, drillDown: "/tickets?currentStatus=RESOLVED" },
    { key: "updatedRecently", label: "Updated in the last 7 days", value: updatedRecently, drillDown: "/tickets?sortBy=updatedAt&sortDir=desc" },
  ];

  return {
    generatedAt: now,
    timeZone: DASHBOARD_TIME_ZONE,
    windowStart,
    metrics,
    lists: { recentlyUpdated, recentlyResolved: resolvedRows },
  };
}

// BR-33 — "recently resolved": the Ticket's latest transition into Resolved happened inside the
// window, and it is still Resolved or Closed (a Ticket reopened since then is no longer "resolved
// work"). Legacy Tickets resolved before Lab 4 have no history row, so they can't appear (BR-21).
async function recentlyResolvedRows(prisma: PrismaClient, ticketWhere: Prisma.TicketWhereInput, windowStart: Date) {
  const rows = await prisma.ticketStatusHistory.findMany({
    where: {
      toStatus: "RESOLVED",
      changedAt: { gte: windowStart },
      ticket: { ...ticketWhere, currentStatus: { in: ["RESOLVED", "CLOSED"] } },
    },
    orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    distinct: ["ticketId"],
    take: LIST_LIMIT,
    include: { ticket: { select: { id: true, ticketNumber: true, summary: true, currentStatus: true } } },
  });
  return rows.map((h) => ({ ...h.ticket, resolvedAt: h.changedAt }));
}

// ---------------------------------------------------------------------------
// IT Staff Dashboard — across all Tickets; "my" metrics use the session user. Administrators get
// the same metrics plus user-account counts (BR-34); the key is absent, not null, for IT Staff.
// ---------------------------------------------------------------------------
export async function staffDashboard(prisma: PrismaClient, user: { id: number; role: Role }, now = new Date()) {
  const windowStart = recentWindowStart(now);
  const open: Prisma.TicketWhereInput = { currentStatus: { in: OPEN_STATUSES } };
  const myOpenActionsWhere: Prisma.ActionTakenWhereInput = { assigneeId: user.id, status: { in: OPEN_ACTION_STATUSES } };
  const myFollowUpsWhere: Prisma.ActionTakenWhereInput = {
    assigneeId: user.id,
    followUpRequired: true,
    status: { not: "CANCELLED" },
    ticket: { currentStatus: { notIn: ["CLOSED", "CANCELLED"] } },
  };

  const [
    unassignedOpen,
    myOpenTickets,
    waitingForRequester,
    resolvedAwaitingClose,
    requesterSaysResolved,
    myOpenActions,
    myFollowUps,
    statusGroups,
    priorityGroups,
    myActions,
    urgentAndRecent,
  ] = await Promise.all([
    prisma.ticket.count({ where: { ...open, ownerId: null } }),
    prisma.ticket.count({ where: { ...open, ownerId: user.id } }),
    prisma.ticket.count({ where: { currentStatus: "WAITING_FOR_REQUESTER" } }),
    prisma.ticket.count({ where: { currentStatus: "RESOLVED" } }),
    prisma.ticket.count({ where: { ...open, requesterConfirmedResolvedAt: { not: null } } }),
    prisma.actionTaken.count({ where: myOpenActionsWhere }),
    prisma.actionTaken.count({ where: myFollowUpsWhere }),
    prisma.ticket.groupBy({ by: ["currentStatus"], _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ["itPriority"], where: open, _count: { _all: true } }),
    prisma.actionTaken.findMany({
      where: { OR: [myOpenActionsWhere, myFollowUpsWhere] },
      orderBy: [{ actionAt: "asc" }, { id: "asc" }],
      take: LIST_LIMIT,
      include: { ticket: { select: { ticketNumber: true } } },
    }),
    // Postgres orders an enum by declaration order (LOW < MEDIUM < HIGH < URGENT), so `desc` puts
    // Urgent first; ties fall back to most recently updated, then id (BR-31).
    prisma.ticket.findMany({
      where: { ...open, OR: [{ itPriority: { in: ["URGENT", "HIGH"] } }, { updatedAt: { gte: windowStart } }] },
      orderBy: [{ itPriority: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: LIST_LIMIT,
      select: {
        id: true,
        ticketNumber: true,
        summary: true,
        currentStatus: true,
        itPriority: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, role: true } },
      },
    }),
  ]);

  const statusCount = (s: TicketStatus) => statusGroups.find((g) => g.currentStatus === s)?._count._all ?? 0;
  const priorityCount = (p: Priority) => priorityGroups.find((g) => g.itPriority === p)?._count._all ?? 0;

  const metrics: Metric[] = [
    { key: "unassignedOpen", label: "Unassigned", value: unassignedOpen, drillDown: "/queue?ownerId=unassigned&statusGroup=open" },
    { key: "myOpenTickets", label: "My open tickets", value: myOpenTickets, drillDown: `/queue?ownerId=${user.id}&statusGroup=open` },
    { key: "waitingForRequester", label: "Waiting for Requester", value: waitingForRequester, drillDown: "/queue?currentStatus=WAITING_FOR_REQUESTER" },
    { key: "resolvedAwaitingClose", label: "Resolved, awaiting close", value: resolvedAwaitingClose, drillDown: "/queue?currentStatus=RESOLVED" },
    { key: "requesterSaysResolved", label: "Requester says resolved", value: requesterSaysResolved, drillDown: "/queue?requesterResolved=true&statusGroup=open" },
    { key: "myOpenActions", label: "My open actions", value: myOpenActions, drillDown: null },
    { key: "myFollowUps", label: "My follow-ups", value: myFollowUps, drillDown: null },
  ];

  const result = {
    generatedAt: now,
    timeZone: DASHBOARD_TIME_ZONE,
    windowStart,
    metrics,
    byStatus: ALL_STATUSES.map((status) => ({ status, value: statusCount(status), drillDown: `/queue?currentStatus=${status}` })),
    openByItPriority: PRIORITIES_HIGH_FIRST.map((itPriority) => ({
      itPriority,
      value: priorityCount(itPriority),
      drillDown: `/queue?itPriority=${itPriority}&statusGroup=open`,
    })),
    lists: {
      myActions: myActions.map((a) => ({
        actionId: a.id,
        ticketId: a.ticketId,
        ticketNumber: a.ticket.ticketNumber,
        description: a.description,
        status: a.status,
        followUpRequired: a.followUpRequired,
        actionAt: a.actionAt,
      })),
      urgentAndRecent,
    },
  };

  if (user.role !== "ADMINISTRATOR") return result;

  const [activeGroups, inactive] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { isActive: true }, _count: { _all: true } }),
    prisma.user.count({ where: { isActive: false } }),
  ]);
  return {
    ...result,
    users: {
      activeByRole: ROLES.map((role) => ({
        role,
        value: activeGroups.find((g) => g.role === role)?._count._all ?? 0,
        drillDown: `/admin/users?role=${role}`,
      })),
      inactive: { value: inactive, drillDown: "/admin/users" },
    },
  };
}
