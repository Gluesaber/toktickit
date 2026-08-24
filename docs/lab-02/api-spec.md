# Lab 2 API Contract

Full detail behind the summary in `specification.md` §8. Endpoints implement `specification.md`'s
Business Rules (BR) and Acceptance Criteria (AC); every row below is traceable to those.

## 0. Conventions

- Base URL: `http://localhost:3000` in development (`VITE_API_URL` on the client). All paths below are
  relative to it.
- **No authentication in Lab 2.** Every Requester-scoped endpoint instead requires an explicit
  `requesterId` — a query parameter on `GET`, a body/form field on `POST`/`DELETE` — representing the
  Development Requester currently selected in the UI (BR-08). The backend never infers identity any other
  way (no cookies/sessions this sprint).
- Timestamps are ISO 8601 UTC strings (e.g. `"2026-08-24T09:32:10.515Z"`).
- All error responses share one envelope:
  ```json
  { "error": { "code": "VALIDATION_ERROR", "message": "Summary is required.", "fields": { "summary": "Summary is required." } } }
  ```
  `code` is one of the values used in the tables below. `fields` is present only for
  `VALIDATION_ERROR` responses that have field-level detail; omitted otherwise.
- Unexpected server failures always return `500` with
  `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." } }` —
  never a raw stack trace or driver error.
- Attachment upload/download are the only endpoints not using JSON bodies (`multipart/form-data` for
  upload, a binary stream for download); every other request/response body is JSON.

## 1. Reference Data Endpoints

### `GET /api/categories`
Purpose: active Categories for the Create Ticket / My Tickets filter dropdowns.
Params: none.
Response `200`:
```json
[{ "id": 1, "name": "Hardware" }]
```
Only rows with `isActive = true` are returned, ordered by `id`. `500` on unexpected failure.

### `GET /api/related-systems`
Purpose: active Related Systems. Same shape and rules as `GET /api/categories`:
```json
[{ "id": 1, "name": "Campus Wi-Fi" }]
```

### `GET /api/requesters`
Purpose: active Development Requesters for the Selection screen (BR-07, BR-35).
Response `200`:
```json
[{ "id": 1, "name": "Alex Rivera", "email": "alex.rivera@example.edu" }]
```
Inactive Requesters are never included. `500` on unexpected failure — the Selection screen shows its
safe failure state in that case (AC-28).

## 2. Ticket Endpoints

### `POST /api/tickets`
Purpose: create one Ticket for the selected Requester (AC-01). Attachments are **not** part of this
request — a Ticket is created first, then attachments are added via
`POST /api/tickets/:id/attachments` (see §3). This two-step design is what makes BR-26's compensation
rule possible: a Ticket can be saved successfully even if a subsequent attachment upload fails.

Request body:
```json
{
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 4,
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "description": "Battery drops from 100% to 20% within an hour of unplugging, started this week."
}
```

| Field | Required | Rule |
|---|---|---|
| `requesterId` | yes | integer; must reference an active Requester (BR-21) |
| `categoryId` | yes | integer; must reference an active Category (BR-21) |
| `relatedSystemId` | yes | integer; must reference an active Related System (BR-21) |
| `summary` | yes | trimmed 5–120 chars (BR-19) |
| `description` | yes | trimmed 10–2000 chars (BR-20) |
| `requestedPriority` | yes | one of `LOW`, `MEDIUM`, `HIGH`, `URGENT` |

`ticketNumber`, Ticket Date (`createdAt`), and `currentStatus` are never accepted from the client even if
present in the body (BR-06) — they are silently ignored, not treated as a validation error.

