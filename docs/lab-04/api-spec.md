# Lab 4 API Contract

Full detail behind `specification.md` §8. This file restates only what Lab 4 adds or changes. Every
endpoint, shape, validation rule and error code in `docs/lab-03/api-spec.md`, and in
`docs/lab-02/api-spec.md` where Lab 3 inherited it, still applies unless a section below changes it.
BR and AC references point to `docs/lab-04/specification.md` unless prefixed "Lab 3".

## 0. Conventions (additions)

- Authentication, the `401 UNAUTHENTICATED`, `403 FORBIDDEN` and `403 PASSWORD_CHANGE_REQUIRED` gates, the
  error envelope, `500 INTERNAL_ERROR`, and 404 anti-enumeration for Requester ownership failures are all
  unchanged (Lab 3 api-spec §0).
- **Validation errors keep the field map.** A `400 VALIDATION_ERROR` lists every failing field in
  `error.fields`, keyed by the request-body name, so the UI can place each message under its control
  (AC-06/07/08).
- **Conflict responses carry current state.** Every `409 STALE_UPDATE` response includes `error.current`,
  the server's current version of the resource, so the client can show what changed without another
  request:
  ```json
  { "error": { "code": "STALE_UPDATE", "message": "This ticket was changed by someone else. Reload to see the latest version.", "current": { "id": 42, "currentStatus": "IN_PROGRESS", "version": 7, "updatedAt": "2026-10-05T03:12:00.000Z" } } }
  ```
- **`version`** is a positive integer. A Ticket workflow PATCH or Action PATCH with `version` missing,
  non-integer or < 1 returns `400 VALIDATION_ERROR` (`fields.version`). A well-formed but outdated value
  returns `409 STALE_UPDATE` (BR-22–BR-24).
- **Order of checks** on every write:
  1. authentication and role (401 or 403);
  2. resource lookup and ownership (404);
  3. body validation (400);
  4. state rules (409);
  5. version (409 `STALE_UPDATE`).

  The version is checked last, atomically with the write, so a stale request that would also break a
  state rule reports the state rule.
- Timestamps are ISO 8601 UTC. Dashboard date boundaries are computed in Asia/Bangkok and also returned in
  UTC (§5).

### Shared shapes

`UserRef`: `{ "id": 3, "name": "Taylor Brooks", "role": "IT_STAFF" }`. Assignee refs also carry
`"isActive"`, so the UI can mark a since-deactivated assignee.

`Action`:
```json
{
  "id": 17,
  "ticketId": 42,
  "actionAt": "2026-10-05T02:30:00.000Z",
  "description": "Replaced the faulty RAM module (slot 2).",
  "result": "Laptop boots normally; memory test passes.",
  "status": "COMPLETED",
  "performedBy": { "id": 6, "name": "Taylor Brooks", "role": "IT_STAFF" },
  "assignee": { "id": 7, "name": "Casey Nguyen", "role": "IT_STAFF", "isActive": true },
  "followUpRequired": true,
  "followUpNote": "Re-check in one week that the crash has not returned.",
  "attachmentNotes": "See attachment memtest-result.png on this ticket.",
  "version": 3,
  "updatedBy": { "id": 7, "name": "Casey Nguyen", "role": "IT_STAFF" },
  "createdAt": "2026-10-05T02:31:10.000Z",
  "updatedAt": "2026-10-05T04:00:00.000Z"
}
```
`updatedBy` is `null` until the first edit. `clientRequestId` is never returned.

`StatusHistoryEntry`:
`{ "id": 88, "fromStatus": "IN_PROGRESS", "toStatus": "RESOLVED", "changedBy": UserRef, "changedAt": "…" }`.
`fromStatus: null` marks the creation entry.

## 1. Ticket Detail Responses (changed)

### `GET /api/tickets/:id` (Requester, own Ticket) and `GET /api/staff/tickets/:id` (IT Staff/Admin)

Both responses gain three fields. Everything else is unchanged, and `notes` is still staff-only:

