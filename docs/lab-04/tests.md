# Lab 4 Test Plan and Results

Planned before implementation, per Test DD/TDD. This file is written in Issue 4-1, before any Lab 4 code
exists. Every row maps to an Acceptance Criterion (AC) or Business Rule (BR) in `specification.md`, and
every AC has at least one planned test (§3).

`Final` starts at `Pending` for every row and moves to `Pass`, `Fail` or `Deferred` as each Issue lands.
It is updated as work happens, not reconstructed afterwards. Issue 4-7 runs a final sweep that reconciles
every row against verified state (the Lab 2/3 doc-finalization lesson).

## 1. Test Strategy

The labsheet requires these coverage types, mapped to concrete levels and IDs below:

| Labsheet type | Where | IDs |
|---|---|---|
| Unit | `server/tests/lab-04/*.unit.test.ts` | UNIT-xx |
| API / integration | `server/tests/lab-04/*.api.test.ts` | API-xx |
| UI component | `client/tests/lab-04/*.test.tsx` | UI-xx |
| UI style | inside the component files, tagged `STYLE-xx` (Lab 2/3 convention) | STYLE-xx |
| Responsive | `e2e/lab-04/visual-responsive.spec.ts` | RESP-xx |
| Authorization | API rows tagged *Authz* in §2 (summary in §2.10) | API-xx |
| Workflow | `ticket-workflow.api.test.ts`, `TicketWorkflow.test.tsx`, `ticket-resolution.spec.ts` | API/UI/E2E |
| Migration / regression | `migration-seed.api.test.ts` + the full Lab 1–3 suites re-run (§2.11) | MIG-xx, REG-xx |
| Performance smoke | `server/tests/lab-04/performance-smoke.api.test.ts` | PERF-xx |
| End-to-end | `e2e/lab-04/*.spec.ts` | E2E-xx |

**File-mapping decisions** (beyond the labsheet §12 minimum file list):
- `action-rules.unit.test.ts` and `workflow-rules.unit.test.ts` test the pure rule functions (§5.3 Action
  matrix, field validators, §5.2 Ticket matrix, gate predicate, Bangkok window start) once in isolation.
  This is the same pattern as Lab 3's `status-transition.unit.test.ts`.
- `migration-seed.api.test.ts` and `performance-smoke.api.test.ts` are added because none of the four
  required API files is the right home for migration and seed checks or timing smoke tests.
- `DrillDownFilters.test.tsx` is added because the URL-driven filters (FR-16) change three existing
  screens and belong to neither dashboard file.
- `e2e/lab-04/visual-responsive.spec.ts` and `e2e/lab-04/regression.spec.ts` are added beyond the three
  required flow specs, the same precedent as Labs 2 and 3.
- **Shared-DB isolation** (Lab 3 lesson). Staff Dashboard and Queue counts are global, and this dev DB is
  never reset. Tests therefore never assert absolute global numbers. They compare each API value to a
  direct Prisma count taken right next to it, or use per-run unique fixtures (`Date.now()` suffix) and
  filter on them. Fixtures that create many Actions get their own Ticket.
- **Lab 3 tests and `version`.** Lab 3 tests that call `PATCH …/status`, `…/owner` and `…/priority` are
  updated in Issue 4-3 to send the current `version` through a small helper. Their assertions do not
  change (specification §11).

## 2. Planned Tests

### 2.1 Unit — `server/tests/lab-04/action-rules.unit.test.ts`

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UNIT-01 | BR-10, §5.3 | Action status matrix: every listed (from, to) pair and every allowed create status | Allowed | Pass |
| UNIT-02 | BR-10, §5.3 | Every unlisted pair, every move out of Completed or Cancelled, Cancelled at create | Not allowed | Pass |
| UNIT-03 | BR-07, BR-08, BR-09 | Action field validator on a merged Action: description/result/notes lengths, result required when Completed, follow-up note conditional, `actionAt` bounds | Returns the exact `fields` map per broken rule. Valid input returns none. Follow-up note is cleared when `followUpRequired` is false | Pass |

### 2.2 Unit — `server/tests/lab-04/workflow-rules.unit.test.ts`

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UNIT-04 | BR-16, §5.2 | Ticket transition matrix, every (from, to, role) triple, including new Reopened → Resolved and Reopened → Cancelled | Listed triples allowed. All others denied. Nothing leaves Cancelled | Pass |
| UNIT-05 | BR-17 | Gate predicate over an Action list | Allowed only with ≥1 Completed. Planned, In Progress or Cancelled alone are not enough | Pass |
| UNIT-06 | BR-29 | `windowStart` in Asia/Bangkok for fixed clocks, including 16:59Z vs 17:00Z, the UTC instant when the Bangkok date changes | Always 00:00 Bangkok of (today − 6), returned as UTC | Pass |
| UNIT-07 | BR-18 | Indication-clearing rule | Clears only for targets In Progress and Reopened | Pass |

