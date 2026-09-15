# Lab 3 Test Plan and Results

Planned before implementation, per Test DD/TDD (this file is written as part of Issue 3-1, before any
Lab 3 code exists). Every row maps to an Acceptance Criterion (AC) or Business Rule (BR) in
`specification.md`; every AC has at least one planned test (§3). `Final` starts at `Pending` for every row
and must be moved to `Pass`/`Fail`/`Deferred` as each Issue actually lands — **not reconstructed from
finished code afterward**, and not left stale: per the Lab 2 retrospective
(`docs/lab-02/specification.md`'s own process notes), a doc-finalization sweep at the end of the sprint
must reconcile every row here against real, verified state before Issue 3-8 (Final Doc) is marked done.

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
| UNIT-03 | BR-22, BR-23, BR-24, §5.2 | Transition-matrix pure function, every listed (from, to, role) triple | Each returns allowed | Pending |
| UNIT-04 | §5.2 | Every pair not listed in the matrix | Returns not-allowed, including any pair out of Cancelled (terminal); Closed → Reopened is a listed, allowed pair, not a not-allowed case | Pending |

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
| API-12 | AC-03, AC-12, BR-03, BR-17 | `POST /api/tickets` with a forged `requesterId` in the body | Created ticket's `requesterId` is the session user's; forged value ignored | Pending |
| API-13 | AC-13, BR-18 | `GET /api/tickets/:id` for a ticket owned by a different Requester | `404 NOT_FOUND` | Pending |
| API-14 | AC-04, BR-29 | Requester calls `POST /api/staff/tickets/:id/notes` | `403 FORBIDDEN`, no note content in the response | Pending |
| API-15 | AC-17, §5.1 | Requester calls `GET /api/staff/tickets` | `403 FORBIDDEN` | Pending |
| API-16 | AC-31, §5.1 | Non-Administrator (both Requester and IT Staff) calls `GET /api/admin/users` | `403 FORBIDDEN` for both roles | Pending |
| API-17 | AC-26, §11 | Administrator calls claim/priority/status/notes endpoints | Succeeds identically to IT Staff (parity) | Pending |
| API-18 | BR-39 | A request includes a legacy `requesterId` query/body param | Ignored; identity still derived from the session | Pending |

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
| API-28 | AC-16 | `GET /api/staff/tickets` as IT Staff | Tickets across multiple Requesters returned | Pending |
| API-29 | AC-18 | `page`/`pageSize`/`sortBy` params | Correct page, accurate `pagination` metadata | Pending |
| API-30 | AC-19 | Filters matching nothing | `data: []` | Pending |
| API-31 | §7 | `ownerId=unassigned` | Only tickets with `ownerId: null` returned | Pending |
| API-32 | §7 | Invalid `sortBy` value | `400 VALIDATION_ERROR` | Pending |
| API-33 | §7 | `page=0` or non-numeric | Silently clamped to `1` | Pending |
| API-55 | §7, `ui-spec.md` §6.3 | `categoryId` filter | Only tickets in that Category returned | Pending |

### API — `server/tests/lab-03/staff-ticket-detail.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-34 | AC-20, BR-19, BR-20 | `PATCH .../owner`, claim an unassigned ticket | `200`, `ownerId` set to the caller | Pending |
| API-35 | AC-21 | `PATCH .../owner`, reassign an owned ticket to a different active IT Staff member | `200`, `ownerId` updates | Pending |
| API-36 | BR-19 | `PATCH .../owner` with a Requester id or an inactive user id | `400 INVALID_OWNER` | Pending |
| API-37 | AC-23, BR-21, BR-22 | `PATCH .../priority` | `200`, `itPriority` updates, `requestedPriority` unchanged | Pending |
| API-38 | AC-22, BR-23 | `PATCH .../status`, New → Resolved directly | `409 TRANSITION_NOT_PERMITTED` | Pending |
| API-39 | §5.2 | `PATCH .../status` through every permitted matrix transition | Each succeeds `200` | Pending |
| API-40 | — | `GET /api/staff/tickets/:id` | Returns `notes[]` and the full `requester` object | Pending |

### API — `server/tests/lab-03/comments-notes.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-41 | AC-24, BR-04 | `POST .../notes` by IT Staff | `201`; visible on the staff `GET`, absent from `GET /api/tickets/:id` | Pending |
| API-42 | BR-26 | `POST .../notes` with blank content | `400 VALIDATION_ERROR` | Pending |
| API-43 | BR-27 | Attempt to edit/delete an existing Comment or Note | No such route exists (`404`) — confirms append-only | Pending |
| API-44 | BR-04 | `GET .../comments` as IT Staff on a ticket they don't own | `200`, full list (IT Staff isn't ownership-restricted) | Pending |

