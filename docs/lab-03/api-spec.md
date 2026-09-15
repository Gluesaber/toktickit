# Lab 3 API Contract

Full detail behind the summary in `specification.md` §8. Endpoints implement `specification.md`'s
Business Rules (BR) and Acceptance Criteria (AC); every row below is traceable to those. Endpoints carried
over from `docs/lab-02/api-spec.md` are restated here only where their contract changes (identity source);
unchanged details (validation ranges, attachment rules, error envelope) are not repeated.

## 0. Conventions

- Base URL: `http://localhost:3000` in development (`VITE_API_URL` on the client). All paths below are
  relative to it.
- **Session-cookie authentication (BR-09).** Login sets an HTTP-only, `SameSite=Lax` session cookie
  (`Secure` in production); the browser sends it automatically on every same-origin request. No endpoint
  in Lab 3 accepts identity as a query parameter or body field — the `requesterId` query/body pattern from
  `docs/lab-02/api-spec.md` (BR-08 there) is fully removed (BR-39).
- Every endpoint except `POST /api/auth/login`, `POST /api/auth/logout`, and the health check requires a
  valid, unexpired session (BR-11); a missing/invalid/expired session returns `401 UNAUTHENTICATED`.
  `/api/staff/*` additionally requires role `IT_STAFF` or `ADMINISTRATOR`; `/api/admin/*` additionally
  requires role `ADMINISTRATOR`. A wrong-role request on either returns `403 FORBIDDEN` — distinguished
  from `401` so the client can tell "log in" apart from "you're logged in but can't do this."
- While the session's `mustChangePassword` is `true`, every endpoint except `GET /api/auth/me`,
  `POST /api/auth/change-password`, and `POST /api/auth/logout` returns `403 PASSWORD_CHANGE_REQUIRED`
  (BR-13) — enforced server-side so a client that ignores the flag still can't act.
- Timestamps are ISO 8601 UTC strings. A `User` object in any response never includes `passwordHash`
  (BR-06, BR-16).
- All error responses share the same envelope introduced in Lab 2:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "New password must be at least 8 characters.", "fields": { "newPassword": "New password must be at least 8 characters." } } }
  ```
- Unexpected server failures always return `500` with
  `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." } }`.
- Ownership/not-found failures continue to return `404 NOT_FOUND` rather than `403`, per Lab 2's
  anti-enumeration rationale (`docs/lab-02/api-spec.md` §2) — this applies to a Requester requesting
  another Requester's Ticket. It does **not** apply to role failures (`/api/staff/*`, `/api/admin/*`),
  which return `403 FORBIDDEN`: a Requester already knows the Ticket Queue and User Management exist (they
  appear in the labsheet/UI copy), so there's no exposure in confirming the endpoint exists but is
  off-limits.

## 1. Authentication Endpoints

### `POST /api/auth/login`
Purpose: authenticate and start a session (AC-01).
Request:
```json
{ "email": "alex.rivera@example.edu", "password": "correct horse battery staple" }
```

Response `200`, session cookie set:
```json
{ "id": 1, "name": "Alex Rivera", "email": "alex.rivera@example.edu", "role": "REQUESTER", "isActive": true, "mustChangePassword": false }
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200` | — |
| Missing/blank email or password | `400` | `VALIDATION_ERROR` |
| Email not found, or password incorrect (BR-07) | `401` | `INVALID_CREDENTIALS` — identical message either way |
| Credentials correct but `isActive = false` (BR-08) | `401` | `ACCOUNT_INACTIVE` — distinct code/message from the above, since the caller already proved valid credentials |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `POST /api/auth/logout`
Purpose: invalidate the current session server-side (BR-10). Always returns `200` and clears the cookie,
whether or not a session was present — logout is idempotent and doesn't require a prior valid session
(§0).
Response `200`: `{}`.

### `GET /api/auth/me`
Purpose: current authenticated user (BR-16). Requires a session.
Response `200`: same shape as the login response body above.
`401 UNAUTHENTICATED` if no valid session.

