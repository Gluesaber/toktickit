# Lab 4 Sprint Engineering Specification

Extends `docs/lab-03/specification.md`. Everything there still applies unless a rule below explicitly
supersedes it. The Lab 3 status matrix (§5.2 there) is replaced by §5.2 here, and Lab 3 BR-25 ("Problem
Appears Resolved") is extended by BR-18 here. IDs in this file (FR/BR/AC) restart at 01 and belong to
Lab 4. Where a Lab 3 rule is meant, it is written as "Lab 3 BR-xx".

## 1. Sprint Goal

Complete the core TokTickIT service-desk workflow. IT Staff and Administrators can plan and record the
actual work on a Ticket as **Actions Taken**. The Ticket lifecycle is final and enforced by the backend,
including a resolution gate that needs real recorded work. Requesters, IT Staff and Administrators each
get a concise dashboard that links to the detailed screens. Every Lab 1–3 feature keeps working, now
hardened against stale updates, double submissions and inconsistent UI.

## 2. Stakeholder Request Interpretation

Talking to the Requester (Public Comments) is not the same as tracking the work. IT needs a work log
under each Ticket: what was done or planned, when, what the outcome was, who did it, who is responsible
for it, and whether something still needs a follow-up. Any IT Staff member may record work on a Ticket.
The Ticket Owner still coordinates the Ticket as a whole. A Requester saying "it looks fixed" is a hint
to IT, not a decision. Only IT Staff or an Administrator resolves a Ticket, and only after at least one
piece of work is recorded as completed. Dashboards answer "what needs my attention right now?" in a few
numbers and short lists, and every number opens the full list behind it. Finally, the whole application
should feel like one finished, consistent Zen Green product.

## 3. Scope

### Included
- Actions Taken: one Ticket has many Actions. Each Action has Action Date/Time, Action Description,
  Result, Performed by (automatic), Assignee, Action Status, Follow-Up Required?, Follow-up Note
  (required when follow-up is needed) and Attachment Notes.
- Create, view and edit Actions on IT Staff Ticket Detail. Requesters get a read-only view on their own
  Ticket Detail.
- The final Ticket status-transition matrix (§5.2), a backend resolution gate, and an append-only Ticket
  status history shown as a timeline.
- Optimistic concurrency (stale-update detection) on Ticket workflow changes and Action edits.
- A Requester Dashboard, an IT Staff Dashboard and an Administrator Dashboard (the Staff Dashboard plus
  user counts), each with drill-down links into My Tickets, the Ticket Queue, Ticket Detail or User
  Management.
- Two Lab 3 gaps closed:
  - the Staff Ticket Detail now shows the Requester's "Problem Appears Resolved" indication;
  - the seed script now creates realistic Tickets, Actions, Comments, Notes and status history.
- A Prisma migration that keeps all existing data, a documented rollback and recovery approach, and an
  idempotent seed.
- Final hardening:
  - double-submit protection and form-data retention;
  - consistent loading, empty, error, forbidden, conflict and not-found feedback;
  - removal of obsolete artifacts;
  - a current README;
  - responsive and accessibility pass;
  - full Lab 1–3 regression.

### Excluded
- Automatic SLA clocks, escalation engines, on-call scheduling, breach notifications, and any automatic
  assignment or routing of Tickets or Actions (assignment stays manual, §11).
- Email, SMS, LINE, push or any other external notification.
- Inventory, spare parts, purchasing, cost accounting, time-sheets, billing, payroll and labor cost.
- Multi-level approvals and electronic signatures.
- BI tools, custom report builders, exports and configurable dashboards.
- Multi-tenant organizations and production cloud operations.
- Deleting Actions, status-history entries, Comments or Notes.
- Requester-initiated Reopen (§11).
- File upload on Actions. "Attachment Notes" is a text pointer to existing Ticket attachments or external
  files, not a new upload mechanism.
- Any feature not listed in this contract.

## 4. Functional Requirements

**Actions Taken**
- FR-01 IT Staff Ticket Detail has an **Actions Taken** section that lists every Action on the Ticket
  (table on desktop, cards on mobile) with all of its fields.
- FR-02 IT Staff and Administrators can create an Action in a create-mode form on that screen.
- FR-03 IT Staff and Administrators can open any Action in view mode, then switch to edit mode to change
  its editable fields while it is still Planned or In Progress.
- FR-04 An Action's own status can be moved Planned → In Progress → Completed, or to Cancelled, from the
  same screen.
- FR-05 The Assignee is chosen from active IT Staff and Administrators and defaults to the current user.
- FR-06 Requester Ticket Detail shows a read-only Actions Taken section with every Action on the
  Requester's own Ticket.

**Ticket workflow**
- FR-07 The Ticket status control offers only transitions permitted for the caller's role from the current
  status (§5.2). While the resolution gate is unmet, "Resolved" is shown disabled, with the reason as text.
- FR-08 A successful status change refreshes the Ticket summary (status badge, version, status history)
  without a full page reload.
- FR-09 Both Ticket Detail screens show a Status History timeline: every recorded status change, oldest
  first, with who made it and when.
- FR-10 Staff Ticket Detail shows the Requester's "Problem Appears Resolved" indication, with its date,
  while it is set.
- FR-11 A stale update (§5.4) shows a conflict message with a Reload action. It never silently overwrites
  and never loses what the user typed.

**Dashboards**
- FR-12 Requester Dashboard: metric cards and short lists for the authenticated Requester's own Tickets
  (§5.5).
- FR-13 IT Staff Dashboard: operational metric cards, "my" Actions, and an urgent/recent Ticket list
  (§5.5).
- FR-14 Administrator Dashboard: the IT Staff Dashboard plus user-account counts (§5.5).
- FR-15 Every role gets a "Dashboard" navigation link with an active-page indication, and the Dashboard is
  the landing screen after login.
- FR-16 Every metric card and list row has a drill-down. My Tickets, the Ticket Queue and User Management
  read their filters from the URL query string, so a drill-down link opens an already-filtered list.

**Hardening and regression**
- FR-17 Every create or update button is disabled while its request is in flight. Action creation is also
  idempotent on the server (BR-14).
- FR-18 Forms keep the user's input after a recoverable failure (validation, conflict, server or network
  error).
