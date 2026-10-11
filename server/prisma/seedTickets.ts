import type { ActionStatus, Priority, PrismaClient, TicketStatus } from "@prisma/client";
import { formatTicketNumber } from "../src/ticketNumber.js";

// Issue 4-2 (Lab 4) — realistic demo Tickets (docs/lab-04/specification.md BR-36, BR-37, §7 "Seed").
// Kept apart from seed.ts so tests (migration-seed.api.test.ts, MIG-02/MIG-04) can run it directly
// without triggering seed.ts's module-level main().
//
// Idempotency: every seed Ticket carries a unique `seedKey`. A Ticket whose key already exists is
// skipped entirely — together with its Actions, Comments, Notes and history — so a re-run never
// duplicates anything and never overwrites a seed Ticket someone has since changed through the app.
// Each Ticket and its children are written in one transaction, so a crash can't leave a Ticket
// whose children were never created (which a later re-run would then skip forever).
//
// Coverage (BR-37): all 8 statuses, all 4 IT Priorities, owned and unassigned, zero/one/several
// Actions (including Actions by someone other than the owner), and timestamps both inside and outside
// the dashboards' 7-day window. Every seed Ticket is Alex Rivera's. Morgan Chen (Requester) and Riley
// Osei (IT Staff) are deliberately never used, so the zero/empty dashboard states can be shown.
// Every Resolved, Closed or Reopened seed Ticket has a Completed Action dated before its resolution,
// so seed data never contradicts the resolution gate (BR-17).

const ALEX = "alex.rivera@example.edu";
const TAYLOR = "taylor.brooks@example.edu";
const CASEY = "casey.nguyen@example.edu";
const JAMIE = "jamie.whitfield@example.edu";

interface SeedAction {
  daysAgo: number; // negative = scheduled in the future (Planned only)
  description: string;
  result?: string;
  status: ActionStatus;
  performedBy: string;
  assignee: string;
  followUpNote?: string; // present = follow-up required
  attachmentNotes?: string;
  updatedBy?: string;
}

interface SeedTicket {
  key: string;
  summary: string;
  description: string;
  category: string;
  relatedSystem: string;
  requestedPriority: Priority;
  itPriority: Priority;
  owner: string | null;
  createdDaysAgo: number;
  // Status changes after creation, oldest first. The last entry is the Ticket's current status.
  path: { to: TicketStatus; daysAgo: number; by: string }[];
  requesterResolvedDaysAgo?: number;
  actions: SeedAction[];
  comments: { daysAgo: number; by: string; content: string }[];
  notes: { daysAgo: number; by: string; content: string }[];
}