### `POST /api/auth/change-password`
Purpose: set a new password, clearing `mustChangePassword` (AC-06/AC-07/AC-08). Requires a session
(reachable even while `mustChangePassword` is true — §0's gate explicitly allows this endpoint).
Request:
```json
{ "newPassword": "a-new-strong-password", "confirmPassword": "a-new-strong-password" }
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, updated `User` object (`mustChangePassword: false`) | — |
| `newPassword` shorter than 8 characters (BR-14) | `400` | `VALIDATION_ERROR` |
| `newPassword` ≠ `confirmPassword` (BR-14) | `400` | `VALIDATION_ERROR` |
| No session | `401` | `UNAUTHENTICATED` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 2. Requester Ticket & Attachment Endpoints (identity source changed)

`POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`,
`POST /api/tickets/:id/attachments`, `GET /api/tickets/:id/attachments`,
`GET /api/attachments/:id/download`, `DELETE /api/attachments/:id` keep the exact request/response shapes,
validation rules, and error codes documented in `docs/lab-02/api-spec.md` §2–§3, with one change applied
uniformly: **every `requesterId` query parameter or body field is removed.** The backend derives the
Requester from the authenticated session (BR-17) instead; a `requesterId` present anywhere in a request
body is silently ignored, never treated as a validation error or an override (BR-03, AC-12).

`GET /api/tickets/:id`'s response gains one field beyond Lab 2's shape — `comments`, the Ticket's Public
Comments (§4) — and, when `requesterConfirmedResolvedAt` is set, that timestamp:
```json
{
  "...": "...(all Lab 2 fields unchanged)...",
  "ownerId": null,
  "itPriority": "MEDIUM",
  "requesterConfirmedResolvedAt": null,
  "comments": [
    { "id": 5, "author": { "id": 1, "name": "Alex Rivera", "role": "REQUESTER" }, "content": "Still happening as of today.", "createdAt": "2026-09-10T14:02:00.000Z" }
  ]
}
```
`ownerId`/`itPriority` are read-only from this endpoint (Requesters never set them — BR-19/BR-21); they're
included so Ticket Detail can show "who's working on this" without a second request. `notes` is never
included in this response shape, at any status — that field only exists on the staff endpoint (§6.2).

## 3. Problem-Resolved Indication

### `PATCH /api/tickets/:id/resolved-indication`
Purpose: Requester marks their own ticket "Problem Appears Resolved" (BR-25, AC-15). No request body.

Response `200`:
```json
{ "id": 42, "requesterConfirmedResolvedAt": "2026-09-12T10:00:00.000Z" }
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200` | — |
| `:id` doesn't exist, or not owned by the caller | `404` | `NOT_FOUND` |
| Current Status is already Resolved, Closed, or Cancelled (BR-25) | `409` | `TICKET_ALREADY_TERMINAL` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 4. Public Comments

### `POST /api/tickets/:id/comments` / `GET /api/tickets/:id/comments`
Purpose: post/list Public Comments (BR-04, BR-26–BR-28). Shared by Requester (own ticket only) and IT
Staff/Administrator (any ticket) — the same endpoint, with the access rule branching on role:

| Caller | Access |
|---|---|
| Requester | own ticket only — `404 NOT_FOUND` for any other ticket, same anti-enumeration rule as §2 |
| IT Staff / Administrator | any ticket |

Request (`POST`):
```json
{ "content": "Thanks for the update — trying that now." }
```
Response `201`: `{ "id": 6, "author": { "id": 3, "name": "Jordan Lee", "role": "IT_STAFF" }, "content": "Thanks for the update — trying that now.", "createdAt": "2026-09-12T10:05:00.000Z" }`

| Case | Status | `error.code` |
|---|---|---|
| Success | `201` (`POST`) / `200` (`GET`, array of the same shape) | — |
| `content` blank or exceeds 2000 chars after trimming (BR-26) | `400` | `VALIDATION_ERROR` |
| `:id` doesn't exist, or (Requester caller) not owned | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

`author`/`createdAt` are always backend-assigned from the session (BR-28); any client-supplied value for
either is ignored.

## 5. Ticket Status

### `PATCH /api/tickets/:id/status`
Purpose: change Current Status, enforcing the transition matrix in `specification.md` §5.2. Shared by
Requester (Cancel only, own ticket, from New/Open — BR-24) and IT Staff/Administrator (any listed
transition, any ticket they can see).
Request: `{ "status": "CANCELLED" }`.

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, updated `{ id, currentStatus, updatedAt }` | — |
| `status` isn't a valid enum value | `400` | `VALIDATION_ERROR` |
| Transition not permitted from the ticket's current status for the caller's role (BR-22, BR-23, BR-24) | `409` | `TRANSITION_NOT_PERMITTED` |
| Requester targets anything other than Cancelled, or targets it outside New/Open (BR-24) | `409` | `TRANSITION_NOT_PERMITTED` — same code as above; a Requester's illegal target and an IT Staff's illegal target are indistinguishable to the caller |
| `:id` doesn't exist, or (Requester caller) not owned | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 6. IT Staff Endpoints (`/api/staff/*`)

All require role `IT_STAFF` or `ADMINISTRATOR` (§0, `specification.md` §11 parity decision).

### `GET /api/staff/tickets`
Purpose: the Ticket Queue (FR-10, AC-16). Full query contract in §7.
Response `200`: same envelope shape as Lab 2's `GET /api/tickets` (`{ data: [...], pagination: {...} }`),
rows additionally carrying `itPriority`, `owner` (`{ id, name, role } | null`), and `requesterName`.

### `GET /api/staff/tickets/:id`
Purpose: staff-view Ticket Detail — everything `GET /api/tickets/:id` (§2) returns, plus `notes`
(Internal Notes) and the full `requester` object (not just a name). Available for any Ticket, not
ownership-restricted (§0's role check is the only gate).
```json
{ "...": "...(all §2 fields)...", "notes": [{ "id": 2, "author": { "id": 3, "name": "Jordan Lee", "role": "IT_STAFF" }, "content": "Confirmed with vendor, ETA Thursday.", "createdAt": "2026-09-12T10:10:00.000Z" }] }
```

### `PATCH /api/staff/tickets/:id/owner`
Purpose: claim or reassign ownership (BR-19, BR-20, AC-20, AC-21).
Request: `{ "ownerId": 3 }`.

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, `{ id, owner: { id, name, role } }` | — |
| `ownerId` missing/non-numeric | `400` | `VALIDATION_ERROR` |
| `ownerId` references a user who isn't an active `IT_STAFF`/`ADMINISTRATOR` (BR-19) | `400` | `INVALID_OWNER` |
| `:id` doesn't exist | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `PATCH /api/staff/tickets/:id/priority`
Purpose: set IT Priority (BR-21, BR-22, AC-23). Request: `{ "itPriority": "HIGH" }`.

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, `{ id, itPriority }` | — |
| Not one of `LOW\|MEDIUM\|HIGH\|URGENT` | `400` | `VALIDATION_ERROR` |
| `:id` doesn't exist | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `POST /api/staff/tickets/:id/notes` / `GET /api/staff/tickets/:id/notes`
Purpose: create/list Internal Notes (BR-04, BR-26–BR-28, AC-24). Same request/response shape and
validation as §4's Comments, on the `Note` model instead — kept as fully separate endpoints (backed by a
separate model, `specification.md` §11) rather than a `visibility` flag on the Comments endpoint, so a
Requester can never reach Note content through any query-parameter manipulation of the Comments route
(AC-04).

| Case | Status | `error.code` |
|---|---|---|
| Success | `201` (`POST`) / `200` (`GET`) | — |
| `content` blank or exceeds 2000 chars (BR-26) | `400` | `VALIDATION_ERROR` |
| `:id` doesn't exist | `404` | `NOT_FOUND` |
| Caller role is `REQUESTER` | `403` | `FORBIDDEN` (AC-04 — no note data included in the error response) |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 7. Staff Ticket-Queue Query Contract (`GET /api/staff/tickets`)

| Parameter | Required | Type / allowed values | Default | Behavior on invalid input |
|---|---|---|---|---|
| `search` | no | string, partial case-insensitive match against `ticketNumber` **or** `summary` | none | any string accepted |
| `currentStatus` | no | any of the 8 status enum values | none | other value → `400 VALIDATION_ERROR` |
| `requestedPriority` / `itPriority` | no | `LOW \| MEDIUM \| HIGH \| URGENT` | none | other value → `400 VALIDATION_ERROR` |
| `ownerId` | no | integer, or the literal string `unassigned` | none | non-numeric and not `unassigned` → `400 VALIDATION_ERROR` |
| `categoryId` | no | integer | none | non-numeric → `400`; a well-formed id with no matching row simply matches zero tickets (not an error), same rule as Lab 2's `GET /api/tickets` (`docs/lab-02/api-spec.md` §4) |
| `sortBy` | no | `createdAt \| currentStatus \| itPriority \| updatedAt` | `createdAt` | other value → `400 VALIDATION_ERROR` |
| `sortDir` | no | `asc \| desc` | `desc` | other value → `400 VALIDATION_ERROR` |
| `page` | no | integer ≥ 1 | `1` | invalid → silently reset to `1` (same rationale as Lab 2, `docs/lab-02/api-spec.md` §4) |
| `pageSize` | no | `10 \| 25 \| 50` | `10` | invalid → silently reset to `10` |

Same required-vs-clamped split and tie-break rule (`createdAt DESC, id DESC`) as Lab 2's `GET /api/tickets`
query contract, for the same reasons (`docs/lab-02/api-spec.md` §4).

## 8. Administrator Endpoints (`/api/admin/users*`)

All require role `ADMINISTRATOR` (§0). No pagination on this list per the labsheet's explicit exclusion
(§4.2 of the labsheet) — `GET` always returns the full matching set.

### `GET /api/admin/users`
Query: `search` (name/email, partial, case-insensitive, optional), `role` (optional, one of the three role
values; other value → `400 VALIDATION_ERROR`).
Response `200`: `[{ "id": 1, "name": "Alex Rivera", "email": "alex.rivera@example.edu", "role": "REQUESTER", "isActive": true }]`.

### `POST /api/admin/users`
Purpose: create a user (BR-30, AC-27). Request:
```json
{ "name": "Sam Okafor", "email": "sam.okafor@example.edu", "role": "IT_STAFF", "isActive": true, "initialPassword": "temporary-pass-1" }
```
`mustChangePassword` is always `true` for a newly created user — not client-settable.

| Case | Status | `error.code` |
|---|---|---|
| Success | `201`, `User` object | — |
| Missing/blank required field, invalid role, `initialPassword` shorter than 8 chars | `400` | `VALIDATION_ERROR` |
| Email already in use, case-insensitive (BR-31) | `409` | `DUPLICATE_EMAIL` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `PATCH /api/admin/users/:id`
Purpose: edit name/email/role/`isActive` (BR-32). Request: any subset of
`{ "name", "email", "role", "isActive" }`. `passwordHash`/`mustChangePassword` are never editable through
this endpoint (§8's reset-password endpoint below is the only path that touches a password).

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, updated `User` object | — |
| Invalid field value | `400` | `VALIDATION_ERROR` |
| Email already in use by another user (BR-31) | `409` | `DUPLICATE_EMAIL` |
| `isActive: false` (or role change away from `ADMINISTRATOR`) targeting the caller's own account (BR-34) | `409` | `SELF_DEACTIVATION_BLOCKED` |
| `isActive: false` (or role change) targeting the last remaining active Administrator (BR-35) | `409` | `LAST_ADMINISTRATOR_PROTECTED` |
| `:id` doesn't exist | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `POST /api/admin/users/:id/reset-password`
Purpose: set a new initial password, forcing `mustChangePassword = true` (BR-33, AC-28). Request:
`{ "newInitialPassword": "another-temp-pass" }`.

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, `{ id, mustChangePassword: true }` | — |
| Password shorter than 8 characters | `400` | `VALIDATION_ERROR` |
| `:id` doesn't exist | `404` | `NOT_FOUND` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 9. HTTP Status Reference

Extends `docs/lab-02/api-spec.md` §5 (all of which still applies to the unchanged Attachment endpoints)
with the statuses/codes Lab 3 introduces:

| Status | Meaning in this API |
|---|---|
| `401` | No valid session (`UNAUTHENTICATED`), or valid session but wrong credentials at login (`INVALID_CREDENTIALS`/`ACCOUNT_INACTIVE`) |
| `403` | Valid session, but the caller's role can't perform this operation (`FORBIDDEN`), or `mustChangePassword` is blocking every non-auth endpoint (`PASSWORD_CHANGE_REQUIRED`) |
| `409` (new codes) | `TRANSITION_NOT_PERMITTED`, `TICKET_ALREADY_TERMINAL`, `DUPLICATE_EMAIL`, `SELF_DEACTIVATION_BLOCKED`, `LAST_ADMINISTRATOR_PROTECTED` — all "the request is well-formed but conflicts with current state" |

`404`/`400`/`413`/`415`/`500` retain their Lab 2 meanings (`docs/lab-02/api-spec.md` §5) for every endpoint
that inherits Lab 2 behavior unchanged.