- FR-19 Every screen uses the same loading, empty/no-results, validation, success, forbidden, conflict,
  not-found and safe-failure patterns.
- FR-20 Obsolete, temporary or placeholder artifacts are removed: no console errors, broken links or
  unfinished controls. This includes the obsolete `e2e/lab-02` specs (§11).
- FR-21 The README setup, migration, seed, test and demo instructions are current and verified by a
  fresh-clone run.
- FR-22 All Lab 4 screens follow Zen Green, are responsive at desktop, tablet and mobile, and meet the
  Lab 2/3 accessibility rules.
- FR-23 Every new write operation is authorized by the backend, independent of the UI.

## 5. Business Rules

**Given (mandatory) examples, kept verbatim:**
- BR-01 Action Taken belongs to exactly one Ticket.
- BR-02 The Ticket Owner coordinates the Ticket, but an Action Taken may be by a different IT Staff
  member.

**Actions Taken: authorization and identity**
- BR-03 Only active IT Staff and Administrators may create or update an Action, on any Ticket (shared
  queue, same as Lab 3 BR-20). A Requester can only read Actions on Tickets they own. Requester calls to
  any Action write endpoint return 403.
- BR-04 **Performed by** is set by the backend to the authenticated user who creates the Action and can
  never be changed. A client-supplied value is ignored.
- BR-05 **Assignee** must be an active user with role IT Staff or Administrator. It defaults to the
  Performed-by user when omitted. A Requester, an inactive user or an unknown id is rejected (400
  `INVALID_ASSIGNEE`). Deactivating a user later does not rewrite Actions already assigned to them. It
  only stops new assignments.
- BR-06 Every edit records `updatedBy` (the authenticated user) and `updatedAt`. Any active IT Staff or
  Administrator may edit any Action that is not locked (BR-10). Edits are not restricted to the performer
  or assignee.

**Actions Taken: field rules**
- BR-07 **Action Date/Time** (`actionAt`) is required (the UI pre-fills "now"). It may not be earlier than
  the Ticket's creation time. A Completed Action's `actionAt` may not be more than 5 minutes in the future
  (clock-skew allowance). A Planned or In Progress Action may be scheduled up to 365 days ahead.
- BR-08 **Action Description** is required, 1–2000 characters after trimming. **Result** is optional, up
  to 2000 characters, but becomes required (non-blank) once the Action is Completed. **Attachment Notes**
  is optional, up to 500 characters.
- BR-09 **Follow-Up Required?** is a boolean, false by default. When true, **Follow-up Note** is required,
  1–1000 characters after trimming. When false, the Follow-up Note is stored as null, whatever the client
  sent.

**Actions Taken: lifecycle and integrity**
- BR-10 Action status lifecycle:
  - Permitted moves: Planned → In Progress, Planned → Completed, In Progress → Completed, and
    Planned or In Progress → Cancelled.
  - Completed and Cancelled are final.
  - A new Action may start as Planned, In Progress or Completed, but not Cancelled.
  - A final Action is locked. Any edit returns 409 `ACTION_LOCKED`, so a completed record of work cannot
    be rewritten afterwards.
  - Any other status move returns 409 `ACTION_TRANSITION_NOT_PERMITTED`.
- BR-11 Actions are never deleted. No delete endpoint exists. Cancelling is how a mistaken or abandoned
  Action is withdrawn.
- BR-12 Actions can be created or edited only while the parent Ticket is not Closed or Cancelled (409
  `TICKET_NOT_ACTIONABLE`). They remain readable at every status.
- BR-13 Actions are always listed in a stable order: `actionAt` ascending, then `id` ascending.
- BR-14 **Duplicate protection.** Each create request carries a client-generated `clientRequestId` (one
  UUID per opened create form). It is unique per Ticket. Repeating a create with the same
  `clientRequestId` returns the already-created Action (200) and never creates a second one.
- BR-15 A Requester sees every Action on their own Ticket with all of its fields, read-only (labsheet
  §8.3). Internal Notes stay hidden from Requesters (Lab 3 BR-04/BR-29).

**Ticket workflow and resolution**
- BR-16 Ticket status changes follow §5.2 exactly. Any (from, to, role) combination not listed there
  returns 409 `TRANSITION_NOT_PERMITTED`.
- BR-17 **Resolution gate.** Every transition into Resolved, from any source status, requires at least one
  **Completed** Action on the Ticket. Otherwise it returns 409
  `RESOLUTION_REQUIRES_COMPLETED_ACTION`. The backend checks this in the same transaction as the status
  write, so a client that skips the screen is still blocked.
- BR-18 The Requester's "Problem Appears Resolved" indication (`requesterConfirmedResolvedAt`, Lab 3
  BR-25) stays advisory and never changes the status by itself. It is cleared (set to null) when the
  Ticket moves into Reopened or In Progress, because staff are working on it again. A cleared indication
  can be set again under Lab 3 BR-25's rules.
- BR-19 A Requester's only status power is still self-Cancel from New or Open on their own Ticket. A
  Requester cannot Resolve, Close or Reopen.
- BR-20 **Append-only status history.** Every status change, and every Ticket creation (from null to New),
  adds one `TicketStatusHistory` row (from, to, changedBy, changedAt) in the same transaction as the
  change. History rows are never updated or deleted, and no endpoint can modify them.
