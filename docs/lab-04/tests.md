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
| UNIT-04 | BR-16, §5.2 | Ticket transition matrix, every (from, to, role) triple, including new Reopened → Resolved and Reopened → Cancelled | Listed triples allowed. All others denied. Nothing leaves Cancelled | Pending |
| UNIT-05 | BR-17 | Gate predicate over an Action list | Allowed only with ≥1 Completed. Planned, In Progress or Cancelled alone are not enough | Pending |
| UNIT-06 | BR-29 | `windowStart` in Asia/Bangkok for fixed clocks, including 16:59Z vs 17:00Z, the UTC instant when the Bangkok date changes | Always 00:00 Bangkok of (today − 6), returned as UTC | Pending |
| UNIT-07 | BR-18 | Indication-clearing rule | Clears only for targets In Progress and Reopened | Pending |

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
| API-21 | Workflow | AC-17, BR-17 | → Resolved from Open, In Progress, Waiting and Reopened with no Actions, then with only Planned and Cancelled Actions | Every attempt `409 RESOLUTION_REQUIRES_COMPLETED_ACTION`, status unchanged, no history row | Pending |
| API-22 | Workflow | AC-03 | Record a Completed Action, then In Progress → Resolved | `200`, new `version`, one history row (In Progress → Resolved, changedBy = caller) | Pending |
| API-23 | Workflow | AC-18, §5.2 | Every permitted (from, to, role) row through the real endpoint, staff and admin, including the new Reopened rows | Each `200` | Pending |
| API-24 | Workflow | AC-18, BR-16 | Representative unlisted pairs (New → Resolved, Closed → In Progress, Cancelled → anything, Reopened → Waiting) | `409 TRANSITION_NOT_PERMITTED` | Pending |
| API-25 | Workflow | AC-19, BR-20 | `POST /api/tickets` then three changes | Creation row (null → New) plus one row per change, ordered, the same on the staff and Requester detail | Pending |
| API-26 | Workflow | AC-19, BR-20 | `PATCH`, `PUT` or `DELETE` on any history path | `404`. Rows unchanged | Pending |
| API-27 | Workflow | AC-20, BR-18 | Requester sets the indication. Staff moves to Waiting (kept), → In Progress (cleared). Set again, Resolve, Close, Reopen (cleared) | `requesterConfirmedResolvedAt` follows exactly that pattern | Pending |
| API-28 | Authz | AC-21, BR-19 | Requester PATCH status to Reopened, Resolved or Closed on their own Ticket | `409 TRANSITION_NOT_PERMITTED` | Pending |
| API-29 | Workflow | AC-22, BR-22 | Outdated `version` on status, owner and priority | Each `409 STALE_UPDATE` with `error.current`. Nothing changed | Pending |
| API-30 | Workflow | AC-23, BR-24 | Two parallel status PATCHes with the same `version` | Exactly one `200`, one `409 STALE_UPDATE`. Exactly one new history row | Pending |
| API-31 | API | BR-22 | Status, owner and priority without `version`, or with `version: "x"` | `400 VALIDATION_ERROR` `fields.version` | Pending |
| API-32 | Migration | BR-21, AC-34 | Legacy-style Ticket (inserted with no history rows) | Detail returns `statusHistory: []`, `version: 1`. The gate still applies to it | Pending |
| API-33 | API | BR-26 | Public Comment vs Internal Note | Comment bumps `Ticket.updatedAt`. Note does not | Pending |