### API — `server/tests/lab-03/users-admin.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-45 | AC-27, BR-31 | `POST /api/admin/users`, duplicate email (any case) | `409 DUPLICATE_EMAIL` | Pending |
| API-46 | BR-30 | `POST /api/admin/users`, valid | `201`, `mustChangePassword: true` regardless of request body | Pending |
| API-47 | AC-28, BR-33 | `POST .../reset-password`, then log in with the new password | `mustChangePassword: true`; login succeeds and routes to Change Password | Pending |
| API-48 | AC-29, BR-34 | `PATCH` own account, `isActive: false` | `409 SELF_DEACTIVATION_BLOCKED` | Pending |
| API-49 | AC-30, BR-35 | `PATCH` the last active Administrator, `isActive: false` or role change | `409 LAST_ADMINISTRATOR_PROTECTED` | Pending |
| API-50 | AC-32 | `GET /api/admin/users?search=...` | Only matching name/email rows returned | Pending |
| API-51 | AC-33 | `GET /api/admin/users?role=IT_STAFF` | Only that role returned | Pending |
| API-52 | BR-32 | `PATCH` edits name/email/role/`isActive` | `passwordHash`/`mustChangePassword` unchanged by this endpoint | Pending |

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
| UI-06 | — | Mocked login for each of the 3 roles | Shell renders only that role's nav links (§2 of `ui-spec.md`) | Deferred |

\* UI-05 verifies the underlying `AuthContext` state (`status: authenticated`,
`user.mustChangePassword: true`) rather than the actual route render — `LoginPage` is tested
standalone, and the redirect itself lives in `App.tsx`'s gate. UI-06 is deferred: `AppShell`'s nav
links are still `{My Tickets, Create Ticket}` regardless of role as of Issue 3-2 — no Queue/User
Management screens exist yet to scope. Both noted directly in `Login.test.tsx`.

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

### UI component — `client/tests/lab-03/StaffTicketQueue.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-14 | AC-19 | Mocked zero-match response, filter active | No-results state + clear-filters action | Pending |
| UI-15 | — | Typing in search | Triggers a re-fetch with the `search` param set | Pending |
| UI-16 | AC-18 | Changing the sort control | Re-fetch with `sortBy`/`sortDir` params | Pending |
| UI-17 | AC-18 | Clicking "next page" | Re-fetch with the incremented `page` param | Pending |
| STYLE-01 | — | Status/priority/role badges on Queue rows | Each renders a color class **and** a visible text label | Pending |

### UI component — `client/tests/lab-03/StaffTicketDetail.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-18 | AC-20 | Claim button on an unassigned ticket | Calls `PATCH .../owner`; row updates to show the caller as owner | Pending |
| UI-19 | AC-22 | Status-change control | Only offers options valid from the current status (`ui-spec.md` §7.3) | Pending |
| UI-20 | AC-22 | A mocked `409 TRANSITION_NOT_PERMITTED` response | Safe failure message shown, status unchanged in the UI | Pending |
| UI-21 | — | Internal Notes card vs. Public Comments card | Rendered with visually distinct CSS classes (`ui-spec.md` §7.4) | Pending |
| STYLE-02 | — | IT Priority editable control vs. Requested Priority read-only badge | Distinguishable classes, matching the editable/read-only rule | Pending |

### UI component — `client/tests/lab-03/UserManagement.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-22 | AC-27 | Mocked `DUPLICATE_EMAIL` response | Inline email-field error shown | Pending |
| UI-23 | AC-29 | The logged-in Administrator's own row | Activation toggle rendered disabled with an explanatory tooltip | Pending |
| UI-24 | AC-30 | The last active Administrator's row | Same disabled + tooltip treatment | Pending |
| UI-25 | AC-32 | Typing in search | Triggers a re-fetch with the `search` param | Pending |
| UI-26 | AC-33 | Selecting a role filter | Triggers a re-fetch with the `role` param | Pending |
| UI-27 | — | "Set New Initial Password" action | Rendered as a separate control from the main Save action (BR-32) | Pending |

### Responsive/visual — `e2e/lab-03/visual-responsive.spec.ts` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| RESP-01 | AC-34 | Ticket Queue at 375px width | No horizontal scroll; card layout renders | Pending |
| RESP-02 | AC-34 | User Management at 375px width | No horizontal scroll; card layout renders | Pending |
| RESP-03 | — | Staff Ticket Detail at 820px (tablet) width | Two-column layout renders without clipping/overlap | Pending |
| RESP-04 | AC-35 | Login, tab-only keyboard navigation | All controls reachable, visible focus ring | Pending |
| RESP-05 | — | Screenshot capture across the 5 new/changed screens × 3 viewports | Produces the files listed in `ui-spec.md` §12 for Part 9 evidence | Pending |