- BR-21 **Legacy Tickets** (created before this migration) have no history rows and no Actions. Their
  status history starts at their first Lab 4 status change, and the timeline says earlier history was not
  recorded. Their current status is left as it is. The resolution gate applies only to future transitions
  into Resolved, so an already-Resolved or Closed legacy Ticket stays valid.

**Concurrency (stale-update handling)**
- BR-22 `Ticket.version` is an integer starting at 1. Every Ticket workflow write increments it: status
  change, owner change and IT Priority change. Each of those requests must include the `version` the
  client last saw. A mismatch returns 409 `STALE_UPDATE` with the Ticket's current state and changes
  nothing. This includes the Requester's self-Cancel.
- BR-23 Each Action has its own `version`. An Action edit must include it. A mismatch returns 409
  `STALE_UPDATE` with the Action's current state.
- BR-24 The version check and the write are one atomic conditional update (`WHERE id = ? AND version = ?`).
  Of two simultaneous requests that saw the same version, exactly one succeeds.
- BR-25 Append-only writes (new Public Comment, Internal Note or Action) neither require nor increment
  `Ticket.version`, because they cannot overwrite anyone's change.
- BR-26 `Ticket.updatedAt` means last visible activity. It is bumped by status, owner and IT Priority
  changes, by Action create or edit, and by Public Comments. Internal Notes do not bump it, so a
  Requester-visible timestamp can never reveal internal-only activity.

**Dashboards**
- BR-27 The **Open** status group is New, Open, In Progress, Waiting for Requester and Reopened. Resolved,
  Closed and Cancelled are not open.
- BR-28 The backend computes every metric at request time from the authoritative tables. Nothing is cached
  or stored, and the client never derives a count from a list.
- BR-29 The **recent window** runs from 00:00 Asia/Bangkok (UTC+7, no daylight saving) six calendar days
  before today, up to the request time: 7 calendar days including today. Every dashboard response returns
  `windowStart`, so the boundary can be checked.
- BR-30 The Requester Dashboard is always scoped to the session user's own Tickets, and no parameter can
  widen it. IT Staff and Administrators calling it get 403. Requesters calling the Staff Dashboard get 403.
- BR-31 Dashboard lists hold at most 5 rows, in a deterministic order with `id` as the final tie-breaker.
  A metric with no matching records returns 0, and a list with none returns `[]`. Neither is an error.
- BR-32 The metric definitions in §5.5 are authoritative. Each one names its query, empty behavior and
  drill-down destination.
- BR-33 "Recently resolved" means the Ticket's latest status-history transition into Resolved falls inside
  the recent window, and the Ticket is still Resolved or Closed. *Refined in Issue 4-5:* a Ticket
  reopened since is no longer resolved work, so it isn't listed. Legacy Tickets resolved before Lab 4
  have no such row and are not listed (BR-21).
- BR-34 Administrators get the IT Staff metrics plus user-account counts (active users per role, and total
  inactive users). The user counts never appear in an IT Staff response.

**Data, migration and seed**
- BR-35 The Lab 4 migration only adds things: new enum, new tables, and new Ticket columns with defaults
  or nullable. It preserves every existing User, Ticket, Attachment, Comment and Note row and every
  relationship. Existing Tickets get `version = 1` and `seedKey = NULL`.
- BR-36 The seed is idempotent. Seed Tickets are matched by their unique `seedKey` and created only if
  absent. Existing rows, including seed rows changed through the app, are never overwritten. Users,
  Categories and Related Systems keep their Lab 3 seed rules.
- BR-37 Seed coverage:
  - Every seed Ticket's Requester is `alex.rivera@example.edu`.
  - Together the seed Tickets cover all 8 statuses and all 4 IT Priorities.
  - Some are assigned and some are unassigned.
  - Some have zero, one and several Actions, including Actions by staff other than the owner.
  - Timestamps fall both inside and outside the recent window.
  - `morgan.chen@example.edu` (Requester) and `riley.osei@example.edu` (IT Staff) are deliberately left
    with no Tickets, Actions or ownership, so the zero and empty dashboard states can be demonstrated.

**Hardening and regression**
- BR-38 Create and update controls are disabled while a request is in flight. After a recoverable failure,
  forms keep every entered value. Password fields are the exception (Lab 3 practice).
- BR-39 Lab 3 BR-01 to BR-39 still hold, except where this file supersedes them (status matrix → §5.2;
  BR-25 → extended by BR-18).

### 5.1. Authorization Matrix

Administrators keep full IT Staff parity on Ticket operations (Lab 3 §11). "✓ (own)" means only on a
Ticket the Requester owns. Requests outside ownership return 404, the Lab 2/3 anti-enumeration rule.

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| All Lab 3 operations | per Lab 3 §5.1 | per Lab 3 §5.1 | per Lab 3 §5.1 |
| View Actions Taken | ✓ (own) | ✓ (any) | ✓ (any) |
| Create Action | ✗ (403) | ✓ | ✓ |
| Edit Action / change Action status | ✗ (403) | ✓ | ✓ |
| Delete Action | ✗ (no endpoint) | ✗ (no endpoint) | ✗ (no endpoint) |
| Be an Action's Assignee | ✗ | ✓ (active) | ✓ (active) |
| View Ticket status history | ✓ (own) | ✓ (any) | ✓ (any) |
| Change Ticket status | Cancel only, New/Open, own | per §5.2 | per §5.2 |
| Requester Dashboard | ✓ (own data only) | ✗ (403) | ✗ (403) |
| IT Staff Dashboard | ✗ (403) | ✓ | ✓ (+ user counts) |

### 5.2. Ticket Status Transition Matrix (final)

Cancelled is the only terminal status. Rows marked **new** are Lab 4 additions. Every other row is
unchanged from Lab 3 §5.2. "Gate" means BR-17 applies.