| Field | Type | Notes |
|---|---|---|
| `version` | integer | The Ticket's current version, sent back on the next workflow PATCH (BR-22) |
| `actions` | `Action[]` | Every Action on the Ticket, ordered `actionAt asc, id asc` (BR-13). The Requester gets the same full shape (BR-15) |
| `statusHistory` | `StatusHistoryEntry[]` | Ordered `changedAt asc, id asc`. Empty `[]` for a legacy Ticket with no Lab 4 changes (BR-21) |

The staff response also exposes `requesterConfirmedResolvedAt`, as in Lab 3. The Staff Ticket Detail
screen now displays it (FR-10).

## 2. Actions Taken Endpoints

All are under `/api/staff/*`, so a Requester gets `403 FORBIDDEN` before any Ticket or Action is read
(BR-03, AC-04). That is the Lab 3 namespace rule, and it does not reveal whether the Ticket exists.

### `POST /api/staff/tickets/:id/actions`
Purpose: create an Action (FR-02, BR-01, BR-04–BR-09, BR-14, AC-01).

Request:
```json
{
  "clientRequestId": "4b0f6f0e-1f5e-4d43-9a39-0d5f7c0f6a11",
  "actionAt": "2026-10-05T02:30:00.000Z",
  "description": "Replaced the faulty RAM module (slot 2).",
  "result": "Laptop boots normally; memory test passes.",
  "status": "COMPLETED",
  "assigneeId": 7,
  "followUpRequired": true,
  "followUpNote": "Re-check in one week that the crash has not returned.",
  "attachmentNotes": "See attachment memtest-result.png on this ticket."
}
```

| Field | Required | Rule |
|---|---|---|
| `clientRequestId` | yes | 8–64 chars, `[A-Za-z0-9-]` (the client sends a UUID v4) |
| `actionAt` | yes | ISO 8601. ≥ Ticket `createdAt`. If `status` is `COMPLETED`, ≤ now + 5 min. Otherwise ≤ now + 365 days (BR-07) |
| `description` | yes | 1–2000 chars after trimming (BR-08) |
| `result` | conditional | ≤ 2000 chars. Required and non-blank when `status` is `COMPLETED` (BR-08) |
| `status` | yes | `PLANNED`, `IN_PROGRESS` or `COMPLETED`. `CANCELLED` is rejected at creation (BR-10) |
| `assigneeId` | no | Integer. Defaults to the caller. Must be an active `IT_STAFF` or `ADMINISTRATOR` (BR-05) |
| `followUpRequired` | no | Boolean, default `false` |
| `followUpNote` | conditional | 1–1000 chars after trimming when `followUpRequired` is true. Ignored and stored null otherwise (BR-09) |
| `attachmentNotes` | no | ≤ 500 chars after trimming. Blank is stored null |
| `performedById`, `updatedById`, `version`, `createdAt` | — | Ignored if sent. The server sets them (BR-04) |

| Case | Status | `error.code` |
|---|---|---|
| Created | `201`, `Action` | — |
| Same `clientRequestId` already used on this Ticket (retry) | `200`, the **existing** `Action`, unchanged (BR-14). The rest of the body is not re-validated or applied | — |
| Any field rule broken | `400` | `VALIDATION_ERROR` (with `fields`) |
| `assigneeId` is unknown, a Requester or inactive | `400` | `INVALID_ASSIGNEE` (`fields.assigneeId`) |
| Ticket `:id` doesn't exist | `404` | `NOT_FOUND` |
| Ticket is Closed or Cancelled (BR-12) | `409` | `TICKET_NOT_ACTIONABLE` |
| Caller is a Requester | `403` | `FORBIDDEN` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

Creating an Action bumps `Ticket.updatedAt` (BR-26) but not `Ticket.version` (BR-25). A simultaneous
retry that loses the race on the `(ticketId, clientRequestId)` unique constraint is caught and answered as
the 200 retry case, never as a 500.