### 2.3 API — `server/tests/lab-04/actions-taken.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| API-01 | Authz | AC-04, BR-03 | Requester `POST /api/staff/tickets/:id/actions`, on their own Ticket | `403 FORBIDDEN`, no row created | actions-taken.api.test.ts | Pass |
| API-02 | Authz | AC-04, BR-03 | Requester `PATCH …/actions/:actionId`. No session on both endpoints | `403`, row unchanged. `401` without a session | actions-taken.api.test.ts | Pass |
| API-03 | API | AC-01 | Create a valid Actions Taken | Created under the correct Ticket and actor: `201`, `ticketId` = `:id`, `performedBy` = session user (forged `performedById` ignored), `assignee` = requested active staff | actions-taken.api.test.ts | Pass |
| API-04 | API | BR-05 | Create without `assigneeId` | `assignee` = caller | actions-taken.api.test.ts | Pass |
| API-05 | API | AC-05, BR-05 | Assignee inactive, Requester or unknown, on create and on edit | `400 INVALID_ASSIGNEE`, `fields.assigneeId`, nothing written | actions-taken.api.test.ts | Pass |
| API-06 | API | AC-06, BR-09 | `followUpRequired: true` with blank note. `false` with a note | First `400` (`fields.followUpNote`). Second `201` with `followUpNote: null` | actions-taken.api.test.ts | Pass |
| API-07 | API | AC-07, BR-08 | `COMPLETED` with blank `result` on create. PATCH to `COMPLETED` with and without a stored result | `400 fields.result` when the merged result is blank. `200` when a stored result exists | actions-taken.api.test.ts | Pass |
| API-08 | API | AC-08, BR-07 | `actionAt` before Ticket creation. Completed 10 min in the future. Planned 30 days ahead | First two `400 fields.actionAt`. Third `201` | actions-taken.api.test.ts | Pass |
| API-09 | API | BR-08 | Blank or 2001-char description, 501-char attachment notes, `status: CANCELLED` at create | `400` with each failing field | actions-taken.api.test.ts | Pass |
| API-10 | API | AC-09, BR-06 | Staff B edits staff A's Planned Action | `200`, `updatedBy` = B, `performedBy` = A unchanged, `version` + 1 | actions-taken.api.test.ts | Pass |
| API-11 | API | AC-10, BR-10 | Any edit to a Completed or a Cancelled Action | `409 ACTION_LOCKED`, unchanged | actions-taken.api.test.ts | Pass |
| API-12 | Workflow | AC-11, §5.3 | Planned → In Progress → Completed, Planned → Cancelled, and an illegal move (In Progress → Planned) | Legal moves `200`. Illegal `409 ACTION_TRANSITION_NOT_PERMITTED` | actions-taken.api.test.ts | Pass |
| API-13 | API | AC-12, BR-02, BR-13 | Ticket owned by A. Actions by A and B with out-of-order `actionAt`, two with equal `actionAt` | Staff and Requester detail list them in `actionAt asc, id asc` order, each with its own performer and assignee | actions-taken.api.test.ts | Pass |
| API-14 | API | AC-13, BR-12 | Create or edit on a Closed and on a Cancelled Ticket | `409 TICKET_NOT_ACTIONABLE` | actions-taken.api.test.ts | Pass |
| API-15 | API | AC-14, BR-14 | Same `clientRequestId` sent twice in sequence, then twice in parallel (`Promise.all`) | Exactly one row each time. Responses `201` + `200` with the same `id`. Never `500` | actions-taken.api.test.ts | Pass |
| API-16 | API | AC-16, BR-11 | `DELETE …/actions/:actionId` as staff and admin | `404`, row still present | actions-taken.api.test.ts | Pass |
| API-17 | Authz | BR-01 | PATCH with an `:actionId` that belongs to a different Ticket | `404 NOT_FOUND` | actions-taken.api.test.ts | Pass |
| API-18 | API | AC-24, BR-23 | PATCH with an outdated `version`, or none | `409 STALE_UPDATE` with `error.current` / `400` | actions-taken.api.test.ts | Pass |
| API-19 | Authz | AC-15, BR-15 | Requester `GET /api/tickets/:id` (own), then another Requester's Ticket | Own: full `actions[]`, no `notes`. Other: `404` | actions-taken.api.test.ts | Pass |
| API-20 | API | BR-25, BR-26 | Creating an Action | `Ticket.updatedAt` advances. `Ticket.version` unchanged | actions-taken.api.test.ts | Pass |

### 2.4 API — `server/tests/lab-04/ticket-workflow.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-21 | Workflow | AC-17, BR-17 | → Resolved from Open, In Progress, Waiting and Reopened with no Actions, then with only Planned and Cancelled Actions | Every attempt `409 RESOLUTION_REQUIRES_COMPLETED_ACTION`, status unchanged, no history row | Pass |
| API-22 | Workflow | AC-03 | Record a Completed Action, then In Progress → Resolved | `200`, new `version`, one history row (In Progress → Resolved, changedBy = caller) | Pass |
| API-23 | Workflow | AC-18, §5.2 | Every permitted (from, to, role) row through the real endpoint, staff and admin, including the new Reopened rows | Each `200` | Pass |
| API-24 | Workflow | AC-18, BR-16 | Representative unlisted pairs (New → Resolved, Closed → In Progress, Cancelled → anything, Reopened → Waiting) | `409 TRANSITION_NOT_PERMITTED` | Pass |
| API-25 | Workflow | AC-19, BR-20 | `POST /api/tickets` then three changes | Creation row (null → New) plus one row per change, ordered, the same on the staff and Requester detail | Pass |
| API-26 | Workflow | AC-19, BR-20 | `PATCH`, `PUT` or `DELETE` on any history path | `404`. Rows unchanged | Pass |
| API-27 | Workflow | AC-20, BR-18 | Requester sets the indication. Staff moves to Waiting (kept), → In Progress (cleared). Set again, Resolve, Close, Reopen (cleared) | `requesterConfirmedResolvedAt` follows exactly that pattern | Pass |
| API-28 | Authz | AC-21, BR-19 | Requester PATCH status to Reopened, Resolved or Closed on their own Ticket | `409 TRANSITION_NOT_PERMITTED` | Pass |
| API-29 | Workflow | AC-22, BR-22 | Outdated `version` on status, owner and priority | Each `409 STALE_UPDATE` with `error.current`. Nothing changed | Pass |
| API-30 | Workflow | AC-23, BR-24 | Two parallel status PATCHes with the same `version` | Exactly one `200`, one `409 STALE_UPDATE`. Exactly one new history row | Pass |
| API-31 | API | BR-22 | Status, owner and priority without `version`, or with `version: "x"` | `400 VALIDATION_ERROR` `fields.version` | Pass |
| API-32 | Migration | BR-21, AC-34 | Legacy-style Ticket (inserted with no history rows) | Detail returns `statusHistory: []`, `version: 1`. The gate still applies to it | Pass |
| API-33 | API | BR-26 | Public Comment vs Internal Note | Comment bumps `Ticket.updatedAt`. Note does not | Pass |