| From | To | Who | Notes |
|---|---|---|---|
| *(create)* | New | system | history row from null to New (BR-20) |
| New | Open | IT Staff / Administrator | |
| New, Open | Cancelled | Requester (own) or IT Staff / Administrator | |
| Open | In Progress | IT Staff / Administrator | clears the Requester indication (BR-18) |
| Open, In Progress, Waiting for Requester | Cancelled | IT Staff / Administrator | |
| In Progress | Waiting for Requester | IT Staff / Administrator | |
| Waiting for Requester | In Progress | IT Staff / Administrator | clears the Requester indication |
| Open, In Progress, Waiting for Requester | Resolved | IT Staff / Administrator | **Gate** |
| Resolved | Closed | IT Staff / Administrator | |
| Resolved, Closed | Reopened | IT Staff / Administrator | clears the Requester indication |
| Reopened | In Progress | IT Staff / Administrator | clears the Requester indication |
| Reopened | Resolved | IT Staff / Administrator | **new**, **Gate** |
| Reopened | Cancelled | IT Staff / Administrator | **new**. Without it, a reopened Ticket could never be withdrawn |

A Ticket's earlier Completed Actions still count toward the gate after a Reopen. The gate asks whether any
work was recorded as completed on this Ticket, not whether new work was done since the reopen. Staff are
expected to add an Action describing the fix for the recurrence. That is the UI's prompt (ui-spec §5.4),
not a backend rule (§11).

### 5.3. Action Status Matrix

| From | To | Notes |
|---|---|---|
| *(create)* | Planned, In Progress, Completed | Completed at creation needs Result (BR-08) |
| Planned | In Progress, Completed, Cancelled | |
| In Progress | Completed, Cancelled | |
| Completed, Cancelled | — | final, locked (BR-10) |

### 5.4. Stale-update Handling Summary

| Write | Requires | Conflict response |
|---|---|---|
| `PATCH /api/tickets/:id/status` (Requester and staff) | Ticket `version` | 409 `STALE_UPDATE` + current `{ id, currentStatus, version, updatedAt }` |
| `PATCH /api/staff/tickets/:id/owner` | Ticket `version` | same |
| `PATCH /api/staff/tickets/:id/priority` | Ticket `version` | same |
| `PATCH /api/staff/tickets/:id/actions/:actionId` | Action `version` | 409 `STALE_UPDATE` + the current Action |
| Create Action / Comment / Note | — (append-only, BR-25) | Duplicate create protection only (BR-14) |

### 5.5. Dashboard Metric Definitions

"Window" is BR-29's recent window. "Open" is BR-27's group. "Me" is the session user. All counts come from
`count(*)` on the stated condition.

**Requester Dashboard** (`GET /api/dashboard/requester`), always with `requesterId = me`:

| Key | Label | Query | Empty | Drill-down |
|---|---|---|---|---|
| `openTickets` | Open tickets | status in Open | 0, "You have no open tickets." | `/tickets?statusGroup=open` |
| `waitingForMe` | Waiting for you | status = Waiting for Requester | 0, "Nothing is waiting on you." | `/tickets?currentStatus=WAITING_FOR_REQUESTER` |
| `resolvedAwaitingClose` | Resolved | status = Resolved | 0 | `/tickets?currentStatus=RESOLVED` |
| `updatedRecently` | Updated in the last 7 days | `updatedAt ≥ windowStart` | 0 | `/tickets?sortBy=updatedAt&sortDir=desc` |
| list `recentlyUpdated` | Recently updated | `updatedAt ≥ windowStart`, ordered `updatedAt desc, id desc`, top 5 | `[]` + empty text | each row → `/tickets/:id` |
| list `recentlyResolved` | Recently resolved | latest history row into Resolved with `changedAt ≥ windowStart`, Ticket still Resolved or Closed (BR-33), ordered `changedAt desc, id desc`, top 5 | `[]` + empty text | each row → `/tickets/:id` |

**IT Staff Dashboard** (`GET /api/staff/dashboard`), across all Tickets:

| Key | Label | Query | Empty | Drill-down |
|---|---|---|---|---|
| `unassignedOpen` | Unassigned | status in Open and `ownerId IS NULL` | 0 | `/queue?ownerId=unassigned&statusGroup=open` |
| `myOpenTickets` | My open tickets | status in Open and `ownerId = me` | 0 | `/queue?ownerId=<me>&statusGroup=open` |
| `waitingForRequester` | Waiting for Requester | status = Waiting for Requester | 0 | `/queue?currentStatus=WAITING_FOR_REQUESTER` |
| `resolvedAwaitingClose` | Resolved, awaiting close | status = Resolved | 0 | `/queue?currentStatus=RESOLVED` |
| `requesterSaysResolved` | Requester says resolved | status in Open and `requesterConfirmedResolvedAt IS NOT NULL` | 0 | `/queue?requesterResolved=true&statusGroup=open` |
| `myOpenActions` | My open actions | Actions with `assigneeId = me` and status in (Planned, In Progress) | 0 | list below |
| `myFollowUps` | My follow-ups | Actions with `assigneeId = me`, `followUpRequired = true`, status ≠ Cancelled, on a Ticket not Closed or Cancelled | 0 | list below |
| `byStatus` | Tickets by status | one count per status, all 8 always present (0 if none) | all zeros | `/queue?currentStatus=<S>` |
| `openByItPriority` | Open tickets by IT Priority | status in Open, one count per priority, all 4 always present | all zeros | `/queue?itPriority=<P>&statusGroup=open` |
| list `myActions` | My open actions and follow-ups | union of the two Action sets above, ordered `actionAt asc, id asc`, top 5 | `[]` | each row → `/queue/:ticketId` |
| list `urgentAndRecent` | Urgent and recent | status in Open and (IT Priority in (Urgent, High) or `updatedAt ≥ windowStart`), ordered by priority rank desc, then `updatedAt desc, id desc`, top 5 | `[]` | each row → `/queue/:id` |