### 2.5 API — `server/tests/lab-04/requester-dashboard.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-34 | Authz | AC-02, BR-30 | Two fresh Requesters with different Tickets | Each sees only their own metric values and list rows | Pending |
| API-35 | API | AC-02, BR-28, BR-32 | Every metric vs an independent Prisma count for that Requester (§5.5 definitions) | All equal | Pending |
| API-36 | API | AC-28, BR-31 | Fresh Requester with no Tickets | `200`, every value 0, both lists `[]` | Pending |
| API-37 | Authz | AC-29 | IT Staff and Administrator call it. No session | `403` / `403` / `401` | Pending |
| API-38 | API | AC-33, BR-29 | Tickets with `updatedAt` = `windowStart − 1s` and `+ 1s` (set through Prisma) | Only the second is counted and listed. `windowStart` returned matches UNIT-06 | Pending |
| API-39 | API | BR-33 | One Ticket resolved now (with history), one legacy Resolved Ticket with no history | Only the first is in `recentlyResolved` | Pending |
| API-40 | API | AC-27 | For each metric, call `GET /api/tickets` with its `drillDown` query | `pagination.totalItems` = metric value | Pending |
| API-41 | API | BR-31 | 7 recent Tickets, two with identical `updatedAt` | List has 5 rows in `updatedAt desc, id desc` order, stable across calls | Pending |

### 2.6 API — `server/tests/lab-04/staff-dashboard.api.test.ts`

| Test ID | Type | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| API-42 | API | AC-25, BR-28 | Every Staff metric, `byStatus` and `openByItPriority` value vs an independent Prisma count taken in the same test | All equal | Pending |
| API-43 | API | AC-26 | For each metric with a `drillDown`, call `GET /api/staff/tickets` with that query | `pagination.totalItems` = metric value | Pending |
| API-44 | API | AC-31 | Actions assigned to staff A and B | A's `myOpenActions`, `myFollowUps` and `lists.myActions` contain only A's | Pending |
| API-45 | Authz | AC-30, BR-34 | As Administrator, then as IT Staff | Admin: `users` present and equal to Prisma counts. Staff: no `users` key | Pending |
| API-46 | Authz | AC-29 | Requester calls it | `403` | Pending |
| API-47 | API | BR-31 | `byStatus` and `openByItPriority` shape | Always 8 and 4 entries in fixed order, zeros included | Pending |
| API-48 | API | FR-16 | Queue `statusGroup=open`, `requesterResolved=true`, and invalid values | Correct filtering. Invalid values `400` | Pending |
| API-49 | API | FR-16 | My Tickets `statusGroup=open`, `sortBy=updatedAt` | Correct filtering and ordering | Pending |

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
| PERF-01 | Perf | api-spec §5 | Both dashboards with seed + 200 extra fixture Tickets, median of 5 calls | < 1000 ms each | Pending |
| PERF-02 | Perf | — | Queue with `statusGroup=open`. Ticket detail with 20 Actions and 20 history rows | < 1000 ms / < 500 ms | Pending |

### 2.9 UI component — `client/tests/lab-04/`

**`StaffDashboard.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-01 | FR-13, AC-26 | Mocked response | Every card shows label and value. Each "View" link's `href` equals the response `drillDown` | Pending |
| UI-02 | ui-spec §3.1 | Pending request | Loading state, no numbers rendered | Pending |
| UI-03 | AC-28 | All-zero response, empty lists | 0 values and empty-list sentences, no error | Pending |
| UI-04 | AC-32 | `500`, then Retry succeeds | Failure alert with no numbers. Retry re-fetches and shows numbers | Pending |
| UI-05 | AC-30 | Response with and without `users` | The Users group renders only when present | Pending |
| UI-06 | AC-31 | `lists.myActions` rows | Each links to `/queue/:ticketId#actions` and shows Action status and Follow-up badges | Pending |
| STYLE-01 | ui-spec §1.2, §9 | Metric card markup | Value is text. Link accessible name includes the metric ("View 3 unassigned tickets") | Pending |