### `PATCH /api/staff/tickets/:id/actions/:actionId`
Purpose: edit an Action and/or move its status (FR-03, FR-04, BR-06, BR-10, BR-23, AC-09–AC-11, AC-24).

Request: `version` is required, plus any subset of `actionAt`, `description`, `result`, `status`,
`assigneeId`, `followUpRequired`, `followUpNote` and `attachmentNotes`. The same field rules as create
apply to the **merged** result (stored values overlaid with the request). For example, moving to
`COMPLETED` without sending `result` is valid only if a non-blank `result` is already stored.

```json
{ "version": 2, "status": "COMPLETED", "result": "Driver reinstalled; printer prints test page." }
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, updated `Action` (`version` + 1, `updatedBy` = caller) | — |
| Field rule broken on the merged result, or `version` missing or malformed | `400` | `VALIDATION_ERROR` |
| `assigneeId` invalid (BR-05) | `400` | `INVALID_ASSIGNEE` |
| Ticket doesn't exist, or `:actionId` doesn't belong to Ticket `:id` (BR-01) | `404` | `NOT_FOUND` |
| Stored Action is Completed or Cancelled (BR-10) | `409` | `ACTION_LOCKED` |
| `status` move not in specification §5.3 | `409` | `ACTION_TRANSITION_NOT_PERMITTED` |
| Ticket is Closed or Cancelled (BR-12) | `409` | `TICKET_NOT_ACTIONABLE` |
| `version` ≠ stored version (BR-23/BR-24) | `409` | `STALE_UPDATE` (`error.current` = current `Action`) |
| Caller is a Requester | `403` | `FORBIDDEN` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

`performedBy` can never be changed through this endpoint (BR-04). Moving an Action to `CANCELLED` needs
nothing else. Its other fields stay as they were.

There is no `DELETE` route for Actions (BR-11, AC-16). Any `DELETE` on these paths falls through to
the API's 404.

## 3. Ticket Workflow Endpoints (changed)

### `PATCH /api/tickets/:id/status`
Lab 3 contract plus the following.

Request: `{ "status": "RESOLVED", "version": 6 }`. `version` is now required (BR-22).

Response `200`: `{ id, currentStatus, version, updatedAt, requesterConfirmedResolvedAt }`. The last field
is included so the UI sees the BR-18 clearing straight away.

On success, within one transaction:
1. conditional update `WHERE id = :id AND version = :version` (status, `version + 1`, `updatedAt`, and
   `requesterConfirmedResolvedAt = NULL` if the target is `REOPENED` or `IN_PROGRESS`);
2. insert a `TicketStatusHistory` row (BR-20).

| Case (added to Lab 3's table) | Status | `error.code` |
|---|---|---|
| `version` missing or malformed | `400` | `VALIDATION_ERROR` |
| Target is `RESOLVED` and the Ticket has no `COMPLETED` Action (BR-17) | `409` | `RESOLUTION_REQUIRES_COMPLETED_ACTION` |
| Transition not in specification §5.2 for the caller's role, including any Requester target other than Cancel (BR-16, BR-19) | `409` | `TRANSITION_NOT_PERMITTED` (unchanged) |
| `version` outdated (BR-22) | `409` | `STALE_UPDATE` (`error.current` = `{ id, currentStatus, version, updatedAt }`) |

The transition check uses the **stored** status. A request that is both stale and an illegal transition
from the stored status gets `TRANSITION_NOT_PERMITTED`.

### `PATCH /api/staff/tickets/:id/owner` and `PATCH /api/staff/tickets/:id/priority`
Lab 3 contract plus `version` (required) in the request, e.g. `{ "ownerId": 3, "version": 4 }`. Responses
gain `version` and `updatedAt`. New cases: `400 VALIDATION_ERROR` for a missing or malformed `version`, and
`409 STALE_UPDATE` for an outdated one. Both bump `version` and `updatedAt`. Neither writes status
history, which records status changes only.

### `POST /api/tickets` (create, unchanged shape)
Now also writes the creation history row (`fromStatus: null`, `toStatus: NEW`, `changedBy` = the
Requester) in the same transaction (BR-20). The response gains `version: 1`.

### `POST /api/tickets/:id/comments` (unchanged shape)
Now also bumps `Ticket.updatedAt` (BR-26). Internal Notes (`POST /api/staff/tickets/:id/notes`) do not.

## 4. List Query Additions (drill-down support)

### `GET /api/tickets` (Requester My Tickets)

| Parameter | Change | Rule |
|---|---|---|
| `statusGroup` | **new** | `open` only (BR-27). Combined with `currentStatus` using AND. Other values return `400 VALIDATION_ERROR` |
| `sortBy` | **extended** | adds `updatedAt` to Lab 2's `createdAt \| ticketNumber \| currentStatus \| requestedPriority` |

### `GET /api/staff/tickets` (Ticket Queue)

| Parameter | Change | Rule |
|---|---|---|
| `statusGroup` | **new** | `open` only. AND-combined with every other filter |
| `requesterResolved` | **new** | `true` only, meaning `requesterConfirmedResolvedAt IS NOT NULL`. Other values return `400 VALIDATION_ERROR` |

Existing parameters (`ownerId` including `unassigned`, `currentStatus`, `itPriority`, `sortBy=updatedAt`,
etc.) already cover the remaining drill-downs. Tie-break ordering is unchanged (`… , id DESC`).

### `GET /api/admin/users`
Unchanged. The `role` parameter already supports the Administrator user-count drill-down.

## 5. Dashboard Endpoints

Both are read-only `GET`s with no query parameters. Every number is computed per request from the database
(BR-28). Metric definitions are in specification §5.5. `drillDown` is a client route (path and query
string) that the UI renders as a link.

### `GET /api/dashboard/requester`
Role: `REQUESTER` only. `IT_STAFF` and `ADMINISTRATOR` get `403 FORBIDDEN` (BR-30, AC-29). Always scoped
to the session user's id. The endpoint accepts no parameter that could change the scope.

Response `200`:
```json
{
  "generatedAt": "2026-10-05T05:00:00.000Z",
  "timeZone": "Asia/Bangkok",
  "windowStart": "2026-09-28T17:00:00.000Z",
  "metrics": [
    { "key": "openTickets", "label": "Open tickets", "value": 3, "drillDown": "/tickets?statusGroup=open" },
    { "key": "waitingForMe", "label": "Waiting for you", "value": 1, "drillDown": "/tickets?currentStatus=WAITING_FOR_REQUESTER" },
    { "key": "resolvedAwaitingClose", "label": "Resolved", "value": 1, "drillDown": "/tickets?currentStatus=RESOLVED" },
    { "key": "updatedRecently", "label": "Updated in the last 7 days", "value": 4, "drillDown": "/tickets?sortBy=updatedAt&sortDir=desc" }
  ],
  "lists": {
    "recentlyUpdated": [
      { "id": 42, "ticketNumber": "TK-2026-000042", "summary": "Laptop crashes on wake", "currentStatus": "IN_PROGRESS", "updatedAt": "2026-10-05T03:12:00.000Z" }
    ],
    "recentlyResolved": [
      { "id": 40, "ticketNumber": "TK-2026-000040", "summary": "VPN disconnects hourly", "currentStatus": "RESOLVED", "resolvedAt": "2026-10-03T09:00:00.000Z" }
    ]
  }
}
```
(`windowStart` above is 2026-09-29 00:00 Asia/Bangkok, i.e. six days before a 2026-10-05 request.)

### `GET /api/staff/dashboard`
Role: `IT_STAFF` or `ADMINISTRATOR`. `REQUESTER` gets `403 FORBIDDEN` (AC-29).

Response `200`, same envelope:
```json
{
  "generatedAt": "…", "timeZone": "Asia/Bangkok", "windowStart": "…",
  "metrics": [
    { "key": "unassignedOpen", "label": "Unassigned", "value": 2, "drillDown": "/queue?ownerId=unassigned&statusGroup=open" },
    { "key": "myOpenTickets", "label": "My open tickets", "value": 3, "drillDown": "/queue?ownerId=6&statusGroup=open" },
    { "key": "waitingForRequester", "label": "Waiting for Requester", "value": 1, "drillDown": "/queue?currentStatus=WAITING_FOR_REQUESTER" },
    { "key": "resolvedAwaitingClose", "label": "Resolved, awaiting close", "value": 2, "drillDown": "/queue?currentStatus=RESOLVED" },
    { "key": "requesterSaysResolved", "label": "Requester says resolved", "value": 1, "drillDown": "/queue?requesterResolved=true&statusGroup=open" },
    { "key": "myOpenActions", "label": "My open actions", "value": 2, "drillDown": null },
    { "key": "myFollowUps", "label": "My follow-ups", "value": 1, "drillDown": null }
  ],
  "byStatus": [ { "status": "NEW", "value": 2, "drillDown": "/queue?currentStatus=NEW" }, "… all 8, fixed enum order …" ],
  "openByItPriority": [ { "itPriority": "URGENT", "value": 1, "drillDown": "/queue?itPriority=URGENT&statusGroup=open" }, "… all 4, URGENT → LOW …" ],
  "lists": {
    "myActions": [
      { "actionId": 17, "ticketId": 42, "ticketNumber": "TK-2026-000042", "description": "Re-check crash after RAM swap", "status": "PLANNED", "followUpRequired": true, "actionAt": "…" }
    ],
    "urgentAndRecent": [
      { "id": 42, "ticketNumber": "TK-2026-000042", "summary": "…", "currentStatus": "IN_PROGRESS", "itPriority": "URGENT", "owner": { "id": 6, "name": "Taylor Brooks", "role": "IT_STAFF" }, "updatedAt": "…" }
    ]
  },
  "users": {
    "activeByRole": [ { "role": "REQUESTER", "value": 4, "drillDown": "/admin/users?role=REQUESTER" }, "… IT_STAFF, ADMINISTRATOR …" ],
    "inactive": { "value": 2, "drillDown": "/admin/users" }
  }
}
```
- `users` is present **only** when the caller is an `ADMINISTRATOR`. For `IT_STAFF` the key is absent,
  not null (BR-34, AC-30).
- `myOpenActions` and `myFollowUps` have `drillDown: null`. Their drill-down is the `lists.myActions` rows,
  each linking to `/queue/:ticketId` (specification §11).
- `byStatus` always holds all 8 statuses and `openByItPriority` all 4 priorities, zeros included, so the
  UI layout never shifts with the data (BR-31).

| Case (both dashboards) | Status | `error.code` |
|---|---|---|
| Success (zeros and empty lists are success, BR-31) | `200` | — |
| No session | `401` | `UNAUTHENTICATED` |
| Wrong role | `403` | `FORBIDDEN` |
| Unexpected failure | `500` | `INTERNAL_ERROR`. No partial body (AC-32) |

**Performance smoke target**: each dashboard responds in < 1000 ms on the dev database with the seed plus
200 extra Tickets (PERF-01). It runs a fixed number of aggregate queries (`count`/`groupBy`), never a
fetch-all-then-count.

## 6. HTTP Status Reference (additions)

| Status | New codes in Lab 4 |
|---|---|
| `400` | `INVALID_ASSIGNEE` (and `VALIDATION_ERROR` for `version`, Action fields, `statusGroup`, `requesterResolved`) |
| `409` | `ACTION_LOCKED`, `ACTION_TRANSITION_NOT_PERMITTED`, `TICKET_NOT_ACTIONABLE`, `RESOLUTION_REQUIRES_COMPLETED_ACTION`, `STALE_UPDATE` |

`200` on `POST …/actions` means "already created by an earlier identical request" (BR-14), while `201`
means newly created. The UI treats both as success.