**Administrator Dashboard** (`GET /api/staff/dashboard` called as an Administrator): everything above,
plus:

| Key | Label | Query | Drill-down |
|---|---|---|---|
| `activeUsersByRole` | Active users | `isActive = true`, one count per role | `/admin/users?role=<R>` |
| `inactiveUsers` | Inactive users | `isActive = false` | `/admin/users` |

## 6. UI Specification Summary

Full detail is in `ui-spec.md`. Summary:

- **Application shell**: "Dashboard" is the first nav link for every role and the landing route after
  login. The active link is marked with `aria-current="page"` as well as a visual style, so the cue is not
  color alone.
- **Requester Dashboard**: 4 metric cards and 2 short lists, each with a drill-down. Loading, empty,
  failure-with-retry and forbidden states.
- **IT Staff Dashboard**: 5 operational cards, a "My work" panel (my open actions and follow-ups), status
  and IT Priority breakdowns (clickable counts with text labels), and an "Urgent and recent" list.
  Administrators also see a "Users" card group.
- **Staff Ticket Detail**: new **Actions Taken** card (list plus create/view/edit modes, Action status
  controls, assignee picker, follow-up fields with conditional validation) and a **Status History**
  timeline. The status control disables "Resolved" with a visible reason until the gate is met. A
  "Requester says resolved" indicator sits beside the status. Stale-update conflicts show a banner with
  Reload and keep the user's input.
- **Requester Ticket Detail**: a read-only Actions Taken card and the Status History timeline. Nothing
  else about it changes.
- **My Tickets, Ticket Queue and User Management**: filters read from and write to the URL so
  drill-downs work. The Queue's status filter gains an "All open" option, plus a "Requester says
  resolved" filter.
- **Zen Green**: same tokens. New `ActionStatusBadge` and "Follow-up" badges reuse the existing palette.
  Text labels always accompany color.

## 7. Data Changes

One incremental Prisma migration, `lab4_actions_taken`, built with the established `migrate diff` →
hand-review → `migrate deploy` workflow. The diff's recurring `DROP TABLE "session"` line is removed by
hand.

| Model | Key fields | Notes |
|---|---|---|
| `ActionStatus` (new enum) | `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED` | §5.3 |
| `ActionTaken` (new) | `id`, `ticketId` (FK → Ticket, required, BR-01), `actionAt`, `description` (Text), `result` (Text, nullable), `status` (`ActionStatus`), `performedById` (FK → User, required, immutable, BR-04), `assigneeId` (FK → User, required, BR-05), `followUpRequired` (bool, default false), `followUpNote` (Text, nullable), `attachmentNotes` (varchar 500, nullable), `clientRequestId` (varchar 64, nullable), `version` (int, default 1), `updatedById` (FK → User, nullable), `createdAt`, `updatedAt` | `@@unique([ticketId, clientRequestId])` (BR-14). Indexes on `(ticketId, actionAt, id)` for detail ordering and `(assigneeId, status)` for "My open actions" |
| `TicketStatusHistory` (new) | `id`, `ticketId` (FK), `fromStatus` (`TicketStatus`, nullable: null means created), `toStatus` (`TicketStatus`), `changedById` (FK → User), `changedAt` | Append-only (BR-20). No `updatedAt`. Indexes on `(ticketId, changedAt, id)` and `(toStatus, changedAt)` for "recently resolved" |
| `Ticket` (extend) | + `version` (int, NOT NULL, default 1), + `seedKey` (varchar 32, nullable, unique) | + index on `updatedAt` for the recent-window queries |

Relationships: one Ticket has many ActionTaken and many TicketStatusHistory rows. A User can be the
performer, assignee or last editor of many Actions, and the changer of many history rows.

**Database-design decisions (labsheet §5.1 asks for at least two):**
1. **An integer `version` column for optimistic concurrency**, not a check on `updatedAt` and not row
   locks.
   - Integers compare exactly, unlike millisecond timestamps that can collide.
   - The atomic `UPDATE … WHERE id = ? AND version = ?` needs no long-held lock (BR-24).
   - It adds as `NOT NULL DEFAULT 1`, which Postgres accepts on a non-empty table in one step. No
     nullable → backfill → `SET NOT NULL` dance is needed.
2. **A separate append-only `TicketStatusHistory` table**, not a "last status change" column on Ticket.
   - It keeps a full audit trail.
   - It gives "recently resolved" (BR-33) an authoritative timestamp.
   - It cannot be rewritten through the API (BR-20).
   - The cost is one extra insert per status change, inside the same transaction.
3. **A nullable unique `Ticket.seedKey` for an idempotent seed**, not matching on title or "seed only if
   empty".
   - Postgres allows many NULLs under a unique index, so real Tickets are unaffected.
   - Seed rows can be found and skipped exactly on every rerun (BR-36).
4. **A `(ticketId, clientRequestId)` unique constraint for duplicate-create protection**, enforced by the
   database rather than an application-level "check then insert", which two simultaneous retries could
   both pass.
5. **`ActionTaken` as its own model**, not a `kind` flag on Comment or Note. It has a different shape,
   lifecycle, editability and visibility. Same reasoning as Lab 3's separate Comment and Note models.

**Migration and backfill**:
- No existing rows are changed apart from defaults filling the new columns (BR-35).
- Legacy Tickets get `version = 1`, no Actions and no history rows (BR-21).
- Dashboards include legacy Tickets in every status-based metric, but not in "recently resolved", because
  they have no history (BR-33).

**Rollback and recovery**:
1. Before `migrate deploy`, take a `pg_dump` backup of the dev database (documented command in the
   README).
2. A hand-written `rollback.sql`, stored next to the migration, drops the two new tables, the enum, the
   two Ticket columns and the index, then deletes the migration's `_prisma_migrations` row. This returns
   the schema to exactly Lab 3's.