### 2.5 API — `server/tests/lab-04/requester-dashboard.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-34 | Authz | AC-02, BR-30 | Two fresh Requesters with different Tickets | Each sees only their own metric values and list rows | Pass |
| API-35 | API | AC-02, BR-28, BR-32 | Every metric vs an independent Prisma count for that Requester (§5.5 definitions) | All equal | Pass |
| API-36 | API | AC-28, BR-31 | Fresh Requester with no Tickets | `200`, every value 0, both lists `[]` | Pass |
| API-37 | Authz | AC-29 | IT Staff and Administrator call it. No session | `403` / `403` / `401` | Pass |
| API-38 | API | AC-33, BR-29 | Tickets with `updatedAt` = `windowStart − 1s` and `+ 1s` (set through Prisma) | Only the second is counted and listed. `windowStart` returned matches UNIT-06 | Pass |
| API-39 | API | BR-33 | One Ticket resolved now (with history), one legacy Resolved Ticket with no history | Only the first is in `recentlyResolved` | Pass |
| API-40 | API | AC-27 | For each metric, call `GET /api/tickets` with its `drillDown` query | `pagination.totalItems` = metric value | Pass |
| API-41 | API | BR-31 | 7 recent Tickets, two with identical `updatedAt` | List has 5 rows in `updatedAt desc, id desc` order, stable across calls | Pass |

### 2.6 API — `server/tests/lab-04/staff-dashboard.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-42 | API | AC-25, BR-28 | Every Staff metric, `byStatus` and `openByItPriority` value vs an independent Prisma count taken in the same test | All equal | Pass |
| API-43 | API | AC-26 | For each metric with a `drillDown`, call `GET /api/staff/tickets` with that query | `pagination.totalItems` = metric value | Pass |
| API-44 | API | AC-31 | Actions assigned to staff A and B | A's `myOpenActions`, `myFollowUps` and `lists.myActions` contain only A's | Pass |
| API-45 | Authz | AC-30, BR-34 | As Administrator, then as IT Staff | Admin: `users` present and equal to Prisma counts. Staff: no `users` key | Pass |
| API-46 | Authz | AC-29 | Requester calls it | `403` | Pass |
| API-47 | API | BR-31 | `byStatus` and `openByItPriority` shape | Always 8 and 4 entries in fixed order, zeros included | Pass |
| API-48 | API | FR-16 | Queue `statusGroup=open`, `requesterResolved=true`, and invalid values | Correct filtering. Invalid values `400` | Pass |
| API-49 | API | FR-16 | My Tickets `statusGroup=open`, `sortBy=updatedAt` | Correct filtering and ordering | Pass |

### 2.7 Migration and seed — `server/tests/lab-04/migration-seed.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| MIG-01 | Migration | AC-34, BR-35 | After migration: every pre-existing Ticket has `version ≥ 1`. Lab 3 fixture Tickets, Comments, Notes and Attachments are intact. Lab 3's API-53 legacy Ticket still resolves | All hold | Pass |
| MIG-02 | Migration | AC-35, BR-36 | Run the seed twice in a row (programmatically) | Per-table row counts identical after the second run | Pass |
| MIG-03 | Migration (scripted manual) | §7 rollback | On a disposable database: Lab 3 schema plus data → `migrate deploy` → `rollback.sql` → re-deploy. Row counts compared at each step | Counts equal. Schema after rollback matches Lab 3. Evidence pasted into §7 | Pass |
| MIG-04 | Seed | AC-36, BR-37 | Seed coverage query | 8 statuses, 4 priorities, owned and unowned, 0/1/many Actions. Morgan Chen and Riley Osei have zero work. Every seed Resolved or Closed Ticket has a Completed Action | Pass |

### 2.8 Performance smoke — `server/tests/lab-04/performance-smoke.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| PERF-01 | Perf | api-spec §5 | Both dashboards with seed + 200 extra fixture Tickets, median of 5 calls | < 1000 ms each | Pass |
| PERF-02 | Perf | — | Queue with `statusGroup=open`. Ticket detail with 20 Actions and 20 history rows | < 1000 ms / < 500 ms | Pass |

### 2.9 UI component — `client/tests/lab-04/`

**`StaffDashboard.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-01 | FR-13, AC-26 | Mocked response | Every card shows label and value. Each "View" link's `href` equals the response `drillDown` | Pass |
| UI-02 | ui-spec §3.1 | Pending request | Loading state, no numbers rendered | Pass |
| UI-03 | AC-28 | All-zero response, empty lists | 0 values and empty-list sentences, no error | Pass |
| UI-04 | AC-32 | `500`, then Retry succeeds | Failure alert with no numbers. Retry re-fetches and shows numbers | Pass |
| UI-05 | AC-30 | Response with and without `users` | The Users group renders only when present | Pass |
| UI-06 | AC-31 | `lists.myActions` rows | Each links to `/queue/:ticketId#actions` and shows Action status and Follow-up badges | Pass |
| STYLE-01 | ui-spec §1.2, §9 | Metric card markup | Value is text. Link accessible name includes the metric ("View 3 unassigned tickets") | Pass |

**`RequesterDashboard.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-07 | FR-12, AC-27 | Mocked response | 4 cards and 2 lists. Drill-down `href`s go to `/tickets?...` | Pass |
| UI-08 | AC-28 | Zero response | Zeros plus empty sentences | Pass |
| UI-09 | AC-32 | `500` | Safe-failure alert plus Retry | Pass |
| UI-10 | AC-29 | `403` | Forbidden panel | Pass |

**`ActionsTaken.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-11 | FR-01, AC-12 | List render | Rows in the given order with all fields. Empty state when there are none | Pass |
| UI-12 | AC-06, AC-07 | Client validation | Follow-up Note appears only when checked and is required. Result becomes required when Status = Completed. No request while invalid | Pass |
| UI-13 | AC-14, AC-37 | Double click Save. Simulated retry | Exactly one POST in flight. The retry reuses the same `clientRequestId` | Pass |
| UI-14 | AC-38 | Mocked `400` with `fields` | Messages under the right fields plus summary. All input retained | Pass |
| UI-15 | AC-10 | Completed and Cancelled rows | No Edit control. View mode shows "Last edited by…" | Pass |
| UI-16 | AC-24 | Edit, then mocked `409 STALE_UPDATE` | Conflict alert with Reload. Edited values retained. `version` was sent | Pass |
| UI-17 | AC-05 | Mocked `400 INVALID_ASSIGNEE` | Message under Assignee | Pass |
| UI-18 | AC-15 | Requester variant | All fields visible. No Add, Edit or form | Pass |
| UI-19 | BR-12 | Ticket Closed | Add Action hidden, read-only note shown | Pass |
| STYLE-02 | ui-spec §1.1 | `ActionStatusBadge` for all 4 statuses, Follow-up badge | Distinct class plus text label each | Pass |