**`RequesterDashboard.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-07 | FR-12, AC-27 | Mocked response | 4 cards and 2 lists. Drill-down `href`s go to `/tickets?...` | Pending |
| UI-08 | AC-28 | Zero response | Zeros plus empty sentences | Pending |
| UI-09 | AC-32 | `500` | Safe-failure alert plus Retry | Pending |
| UI-10 | AC-29 | `403` | Forbidden panel | Pending |

**`ActionsTaken.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-11 | FR-01, AC-12 | List render | Rows in the given order with all fields. Empty state when there are none | Pending |
| UI-12 | AC-06, AC-07 | Client validation | Follow-up Note appears only when checked and is required. Result becomes required when Status = Completed. No request while invalid | Pending |
| UI-13 | AC-14, AC-37 | Double click Save. Simulated retry | Exactly one POST in flight. The retry reuses the same `clientRequestId` | Pending |
| UI-14 | AC-38 | Mocked `400` with `fields` | Messages under the right fields plus summary. All input retained | Pending |
| UI-15 | AC-10 | Completed and Cancelled rows | No Edit control. View mode shows "Last edited by…" | Pending |
| UI-16 | AC-24 | Edit, then mocked `409 STALE_UPDATE` | Conflict alert with Reload. Edited values retained. `version` was sent | Pending |
| UI-17 | AC-05 | Mocked `400 INVALID_ASSIGNEE` | Message under Assignee | Pending |
| UI-18 | AC-15 | Requester variant | All fields visible. No Add, Edit or form | Pending |
| UI-19 | BR-12 | Ticket Closed | Add Action hidden, read-only note shown | Pending |
| STYLE-02 | ui-spec §1.1 | `ActionStatusBadge` for all 4 statuses, Follow-up badge | Distinct class plus text label each | Pending |

**`TicketWorkflow.test.tsx`**

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-20 | AC-17, FR-07 | Status control with and without a Completed Action | "Resolved" disabled with visible reason / enabled | Pending |
| UI-21 | AC-18 | Offered options for all 8 statuses × staff role vs an independently transcribed §5.2 | Exact match | Pending |
| UI-22 | FR-08, AC-20 | Successful change to In Progress | Badge, history and indication pill update without reload | Pending |
| UI-23 | AC-22 | Mocked `409 STALE_UPDATE` | Banner plus Reload. Selection retained | Pending |
| UI-24 | FR-10, AC-20 | Staff detail with the indication set | Pill with date visible next to the status | Pending |
| UI-25 | FR-09, BR-21 | Status History with rows / legacy with none | Ordered timeline / "not recorded" notice | Pending |
| UI-26 | AC-22, BR-22 | Requester Cancel | Sends `version`. Stale message on `409` | Pending |

**`DrillDownFilters.test.tsx`** *(additional, §1)*

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-27 | FR-16, AC-26 | Queue opened at `?ownerId=unassigned&statusGroup=open&requesterResolved=true` | First fetch carries those params. Controls show them. Filter chip visible | Pending |
| UI-28 | FR-16, AC-27 | My Tickets from URL. Invalid values | Params applied. Invalid ones dropped with notice, no raw error | Pending |
| UI-29 | FR-15, AC-41 | App shell per role | "Dashboard" first. `aria-current="page"` on the active link. `/` goes to `/dashboard` | Pending |
| UI-30 | FR-16 | User Management at `?role=IT_STAFF` | Fetch uses `role=IT_STAFF`. Filter preselected | Pending |

### 2.10 Authorization summary

API rows tagged *Authz* above: API-01, 02, 17, 19, 28, 34, 37, 45 and 46. They cover every new endpoint
× wrong role, every ownership boundary and every no-session case. Lab 3's own authorization suite
(`server/tests/lab-03/authorization.api.test.ts`) is re-run unchanged as part of REG-01.

### 2.11 Regression

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| REG-01 | AC-39 | All `server/tests/lab-01..03` suites (with the `version` helper from §1) | All pass | Pending |
| REG-02 | AC-39 | All `client/tests/lab-02..03` suites | All pass | Pending |
| REG-03 | AC-39 | `npx playwright test e2e/lab-03` | All pass | Pending |

### 2.12 Responsive / accessibility — `e2e/lab-04/visual-responsive.spec.ts` *(additional, §1)*

| Test ID | Req/AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| RESP-01 | AC-40 | Staff, Admin and Requester dashboards at 1280, 820 and 375 | `scrollWidth ≤ clientWidth`. Cards stack per ui-spec §3.1 | Pending |
| RESP-02 | AC-40 | Staff Ticket Detail with 3+ Actions at 1280, 820 and 375 | Table at ≥768, cards at 375. No overflow or clipping | Pending |
| RESP-03 | AC-40 | Requester Ticket Detail (read-only Actions plus history) at 375 | No overflow | Pending |
| RESP-04 | AC-40 | Keyboard-only: dashboard drill-down, then Add Action, fill, Save, then status change | Every step reachable by Tab/Enter/Space with a visible focus ring | Pending |
| RESP-05 | ui-spec §10 | Baseline screenshots per screen × viewport | Files written under `artifacts/lab-04/screenshots/` | Pending |