3. Rollback is tested once against a disposable copy of the database: apply, roll back, re-apply, compare
   row counts. The evidence goes in `tests.md` (MIG-03).

**Seed** (BR-36, BR-37): about 14 Tickets with keys `SEED-T01` to `SEED-T14`, all requested by Alex
Rivera, owned by Taylor Brooks, Casey Nguyen, Jamie Whitfield, or unassigned. Each has Actions, Comments,
Notes and status-history rows that fit its status. `createdAt`/`updatedAt` are spread over the last 5
weeks relative to the time the seed runs. Resolved and Closed seed Tickets always have at least one
Completed Action, so seed data never breaks the gate.

## 8. API Contract

Full detail is in `api-spec.md`. Summary of new or changed endpoints:

| Method & Path | Purpose |
|---|---|
| `POST /api/staff/tickets/:id/actions` | Create an Action (IT Staff/Admin). Idempotent on `clientRequestId` |
| `PATCH /api/staff/tickets/:id/actions/:actionId` | Edit an Action and/or change its status (requires `version`) |
| `GET /api/staff/tickets/:id` (changed) | Adds `version`, `actions[]`, `statusHistory[]` |
| `GET /api/tickets/:id` (changed) | Adds `version`, `actions[]`, `statusHistory[]` (Requester, own Ticket) |
| `PATCH /api/tickets/:id/status` (changed) | Requires `version`. Resolution gate. Clears the Requester indication. Writes history |
| `PATCH /api/staff/tickets/:id/owner`, `/priority` (changed) | Require `version`. Responses include the new `version` |
| `GET /api/tickets` (changed) | Adds `statusGroup=open` and `sortBy=updatedAt` |
| `GET /api/staff/tickets` (changed) | Adds `statusGroup=open` and `requesterResolved=true` |
| `GET /api/dashboard/requester` | Requester Dashboard (§5.5) |
| `GET /api/staff/dashboard` | IT Staff Dashboard, plus user counts for an Administrator (§5.5) |

New error codes:
- `INVALID_ASSIGNEE` (400)
- `ACTION_LOCKED` (409)
- `ACTION_TRANSITION_NOT_PERMITTED` (409)
- `TICKET_NOT_ACTIONABLE` (409)
- `RESOLUTION_REQUIRES_COMPLETED_ACTION` (409)
- `STALE_UPDATE` (409)

## 9. Acceptance Criteria

**Given (mandatory) examples, kept verbatim:**
- AC-01 Given a permitted IT Staff user and valid data, when an Actions Taken is created, then it is saved
  under the correct Ticket with the authenticated creator and approved assignee.
- AC-02 Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent
  Tickets owned by that Requester are returned.

**Actions Taken**
- AC-03 Given an In Progress Ticket with no Actions, when IT Staff records a Completed Action and then sets
  the Ticket to Resolved, then both succeed and the status history shows the In Progress → Resolved change
  by that user.
- AC-04 Given a Requester (even on their own Ticket), when they call any Action create or edit endpoint
  directly, then it is rejected with 403 and no Action is created or changed.
- AC-05 Given an assignee who is inactive, a Requester, or does not exist, when an Action is created or
  edited with that assignee, then it is rejected with 400 `INVALID_ASSIGNEE`.
- AC-06 Given Follow-Up Required is true and Follow-up Note is blank, when the Action is saved, then it is
  rejected with a field-level message, both in the UI and from the API.
- AC-07 Given an Action being saved as Completed with a blank Result, when submitted, then it is rejected
  with a field-level message.
- AC-08 Given an `actionAt` earlier than the Ticket's creation, or a Completed Action dated more than 5
  minutes in the future, when saved, then it is rejected with a field-level message.
- AC-09 Given a Planned or In Progress Action, when another IT Staff member edits it, then the change is
  saved, `updatedBy` shows the editor, and Performed by is unchanged.
- AC-10 Given a Completed or Cancelled Action, when an edit is attempted through the API, then it is
  rejected with 409 `ACTION_LOCKED`. In the UI the Action shows no Edit control.
- AC-11 Given a Planned Action, when it moves to In Progress and then Completed, then each step succeeds.
  An attempt to move a Completed Action back is rejected with 409 `ACTION_TRANSITION_NOT_PERMITTED`.
- AC-12 Given one Ticket owned by staff member A, when staff members A and B each record Actions, then
  Ticket Detail lists all of them in stable `actionAt` order, each showing its own Performed by and
  Assignee.
- AC-13 Given a Closed or Cancelled Ticket, when an Action create or edit is attempted, then it is rejected
  with 409 `TICKET_NOT_ACTIONABLE`.
- AC-14 Given a create request repeated with the same `clientRequestId`, when both are processed, then
  exactly one Action exists and both responses return it.
- AC-15 Given a Requester viewing their own Ticket, when it has Actions, then every Action is listed
  read-only with all fields, and no create or edit control or Internal Note is rendered.
- AC-16 Given any role, when a delete of an Action is attempted, then no such route exists (404).

**Ticket workflow**
- AC-17 Given a Ticket with no Completed Action, when IT Staff attempts to set it to Resolved, then the API
  rejects it with 409 `RESOLUTION_REQUIRES_COMPLETED_ACTION`, and the UI shows "Resolved" disabled with
  the reason.
- AC-18 Given each permitted (from, to, role) combination in §5.2, when requested, then it succeeds. Every
  combination not listed is rejected with 409 `TRANSITION_NOT_PERMITTED`, including the new Reopened →
  Resolved and Reopened → Cancelled rows.
- AC-19 Given a status change, when it succeeds, then exactly one history row is added and shown in order
  to both the Requester and staff. No endpoint can modify or delete history.
- AC-20 Given a Ticket the Requester marked "Problem Appears Resolved", when staff view it, then the
  indicator and its date are shown. When the Ticket moves to Reopened or In Progress, the indication is
  cleared.