**`TicketWorkflow.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-20 | AC-17, FR-07 | Status control with and without a Completed Action | "Resolved" disabled with visible reason / enabled | Pass |
| UI-21 | AC-18 | Offered options for all 8 statuses × staff role vs an independently transcribed §5.2 | Exact match | Pass |
| UI-22 | FR-08, AC-20 | Successful change to In Progress | Badge, history and indication pill update without reload | Pass |
| UI-23 | AC-22 | Mocked `409 STALE_UPDATE` | Banner plus Reload. Selection retained | Pass |
| UI-24 | FR-10, AC-20 | Staff detail with the indication set | Pill with date visible next to the status | Pass |
| UI-25 | FR-09, BR-21 | Status History with rows / legacy with none | Ordered timeline / "not recorded" notice | Pass |
| UI-26 | AC-22, BR-22 | Requester Cancel | Sends `version`. Stale message on `409` | Pass |

**`DrillDownFilters.test.tsx`** *(additional, §1)*

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-27 | FR-16, AC-26 | Queue opened at `?ownerId=unassigned&statusGroup=open&requesterResolved=true` | First fetch carries those params. Controls show them. Filter chip visible | Pass |
| UI-28 | FR-16, AC-27 | My Tickets from URL. Invalid values | Params applied. Invalid ones dropped with notice, no raw error | Pass |
| UI-29 | FR-15, AC-41 | App shell per role | "Dashboard" first. `aria-current="page"` on the active link. `/` goes to `/dashboard` | Pass |
| UI-30 | FR-16 | User Management at `?role=IT_STAFF` | Fetch uses `role=IT_STAFF`. Filter preselected | Pass |

### 2.10 Authorization summary

API rows tagged *Authz* above: API-01, 02, 17, 19, 28, 34, 37, 45 and 46. They cover every new endpoint
× wrong role, every ownership boundary and every no-session case. Lab 3's own authorization suite
(`server/tests/lab-03/authorization.api.test.ts`) is re-run unchanged as part of REG-01.

### 2.11 Regression

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| REG-01 | AC-39 | All `server/tests/lab-01..03` suites (with the `version` helper from §1) | All pass | Pass |
| REG-02 | AC-39 | All `client/tests/lab-02..03` suites | All pass | Pass |
| REG-03 | AC-39 | `npx playwright test e2e/lab-03` | All pass | Pass |

### 2.12 Responsive / accessibility — `e2e/lab-04/visual-responsive.spec.ts` *(additional, §1)*

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| RESP-01 | AC-40 | Staff, Admin and Requester dashboards at 1280, 820 and 375 | `scrollWidth ≤ clientWidth`. Cards stack per ui-spec §3.1 | Pass |
| RESP-02 | AC-40 | Staff Ticket Detail with 3+ Actions at 1280, 820 and 375 | Table at ≥992, cards below (changed from ≥768 in Issue 4-6, §7). No overflow or clipping | Pass |
| RESP-03 | AC-40 | Requester Ticket Detail (read-only Actions plus history) at 375 | No overflow | Pass |
| RESP-04 | AC-40 | Keyboard-only: dashboard drill-down, then Add Action, fill, Save, then status change | Every step reachable by Tab/Enter/Space with a visible focus ring | Pass |
| RESP-05 | ui-spec §10 | Baseline screenshots per screen × viewport | Files written under `artifacts/lab-04/screenshots/` | Pass |

### 2.13 E2E — `e2e/lab-04/`

| Test ID | Req/AC | File | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-09, AC-11, AC-12 | actions-taken-flow.spec.ts | Staff A claims a Ticket and adds a Planned Action assigned to staff B. B (second browser context) moves it to In Progress, then Completed. A adds another Action | Both listed in order with correct performer and assignee. Completed one is locked | Pass |
| E2E-02 | AC-03, AC-17, AC-19 | ticket-resolution.spec.ts | "Resolved" disabled with reason. Record a Completed Action. Resolve. Requester logs in and sees the Actions and history read-only | Each step as specified | Pass |
| E2E-03 | AC-20, AC-21 | ticket-resolution.spec.ts | Requester marks "appears resolved". Staff sees the pill, Resolves, Closes, Reopens. Pill cleared. Requester has no Reopen control | As specified | Pass |
| E2E-04 | AC-22, AC-24 | ticket-resolution.spec.ts | Two staff contexts on one Ticket. One changes status. The other submits a status and an Action edit | Conflict banner, Reload, input retained, nothing overwritten | Pass |
| E2E-05 | AC-05, AC-06, AC-08, AC-13 | actions-taken-flow.spec.ts | UI validation errors. Assignee deactivated by an Admin while the form is open, then save. Closed Ticket shows no Add Action | Field errors. `INVALID_ASSIGNEE` under Assignee. Read-only card | Pass |
| E2E-06 | AC-25, AC-26 | dashboards.spec.ts | Staff dashboard: follow every card drill-down | The Queue total shown equals each card value | Pass |
| E2E-07 | AC-02, AC-27, AC-28 | dashboards.spec.ts | Requester dashboard drill-downs. Fresh Requester sees zeros and empty states | As specified | Pass |
| E2E-08 | AC-30, AC-41, FR-20 | dashboards.spec.ts | Each role logs in, lands on its Dashboard (Admin with user counts), and visits every screen | Correct landing and nav. Zero console errors collected across the journey | Pass |
| E2E-09 | AC-39 | regression.spec.ts | Cross-role journey: Requester creates a Ticket with an attachment and a comment → staff claims, sets priority, adds a note and an Action, resolves → Admin creates and deactivates a user | All Lab 2/3 behavior intact | Pass |
| E2E-10 | AC-37, AC-38 | regression.spec.ts | Double click Save on Action and Comment. Aborted network request (`page.route`) on the Action form | One record each. Form input retained after the failure | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Test(s) | AC | Test(s) |
|---|---|---|---|
| AC-01 | API-03, E2E-01 | AC-22 | API-29, UI-23, UI-26, E2E-04 |
| AC-02 | API-34, API-35, E2E-07 | AC-23 | API-30 |
| AC-03 | API-22, E2E-02 | AC-24 | API-18, UI-16, E2E-04 |
| AC-04 | API-01, API-02 | AC-25 | API-42, E2E-06 |
| AC-05 | API-05, UI-17, E2E-05 | AC-26 | API-43, UI-01, UI-27, E2E-06 |
| AC-06 | API-06, UI-12, E2E-05 | AC-27 | API-40, UI-07, UI-28, E2E-07 |
| AC-07 | API-07, UI-12 | AC-28 | API-36, UI-03, UI-08, E2E-07 |
| AC-08 | API-08, E2E-05 | AC-29 | API-37, API-46, UI-10 |
| AC-09 | API-10, E2E-01 | AC-30 | API-45, UI-05, E2E-08 |
| AC-10 | API-11, UI-15 | AC-31 | API-44, UI-06 |
| AC-11 | API-12, E2E-01 | AC-32 | UI-04, UI-09 |
| AC-12 | API-13, UI-11, E2E-01 | AC-33 | API-38, UNIT-06 |
| AC-13 | API-14, UI-19, E2E-05 | AC-34 | MIG-01, API-32 |
| AC-14 | API-15, UI-13 | AC-35 | MIG-02 |
| AC-15 | API-19, UI-18, E2E-02 | AC-36 | MIG-04 |
| AC-16 | API-16 | AC-37 | API-15, UI-13, E2E-10 |
| AC-17 | API-21, UI-20, E2E-02 | AC-38 | UI-14, UI-16, E2E-10 |
| AC-18 | UNIT-04, API-23, API-24, UI-21 | AC-39 | REG-01–03, E2E-09 |
| AC-19 | API-25, API-26, E2E-02 | AC-40 | RESP-01–04 |
| AC-20 | UNIT-07, API-27, UI-22, UI-24, E2E-03 | AC-41 | UI-29, E2E-08 |
| AC-21 | API-28, E2E-03 | | |

Every AC has at least one planned test. The workflow, authorization and dashboard-accuracy ACs (AC-03,
AC-17, AC-22, AC-25/26) are covered at several levels on purpose, because they are exactly what the
submission's Answer Parts 5–8 must show working live.

## 4. Responsive and Visual Checklist

`ui-spec.md` §11 is the manual visual-inspection pass that accompanies RESP-01–05 and the screenshots.
Automated assertions catch markup and overflow regressions. A human look at the real screenshots against
that checklist is the final sign-off.

## 5. Test Commands

| Command | Runs |
|---|---|
| `cd server && npm test` | All server Vitest/Supertest suites (Lab 1–4), including unit, migration-seed and performance-smoke |
| `cd client && npm test` | All client Vitest/Testing-Library suites (Lab 2–4) |
| `npx playwright test e2e/lab-03 e2e/lab-04` (repo root) | Lab 3 regression plus Lab 4 E2E. The backend must already be running (`cd server && npm run dev`). Playwright's `webServer` only starts the Vite client |
| `cd server && npx prisma migrate deploy && npm run prisma:seed` | Applies the Lab 4 migration and (re-)seeds idempotently |

## 6. Final Results

Updated as each Issue lands. **As of Issue 4-6 (Final hardening and E2E): all 112 planned rows are
implemented and passing.** Issue 4-7 (Final Doc) does the final staleness sweep. UNIT-06 (the Asia/Bangkok window) is a dashboard
rule and lands with Issue 4-5.

| Level | Planned | Actual so far | Passing | Failing | Deferred |
|---|---|---|---|---|---|
| Unit | 7 | 7 (UNIT-01–07) | 7 | 0 | 0 |
| API (incl. Authz/Workflow) | 49 | 49 (API-01–49) | 49 | 0 | 0 |
| Migration / seed | 4 | 4 (MIG-01–04) | 4 | 0 | 0 |
| Performance smoke | 2 | 2 (PERF-01–02) | 2 | 0 | 0 |
| UI component | 30 | 30 (UI-01–30) | 30 | 0 | 0 |
| UI style | 2 | 2 (STYLE-01–02) | 2 | 0 | 0 |
| Regression | 3 | 3 (REG-01–03) | 3 | 0 | 0 |
| Responsive | 5 | 5 (RESP-01–05) | 5 | 0 | 0 |
| E2E | 10 | 10 (E2E-01–10) | 10 | 0 | 0 |
| **Total** | **112** | **112** | **112** | **0** | **0** |

Baseline before any Lab 4 change, confirmed on `feature/4-2-Actions-Taken-backend` at
`lab4-staging`'s tip (`494d1c0`): 188 server + 75 client Vitest, all passing.

After Issue 4-2: `cd server && npm test` gives 267 passing (188 Lab 1–3 + 79 Lab 4 `it()` blocks across
`action-rules.unit`, `actions-taken.api` and `migration-seed.api`). Stable across two consecutive runs
on the shared dev DB. `cd client && npm test` gives 75 passing (no client change in this issue).
`npx playwright test e2e/lab-03` gives 23 passing against the migrated, seeded database. REG-01–03 are
formally signed off in Issue 4-6, but this issue already ran all three green.

Two deliberate mutation checks confirmed the new tests can fail:
- making `isActionLocked` always return false fails exactly API-11's two cases;
- disabling the `clientRequestId` lookup fails exactly API-15's sequential and parallel cases.

**PR #56 review round.** Two more API-14 cases cover a Ticket closed *during* an Action create or edit
(the check-then-act race the reviewer found). Run against the pre-fix `app.ts`, both fail: the Action is
written onto the already-Closed Ticket (`201` / `200`). With the fix, both get `409`. The server suite is
now 269 (188 + 81), passing twice in a row on a freshly reset database (`toktickit_test`).

**After Issue 4-3:**
- **Server:** `cd server && npm test` gives 338 passing (188 Lab 1–3 + 150 Lab 4), twice in a row on
  `toktickit_test`. The new files are `workflow-rules.unit` and `ticket-workflow.api`, plus the shared
  hand-transcribed `specMatrix.ts`.
- **Client:** `cd client && npm test` gives 75 passing. The client now sends `version` on status, owner
  and priority changes, and the tests assert the loaded version is passed through.
- **Playwright:** `npx playwright test e2e/lab-03` gives 23 passing through the real UI, with the
  backend pointed at `toktickit_test` so the main dev DB stayed at its 11 seed users.

Three deliberate mutation checks confirmed the new workflow tests can fail:
- removing the gate fails API-21 (all four sources) and API-32;
- removing the indication clearing fails API-27;
- dropping `version` from the status `UPDATE`'s `WHERE` fails API-29 and API-30.

**After Issue 4-4:**
- **Client:** `cd client && npm test` gives 117 passing. That is 75 Lab 2–3, plus 42 Lab 4 in
  `ActionsTaken.test.tsx` and `TicketWorkflow.test.tsx`, with no `act()` warnings.
- **Server:** `cd server && npm test` gives 338 passing (no server change in this issue).
- **Playwright:** `npx playwright test e2e/lab-03 e2e/lab-04` gives 28 passing. That is 23 Lab 3 plus
  5 Lab 4 (`actions-taken-flow`, `ticket-resolution`). After the two fixes in §7 it was stable across
  seven further consecutive runs, with the backend on `toktickit_test` so the main dev DB stayed at its
  11 seed users.

Three client mutation checks:
- un-disabling the gated "Resolved" option fails UI-20;
- generating a new `clientRequestId` per submit fails UI-13;
- removing the late-fetch guard fails the StrictMode regression test (§7).

A browser pass at 800px and 375px on a seeded Ticket with three Actions found one real overflow, fixed
in this issue (§7).

**After Issue 4-5:**
- **Server:** `cd server && npm test` gives 367 passing (188 Lab 1–3 + 179 Lab 4), three consecutive
  runs on `toktickit_test`. New files: `requester-dashboard.api`, `staff-dashboard.api`,
  `performance-smoke.api`, plus UNIT-06 in `workflow-rules.unit`.
- **Client:** `cd client && npm test` gives 144 passing (no `act()` warnings). New files:
  `StaffDashboard`, `RequesterDashboard`, `DrillDownFilters`.
- **Playwright:** `npx playwright test e2e/lab-03 e2e/lab-04` gives 31 passing. Six consecutive runs
  without the Lab 3 visual spec (15/15 each) and two full runs (31/31). The main dev DB stayed at its
  11 seed users throughout.
- **Mutation check:** dropping Reopened from the open group fails API-35, API-42 and API-49.
- **Browser check:**
  - At 625px and 375px, the Admin dashboard and a drill-down Queue had no horizontal scroll.
  - On the phone, cards stack one per row.
  - The "Unassigned" card's 2893 matched the drilled-down Queue's "2893 total".
  - Console errors appeared only for the two expected pre-login 401s.

## 7. Known Limitations or Deferred Tests

Recorded as they are found during implementation. Known at planning time:
- **No absolute global-count assertions.** Staff-dashboard and Queue tests compare against independent
  Prisma counts taken in the same test rather than fixed numbers, because the shared dev DB is never reset
  (§1).
- **Performance smoke is a smoke test, not a benchmark.** It catches accidental fetch-all or N+1
  regressions on a developer machine. It is not a load test.
- **Cross-browser coverage** stays out of scope, as in Labs 2–3. Chromium only.
- **`e2e/lab-02` specs are retired** in Issue 4-6 (specification §11), so the regression command scopes to
  `e2e/lab-03 e2e/lab-04`.

Found during implementation:
- **MIG-03 evidence (Issue 4-2).** The rollback was rehearsed on a disposable database
  (`toktickit_migtest`) restored from a `pg_dump` of the dev DB, then dropped. Row counts plus a checksum
  over every pre-existing Ticket column were taken at each step:

  | Step | User | Ticket | Comment | Note | Attachment | Ticket-column checksum |
  |---|---|---|---|---|---|---|
  | Restored (Lab 3 schema) | 982 | 1980 | 91 | 70 | 952 | 23018469638 |
  | `migrate deploy` | 982 | 1980 | 91 | 70 | 952 | 23018469638 (all 1980 Tickets `version = 1`) |
  | `rollback.sql` | 982 | 1980 | 91 | 70 | 952 | 23018469638 (0 Lab 4 tables, 0 Lab 4 Ticket columns) |
  | `migrate deploy` again | 982 | 1980 | 91 | 70 | 952 | 23018469638 |

  After the re-deploy, `prisma migrate diff` against `schema.prisma` shows nothing except the expected
  `session` table. The real dev DB was then migrated with identical before/after counts and checksum,
  and all 647 active sessions were kept.
- **A foreign failed migration was blocking `migrate deploy` on the dev DB.** `_prisma_migrations` held
  a failed row, `20260809130701_init`, dated 2026-09-17. It comes from the separate review checkout
  (`toktickitReviewV`), whose server had been pointed at this database once. It failed on its first
  statement (`relation "Category" already exists`, 0 steps applied), so no data changed. Prisma refuses
  every new deploy while a failed row exists, so it was marked rolled back with
  `prisma migrate resolve --rolled-back` (bookkeeping only).
- **MIG-04 checks the seed's own rows, not whole-database totals.** The long-lived dev DB still has Lab 2
  era Tickets, including one for Morgan Chen. "Morgan and Riley have zero work" is therefore asserted as
  "no seed Ticket, Action, Comment or Note involves them". On a fresh clone that is the same as zero.
  MIG-02 likewise compares seed-owned counts, because other test files insert rows in parallel.
- **The Lab 3 visual spec overwrites `artifacts/lab-03/screenshots/` on every run.** Re-running
  `e2e/lab-03` as regression re-captured nine graded Lab 3 screenshots, which now include the Lab 4 seed
  tickets. They were restored with `git checkout`. To fix in Issue 4-6: regression runs must not rewrite
  another lab's evidence (e.g. skip RESP-05's capture unless asked).
- **Check-then-act race on closed Tickets (PR #56 review).** Both Action routes read the Ticket's status,
  then wrote the Action as a separate step, so a Ticket closed in between could still get an Action.
  Fixed: the authoritative check is now a conditional `UPDATE` on the Ticket (`currentStatus NOT IN
  (Closed, Cancelled)`) inside the same transaction as the Action write, which also bumps `updatedAt`.
  The early read check is kept only so the order of error responses is unchanged.

  The test makes the race deterministic rather than hoping to hit it:
  1. it holds an uncommitted "close" on the Ticket row;
  2. it sends the request, which blocks on that row lock;
  3. it commits the close, after which the request re-checks against the Closed row and refuses.
- **Fresh database: parallel workers race to create the `session` table.** Found after the dev DB was
  reset. `connect-pg-simple` creates its table lazily on first use, so on a database that has never had
  it, several test workers try to create it at once and the losers' logins return 500 (12–43 failures).
  It doesn't happen once the table exists, which is why it never showed before. For now the table can be
  created once from `node_modules/connect-pg-simple/table.sql`. Proper fix: Issue 4-6.
- **Lab 3 tests changed by Issue 4-3, on purpose and only where the Lab 4 contract supersedes Lab 3.**
  Their assertions are unchanged:
  1. The calls to the status, owner and priority endpoints in `staff-ticket-detail.api.test.ts` and
     `requester-regression.api.test.ts` now send the current `version` (BR-22), read through a small
     `currentVersion` helper. That includes the three that test illegal transitions: a missing
     `version` is a 400 checked before the 409 state rules (api-spec §0), so without a valid `version`
     they would test the wrong thing.
  2. API-39's full forward walk records a Completed Action before its Resolved step (BR-17 gate).
  3. `status-transition.unit.test.ts`'s own matrix gains the two new Reopened rows from §5.2.
  4. The client test fixtures gain `version`.

  The client's own Staff status menu (`STAFF_TRANSITIONS`) is deliberately not changed yet. It still
  offers only the Lab 3 rows, which is safe: it offers fewer moves than the API allows, never more. The
  two new Reopened options, the disabled "Resolved" reason and the conflict banner are Issue 4-4's UI
  work.
- **Issue 4-4: the client menu now has the final §5.2 rows.** Lab 3's UI-19 matrix in
  `StaffTicketDetail.test.tsx` gains the two Reopened rows, the same supersession already applied to
  the server-side Lab 3 unit test.
- **A slow, older Ticket fetch could undo a user's action (found by E2E-03, fixed).** `main.tsx` runs
  React in StrictMode, so in development each Ticket Detail page fetched its Ticket twice on load.
  When the older of the two fetches finished after the user had acted, it replaced the newer state.
  For example, "Mark Problem as Resolved" visibly reverted, even though the server had saved it. The
  same thing can happen in production whenever a fetch outlives a later change.

  Fixed on both detail pages: every fetch takes a sequence number, local changes go through
  `updateTicket` (which bumps it), and a fetch that has been overtaken is ignored when it lands. A
  StrictMode client test reproduces the exact race and fails without the guard.
- **Two weak Lab 3 E2E assertions became flaky against a long-lived database, and were fixed rather
  than retried.**
  1. `staff-ticket-flow.spec.ts` gave every run's fixture the same name, "E2E ADMINISTRATOR Staffer". On
     `toktickit_test`, dozens of earlier fixtures appeared in the Reassign picker under that name, so
     `getByText(name)` matched 18 elements. The name is now unique per run.
  2. More importantly, its "claim persisted after reload" check was unscoped. It could pass by matching
     the logged-in user's own name in the header chip, which renders before the Ticket loads, so it
     never actually proved the claim was saved. It is now scoped to the Ownership card.

  In `requester-regression.spec.ts`, the new Status History card shows status badges too, so the two
  `getByText("New"/"Cancelled")` checks target the header badge with `.first()`, as
  `staff-ticket-flow.spec.ts` already did.
- **A long staff name in the Reassign picker pushed Staff Ticket Detail sideways at 375px.** Found in the
  browser check. The page was 449px wide in a 375px viewport. The Lab 3 `w-auto` select sized itself
  to its longest option. Fixed with `mw-100` on both auto-width selects on that page.

  Lab 3's RESP check didn't catch it because its fixture ticket's page had only short names in that
  picker. RESP-02 (Issue 4-6) should run against a database with realistic, long names.
- **Console noise to remember for E2E-08 (Issue 4-6).** Two `401` responses from `GET /api/auth/me`
  appear on the Login screen before anyone has logged in. They are the session check and expected, but
  the browser logs them as errors, so E2E-08's "zero console errors" rule must either exclude them or
  the session check must avoid a logged error.
- **Issue 4-5: global dashboard numbers are compared "until consistent", not as one snapshot.**
  API-42, API-43 and API-45 compare all-Tickets or all-Users numbers with independent counts, while
  other test files write to the same database in parallel. Those files even create a Ticket and change
  its status within milliseconds, so a count can rise and fall during one API call. Two weaker guards
  were tried and failed in practice:
  1. "Same count before and after the call."
  2. A whole-table write fingerprint. It was blinded because one test deliberately sets a Ticket's
     `updatedAt` a minute into the future.

  Each comparison is now retried until the API and the count agree, up to 45 s, and fails only if they
  never do. A real bug never agrees, as the mutation check above confirms.
- **The URL filter sync lost its own "unrecognized link" notice (found by UI-28, fixed).**
  `src/urlFilters.ts`'s first version decided "did the URL change from outside?" by remembering its own
  writes. On first load, that misread the page's own clean-up of a bad link as a second outside change
  and re-read the URL, which cleared the notice. A first fix still broke under React StrictMode's
  doubled effects. The final version decides by content instead: it cleans up the URL and compares it
  with the page's current filters. A StrictMode test covers it.
- **Lab 2/3 leftovers found and fixed while adding drill-downs:**
  - My Tickets' Status filter still offered only "New" (from Lab 2, when that was the only reachable
    status). It now lists all 8, plus "All open".
  - The Queue's Ticket Owner filter only offered "Unassigned" (from before Tickets could have owners).
    It now lists active staff, with "(me)".
- **Lab 3 E2E updated for the Dashboard landing page.** Specs that expected to land on Ticket Queue or
  My Tickets now expect the Dashboard, then navigate on. "User Management" clicks are scoped to the
  Primary nav, because the Admin dashboard's Quick Actions has a link with the same name.

  One assertion stayed as it was: E2E-01 opens `/tickets` while the password gate is up, so after
  changing the password it correctly remains on My Tickets. The Dashboard landing applies to `/` only.
- **`toktickit_test` has grown to about 2,400 fixture users.** Every test run adds disposable accounts.
  Under a full parallel Playwright run, the Lab 3 visual spec's desktop User Management step once took
  longer than its 5 s wait loading that list. It passed in every other run. That is environment size,
  not an app regression; resetting `toktickit_test` occasionally keeps runs fast.
- **UI-29 was flaky under heavy CPU load (PR #59 review, fixed).** The test waited for the URL to become
  `/dashboard` and then checked `aria-current` immediately. The URL changes as soon as navigation
  starts, slightly before React finishes re-rendering the nav, so a busy machine could check in that
  gap (the reviewer saw 143/144).

  The test now waits for the Dashboard heading, then checks the URL and `aria-current` inside
  `waitFor`, re-querying the nav. Verified with five normal client runs and three rounds of two full
  suites running at once (144/144 every time).
- **Issue 4-6: the parallel-worker race on the `session` table is fixed.** `server/tests/globalSetup.ts`
  runs once, before Vitest starts its workers, and creates connect-pg-simple's table from the library's
  own `table.sql` if it is missing. Proof on a brand-new database with no `session` table: without the
  setup, 26 failures; with it, 367/367 on the first run.
- **Issue 4-6: the Lab 3 visual spec no longer rewrites graded Lab 3 screenshots.** All screenshot
  writes in `e2e/lab-03/visual-responsive.spec.ts` and `e2e/lab-04/visual-responsive.spec.ts` now
  happen only with `CAPTURE_SCREENSHOTS=1`. The layout assertions run every time. Several consecutive
  full runs left `artifacts/` untouched.
- **Issue 4-6: `e2e/lab-02` removed** (specification §11). The regression command is
  `npx playwright test e2e/lab-03 e2e/lab-04`.
- **The Actions Taken table pushed Staff Ticket Detail sideways at tablet width (found by RESP-02,
  fixed).** At 820px its eight columns needed about 756px inside a narrower card: page 827px in an
  805px viewport. Issue 4-4's browser check had measured overflow only at 375px. The table now starts
  at 992px (Bootstrap `lg`), with stacked cards below. `ui-spec.md` §5.3/§8/§11 are updated.
- **Focus could be lost after saving an Action (found by RESP-04, fixed).** After an asynchronous
  save, focus was returned on the next animation frame, which could run before React had re-created
  the "Add Action" button, leaving focus on `<body>`. It failed 1 in 8 under a parallel stress run. It
  is now returned in an effect after the commit: 12/12 under the same stress run. A component test
  guards the behaviour, but jsdom can't reproduce the original timing, so the real-browser stress run
  is the proof.
- **The test database had grown to about 2,400 users and 4,300 Tickets.** Under a full parallel run,
  screens that list every user (User Management, which has no pagination by Lab 3 scope) or every
  staff member (the assignee/owner pickers) became slow enough to hit 30 s test timeouts.
  `toktickit_test` was dropped, recreated, migrated and seeded (11 users, 14 demo tickets). The main
  dev DB was never touched. The README now explains the separate test database and resetting it.
- **E2E-09 (the cross-role journey) gets a 90 s limit.** It covers three users and about 30 UI steps,
  about 15 s on its own, so the default 30 s is too tight under a full parallel run. Its fixture names
  are unique per run (the Reassign-picker lesson from Issue 4-4).
- **Three E2E timing races (found in PR #60 review, fixed in the tests).** On a slower machine the
  tests acted faster than the app could finish, so the failures were in the test steps, not the app:
  - E2E-09 changed the status while the IT Priority save was still running, so the status change went
    out with the old version and was refused as stale (409). It now waits for each save to finish
    (the control is enabled again) before the next one, and waits for the Queue search (300 ms
    debounce) to show exactly the one matching ticket before clicking it.
  - RESP-04 (Lab 4) started pressing Tab as soon as the Queue heading appeared, before the list had
    loaded. It now waits for the ticket link first.
  - RESP-03 (Lab 3) clicked a search result just as the debounced search re-drew the list. It now
    opens the ticket directly by its id, since the test is about the detail page's layout; search
    is still covered by `staff-ticket-flow.spec.ts`.

  Verified: three consecutive full runs (43/43), then the three specs repeated 5 times with 8 parallel
  workers (140/140).
- **Formal regression sign-off (REG-01–03).** Run on `feature/4-6-Final-hardening-and-E2E`:
  - `cd server && npm test`: 367/367 (Lab 1–3: 188, Lab 4: 179);
  - `cd client && npm test`: 145/145 (Lab 2–3: 75, Lab 4: 70);
  - `npx playwright test e2e/lab-03 e2e/lab-04`: 43/43 (Lab 3: 23, Lab 4: 20), three consecutive
    full runs after the last change (the PR #60 race fixes above).

  All results are from runs on `toktickit_test`; the main dev DB stayed at its 11 seed users.
- **RESP-05 baseline screenshots** (15 files in `artifacts/lab-04/screenshots/{staff-dashboard,
  requester-dashboard, actions-taken}/`) were captured once with `CAPTURE_SCREENSHOTS=1` against a
  throwaway database (`toktickit_demo`: migrated, seeded, then dropped).
- **Known, accepted:** the Login screen's session check (`GET /api/auth/me`) answers 401 before anyone
  has logged in, and the browser logs that as a console error. This is the documented Lab 3 contract
  (`docs/lab-03/api-spec.md` §1), so E2E-08 counts console errors from login onward. A long name in the
  Lab 3 read-only Requester field is visually truncated at tablet width; the full value is still in
  the field.
