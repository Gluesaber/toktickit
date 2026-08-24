# Lab 2 Test Plan and Results

Planned before implementation, per Test DD/TDD. Every row maps to an Acceptance Criterion (AC) or
Business Rule (BR) in `specification.md`; every AC has at least one test (§3). `Final` will move from
`Pending` to `Pass`/`Fail` as each Issue lands — this file is not reconstructed after the fact.

## 1. Test Strategy

Six levels, per the labsheet's minimum coverage requirement: **Unit**, **API**, **UI component**,
**UI style**, **Responsive**, **E2E**.

**File-mapping decisions** (beyond the four required `server/tests/lab-02/*.api.test.ts` and four required
`client/tests/lab-02/*.test.tsx` files listed in the labsheet's §12 Required Repository Increment):
- Reference-data endpoint checks (`GET /api/categories`, `GET /api/requesters`) are folded into
  `create-ticket.api.test.ts` rather than given their own file, since Create Ticket is the primary
  consumer of that data and the Selection screen's own behavior is covered at the UI/E2E level.
- The Development Requester Selection screen has no dedicated file in the labsheet's minimum client
  structure even though the labsheet's §8.1 requires it to have loading/empty/failure/keyboard states — an
  extra file,
  `client/tests/lab-02/DevRequesterSelector.test.tsx`, is added to cover it.
- UI style assertions (CSS classes, asterisks, badge text+color, busy-state class) live inside the same
  four component test files rather than a separate style-only suite — each is still tagged as its own
  `STYLE-xx` row below for traceability, per the file it actually lives in.
- Responsive/visual screenshot capture gets its own file, `e2e/lab-02/visual-responsive.spec.ts`, kept
  separate from the required `e2e/lab-02/requester-ticket-flow.spec.ts` so the main flow spec isn't
  bloated with viewport-resize/screenshot boilerplate.

## 2. Planned Tests

### Unit — `server/tests/lab-02/ticket-number.unit.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UNIT-01 | BR-05 | Ticket Number generator format | Output matches `TK-<year>-<6-digit zero-padded id>` | Pending |
| UNIT-02 | BR-01, BR-05 | Ticket Number uniqueness | Two different ids never produce the same number | Pending |
| UNIT-03 | BR-17 | Ticket-list `page` clamp helper | Non-numeric/zero/negative `page` resolves to `1` | Pending |
| UNIT-04 | BR-17 | Ticket-list `pageSize` clamp helper | Any value outside `10/25/50` resolves to `10` | Pending |

### API — `server/tests/lab-02/create-ticket.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-01 | AC-01 | `POST /api/tickets` valid payload | `201`, ticket persisted, `ticketNumber` present | Pending |
| API-02 | AC-04, BR-19 | Blank `summary` | `400 VALIDATION_ERROR`, `fields.summary` set | Pending |
| API-03 | AC-05, BR-20 | `description` under 10 chars | `400 VALIDATION_ERROR`, `fields.description` set | Pending |
| API-04 | BR-06 | Body includes spoofed `ticketNumber`/`currentStatus` | Spoofed values ignored; server-generated ones used | Pending |
| API-05 | BR-21 | `requesterId` inactive or unknown | `400 INVALID_REQUESTER` | Pending |
| API-06 | BR-21 | `categoryId`/`relatedSystemId` inactive or unknown | `400 VALIDATION_ERROR` | Pending |
| API-07 | BR-23 | Two identical `POST` requests in sequence | Two independent Tickets created (documented, not a bug) | Pending |
| API-08 | — | `GET /api/categories` | Only `isActive = true` rows returned | Pending |
| API-09 | BR-07, BR-35 | `GET /api/requesters` | Inactive seeded Requester excluded from the response | Pending |

### API — `server/tests/lab-02/attachments.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-10 | AC-06 | `POST .../attachments` valid JPG | `201`, attachment persisted and linked to the Ticket | Pending |
| API-11 | AC-07, BR-28 | File over 5 MB | `413 FILE_TOO_LARGE` | Pending |
| API-12 | AC-08, BR-27 | Unsupported type (`.exe`) | `415 UNSUPPORTED_FILE_TYPE` | Pending |
| API-13 | AC-09, BR-29 | 6th attachment on a Ticket with 5 active | `409 ATTACHMENT_LIMIT_REACHED` | Pending |
| API-14 | BR-33 | Upload attempt from a non-owning `requesterId` | `404 NOT_FOUND` | Pending |
| API-15 | AC-22 | Download an active Attachment | `200`, correct binary + `Content-Disposition` | Pending |
| API-16 | AC-24, BR-32 | Download a soft-removed Attachment | `410 ATTACHMENT_REMOVED` | Pending |
| API-17 | AC-26, BR-31 | Soft-remove an active Attachment with a reason | `200`, `removedAt` + `removalReason` set | Pending |
| API-18 | — | Soft-remove an already-removed Attachment | `409 ALREADY_REMOVED` | Pending |
| API-19 | BR-32 | `GET .../attachments` metadata list | Includes both active and removed rows with full metadata | Pending |

### API — `server/tests/lab-02/my-tickets.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-20 | AC-12, BR-13 | List scoping across two Requesters | Only the requesting Requester's Tickets are returned | Pending |
| API-21 | AC-13, BR-14 | `search` by Ticket Number substring | Only matching Tickets returned | Pending |
| API-22 | AC-14, BR-15 | `categoryId` filter | Only Tickets in that Category returned | Pending |
| API-23 | AC-15, BR-37 | Requester with zero Tickets | `data: []`, `pagination.totalItems: 0` | Pending |
| API-24 | AC-16, BR-38 | Filters matching nothing | `data: []` (client distinguishes from API-23 by active-filter state) | Pending |
| API-25 | AC-17, BR-17 | `page=2` with >10 Tickets | Second page returned, correct `pagination` metadata | Pending |
| API-26 | AC-18, BR-16 | `sortBy=requestedPriority` | Results ordered correctly, ties broken by `createdAt desc` | Pending |
| API-27 | BR-17 | `page` beyond the last page | `200`, `data: []` — not an error | Pending |
| API-28 | BR-18 | `sortBy=notARealField` | `400 VALIDATION_ERROR` | Pending |
| API-29 | — | Missing `requesterId` | `400 VALIDATION_ERROR` | Pending |

### API — `server/tests/lab-02/ticket-detail.api.test.ts`

| Test ID | AC/BR | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| API-30 | AC-20 | `GET /api/tickets/:id` owned | `200`, full Ticket + `attachments[]` | Pending |
| API-31 | AC-03, AC-21, BR-12, BR-40 | `GET /api/tickets/:id` owned by a different Requester | `404 NOT_FOUND` | Pending |
| API-32 | BR-12 | `GET /api/tickets/:id` nonexistent id | `404 NOT_FOUND`, identical shape to API-31 | Pending |

### UI component — `client/tests/lab-02/CreateTicket.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-01 | AC-04 | Submit with blank Summary | Field message shown, no `fetch` call made | Pending |
| UI-02 | AC-05 | Submit with short Description | Field message shown, no `fetch` call made | Pending |
| UI-03 | AC-07 | Oversized file selected | Size error shown, file not added to the list | Pending |
| UI-04 | AC-08 | Unsupported file type selected | Type error shown, file not added | Pending |
| UI-05 | AC-09 | 6th file selected (5 already queued) | Limit error shown, 6th file not added | Pending |
| UI-06 | AC-11 | Submit clicked | Button shows busy state and is disabled during the request | Pending |
| UI-07 | AC-10 | Mocked API failure on submit | Safe error banner shown, all field values still populated | Pending |
| UI-08 | AC-01 | Mocked successful submit | Confirmation panel shows the returned Ticket Number | Pending |
| STYLE-01 | — | Required-field markup | Asterisk present; invalid fields carry the error CSS class | Pending |
| STYLE-02 | — | Read-only field markup | Ticket Number/Date/Requester use the read-only class, not editable | Pending |
| STYLE-04 | — | Submit button while pending | Carries the busy-state CSS class | Pending |

### UI component — `client/tests/lab-02/MyTickets.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-09 | AC-15 | Mocked zero-ticket response, no filters active | Empty-state message + Create Ticket action shown | Pending |
| UI-10 | AC-16 | Mocked zero-match response, filter active | No-results message + Clear-filters action shown | Pending |
| UI-11 | AC-13 | Typing in search | Triggers a re-fetch with the `search` query param set | Pending |
| UI-12 | AC-19 | Change Requester action | List clears then reloads for the new Requester | Pending |
| UI-13 | AC-17 | Clicking "next page" | Triggers a re-fetch with the incremented `page` param | Pending |
| UI-14 | AC-02 | No Requester currently selected | Component redirects to the Selection screen | Pending |
| STYLE-03 | — | Priority/status badges | Each badge renders a color class **and** visible text label | Pending |
| STYLE-05 | — | Empty vs. no-results states | Render with distinct component states/classes, not the same markup | Pending |

### UI component — `client/tests/lab-02/RequesterTicketDetail.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-15 | AC-20 | Mocked owned-ticket response | All fields render read-only with the returned values | Pending |
| UI-16 | AC-21 | Mocked `404` response | "Ticket not found" state shown, no partial ticket data rendered | Pending |
| UI-17 | AC-23 | Removed Attachment in the response | Row shows "Unavailable", download control disabled | Pending |
| UI-18 | AC-26 | Soft-remove action with a reason typed | Calls `DELETE` with the reason, row updates to removed state | Pending |

### UI component — `client/tests/lab-02/AttachmentSection.test.tsx`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-19 | AC-22 | Active Attachment row | Download control is present and points at the correct endpoint | Pending |
| UI-20 | AC-25 | Adding a file when 5 are already active | Client-side limit check blocks the request before any `fetch` call | Pending |

### UI component — `client/tests/lab-02/DevRequesterSelector.test.tsx` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| UI-21 | AC-27 | Mocked empty active-Requester list | Empty-state message shown, Continue stays disabled | Pending |
| UI-22 | AC-28 | Mocked API failure | Safe failure state shown, no unhandled error/crash | Pending |
| UI-23 | AC-30 | Tab-only keyboard navigation | Dropdown → Continue both reachable with a visible focus ring | Pending |

### Responsive/visual — `e2e/lab-02/visual-responsive.spec.ts` *(additional file, see §1)*

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| RESP-01 | AC-29 | Create Ticket at 375px width | No horizontal scroll; fields stacked vertically | Pending |
| RESP-02 | — | My Tickets at 375px width | Renders the card layout, not the desktop table | Pending |
| RESP-03 | — | Ticket Detail at 820px (tablet) width | Two-column layout renders without clipping/overlap | Pending |
| RESP-04 | — | Screenshot capture, 3 screens × 3 viewports | Produces the files listed in `ui-spec.md` §10 for Part 9 evidence | Pending |

### E2E — `e2e/lab-02/requester-ticket-flow.spec.ts`

| Test ID | AC | What It Tests | Expected Result | Final |
|---|---|---|---|---|
| E2E-01 | AC-01, AC-06 | Select Requester A → create a valid Ticket with one attachment | Confirmation shows the official Ticket Number | Pending |
| E2E-02 | AC-01, AC-13 | Search for the ticket just created | It's found in My Tickets by Ticket Number | Pending |
| E2E-03 | AC-20 | Open Ticket Detail from My Tickets | Displayed fields match what was submitted | Pending |
| E2E-04 | AC-22, AC-24, AC-25, AC-26 | Add a second attachment, then soft-remove the first with a reason | Removed one blocks download, active one still downloads | Pending |
| E2E-05 | AC-03, AC-19, AC-21 | Switch to Requester B via Change Requester | Requester A's ticket is absent from the list and its direct Ticket Detail URL is blocked | Pending |
| E2E-06 | AC-10 | Submit a valid Create Ticket form with the API mocked to fail | Safe failure state shown, form values retained (see §7 on how "backend down" is simulated) | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Test(s) | AC | Test(s) |
|---|---|---|---|
| AC-01 | API-01, UI-08, E2E-01, E2E-02 | AC-16 | API-24, UI-10 |
| AC-02 | UI-14 | AC-17 | API-25, UI-13 |
| AC-03 | API-31, E2E-05 | AC-18 | API-26 |
| AC-04 | API-02, UI-01 | AC-19 | UI-12, E2E-05 |
| AC-05 | API-03, UI-02 | AC-20 | API-30, UI-15, E2E-03 |
| AC-06 | API-10, E2E-01 | AC-21 | API-31, UI-16, E2E-05 |
| AC-07 | API-11, UI-03 | AC-22 | API-15, UI-19, E2E-04 |
| AC-08 | API-12, UI-04 | AC-23 | UI-17 |
| AC-09 | API-13, UI-05 | AC-24 | API-16, E2E-04 |
| AC-10 | UI-07, E2E-06 | AC-25 | UI-20, E2E-04 |
| AC-11 | UI-06 | AC-26 | API-17, UI-18, E2E-04 |
| AC-12 | API-20 | AC-27 | UI-21 |
| AC-13 | API-21, UI-11, E2E-02 | AC-28 | UI-22 |
| AC-14 | API-22 | AC-29 | RESP-01 |
| AC-15 | API-23, UI-09 | AC-30 | UI-23 |

Every AC has at least one automated test; the higher-traffic ones (AC-01, AC-20–AC-26) are covered at
more than one level deliberately, since those are exactly the ownership- and attachment-lifecycle-
sensitive paths the labsheet's submission evidence (Parts 6–8) asks us to demonstrate live.

## 4. Responsive and Visual Checklist

Reuses `ui-spec.md` §9 verbatim as the manual visual-inspection pass that accompanies RESP-01–04 and the
`artifacts/lab-02/screenshots/` captures — automated assertions catch regressions in markup/CSS classes,
but the final sign-off before a UI Issue is marked Done is a human look at the actual screenshots against
that checklist.

## 5. Test Commands

| Command | Runs |
|---|---|
| `cd server && npm test` | All Vitest/Supertest suites, including `server/tests/lab-02/*.api.test.ts` and the unit tests |
| `cd client && npm test` | All Vitest/Testing-Library suites, including `client/tests/lab-02/*.test.tsx` |
| `npx playwright test e2e/lab-02` (from repo root, once Playwright is added in Issue 8) | `requester-ticket-flow.spec.ts` and `visual-responsive.spec.ts` |
| `cd server && npm run prisma:migrate && npm run prisma:seed` | Applies the Lab 2 migration and (re-)seeds reference data + Requesters before any of the above |

## 6. Final Results

Not yet run — `feature/2-1-spec` only contains the four planning documents, no implementation. This
table is filled in as each feature-branch PR merges into `lab2-staging`, and the final counts here must
match a clean `npm test` run on `main` before Lab 2 is submitted.

| Level | Planned | Passing | Failing | Pending |
|---|---|---|---|---|
| Unit | 4 | 0 | 0 | 4 |
| API | 32 | 0 | 0 | 32 |
| UI component | 23 | 0 | 0 | 23 |
| UI style | 5 | 0 | 0 | 5 |
| Responsive | 4 | 0 | 0 | 4 |
| E2E | 6 | 0 | 0 | 6 |
| **Total** | **74** | **0** | **0** | **74** |

## 7. Known Limitations or Deferred Tests

- **BR-23 (no server-side idempotency)** is intentionally *not* tested as a failure case — API-07 instead
  documents the accepted current behavior (two identical submissions create two Tickets). A real
  idempotency-key mechanism is out of scope for Lab 2.
- **E2E-06 ("backend down")** simulates failure via Playwright request interception
  (`page.route(...).abort()`) rather than literally stopping the `server` process — stopping/restarting a
  real process mid-suite is flaky in CI. The submission PDF's Part 6 evidence (§13 of the labsheet) still
  needs one *manual* screenshot of the literal backend-stopped case, taken by hand against the dev
  server, separate from this automated test.
- **Cross-browser coverage** is out of scope — Playwright runs against one engine (Chromium) for Lab 2;
  broader browser matrix testing is not part of this sprint's Definition of Done.
- **Load/concurrency testing** (e.g., two simultaneous ticket creations racing on the id-based Ticket
  Number) is not covered; BR-05's reliance on Postgres's own autoincrement guarantee is treated as
  sufficient evidence of uniqueness without a dedicated concurrency test.