- AC-21 Given a Requester on their own Resolved Ticket, when they attempt Reopen, Resolve or Close
  directly, then it is rejected with 409 `TRANSITION_NOT_PERMITTED`.
- AC-22 Given a client holding an old Ticket `version`, when it submits a status, owner or priority change,
  then it is rejected with 409 `STALE_UPDATE`, nothing changes, and the UI offers Reload while keeping the
  user's selection.
- AC-23 Given two simultaneous status changes sent with the same `version`, when both are processed, then
  exactly one succeeds and the other gets 409 `STALE_UPDATE`.
- AC-24 Given a client holding an old Action `version`, when it saves an edit, then it is rejected with
  409 `STALE_UPDATE`, and the form keeps the edited values.

**Dashboards**
- AC-25 Given seeded data, when IT Staff loads the Staff Dashboard, then every metric equals an
  independent direct database count for its §5.5 definition.
- AC-26 Given any Staff Dashboard card, when its drill-down is followed, then the Ticket Queue opens with
  the matching filters applied, and its total equals the card's value.
- AC-27 Given any Requester Dashboard card, when its drill-down is followed, then My Tickets opens
  filtered, and its total equals the card's value.
- AC-28 Given a Requester with no Tickets (or staff owning nothing), when the dashboard loads, then every
  metric shows 0 and each list shows its empty-state message. No error is shown.
- AC-29 Given a Requester calling the Staff Dashboard, or IT Staff/Administrator calling the Requester
  Dashboard, when requested, then 403 is returned. Without a session, 401 is returned.
- AC-30 Given an Administrator, when the Staff Dashboard loads, then user-account counts are included.
  Given IT Staff, they are absent from the response.
- AC-31 Given Actions assigned to several staff members, when a staff member loads the dashboard, then
  "My open actions", "My follow-ups" and the "My work" list include only Actions assigned to them.
- AC-32 Given the dashboard API fails, when the dashboard loads, then a safe-failure message with Retry is
  shown and no stale or partial numbers are displayed.
- AC-33 Given Tickets updated just before and just after `windowStart` (Asia/Bangkok), when the dashboard
  loads, then only the latter count as recent.

**Data and regression**
- AC-34 Given a Lab 3 database, when the Lab 4 migration is applied, then every existing row is preserved
  with unchanged values. Legacy Tickets have `version = 1` and no Actions, and are fully viewable and
  workable.
- AC-35 Given the seed has already run, when it runs again, then no duplicate rows are created and
  per-table counts are unchanged.
- AC-36 Given a fresh seed, when the data is inspected, then it covers all 8 statuses, all 4 IT
  Priorities, assigned and unassigned Tickets, Tickets with zero, one and several Actions, and one
  Requester and one staff member with zero work.
- AC-37 Given a create form (Action or Comment), when the submit button is clicked repeatedly or the
  request is retried, then exactly one record is created.
- AC-38 Given a recoverable failure (400, 409, 500 or network) while saving an Action, comment, status or
  user form, when the error is shown, then the entered values are still in the form.
- AC-39 Given the Lab 1–3 automated suites, when run against the Lab 4 `main`, then they all pass. The
  obsolete `e2e/lab-02` specs are retired, not counted (§11).
- AC-40 Given the Lab 4 screens at 375px, 820px and 1280px, when inspected, then there is no horizontal
  page scroll, clipping or overlap, every control is keyboard-reachable with a visible focus ring, and
  status, priority and Action status are never shown by color alone.
- AC-41 Given any role logging in, when login completes, then the user lands on their role's Dashboard,
  and the nav marks "Dashboard" as the current page.

## 10. Definition of Done

**Product completion**
- Every FR, BR and AC above is implemented and traced to at least one passing automated test in
  `tests.md`.
- `npm test` passes in `server/` and `client/` from a clean `main` checkout. `npx playwright test
  e2e/lab-03 e2e/lab-04` passes against a running dev stack. No required test is skipped, disabled or
  commented out.
- Every authorization, ownership, transition, gate and stale-update rule is verified by direct API calls,
  not only through the UI.
- Every dashboard metric is verified against an independent database count (AC-25), and the evidence is
  captured for the submission (`psql` count beside each screenshot).
- The migration has been applied to a populated Lab 3 database with row counts compared before and after.
  The rollback has been rehearsed once on a disposable copy.
- Running the seed twice in a row leaves counts unchanged.
- A full end-to-end user journey per role has been run (not just per-issue tests). This is the Lab 3
  lesson: per-layer tests passing does not prove a feature is reachable.
- There are no browser console errors on any screen during the E2E run. There are no placeholder text,
  dead links or unfinished controls.
- `ui-spec.md` §11's visual and accessibility checklist is fully ticked, each item backed by a named test
  or verification.
- The README's setup, migration, seed, test and demo steps have been verified by a fresh-clone run on
  Windows.

**Course delivery**
- Each Issue is on its own `feature/4-N-*` branch, PR'd into `lab4-staging`, and peer-reviewed. One
  release PR goes from `lab4-staging` into `main`. Every Issue is in Done on the Kanban board.
- `docs/lab-04/{specification, tests, ui-spec, api-spec, reviewer, ai-use}.md` are complete. The doc sweep
  finds no `Pending`, `TODO`, `TBD` or `- [ ]` left anywhere.
- Baseline screenshots are committed under `artifacts/lab-04/screenshots/{staff-dashboard,
  requester-dashboard, actions-taken}/`. The state, workflow and regression captures go in the submission
  PDF (`ui-spec.md` §10).
- The submission PDF uses "Answer Part 1" through "Answer Part 9".

## 11. Assumptions and Decisions

All of these were agreed with the user before drafting (2026-10-03) unless marked otherwise.