Response `201`:
```json
{
  "id": 42,
  "ticketNumber": "TK-2026-000042",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 4,
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within an hour of unplugging, started this week.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-08-24T09:32:10.515Z",
  "updatedAt": "2026-08-24T09:32:10.515Z"
}
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `201` | — |
| Missing/blank/out-of-range field | `400` | `VALIDATION_ERROR` (with `fields`) |
| `requesterId` references an inactive or unknown Requester | `400` | `INVALID_REQUESTER` |
| `categoryId` / `relatedSystemId` references an inactive or unknown record | `400` | `VALIDATION_ERROR` (with `fields`) |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `GET /api/tickets`
Purpose: the current Requester's paginated, searchable, filterable, sortable ticket list (My Tickets).
Full query contract in §4. Requires `requesterId`.

Response `200`:
```json
{
  "data": [
    {
      "id": 42,
      "ticketNumber": "TK-2026-000042",
      "summary": "Laptop battery drains quickly",
      "categoryName": "Hardware",
      "relatedSystemName": "Corporate Laptop",
      "requestedPriority": "MEDIUM",
      "currentStatus": "NEW",
      "createdAt": "2026-08-24T09:32:10.515Z",
      "updatedAt": "2026-08-24T09:32:10.515Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false }
}
```
List rows are denormalized (`categoryName`, `relatedSystemName`) so the table/cards don't need extra
client-side joins. An empty-but-successful result (`"data": []`) is how both the "empty" (BR-36) and
"no-results" (BR-37) UI states are distinguished — the frontend tells them apart by whether any
search/filter parameter was active, not by a different API response.

| Case | Status | `error.code` |
|---|---|---|
| Success (including zero matches) | `200` | — |
| Missing/non-numeric `requesterId` | `400` | `VALIDATION_ERROR` |
| Invalid `sortBy` / `sortDir` / filter enum value | `400` | `VALIDATION_ERROR` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

### `GET /api/tickets/:id`
Purpose: one owned Ticket with its Attachments, for Ticket Detail. Requires `requesterId` as a query
parameter.

Response `200`:
```json
{
  "id": 42,
  "ticketNumber": "TK-2026-000042",
  "requester": { "id": 1, "name": "Alex Rivera", "email": "alex.rivera@example.edu" },
  "category": { "id": 2, "name": "Hardware" },
  "relatedSystem": { "id": 4, "name": "Corporate Laptop" },
  "summary": "Laptop battery drains quickly",
  "description": "Battery drops from 100% to 20% within an hour of unplugging, started this week.",
  "requestedPriority": "MEDIUM",
  "currentStatus": "NEW",
  "createdAt": "2026-08-24T09:32:10.515Z",
  "updatedAt": "2026-08-24T09:32:10.515Z",
  "attachments": [
    {
      "id": 7,
      "originalFileName": "battery-report.pdf",
      "mimeType": "application/pdf",
      "fileSizeBytes": 182004,
      "uploadedAt": "2026-08-24T09:33:00.000Z",
      "removedAt": null,
      "removalReason": null,
      "active": true
    }
  ]
}
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200` | — |
| `:id` doesn't exist, or exists but `requesterId` doesn't own it | `404` | `NOT_FOUND` (BR-12, BR-40, AC-21 — identical response either way, so a foreign-ticket probe can't distinguish "doesn't exist" from "not yours") |
| Missing/non-numeric `requesterId` | `400` | `VALIDATION_ERROR` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 3. Attachment Endpoints

### `POST /api/tickets/:id/attachments`
Purpose: add an Attachment to an owned Ticket (Create Ticket's post-save step, or from Ticket Detail).
`multipart/form-data` body: `file` (the binary) and `requesterId` (form field, ownership check).

| Case | Status | `error.code` |
|---|---|---|
| Success | `201` (attachment object, same shape as one entry in `attachments[]` above) | — |
| No file provided / `requesterId` missing | `400` | `VALIDATION_ERROR` |
| `:id` doesn't exist, or not owned by `requesterId` | `404` | `NOT_FOUND` |
| File extension/MIME type not in JPG/JPEG/PNG/WEBP/PDF (BR-27) | `415` | `UNSUPPORTED_FILE_TYPE` |
| File exceeds 5 MB (BR-28) | `413` | `FILE_TOO_LARGE` |
| Ticket already has 5 active Attachments (BR-29) | `409` | `ATTACHMENT_LIMIT_REACHED` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

Per BR-34, a rejected upload never modifies the existing Attachment list — the failure is scoped to that
one file.

### `GET /api/tickets/:id/attachments`
Purpose: Attachment metadata for a Ticket (used when Ticket Detail needs to refresh just the list).
Requires `requesterId`. Response `200`: array shaped like `attachments[]` above (active and removed both
included, per BR-32). Same `404`/`400`/`500` cases as `GET /api/tickets/:id`.

### `GET /api/attachments/:id/download`
Purpose: stream an active Attachment's file bytes. Requires `requesterId`.

| Case | Status | `error.code` |
|---|---|---|
| Success | `200`, binary body, `Content-Disposition: attachment; filename="<originalFileName>"` | — |
| `:id` doesn't exist, or its Ticket isn't owned by `requesterId` | `404` | `NOT_FOUND` |
| `:id` exists and is owned, but has been soft-removed (BR-32, AC-24) | `410` | `ATTACHMENT_REMOVED` |
| Missing/non-numeric `requesterId` | `400` | `VALIDATION_ERROR` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

`410 Gone` (rather than reusing `404`) is deliberate here: unlike the ownership case, the Requester
already knows this Attachment exists (they can see its metadata in Ticket Detail per BR-32), so there is
no existence-leak risk in saying precisely why the download is blocked.

### `DELETE /api/attachments/:id`
Purpose: soft-remove an owned, currently-active Attachment (BR-31).
Body: `{ "requesterId": 1, "reason": "Wrong file attached" }` — `reason` is optional (BR-31 allows it,
doesn't require it).

Response `200`:
```json
{ "id": 7, "removedAt": "2026-08-24T09:40:00.000Z", "removalReason": "Wrong file attached", "active": false }
```

| Case | Status | `error.code` |
|---|---|---|
| Success | `200` | — |
| `:id` doesn't exist, or its Ticket isn't owned by `requesterId` | `404` | `NOT_FOUND` |
| `:id` exists, owned, but already removed | `409` | `ALREADY_REMOVED` |
| Missing/non-numeric `requesterId` | `400` | `VALIDATION_ERROR` |
| Unexpected failure | `500` | `INTERNAL_ERROR` |

## 4. Ticket-List Query Contract (`GET /api/tickets`)

| Parameter | Required | Type / allowed values | Default | Behavior on invalid input |
|---|---|---|---|---|
| `requesterId` | yes | integer | — | missing or non-numeric → `400 VALIDATION_ERROR` |
| `search` | no | string, matched case-insensitively as a partial match against `ticketNumber` **or** `summary` (BR-14) | none | any string accepted; no error possible |
| `categoryId` | no | integer | none | non-numeric → `400`; a well-formed id with no matching row is a valid filter that simply matches zero tickets (not an error) |
| `relatedSystemId` | no | integer | none | same rule as `categoryId` |
| `priority` | no | `LOW \| MEDIUM \| HIGH \| URGENT` | none | any other value → `400 VALIDATION_ERROR` |
| `status` | no | `NEW` (the only status reachable in Lab 2; other enum values are reserved for later labs) | none | any other value → `400 VALIDATION_ERROR` |
| `sortBy` | no | `createdAt \| ticketNumber \| currentStatus \| requestedPriority` | `createdAt` | any other value → `400 VALIDATION_ERROR` |
| `sortDir` | no | `asc \| desc` | `desc` | any other value → `400 VALIDATION_ERROR` |
| `page` | no | integer ≥ 1 | `1` | non-numeric, missing, zero, or negative → silently reset to `1` (never an error — BR-17) |
| `pageSize` | no | `10 \| 25 \| 50` | `10` | any other value → silently reset to `10` (never an error — BR-17) |

Rationale for the split: `sortBy`/`sortDir`/`priority`/`status` are values the frontend always sends from
a fixed dropdown, so an unrecognized value signals a client bug worth surfacing as `400`. `page`/`pageSize`
are more likely to come from a hand-edited URL or a stale bookmark, and BR-17 explicitly requires that
paging past the end of the list stays a normal empty response rather than an error — so those two are
clamped instead.

Secondary sort: whatever `sortBy` is chosen, ties break by `createdAt DESC, id DESC` (BR-16), so pagination
order is always deterministic even when many tickets share a sort value (e.g. same `requestedPriority`).

`pagination` response metadata is always present and always reflects the *effective* (post-clamping)
`page`/`pageSize`, so the client can tell when its requested values were adjusted.

## 5. HTTP Status Reference

| Status | Meaning in this API |
|---|---|
| `200` | Successful retrieval, soft-removal, or metadata update |
| `201` | Ticket or Attachment created |
| `400` | Invalid input — missing/blank required field, out-of-range value, unrecognized enum, non-numeric id |
| `404` | Resource doesn't exist, or exists but isn't owned by the supplied `requesterId` (identical response for both, by design — BR-12) |
| `409` | Conflict with current state — attachment limit reached, or attachment already removed |
| `410` | Resource existed and is known to the caller, but is no longer available — a soft-removed Attachment's download |
| `413` | Uploaded file exceeds the 5 MB limit |
| `415` | Uploaded file's type isn't JPG/JPEG/PNG/WEBP/PDF |
| `500` | Unexpected server error — response body never exposes internals |