### 2.13 E2E — `e2e/lab-04/`

| Test ID | Req/AC | File | What It Tests | Expected Result | Final |
|---|---|---|---|---|---|
| E2E-01 | AC-01, AC-09, AC-11, AC-12 | actions-taken-flow.spec.ts | Staff A claims a Ticket and adds a Planned Action assigned to staff B. B (second browser context) moves it to In Progress, then Completed. A adds another Action | Both listed in order with correct performer and assignee. Completed one is locked | Pending |
| E2E-02 | AC-03, AC-17, AC-19 | ticket-resolution.spec.ts | "Resolved" disabled with reason. Record a Completed Action. Resolve. Requester logs in and sees the Actions and history read-only | Each step as specified | Pending |
| E2E-03 | AC-20, AC-21 | ticket-resolution.spec.ts | Requester marks "appears resolved". Staff sees the pill, Resolves, Closes, Reopens. Pill cleared. Requester has no Reopen control | As specified | Pending |
| E2E-04 | AC-22, AC-24 | ticket-resolution.spec.ts | Two staff contexts on one Ticket. One changes status. The other submits a status and an Action edit | Conflict banner, Reload, input retained, nothing overwritten | Pending |
| E2E-05 | AC-05, AC-06, AC-08, AC-13 | actions-taken-flow.spec.ts | UI validation errors. Assignee deactivated by an Admin while the form is open, then save. Closed Ticket shows no Add Action | Field errors. `INVALID_ASSIGNEE` under Assignee. Read-only card | Pending |
| E2E-06 | AC-25, AC-26 | dashboards.spec.ts | Staff dashboard: follow every card drill-down | The Queue total shown equals each card value | Pending |
| E2E-07 | AC-02, AC-27, AC-28 | dashboards.spec.ts | Requester dashboard drill-downs. Fresh Requester sees zeros and empty states | As specified | Pending |
| E2E-08 | AC-30, AC-41, FR-20 | dashboards.spec.ts | Each role logs in, lands on its Dashboard (Admin with user counts), and visits every screen | Correct landing and nav. Zero console errors collected across the journey | Pending |
| E2E-09 | AC-39 | regression.spec.ts | Cross-role journey: Requester creates a Ticket with an attachment and a comment → staff claims, sets priority, adds a note and an Action, resolves → Admin creates and deactivates a user | All Lab 2/3 behavior intact | Pending |
| E2E-10 | AC-37, AC-38 | regression.spec.ts | Double click Save on Action and Comment. Aborted network request (`page.route`) on the Action form | One record each. Form input retained after the failure | Pending |

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

Updated as each Issue lands. **As of Issue 4-2 (Actions Taken backend):** UNIT-01–03, API-01–20 and
MIG-01–04 are implemented and passing.

| Level | Planned | Actual so far | Passing | Failing | Deferred |
|---|---|---|---|---|---|
| Unit | 7 | 3 (UNIT-01–03) | 3 | 0 | 0 |
| API (incl. Authz/Workflow) | 49 | 20 (API-01–20) | 20 | 0 | 0 |
| Migration / seed | 4 | 4 (MIG-01–04) | 4 | 0 | 0 |
| Performance smoke | 2 | 0 | 0 | 0 | 0 |
| UI component | 30 | 0 | 0 | 0 | 0 |
| UI style | 2 | 0 | 0 | 0 | 0 |
| Regression | 3 | 0 | 0 | 0 | 0 |
| Responsive | 5 | 0 | 0 | 0 | 0 |
| E2E | 10 | 0 | 0 | 0 | 0 |
| **Total** | **112** | **27** | **27** | **0** | **0** |

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
