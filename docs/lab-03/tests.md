# Lab 3 Test Plan and Results

Planned before implementation, per Test DD/TDD (this file is written as part of Issue 3-1, before any
Lab 3 code exists). Every row maps to an Acceptance Criterion (AC) or Business Rule (BR) in
`specification.md`; every AC has at least one planned test (§3). `Final` starts at `Pending` for every row
and must be moved to `Pass`/`Fail`/`Deferred` as each Issue actually lands — **not reconstructed from
finished code afterward**, and not left stale: per the Lab 2 retrospective
(`docs/lab-02/specification.md`'s own process notes), a doc-finalization sweep at the end of the sprint
must reconcile every row here against real, verified state before Issue 3-8 (Final Doc) is marked done.
That sweep was done in Issue 3-8: no row in this file is still `Pending` (see §6).

## 1. Test Strategy

Six levels, per the labsheet's minimum coverage requirement: **Unit**, **API**, **UI component**,
**UI style**, **Responsive**, **E2E**.

**File-mapping decisions** (beyond the required `server/tests/lab-03/*.api.test.ts` and
`client/tests/lab-03/*.test.tsx` files listed in the labsheet's §12 Required Repository Increment):
- Two small unit-test files not in the labsheet's minimum list are added, matching Lab 2's precedent
  (`ticket-number.unit.test.ts`): `password.unit.test.ts` (hashing/length helpers) and
  `status-transition.unit.test.ts` (a pure function over the §5.2 matrix, so every transition rule is
  checked once in isolation before it's re-exercised through real API calls).
- `requester-regression.api.test.ts` and `migration.api.test.ts` are added beyond the six required staff/
  admin/auth files, since none of those six is really the right home for "does every Lab 2 Requester
  function still work under session auth" or "did the Requester→User migration preserve existing data" —
  both are Lab 3-specific concerns the required file list doesn't name a home for.
- `RequesterTicketDetailExtensions.test.tsx` is added because Public Comments and "Problem Appears
  Resolved" are new behavior on an existing Lab 2 screen; keeping it separate from
  `docs/lab-02`'s own `RequesterTicketDetail.test.tsx` avoids mixing Lab 2's frozen regression suite with
  Lab 3's new assertions in the same file.
- `client/tests/lab-02/DevRequesterSelector.test.tsx` is retired (the screen it tested no longer exists,
  §11 BR-39) — its coverage of "empty/failure/keyboard" states is replaced by the equivalent states on
  `Login.test.tsx`.
- UI style assertions continue Lab 2's pattern of living inside the relevant component test file, tagged
  `STYLE-xx` for traceability rather than a separate style-only suite.
- `visual-responsive.spec.ts` and a small `requester-regression.spec.ts` are added under `e2e/lab-03/`
  beyond the three required flow specs, mirroring Lab 2's own `visual-responsive.spec.ts` precedent and
  keeping the Requester end-to-end walkthrough out of the Staff/Admin-focused required specs.

## 2. Planned Tests

### Unit — `server/tests/lab-03/password.unit.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UNIT-01 | BR-06 | bcrypt hash/compare round-trip | Correct password compares true; wrong password compares false | Pass |
| UNIT-02 | BR-14 | New-password length validator | <8 chars rejected; ≥8 chars accepted | Pass |

### Unit — `server/tests/lab-03/status-transition.unit.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UNIT-03 | BR-22, BR-23, BR-24, §5.2 | Transition-matrix pure function, every listed (from, to, role) triple | Each returns allowed | Pass |
| UNIT-04 | §5.2 | Every pair not listed in the matrix | Returns not-allowed, including any pair out of Cancelled (terminal); Closed → Reopened is a listed, allowed pair, not a not-allowed case | Pass |

### API — `server/tests/lab-03/auth.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-01 | AC-01 | `POST /api/auth/login` valid credentials | `200`, session cookie set, correct role in body | Pass |
| API-02 | BR-07 | Login with an unknown email | `401 INVALID_CREDENTIALS` | Pass |
| API-03 | BR-07 | Login with a known email, wrong password | `401 INVALID_CREDENTIALS`, message identical to API-02 | Pass |
| API-04 | AC-05, BR-08 | Login with correct credentials, `isActive = false` | `401 ACCOUNT_INACTIVE`, message distinct from API-02/03 | Pass |
| API-05 | AC-02, BR-13 | Any protected endpoint while `mustChangePassword = true` | `403 PASSWORD_CHANGE_REQUIRED` | Pass* |
| API-06 | AC-07, BR-14 | `POST /api/auth/change-password`, new password <8 chars | `400 VALIDATION_ERROR` | Pass |
| API-07 | AC-08, BR-14 | Change-password, mismatched confirmation | `400 VALIDATION_ERROR` | Pass |
| API-08 | BR-15 | Change-password, valid | `200`, `mustChangePassword: false`, same session still authenticates | Pass |
| API-09 | AC-09, BR-10 | Logout, then reuse the old cookie | `401 UNAUTHENTICATED` on the next request | Pass |
| API-10 | AC-10, BR-11 | Any protected endpoint, no cookie | `401 UNAUTHENTICATED` | Pass |
| API-11 | BR-16 | `GET /api/auth/me` | Returns id/name/email/role/isActive/mustChangePassword; never `passwordHash` | Pass |

\* API-05 is verified against `requirePasswordChanged` mounted on a throwaway test-only route, not a
real business endpoint — as of Issue 3-2 no such endpoint exists yet (every Lab 2 endpoint is still
unauthenticated; Issue 3-3 is what first composes this middleware onto a real route). The middleware
itself is proven correct now rather than left untested until 3-3; full business-route coverage is
added when 3-3 actually gates a route with it.

### API — `server/tests/lab-03/authorization.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-12 | AC-03, AC-12, BR-03, BR-17 | `POST /api/tickets` with a forged `requesterId` in the body | Created ticket's `requesterId` is the session user's; forged value ignored | Pass |
| API-13 | AC-13, BR-18 | `GET /api/tickets/:id` for a ticket owned by a different Requester | `404 NOT_FOUND` | Pass |
| API-14 | AC-04, BR-29 | Requester calls `POST /api/staff/tickets/:id/notes` | `403 FORBIDDEN`, no note content in the response | Pass |
| API-15 | AC-17, §5.1 | Requester calls `GET /api/staff/tickets` | `403 FORBIDDEN` | Pass |
| API-16 | AC-31, §5.1 | Non-Administrator (both Requester and IT Staff) calls `GET /api/admin/users` | `403 FORBIDDEN` for both roles | Pass |
| API-17 | AC-26, §11 | Administrator calls claim/priority/status/notes endpoints | Succeeds identically to IT Staff (parity) | Pass |
| API-18 | BR-39 | A request includes a legacy `requesterId` query/body param | Ignored; identity still derived from the session | Pass |

### API — `server/tests/lab-03/requester-regression.api.test.ts` *(additional file, see §1)*

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-19 | AC-11 | `GET /api/tickets` as an authenticated Requester | Only that Requester's own tickets returned, no `requesterId` param needed | Pass |
| API-20 | — | Every Lab 2 AC (`docs/lab-02/specification.md` §9) re-run against the session-authenticated endpoints | All still pass unchanged | Pass |
| API-21 | AC-14, BR-26–BR-28 | `POST /api/tickets/:id/comments`, valid content | `201`, `author`/`createdAt` backend-assigned | Pass |
| API-22 | BR-26 | Comment with blank/whitespace-only content | `400 VALIDATION_ERROR` | Pass |
| API-23 | AC-15, BR-25 | `PATCH .../resolved-indication` on an open owned ticket | `200`, `requesterConfirmedResolvedAt` set, `currentStatus` unchanged | Pass |
| API-24 | BR-25 | Same action on an already-Resolved ticket | `409 TICKET_ALREADY_TERMINAL` | Pass |

**API-25/26/27 (Requester self-Cancel) are not part of this issue.** Confirmed with the user ahead of
implementation (`specification.md` §11 "Cancel scope" decision, referencing GitHub Issue #33's own text,
which never mentions status/cancel): the entire `PATCH /api/tickets/:id/status` endpoint — every IT-Staff
transition and the Requester's own Cancel-from-New/Open case together — is built once, in Issue 3-5, not
split across two issues. Those three IDs are retired from this file's plan; Issue 3-5's own test plan
defines whatever IDs it needs for the full transition matrix, AC-25 included (see §3's traceability note
below).

### API — `server/tests/lab-03/staff-queue.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-28 | AC-16 | `GET /api/staff/tickets` as IT Staff | Tickets across multiple Requesters returned | Pass |
| API-29 | AC-18 | `page`/`pageSize`/`sortBy` params | Correct page, accurate `pagination` metadata | Pass |
| API-30 | AC-19 | Filters matching nothing | `data: []` | Pass |
| API-31 | §7 | `ownerId=unassigned` | Only tickets with `ownerId: null` returned | Pass |
| API-32 | §7 | Invalid `sortBy` value | `400 VALIDATION_ERROR` | Pass |
| API-33 | §7 | `page=0` or non-numeric | Silently clamped to `1` | Pass |
| API-55 | §7, `ui-spec.md` §6.3 | `categoryId` filter | Only tickets in that Category returned | Pass |

### API — `server/tests/lab-03/staff-ticket-detail.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-34 | AC-20, BR-19, BR-20 | `PATCH .../owner`, claim an unassigned ticket | `200`, `ownerId` set to the caller | Pass |
| API-35 | AC-21 | `PATCH .../owner`, reassign an owned ticket to a different active IT Staff member | `200`, `ownerId` updates | Pass |
| API-36 | BR-19 | `PATCH .../owner` with a Requester id or an inactive user id | `400 INVALID_OWNER` | Pass |
| API-37 | AC-23, BR-21, BR-22 | `PATCH .../priority` | `200`, `itPriority` updates, `requestedPriority` unchanged | Pass |
| API-38 | AC-22, BR-23 | `PATCH .../status`, New → Resolved directly | `409 TRANSITION_NOT_PERMITTED` | Pass |
| API-39 | §5.2 | `PATCH .../status` through every permitted matrix transition | Each succeeds `200` | Pass |
| API-40 | — | `GET /api/staff/tickets/:id` | Returns `notes[]` and the full `requester` object | Pass |

### API — `server/tests/lab-03/comments-notes.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-41 | AC-24, BR-04 | `POST .../notes` by IT Staff | `201`; visible on the staff `GET`, absent from `GET /api/tickets/:id` | Pass |
| API-42 | BR-26 | `POST .../notes` with blank content | `400 VALIDATION_ERROR` | Pass |
| API-43 | BR-27 | Attempt to edit/delete an existing Comment or Note | No such route exists (`404`) — confirms append-only | Pass |
| API-44 | BR-04 | `GET .../comments` as IT Staff on a ticket they don't own | `200`, full list (IT Staff isn't ownership-restricted) | Pass |

### API — `server/tests/lab-03/requester-regression.api.test.ts` *(additional rows, Issue 3-5)*

Restores the "Planned" total §6 noted would happen once Issue 3-5 defined its own IDs for the
Requester side of the transition matrix, in place of the retired API-25/26/27 (§2's Cancel-scope
note).

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-56 | AC-25, BR-24 | Requester `PATCH /api/tickets/:id/status` with `CANCELLED` from New or Open, own ticket | `200`, `currentStatus: CANCELLED` | Pass |
| API-57 | BR-24 | Requester attempts Cancel past New/Open, a non-Cancel target, or on a non-owned ticket | `409 TRANSITION_NOT_PERMITTED` (first two); `404` (ownership) | Pass |

### API — `server/tests/lab-03/users-admin.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-45 | AC-27, BR-31 | `POST /api/admin/users`, duplicate email (any case) | `409 DUPLICATE_EMAIL` | Pass |
| API-46 | BR-30 | `POST /api/admin/users`, valid | `201`, `mustChangePassword: true` regardless of request body | Pass |
| API-47 | AC-28, BR-33 | `POST .../reset-password`, then log in with the new password | `mustChangePassword: true`; login succeeds and routes to Change Password | Pass |
| API-48 | AC-29, BR-34 | `PATCH` own account, `isActive: false` | `409 SELF_DEACTIVATION_BLOCKED` | Pass |
| API-49 | AC-30, BR-35 | `PATCH` targeting the last active Administrator | See §7 note: reachable only via the same self-targeting request API-48 already covers (BR-34 fires first); tested instead via (a) a fellow active Administrator can be deactivated when it would *not* leave zero active, and (b) the sole active Administrator's self-attempt is still blocked | Pass |
| API-50 | AC-32 | `GET /api/admin/users?search=...` | Only matching name/email rows returned | Pass |
| API-51 | AC-33 | `GET /api/admin/users?role=IT_STAFF` | Only that role returned | Pass |
| API-52 | BR-32 | `PATCH` edits name/email/role/`isActive` | `passwordHash`/`mustChangePassword` unchanged by this endpoint | Pass |

### API — `server/tests/lab-03/migration.api.test.ts` *(additional file, see §1)*

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-53 | BR-37 | An existing Lab 2 seeded Ticket, post-migration | `requesterId` still resolves to the correct migrated `User` row | Pass |
| API-54 | BR-38 | Every migrated seed Requester | Has a non-null `passwordHash` and `mustChangePassword: true` | Pass |

### UI component — `client/tests/lab-03/Login.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-01 | AC-05 | Mocked `ACCOUNT_INACTIVE` response | Distinct inactive-account message shown | Pass |
| UI-02 | — | Submit with blank email/password | Field validation messages, no `fetch` call | Pass |
| UI-03 | — | Mocked `INVALID_CREDENTIALS` response | Generic message shown, not attached to a specific field | Pass |
| UI-04 | — | Submit clicked | Busy state shown, button disabled during the request | Pass |
| UI-05 | AC-06 | Mocked successful login with `mustChangePassword: true` | Redirects to Change Password, not the main app | Pass* |
| UI-06 | — | Mocked login for each of the 3 roles | Shell renders only that role's nav links (§2 of `ui-spec.md`) | Pass |

\* UI-05 verifies the underlying `AuthContext` state (`status: authenticated`,
`user.mustChangePassword: true`) rather than the actual route render — `LoginPage` is tested
standalone, and the redirect itself lives in `App.tsx`'s gate. UI-06 was deferred at Issue 3-2 (no
Queue/User Management screens existed yet to scope) and completed at Issue 3-4 once
`StaffTicketQueuePage`/`App.tsx`'s role-conditional routing existed — tested against the full `App`
rather than `LoginPage` alone, since the nav lives in `AppShell`. Both noted directly in
`Login.test.tsx`.

### UI component — `client/tests/lab-03/ChangePassword.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-07 | AC-07 | New password <8 chars | Length message, no API call | Pass |
| UI-08 | AC-08 | Mismatched confirmation field | Mismatch message, no API call | Pass |
| UI-09 | — | Mocked success | Continues into the app without a second login prompt | Pass |

### UI component — `client/tests/lab-03/RequesterTicketDetailExtensions.test.tsx` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-10 | AC-14 | Post a Public Comment | New comment appears at the bottom of the list immediately | Pass |
| UI-11 | AC-15 | Click "Mark Problem as Resolved" | Button replaced by a confirmation line; status badge unchanged | Pass |
| UI-12 | BR-25 | Ticket already Resolved/Closed/Cancelled | Action button is not rendered | Pass |
| UI-13 | AC-04 | Static check of this screen's own code path | No component or request on this screen can render Note data | Pass |
| UI-28 | BR-24 *(new, Issue 3-7)* | Click "Cancel Ticket" then "Confirm" | `PATCH .../status` called with `CANCELLED`; status badge updates | Pass |
| UI-29 | — *(new, Issue 3-7)* | Click "Cancel Ticket" then "Keep Ticket" | No API call made, confirm step dismissed | Pass |
| UI-30 | BR-24 *(new, Issue 3-7)* | Ticket past New/Open | "Cancel Ticket" is not rendered | Pass |

### UI component — `client/tests/lab-03/StaffTicketQueue.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-14 | AC-19 | Mocked zero-match response, filter active | No-results state + clear-filters action | Pass |
| UI-15 | — | Typing in search | Triggers a re-fetch with the `search` param set | Pass |
| UI-16 | AC-18 | Changing the sort control | Re-fetch with `sortBy`/`sortDir` params | Pass |
| UI-17 | AC-18 | Clicking "next page" | Re-fetch with the incremented `page` param | Pass |
| STYLE-01 | — | Status/priority/role badges on Queue rows | Each renders a color class **and** a visible text label | Pass |

### UI component — `client/tests/lab-03/StaffTicketDetail.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-18 | AC-20 | Claim button on an unassigned ticket | Calls `PATCH .../owner`; row updates to show the caller as owner | Pass |
| UI-19 | AC-22 | Status-change control | Only offers options valid from the current status (`ui-spec.md` §7.3). Checked for all 8 statuses against `specification.md` §5.2 (extended from a 2-status spot check in Issue 3-8) | Pass |
| UI-20 | AC-22 | A mocked `409 TRANSITION_NOT_PERMITTED` response | Safe failure message shown, status unchanged in the UI | Pass |
| UI-21 | — | Internal Notes card vs. Public Comments card | Rendered with visually distinct CSS classes (`ui-spec.md` §7.4) | Pass |
| STYLE-02 | — | IT Priority editable control vs. Requested Priority read-only badge | Distinguishable classes, matching the editable/read-only rule | Pass |

### UI component — `client/tests/lab-03/UserManagement.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-22 | AC-27 | Mocked `DUPLICATE_EMAIL` response | Inline email-field error shown | Pass |
| UI-23 | AC-29 | The logged-in Administrator's own row | Activation toggle rendered disabled with an explanatory tooltip | Pass |
| UI-24 | AC-30 | The last active Administrator's row | Same disabled + tooltip treatment | Pass |
| UI-25 | AC-32 | Typing in search | Triggers a re-fetch with the `search` param | Pass |
| UI-26 | AC-33 | Selecting a role filter | Triggers a re-fetch with the `role` param | Pass |
| UI-27 | — | "Set New Initial Password" action | Rendered as a separate control from the main Save action (BR-32) | Pass |

### Responsive/visual — `e2e/lab-03/visual-responsive.spec.ts` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| RESP-01 | AC-34 | Ticket Queue at 375px width | No horizontal scroll; card layout renders | Pass |
| RESP-02 | AC-34 | User Management at 375px width | No horizontal scroll; card layout renders | Pass |
| RESP-03 | — | Staff Ticket Detail at 820px (tablet) width | Two-column layout renders without clipping/overlap | Pass |
| RESP-04 | AC-35 | Login, tab-only keyboard navigation | All controls reachable, visible focus ring | Pass |
| RESP-05 | — | Baseline screenshot capture (one clean shot per screen per viewport — Queue, User Management, Staff Ticket Detail × desktop/tablet/mobile) | 9 files under `artifacts/lab-03/screenshots/` | Pass — see §7: the full `ui-spec.md` §12 per-interaction-state matrix (~40 files) is Issue 3-8's job, same Issue-2-8-vs-2-9 split Lab 2 used |

### E2E — `e2e/lab-03/authentication.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-01 | AC-01, AC-02, AC-06, AC-09, AC-10 | Full flow: login → mandatory Change Password → logout → direct access blocked after logout | Each step behaves per spec | Pass |
| E2E-02 | AC-05 | Login attempt on a seeded inactive account | Distinct inactive-account message shown | Pass |

### E2E — `e2e/lab-03/staff-ticket-flow.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-03 | AC-16, AC-20, AC-23, AC-24 | Login as IT Staff → open Queue → claim a ticket → set IT Priority → post an Internal Note → change status | Each step succeeds and is reflected on reload | Pass |
| E2E-04 | AC-26 | Login as Administrator → repeat the same claim/priority/status/note flow | Succeeds identically to IT Staff (full parity) | Pass |

### E2E — `e2e/lab-03/user-administration.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-05 | AC-27, AC-28 | Login as Administrator → create a user → reset that user's password → log in as that user | Routed to the mandatory Change Password screen | Pass |
| E2E-06 | AC-29, AC-30 | Self-deactivation attempt on the logged-in Administrator's own row | Blocked: Activation toggle disabled with an explanatory tooltip | Pass — see §7 (same as API-49): a *different*-caller "deactivate the last Administrator" scenario is unreachable live, so this is what AC-30 actually reduces to in practice |

### E2E — `e2e/lab-03/requester-regression.spec.ts` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-07 | AC-11, AC-12, AC-14, AC-15, AC-25 | Login as Requester → create a ticket → post a Public Comment → mark Problem Appears Resolved → cancel a different New ticket | Each step succeeds; My Tickets shows only this Requester's tickets throughout | Pass |

## 3. Acceptance-Criterion Traceability

| AC | Test(s) | AC | Test(s) |
|---|---|---|---|
| AC-01 | API-01, E2E-01 | AC-19 | API-30, UI-14 |
| AC-02 | API-05, E2E-01 | AC-20 | API-34, UI-18, E2E-03 |
| AC-03 | API-12 | AC-21 | API-35 |
| AC-04 | API-14, UI-13 | AC-22 | API-38, UI-19, UI-20 |
| AC-05 | API-04, UI-01, E2E-02 | AC-23 | API-37, E2E-03 |
| AC-06 | UI-05, E2E-01 | AC-24 | API-41, E2E-03 |
| AC-07 | API-06, UI-07 | AC-25 | API-56, API-57, E2E-07 |
| AC-08 | API-07, UI-08 | AC-26 | API-17, E2E-04 |
| AC-09 | API-09, E2E-01 | AC-27 | API-45, UI-22 |
| AC-10 | API-10, E2E-01 | AC-28 | API-47, E2E-05 |
| AC-11 | API-19, E2E-07 | AC-29 | API-48, UI-23, E2E-06 |
| AC-12 | API-12, E2E-07 | AC-30 | API-49, UI-24, E2E-06 |
| AC-13 | API-13 | AC-31 | API-16 |
| AC-14 | API-21, UI-10, E2E-07 | AC-32 | API-50, UI-25 |
| AC-15 | API-23, UI-11, E2E-07 | AC-33 | API-51, UI-26 |
| AC-16 | API-28, E2E-03 | AC-34 | RESP-01, RESP-02 |
| AC-17 | API-15 | AC-35 | RESP-04 |
| AC-18 | API-29, UI-16, UI-17 | | |

Every AC has at least one planned test. AC-01/AC-05/AC-14/AC-15/AC-20/AC-22 are covered at more than one
level deliberately — these are exactly the authentication- and ownership-sensitive paths the submission
evidence (Parts 5–7) asks us to demonstrate live.

## 4. Responsive and Visual Checklist

Reuses `ui-spec.md` §11 verbatim as the manual visual-inspection pass that accompanies RESP-01–05 and the
`artifacts/lab-03/screenshots/` captures, following the same discipline Lab 2 established
(`docs/lab-02/tests.md` §4): automated assertions catch markup/CSS regressions, but the final sign-off
before a UI Issue is marked Done is a human look at the actual screenshots against that checklist.

## 5. Test Commands

| Command | Runs |
|---|---|
| `cd server && npm test` | All Vitest/Supertest suites, including `server/tests/lab-03/*.api.test.ts` and the Lab 3 unit tests |
| `cd client && npm test` | All Vitest/Testing-Library suites, including `client/tests/lab-03/*.test.tsx` |
| `npx playwright test e2e/lab-03` (from repo root) | `e2e/lab-03/*.spec.ts`. Backend must already be running (`cd server && npm run dev`) — `playwright.config.ts`'s `webServer` only auto-starts the Vite client. Scoped to `e2e/lab-03` deliberately: unscoped `npx playwright test` also picks up `e2e/lab-02`, whose specs are now obsolete — see §7 |
| `cd server && npm run prisma:migrate && npm run prisma:seed` | Applies the Lab 3 migration (`Requester` → `User`, new columns/models) and (re-)seeds Users/Tickets/Comments/Notes before any of the above |
| `cd server && npm run dev` (must already be running before `npx playwright test`) | The backend — same limitation as Lab 2 (`docs/lab-02/tests.md` §5): Playwright's `webServer` config only auto-starts the Vite client |

## 6. Final Results

**Complete.** Updated after each landed Issue — following the same discipline `docs/lab-02/tests.md` §6
used — not reconstructed in one pass at the end. As of **Issue 3-7 (Responsive & E2E verification)**,
every single row this file plans, across every level, is `Pass`. The 7 `e2e/lab-03/*.spec.ts` files
(authentication, staff-ticket-flow, user-administration, requester-regression, visual-responsive) run
against the real app and real backend, confirmed stable across repeated runs. A full staleness sweep
(reconciling every row against real, verified state one more time) still happens as part of Issue 3-8 per
the doc-finalization habit this project has already needed twice in Lab 2 — that's a final audit, not the
only time this table gets touched, and this issue's own numbers below were produced the same
implement-then-verify way every prior issue's were.

The API "Planned" total dropped from 100's original 55 to 52 as of Issue 3-3 (API-25/26/27 retired),
then back up to 54 at Issue 3-5 (API-56/57, the Requester side of the transition matrix). The UI component
total similarly grew from 27 to 30 at this issue: UI-28–30 are Issue 3-7's own IDs for the Requester
Cancel Ticket control — a real gap this issue found (see §7) and fixed, not originally planned. UI-06
(role-scoped nav), deferred at Issue 3-2, completed at Issue 3-4.

| Level | Planned (sprint total) | Actual so far | Passing | Failing | Deferred |
|---|---|---|---|---|---|
| Unit | 4 | 4 (UNIT-01–04) | 4 | 0 | 0 |
| API | 54 | 54 (API-01–57, all IDs) | 54 | 0 | 0 |
| UI component | 30 | 30 (UI-01–30, all IDs) | 30 | 0 | 0 |
| UI style | 2 | 2 (STYLE-01, 02) | 2 | 0 | 0 |
| Responsive | 5 | 5 (RESP-01–05) | 5 | 0 | 0 |
| E2E | 7 | 7 (E2E-01–07) | 7 | 0 | 0 |
| **Total** | **102** | **102** | **102** | **0** | **0** |

"Actual so far" counts planned Test IDs with a real, verified implementation. The real `npm test` +
`npx playwright test e2e/lab-03` suites run more raw cases than that (188 server + 75 client `it()` blocks
+ 23 Playwright tests, against 102 planned IDs combined) — extra edge cases don't map to a single planned
ID each, same pattern Lab 2 saw (`docs/lab-02/tests.md` §6). Re-run repeatedly across Issues 3-2 through
3-7 — including after fixing five separate manual-testing data-pollution incidents (all caught by
`API-54`) and one test-isolation bug in Issue 3-4's own `staff-queue.api.test.ts` — with zero flakes
since; see §7. Two planned things turned out different from plan during this issue specifically, both
documented in §7 rather than silently patched: `LAST_ADMINISTRATOR_PROTECTED` is unreachable through any
real request (found in Issue 3-6, restated here since E2E-06 hit the same wall), and the Requester's own
Cancel Ticket control didn't exist in the frontend at all until this issue built it.

## 7. Known Limitations or Deferred Tests

Recorded as real limitations are found during implementation, matching Lab 2's practice of documenting
what actually happened rather than speculating here. Two are already known from `specification.md` §3/§11
and are recorded now so they aren't mistaken for gaps later:

- **No login rate-limiting/lockout test** — BR-12 explicitly documents that Lab 3 doesn't implement this
  behavior (excluded per the labsheet's account-unlocking exclusion), so there is intentionally no test
  asserting lockout after N failed attempts; API-02/API-03 confirm each individual failed attempt is
  handled correctly, which is the behavior that does exist.
- **Cross-browser coverage** stays out of scope, same as Lab 2 (`docs/lab-02/tests.md` §7) — Playwright
  runs against Chromium only.
- **Manual browser verification of Issue 3-2 mutated a real seeded account.** Logging in as
  `alex.rivera@example.edu` through the actual UI to verify the login → change-password → app flow
  legitimately flipped that account's `mustChangePassword` to `false` and changed its password — correct
  app behavior, but it broke `API-54`'s assumption that every migrated seed Requester is still in its
  fresh post-migration state, and would have broken the documented demo credentials (README "Seeded
  accounts") for that one account. Restored via a one-off script (re-hashing the documented dev password
  and resetting `mustChangePassword` to `true`), then re-verified `npm test` clean. Not a schema or
  migration defect — a reminder that manual verification should prefer disposable accounts over the
  documented seed/demo ones where the two aren't the same account being verified on purpose.
- **The same incident recurred once, independently, before Issue 3-3 started** — `alex.rivera@example.edu`
  was found with `mustChangePassword: false` again at the start of this issue's work, most likely from
  manual testing during PR #40's review. Restored the same way. Issue 3-3's own manual browser
  verification used a disposable `manual-verify@example.test` account instead (created and left in place,
  same as other `@example.test` fixture rows this project's test suites already leave behind), precisely
  to avoid a third recurrence.
- **The incident recurred a third time anyway, before Issue 3-4 started** — `alex.rivera@example.edu` was
  found flipped again at the start of this issue's work, despite Issue 3-3 having deliberately avoided
  touching it. Restored the same way once more. This project doesn't yet have a `npm run reset-dev-accounts`
  script or similar; worth building one if a fourth recurrence happens.
- **`staff-queue.api.test.ts` (Issue 3-4) had its own test-isolation bug**, unrelated to the account
  incidents above: its `beforeAll` used a static summary string ("Fixture ticket for Staff Queue tests")
  as both the created tickets' summary and the search term every assertion filtered by. Because the
  Staff Queue is deliberately unscoped (AC-16 — every Requester's tickets, not just one session's) and
  this dev DB is never reset between `npm test` invocations, every repeated run added 12 more tickets
  matching that same static string, so exact-count assertions (`toBe(3)`, `toHaveLength(2)`,
  `totalItems: 12`) passed on first creation but went flaky on every subsequent run. Fixed by folding a
  `Date.now()` suffix into the fixture summary itself, the same uniqueness technique already used for
  fixture email addresses throughout this project — confirmed stable across three consecutive re-runs
  after the fix.
- **The account-pollution incident recurred a fourth time, before Issue 3-5 started — and for the first
  time, hit two accounts at once.** Both `alex.rivera@example.edu` and `priya.nair@example.edu` were
  found with `mustChangePassword: false` at the start of this issue's work; neither had been deliberately
  touched by any Issue 3-4 test or verification step, so this was manual browser testing between issues
  again. Restored the same way (disposable `tsx` script, re-hash the documented dev password, reset
  `mustChangePassword` to `true`), then re-verified all 157 server tests clean. Given this is now the
  fourth occurrence and the first to affect more than one account at once, the `npm run
  reset-dev-accounts` script flagged as "worth building" after the third recurrence is now a real backlog
  item rather than a hypothetical — not built in this issue (out of its own scope), but should not keep
  being deferred past Issue 3-6 or 3-7.
- **The incident recurred a fifth time, before Issue 3-6 started** — `alex.rivera@example.edu` again.
  Restored the same way, then all 188 server tests reverified clean. This time the backlog item from the
  note above was actually built: `server/prisma/resetDevAccounts.ts` (`npm run reset-dev-accounts`)
  resets every account in `seed.ts`'s `USERS` list back to the documented dev password and
  `mustChangePassword: true`, idempotently, without creating any row (that stays `prisma:seed`'s job) or
  touching any `@example.test` fixture account (none of those are in `USERS`). The shared data
  (`DEV_SEED_PASSWORD`/`USERS`) was pulled out into `server/prisma/seedData.ts` so importing it doesn't
  also trigger `seed.ts`'s own module-level `main()` call as a side effect. Should this recur a sixth
  time, the fix is now `npm run reset-dev-accounts`, not another disposable script.
- **`LAST_ADMINISTRATOR_PROTECTED` (BR-35) is unreachable through any real authenticated request** —
  found while writing API-49's test. `PATCH /api/admin/users/:id` requires the caller to be an active
  Administrator (`requireAuth`/`requireRole`), so whenever caller != target there are always >= 2 active
  Administrators at request time — deactivating the target can never actually reach zero. When caller ==
  target, BR-34 fires first and unconditionally ("independent of the last-Administrator rule" —
  specification.md §11), so self-deactivation never falls through to the BR-35 branch either. The check
  in `app.ts` is kept as defense-in-depth against a theoretical concurrent-request race (two requests both
  passing the count check before either commits), not because a single-request test can reach it — API-49
  was rewritten to test the two behaviors that actually are reachable: a fellow active Administrator *can*
  be deactivated when doing so wouldn't leave zero active (correct, not over-blocking), and the sole
  active Administrator's own self-attempt is still blocked (via BR-34, `SELF_DEACTIVATION_BLOCKED`). Not a
  defect — `LAST_ADMINISTRATOR_PROTECTED` genuinely can never appear in a response under this
  authorization model, which is worth knowing rather than discovering via a confusing always-passing (or
  always-failing) test later. E2E-06 hit the identical wall while writing its own scenario, for the exact
  same reason — confirmed rather than re-litigated.
- **The Requester's own Cancel action had no frontend control at all, until this issue.** Issue 3-5 built
  the backend side of BR-24/AC-25 (`PATCH /api/tickets/:id/status`, tested at
  `requester-regression.api.test.ts`'s API-56/57) and `api.ts`'s `changeTicketStatus` already existed for
  the Staff detail page to call — but nothing on `TicketDetailPage.tsx` ever called it, and `ui-spec.md`
  §5 never mentioned a Cancel control either. Found while writing this issue's E2E-07 spec, which needs
  exactly this action to exist. Fixed: a "Cancel Ticket" button (visible only from New/Open, per BR-24)
  with the same inline-confirm pattern `StaffTicketDetailPage.tsx`'s status control already uses, plus
  new component tests (UI-28–30) and `ui-spec.md` §5.3. A good example of why an E2E spec is worth writing
  even when every layer below it already has its own passing tests — the layers can each be individually
  correct and the feature still not exist end-to-end.
- **`e2e/lab-02/*.spec.ts` are now obsolete, not broken by this issue.** Confirmed via `git log`:
  `GET /api/requesters` was removed in Issue 3-3 (commit `334558e`), well before this session, as part of
  deleting the Development Requester Selector entirely (BR-39). Lab 2's own E2E specs still drive that
  removed flow (`localStorage`-based Requester selection, `GET /api/requesters` for fixture setup) and now
  fail with a JSON-parse error against the 404 HTML page. Not a regression to fix — Lab 2 is already closed
  out and graded, and `e2e/lab-03/requester-regression.spec.ts` (E2E-07) now covers equivalent Requester
  ground through the real session-auth flow that replaced it. Documented here, and `tests.md` §5's command
  updated to scope explicitly to `e2e/lab-03`, so an unscoped `npx playwright test` run doesn't produce a
  false "something's broken" signal.
- **`.btn-zg-primary` had no visible keyboard-focus indicator at all** — found while writing RESP-04
  (AC-35). Bootstrap's base `.btn` class zeroes the native outline on focus and normally replaces it with
  a `box-shadow` keyed to a `--bs-btn-focus-shadow-rgb` custom property that variant classes like
  `.btn-primary` set — but `.btn-zg-primary` was written from scratch (`client/src/styles/zen-green.css`,
  since Lab 2) and never set that property or any focus style of its own, so keyboard focus on every
  primary button in the app (Login's "Log In" included) was completely invisible, not just subtle. A real,
  if small, accessibility gap that predates this issue — fixed with an explicit
  `.btn-zg-primary:focus-visible` rule rather than weakening RESP-04's check to pass around it.
- **PR #45 review caught a real flaky race in `user-administration.spec.ts`** — the original fix for the
  debounced-search race (wait for the filtered cell to appear, then `.first().click()` on Edit) narrowed
  the race window but didn't close it: in the reviewer's environment it still landed on the wrong row 2 of
  17 runs. Replaced with row-scoped locators — `page.getByRole("row").filter({ hasText: email })
  .getByRole("button", { name: "Edit" })` — which click the Edit button *inside* the matched row directly,
  removing the race entirely rather than just shrinking it. Confirmed stable across 5 repeated local runs
  after the fix, plus a full 17/17 `e2e/lab-03` re-run. Worth remembering for any future Playwright
  work in this repo: "wait for the thing to appear, then click a `.first()`/`.last()` locator" is weaker
  than scoping the click to a container that's guaranteed to hold the right element.
- **Issue 3-8 doc sweep found two coverage gaps behind `ui-spec.md` §11 ticks, and closed both.**
  (1) UI-19 only spot-checked two of the eight statuses; it now checks all eight against `specification.md`
  §5.2, using a matrix transcribed independently of the component (client suite 67 to 75 `it()` blocks).
  (2) "No horizontal scrolling on any of the five new/changed screens" was automated for only three of the
  five (RESP-01/02/03). `visual-responsive.spec.ts` now also asserts no overflow on Login and on Change
  Password at desktop, tablet and mobile widths (Playwright suite 17 to 23 tests), using a freshly created
  user still on the initial password. Both passed without any app change, so this closed evidence gaps
  rather than fixing bugs. Every §11 item is now ticked, each with the test that backs it.