### E2E — `e2e/lab-03/authentication.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-01 | AC-01, AC-02, AC-06, AC-09, AC-10 | Full flow: login → mandatory Change Password → logout → direct access blocked after logout | Each step behaves per spec | Pending |
| E2E-02 | AC-05 | Login attempt on a seeded inactive account | Distinct inactive-account message shown | Pending |

### E2E — `e2e/lab-03/staff-ticket-flow.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-03 | AC-16, AC-20, AC-23, AC-24 | Login as IT Staff → open Queue → claim a ticket → set IT Priority → post an Internal Note → change status | Each step succeeds and is reflected on reload | Pending |
| E2E-04 | AC-26 | Login as Administrator → repeat the same claim/priority/status/note flow | Succeeds identically to IT Staff (full parity) | Pending |

### E2E — `e2e/lab-03/user-administration.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-05 | AC-27, AC-28 | Login as Administrator → create a user → reset that user's password → log in as that user | Routed to the mandatory Change Password screen | Pending |
| E2E-06 | AC-29, AC-30 | Attempt self-deactivation, then attempt to deactivate the last active Administrator | Both blocked with a visible message | Pending |

### E2E — `e2e/lab-03/requester-regression.spec.ts` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-07 | AC-11, AC-12, AC-14, AC-15, AC-25 | Login as Requester → create a ticket → post a Public Comment → mark Problem Appears Resolved → cancel a different New ticket | Each step succeeds; My Tickets shows only this Requester's tickets throughout | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Test(s) | AC | Test(s) |
|---|---|---|---|
| AC-01 | API-01, E2E-01 | AC-19 | API-30, UI-14 |
| AC-02 | API-05, E2E-01 | AC-20 | API-34, UI-18, E2E-03 |
| AC-03 | API-12 | AC-21 | API-35 |
| AC-04 | API-14, UI-13 | AC-22 | API-38, UI-19, UI-20 |
| AC-05 | API-04, UI-01, E2E-02 | AC-23 | API-37, E2E-03 |
| AC-06 | UI-05, E2E-01 | AC-24 | API-41, E2E-03 |
| AC-07 | API-06, UI-07 | AC-25 | *(Issue 3-5 — see §2's Cancel-scope note)* |
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
| `npx playwright test` (from repo root) | `e2e/lab-03/*.spec.ts` — `playwright.config.ts` already scopes `testDir` to `e2e/` |
| `cd server && npm run prisma:migrate && npm run prisma:seed` | Applies the Lab 3 migration (`Requester` → `User`, new columns/models) and (re-)seeds Users/Tickets/Comments/Notes before any of the above |
| `cd server && npm run dev` (must already be running before `npx playwright test`) | The backend — same limitation as Lab 2 (`docs/lab-02/tests.md` §5): Playwright's `webServer` config only auto-starts the Vite client |

## 6. Final Results

**In progress.** Updated after each landed Issue — following the same discipline `docs/lab-02/tests.md`
§6 used — not reconstructed in one pass at the end. Current as of **Issue 3-3 (Requester Regression)**;
every other Issue's rows remain `Pending` below until their own branch lands. A full staleness sweep
(every `Pending`/`TODO` row reconciled against real, verified state) still happens as part of Issue 3-8,
per the doc-finalization habit this project has already needed twice in Lab 2 — but that's a final audit,
not the only time this table gets touched.

The API "Planned" total drops from 100's original 55 to 52 this issue: API-25/26/27 (Requester
self-Cancel) are retired from this file's plan per the Cancel-scope decision (§2) rather than carried as
permanently `Pending` — Issue 3-5 will add its own IDs for the full transition matrix when it's planned in
detail, which will likely restore or exceed this sprint total.

| Level | Planned (sprint total) | Actual so far | Passing | Failing | Deferred |
|---|---|---|---|---|---|
| Unit | 4 | 2 (UNIT-01, 02) | 2 | 0 | 0 |
| API | 52 | 19 (API-01–24, 53, 54) | 19 | 0 | 0 |
| UI component | 27 | 13 (UI-01–13) | 12 | 0 | 1 (UI-06) |
| UI style | 2 | 0 | 0 | 0 | 0 |
| Responsive | 5 | 0 | 0 | 0 | 0 |
| E2E | 7 | 0 | 0 | 0 | 0 |
| **Total** | **97** | **34** | **33** | **0** | **1** |

"Actual so far" counts planned Test IDs with a real, verified implementation. The real `npm test` suites
run more raw cases than that (102 server + 40 client `it()` blocks as of this issue, against 32 planned
IDs combined) — extra edge cases like the missing-field/idempotent-logout/role-leak checks don't map to a
single planned ID each, same pattern Lab 2 saw (`docs/lab-02/tests.md` §6: actual execution count grew
past the original per-ID estimate as real edge cases were found). Re-run repeatedly across both Issue 3-2
and 3-3 (including after fixing two unrelated manual-testing data-pollution incidents, both caught by
`API-54`) with zero flakes; see §7.

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