export const SEED_TICKETS: SeedTicket[] = [
  {
    key: "SEED-T01",
    summary: "Laptop won't power on before exam grading",
    description: "My corporate laptop shows no lights at all when I press the power button, even when plugged in. I need it to grade exams today.",
    category: "Hardware",
    relatedSystem: "Corporate Laptop",
    requestedPriority: "URGENT",
    itPriority: "URGENT",
    owner: null,
    createdDaysAgo: 0.1,
    path: [],
    actions: [],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T02",
    summary: "Request a second monitor for the office",
    description: "Could I get a second monitor for my office desk? A 24-inch one would be enough. No rush on this.",
    category: "Hardware",
    relatedSystem: "Corporate Laptop",
    requestedPriority: "LOW",
    itPriority: "LOW",
    owner: null,
    createdDaysAgo: 20,
    path: [],
    actions: [],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T03",
    summary: "Cannot access the shared Finance drive",
    description: "Since this morning I get 'access denied' when opening the shared Finance folder. Colleagues in my team can open it.",
    category: "Account and Access",
    relatedSystem: "Email",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    owner: TAYLOR,
    createdDaysAgo: 2,
    path: [{ to: "OPEN", daysAgo: 1.8, by: TAYLOR }],
    actions: [
      {
        daysAgo: -1,
        description: "Check the user's group membership against the Finance drive's access list.",
        status: "PLANNED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
      },
    ],
    comments: [{ daysAgo: 1.8, by: TAYLOR, content: "Thanks, I've picked this up and will check your access tomorrow morning." }],
    notes: [],
  },
  {
    key: "SEED-T04",
    summary: "Campus Wi-Fi drops in Building 3, room 304",
    description: "The Wi-Fi in room 304 disconnects every few minutes during lectures. Students have noticed it too.",
    category: "Network",
    relatedSystem: "Campus Wi-Fi",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    owner: null,
    createdDaysAgo: 10,
    path: [{ to: "OPEN", daysAgo: 9.5, by: CASEY }],
    actions: [],
    comments: [],
    notes: [{ daysAgo: 9.5, by: CASEY, content: "Likely the access point near the stairwell. Needs someone on site." }],
  },
  {
    key: "SEED-T05",
    summary: "Laptop crashes when waking from sleep",
    description: "My laptop shows a blue screen almost every time it wakes from sleep. It started after last week's update.",
    category: "Hardware",
    relatedSystem: "Corporate Laptop",
    requestedPriority: "HIGH",
    itPriority: "URGENT",
    owner: TAYLOR,
    createdDaysAgo: 3,
    path: [
      { to: "OPEN", daysAgo: 2.9, by: TAYLOR },
      { to: "IN_PROGRESS", daysAgo: 2.5, by: TAYLOR },
    ],
    actions: [
      {
        daysAgo: 2.4,
        description: "Ran hardware diagnostics and read the crash dumps.",
        result: "Memory test failed on slot 2; crash dumps point to a faulty RAM module.",
        status: "COMPLETED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
        attachmentNotes: "Crash dump summary saved as memtest-result.png on this ticket.",
      },
      {
        daysAgo: 1,
        description: "Replace the RAM module in slot 2 with a spare from stock.",
        status: "IN_PROGRESS",
        performedBy: TAYLOR,
        assignee: CASEY,
        updatedBy: CASEY,
      },
      {
        daysAgo: -2,
        description: "Confirm with the Requester that the laptop no longer crashes after waking.",
        status: "PLANNED",
        performedBy: TAYLOR,
        assignee: JAMIE,
        followUpNote: "If it still crashes, escalate for a full laptop replacement.",
      },
    ],
    comments: [
      { daysAgo: 2.4, by: TAYLOR, content: "We found a faulty memory module and will replace it." },
      { daysAgo: 2.3, by: ALEX, content: "Thank you! Can I keep using it until then?" },
      { daysAgo: 2.2, by: TAYLOR, content: "Yes, just save your work often." },
    ],
    notes: [{ daysAgo: 2.4, by: TAYLOR, content: "Spare RAM is in cabinet B. Casey has the key." }],
  },
  {
    key: "SEED-T06",
    summary: "VPN disconnects every hour",
    description: "The VPN drops my connection roughly every hour and I have to log in again.",
    category: "Network",
    relatedSystem: "VPN",
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    owner: CASEY,
    createdDaysAgo: 6,
    path: [
      { to: "OPEN", daysAgo: 5.8, by: CASEY },
      { to: "IN_PROGRESS", daysAgo: 5, by: CASEY },
    ],
    requesterResolvedDaysAgo: 0.5,
    actions: [
      {
        daysAgo: 4.5,
        description: "Pushed the updated VPN profile with a longer session timeout.",
        status: "IN_PROGRESS",
        performedBy: CASEY,
        assignee: CASEY,
      },
    ],
    comments: [{ daysAgo: 0.5, by: ALEX, content: "It has stayed connected all day today, looks fixed to me." }],
    notes: [],
  },
  {
    key: "SEED-T07",
    summary: "Printer on floor 2 prints blank pages",
    description: "The floor 2 printer feeds paper but prints nothing on it.",
    category: "Hardware",
    relatedSystem: "Printer",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    owner: CASEY,
    createdDaysAgo: 8,
    path: [
      { to: "OPEN", daysAgo: 7.5, by: CASEY },
      { to: "IN_PROGRESS", daysAgo: 7, by: CASEY },
      { to: "WAITING_FOR_REQUESTER", daysAgo: 1, by: CASEY },
    ],
    actions: [
      {
        daysAgo: 6.8,
        description: "Replaced the toner cartridge and ran a test page.",
        result: "Test page still blank; the issue isn't the toner.",
        status: "COMPLETED",
        performedBy: CASEY,
        assignee: CASEY,
      },
      {
        daysAgo: -1,
        description: "Inspect the print drum once the Requester confirms which tray they used.",
        status: "PLANNED",
        performedBy: CASEY,
        assignee: CASEY,
        followUpNote: "Waiting for the Requester's reply before ordering a new drum.",
      },
    ],
    comments: [{ daysAgo: 1, by: CASEY, content: "Which paper tray were you printing from? Please reply so we can continue." }],
    notes: [],
  },
  {
    key: "SEED-T08",
    summary: "Grade Submission App rejects CSV upload",
    description: "Uploading my grades CSV fails with 'invalid format', even though I used the template.",
    category: "Software",
    relatedSystem: "Grade Submission App",
    requestedPriority: "HIGH",
    itPriority: "MEDIUM",
    owner: TAYLOR,
    createdDaysAgo: 5,
    path: [
      { to: "OPEN", daysAgo: 4.8, by: TAYLOR },
      { to: "IN_PROGRESS", daysAgo: 4.5, by: TAYLOR },
      { to: "RESOLVED", daysAgo: 1, by: TAYLOR },
    ],
    requesterResolvedDaysAgo: 1.5,
    actions: [
      {
        daysAgo: 4.4,
        description: "Compared the uploaded file with the official template.",
        result: "The file was saved with semicolons instead of commas.",
        status: "COMPLETED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
        attachmentNotes: "See the Requester's uploaded grades file on this ticket.",
      },
      {
        daysAgo: 2,
        description: "Walked the Requester through exporting the file as comma-separated.",
        result: "Upload succeeded on the second try.",
        status: "COMPLETED",
        performedBy: CASEY,
        assignee: CASEY,
      },
    ],
    comments: [{ daysAgo: 1.5, by: ALEX, content: "The upload works now, thanks!" }],
    notes: [],
  },
  {
    key: "SEED-T09",
    summary: "Email signature shows the old department name",
    description: "My email signature still shows the department's old name after the reorganisation.",
    category: "Software",
    relatedSystem: "Email",
    requestedPriority: "LOW",
    itPriority: "LOW",
    owner: JAMIE,
    createdDaysAgo: 14,
    path: [
      { to: "OPEN", daysAgo: 13.5, by: JAMIE },
      { to: "IN_PROGRESS", daysAgo: 13, by: JAMIE },
      { to: "RESOLVED", daysAgo: 12, by: JAMIE },
    ],
    actions: [
      {
        daysAgo: 12.5,
        description: "Updated the department name in the directory, which feeds the signature template.",
        result: "New name appears after the next directory sync.",
        status: "COMPLETED",
        performedBy: JAMIE,
        assignee: JAMIE,
        followUpNote: "Check that other staff in the same department also got the new name.",
      },
    ],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T10",
    summary: "Request access to the LEB2 course shell",
    description: "I'm co-teaching CPE334 this term and need instructor access to its LEB2 course shell.",
    category: "Account and Access",
    relatedSystem: "LEB2 App",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    owner: CASEY,
    createdDaysAgo: 30,
    path: [
      { to: "OPEN", daysAgo: 29, by: CASEY },
      { to: "IN_PROGRESS", daysAgo: 28, by: CASEY },
      { to: "RESOLVED", daysAgo: 20, by: CASEY },
      { to: "CLOSED", daysAgo: 15, by: CASEY },
    ],
    actions: [
      {
        daysAgo: 27,
        description: "Requested approval from the course coordinator.",
        result: "Coordinator approved by email.",
        status: "COMPLETED",
        performedBy: CASEY,
        assignee: CASEY,
      },
      {
        daysAgo: 21,
        description: "Added the Requester as an instructor on the course shell.",
        result: "Requester confirmed they can see the course.",
        status: "COMPLETED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
      },
    ],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T11",
    summary: "Laptop battery drains within an hour",
    description: "The battery goes from full to empty in about an hour, even with the screen dimmed.",
    category: "Hardware",
    relatedSystem: "Corporate Laptop",
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    owner: TAYLOR,
    createdDaysAgo: 35,
    path: [
      { to: "OPEN", daysAgo: 34, by: TAYLOR },
      { to: "IN_PROGRESS", daysAgo: 33, by: TAYLOR },
      { to: "RESOLVED", daysAgo: 28, by: TAYLOR },
      { to: "CLOSED", daysAgo: 25, by: TAYLOR },
    ],
    actions: [
      {
        daysAgo: 29,
        description: "Replaced the battery under warranty.",
        result: "Battery now lasts about seven hours.",
        status: "COMPLETED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
      },
    ],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T12",
    summary: "Duplicate: Wi-Fi drops in room 304",
    description: "Opened this by mistake — it's the same problem as my earlier Wi-Fi ticket.",
    category: "Network",
    relatedSystem: "Campus Wi-Fi",
    requestedPriority: "LOW",
    itPriority: "LOW",
    owner: null,
    createdDaysAgo: 9,
    path: [{ to: "CANCELLED", daysAgo: 8.9, by: ALEX }],
    actions: [],
    comments: [],
    notes: [],
  },
  {
    key: "SEED-T13",
    summary: "Outlook keeps asking for my password",
    description: "Outlook asks me to sign in again several times a day.",
    category: "Account and Access",
    relatedSystem: "Email",
    requestedPriority: "MEDIUM",
    itPriority: "HIGH",
    owner: TAYLOR,
    createdDaysAgo: 22,
    path: [
      { to: "OPEN", daysAgo: 21.5, by: TAYLOR },
      { to: "IN_PROGRESS", daysAgo: 21, by: TAYLOR },
      { to: "RESOLVED", daysAgo: 18, by: TAYLOR },
      { to: "CLOSED", daysAgo: 14, by: TAYLOR },
      { to: "REOPENED", daysAgo: 2, by: TAYLOR },
    ],
    actions: [
      {
        daysAgo: 20,
        description: "Cleared the stored credentials and re-added the mail account.",
        result: "Password prompts stopped.",
        status: "COMPLETED",
        performedBy: TAYLOR,
        assignee: TAYLOR,
      },
      {
        daysAgo: 19,
        description: "Checked the account's sign-in log for failed attempts.",
        result: "No suspicious sign-ins found.",
        status: "COMPLETED",
        performedBy: JAMIE,
        assignee: JAMIE,
      },
    ],
    comments: [{ daysAgo: 2, by: ALEX, content: "The password prompts are back since yesterday." }],
    notes: [{ daysAgo: 2, by: TAYLOR, content: "Possibly the new conditional-access policy. Check before re-adding the account again." }],
  },
  {
    key: "SEED-T14",
    summary: "Install statistics software on lab PCs",
    description: "Please install the statistics package on the 20 PCs in the teaching lab before next term.",
    category: "Software",
    relatedSystem: "Corporate Laptop",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    owner: CASEY,
    createdDaysAgo: 18,
    path: [
      { to: "OPEN", daysAgo: 17, by: CASEY },
      { to: "CANCELLED", daysAgo: 16, by: CASEY },
    ],
    actions: [
      {
        daysAgo: 17,
        description: "Schedule installation on the teaching lab PCs.",
        status: "CANCELLED",
        performedBy: CASEY,
        assignee: CASEY,
        updatedBy: CASEY,
      },
    ],
    comments: [{ daysAgo: 16, by: CASEY, content: "The faculty has bought a site licence that installs automatically, so this is no longer needed." }],
    notes: [],
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

export async function seedTickets(prisma: PrismaClient, now: Date = new Date()): Promise<{ created: number; skipped: number }> {
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS);

  const emails = [ALEX, TAYLOR, CASEY, JAMIE];
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
  const userId = (email: string) => {
    const user = users.find((u) => u.email === email);
    if (!user) throw new Error(`Seed user ${email} is missing — run the user seed first.`);
    return user.id;
  };
  const categories = await prisma.category.findMany();
  const systems = await prisma.relatedSystem.findMany();
  const categoryId = (name: string) => categories.find((c) => c.name === name)!.id;
  const systemId = (name: string) => systems.find((s) => s.name === name)!.id;

  let created = 0;
  let skipped = 0;
  for (const t of SEED_TICKETS) {
    const existing = await prisma.ticket.findUnique({ where: { seedKey: t.key }, select: { id: true } });
    if (existing) {
      skipped++;
      continue;
    }

    const createdAt = at(t.createdDaysAgo);
    const lastEvent = [
      t.createdDaysAgo,
      ...t.path.map((p) => p.daysAgo),
      ...t.actions.filter((a) => a.daysAgo >= 0).map((a) => a.daysAgo),
      ...t.comments.map((c) => c.daysAgo),
    ].reduce((min, d) => Math.min(min, d));
    const currentStatus = t.path.length > 0 ? t.path[t.path.length - 1].to : "NEW";

    await prisma.$transaction(async (tx) => {
      const [{ nextval }] = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval(pg_get_serial_sequence('"Ticket"', 'id')) AS nextval`;
      const id = Number(nextval);
      await tx.ticket.create({
        data: {
          id,
          ticketNumber: formatTicketNumber(id, createdAt),
          seedKey: t.key,
          requesterId: userId(ALEX),
          ownerId: t.owner ? userId(t.owner) : null,
          categoryId: categoryId(t.category),
          relatedSystemId: systemId(t.relatedSystem),
          summary: t.summary,
          description: t.description,
          requestedPriority: t.requestedPriority,
          itPriority: t.itPriority,
          currentStatus,
          requesterConfirmedResolvedAt: t.requesterResolvedDaysAgo !== undefined ? at(t.requesterResolvedDaysAgo) : null,
          // Seed Tickets are "lived-in": `version` reflects how many workflow writes they've had.
          version: 1 + t.path.length + (t.owner ? 1 : 0),
          createdAt,
          updatedAt: at(lastEvent),
        },
      });

      // BR-20: creation entry (null -> New) plus one row per status change.
      await tx.ticketStatusHistory.createMany({
        data: [
          { ticketId: id, fromStatus: null, toStatus: "NEW", changedById: userId(ALEX), changedAt: createdAt },
          ...t.path.map((p, i) => ({
            ticketId: id,
            fromStatus: i === 0 ? ("NEW" as TicketStatus) : t.path[i - 1].to,
            toStatus: p.to,
            changedById: userId(p.by),
            changedAt: at(p.daysAgo),
          })),
        ],
      });

      for (const a of t.actions) {
        await tx.actionTaken.create({
          data: {
            ticketId: id,
            actionAt: at(a.daysAgo),
            description: a.description,
            result: a.result ?? null,
            status: a.status,
            performedById: userId(a.performedBy),
            assigneeId: userId(a.assignee),
            followUpRequired: a.followUpNote !== undefined,
            followUpNote: a.followUpNote ?? null,
            attachmentNotes: a.attachmentNotes ?? null,
            updatedById: a.updatedBy ? userId(a.updatedBy) : null,
            version: a.updatedBy ? 2 : 1,
            createdAt: at(Math.max(a.daysAgo, 0)),
          },
        });
      }

      await tx.comment.createMany({
        data: t.comments.map((c) => ({ ticketId: id, authorId: userId(c.by), content: c.content, createdAt: at(c.daysAgo) })),
      });
      await tx.note.createMany({
        data: t.notes.map((n) => ({ ticketId: id, authorId: userId(n.by), content: n.content, createdAt: at(n.daysAgo) })),
      });
    });
    created++;
  }

  return { created, skipped };
}