- **Assignment is manual, never automatic.**
  - Staff claim or reassign Tickets as in Lab 3.
  - Each Action's Assignee defaults to its creator, which is effectively "claiming" that piece of work,
    and can be set to another active staff member.
  - Automatic routing to an "online" or "available" admin was considered and rejected. It falls under the
    labsheet's excluded on-call scheduling and escalation engines, and needs presence tracking that is
    not in scope.
- **Performed by is the creator; Assignee is who is responsible.** Labsheet AC-01 asks for both "the
  authenticated creator and approved assignee", and BR-02 separates coordinator from doer. Labsheet Part 6
  ("assign", "inactive-assignee rejection") confirms an Action-level Assignee.
- **Actions have their own status (Planned, In Progress, Completed, Cancelled).** Labsheet Part 6 asks to
  demonstrate "complete, cancel", and the stakeholder asks to "plan and track the actual work". Completed
  and Cancelled lock the Action, which is the append-only work record labsheet Part 7 asks for.
- **The resolution gate needs at least one Completed Action**, not just any Action. A Planned placeholder
  must not satisfy it.
- **Requesters cannot Reopen.** The stakeholder says IT Staff must formally update the Ticket. A Requester
  who finds the problem is back posts a Public Comment, and staff reopen. Requester powers stay
  self-Cancel and the advisory indication.
- **Append-only status history is added** even though the labsheet does not name it. It is the clearest
  evidence for Part 7 "append-only" and the learning outcome on auditability. Legacy Tickets are not
  backfilled, because inventing a history would be false data.
- **The Requester indication clears on Reopened or In Progress** (BR-18). Otherwise a stale "Requester
  says resolved" would follow a Ticket through a reopen. This closes a Lab 3 gap: the flag was never
  cleared before.
- **Staff Ticket Detail shows the Requester indication** (FR-10). This closes the Lab 3 gap where the
  staff API returned it but no screen showed it.
- **Optimistic concurrency uses an integer `version`, required on every Ticket workflow PATCH** (status,
  owner, priority) and on Action edits. *Decided while drafting, flagged for user review.* Making it
  required rather than optional means a client cannot opt out of conflict detection. It also means the
  Lab 3 tests calling these three endpoints must send `version`. Those tests are updated in Issue 4-3 with
  a helper that reads the current version first, and their assertions are not otherwise changed. Issue
  4-3 also makes the existing client calls (`client/src/api.ts` status, owner and priority) send the
  `version` they already hold from the detail response. Otherwise the Lab 3 screens would break between
  merging 4-3 and 4-4.
- **Gate counts earlier Completed Actions after a Reopen** (§5.2 note). *Decided while drafting.* A
  stricter "Completed after the latest Reopen" rule would need history-aware gate logic for little real
  benefit. The UI prompts staff to record the fix for the recurrence instead.
- **Dashboard rules**:
  - "Open" means New, Open, In Progress, Waiting for Requester and Reopened. Resolved has its own card.
  - Asia/Bangkok calendar-day recent window, 7 days including today.
  - Lists hold at most 5 rows.
  - Administrators see the Staff Dashboard plus user counts. Requesters get their own dashboard.
  - Metric evidence is `psql` counts beside the screenshots, plus API tests comparing each metric to a
    direct Prisma count.
- **No day-over-day trend figures ("+3 from yesterday").** *Added in Issue 4-2 after PR #55 review.* The
  labsheet's example dashboard wireframes show a trend line under each card. Dashboards here are
  real-time operational counts (BR-28): each number is computed at request time, and no daily snapshot is
  stored. A trend would need either a new snapshot table and scheduled job, or reconstructing past counts
  from status history. That history is incomplete for legacy Tickets (BR-21), so the figure would be
  wrong. Both options are new scope beyond the labsheet's §4.6 metric examples, and the second would be
  inaccurate. Cards therefore show the current value only. The wireframes' other elements are still
  candidates for Issue 4-5: welcome line, Quick Actions panel, "View all" links, per-status cards.
- **Timestamps are displayed in the browser's locale**, as in Labs 2–3. Only window boundaries are
  computed in Asia/Bangkok. The dashboard shows "Since <windowStart>" so the boundary is visible.
- **Seed Tickets belong to `alex.rivera@example.edu`.** Seeding Tickets never touches any account's
  password. The Lab 3 rule still applies: never log into a documented seed account through the browser
  for testing. Use disposable `@example.test` accounts, and the disposable demo database for screenshots.
- **Idempotent seeding uses `Ticket.seedKey`** (§7 decision 3).
- **Obsolete `e2e/lab-02` specs are deleted in the hardening Issue.** They drive the Development Requester
  Selector removed in Lab 3 and cannot pass. FR-20 asks for obsolete artifacts to be removed, and
  `e2e/lab-03/requester-regression.spec.ts` already covers the same Requester ground. They remain in git
  history.
- **Drill-down uses URL query parameters** on the existing list screens rather than new list screens.
  This reuses the existing search, filter and pagination code, and makes drill-downs bookmarkable.
- **"My open actions" and "My follow-ups" drill down to a dashboard list of Ticket links**, not a new
  Action-list screen. A standalone Action list was judged new product scope beyond this contract.
- **Action Attachment Notes are text only** (§3 Excluded). They point to existing Ticket attachments or
  files elsewhere, as the labsheet's own wording says ("what file to look for").
- **Client test directory is `client/tests/lab-04/`** (no space), the same convention as Labs 2 and 3.
- **Lab 3 decisions carry forward unchanged**:
  - session cookies;
  - `bcryptjs`;
  - Administrator parity;
  - separate Comment and Note models;
  - `/api/staff/*` and `/api/admin/*` namespacing;
  - 404 anti-enumeration for ownership failures;
  - modal pattern with no `bootstrap.bundle.js`;
  - explicit `:focus-visible` rules for every custom `.btn-zg-*` class.
