# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the temporary Development Requester Selector with real, server-enforced authentication and
role-based authorization for three roles — Requester, IT Staff, Administrator — and deliver the first
operational IT Staff Ticket Queue/Ticket Detail workflow (claim, reassign, IT Priority, permitted status
changes, Public Comments, Internal Notes) plus a minimalist Administrator User Management screen, while
every Lab 2 Requester function keeps working unchanged under the authenticated identity.

## 2. Stakeholder Request Interpretation

The IT department needs the app to know who is actually using it. A Requester logs in with email and
password instead of picking a name from a dropdown, and — if issued an initial password — must set a new
one before doing anything else. IT Staff need a shared queue to find and work tickets: claim ownership, set
how urgently IT itself treats the ticket (separate from what the Requester asked for), move it through a
controlled set of statuses, talk to the Requester through Public Comments, and keep private Internal Notes
for themselves and Administrators. Requesters can say a problem looks fixed, but only IT Staff/Administrator
can formally close the loop. Administrators get one simple screen to create accounts, fix basic account
details, assign a role, and turn accounts on/off — nothing more elaborate. Every one of these boundaries is
enforced by the backend, not by which buttons the frontend happens to show.

## 3. Scope

### Included
- Login, Logout, current-authenticated-user retrieval, and mandatory first-login password change.
- Role-based navigation and server-side authorization for Requester, IT Staff, and Administrator.
- Migration of the Lab 2 `Requester` model into a real `User` model with credentials and a role, in place.
- Continued Requester ownership protection for all Lab 2 Ticket/Attachment functions, now keyed to the
  authenticated session instead of the Development Requester Selector.
- Requester-facing Public Comments and a "Problem Appears Resolved" indication (non-status-changing).
- IT Staff Ticket Queue (search/filter/sort/paginate) and extended Ticket Detail: claim/reassign ownership,
  IT Priority, permitted status transitions, Public Comments, Internal Notes.
- Minimalist Administrator User Management: list/search/role-filter, create, edit (name/email/role/active),
  set a new initial password, and the associated Administrator safety rules.
- Full IT Staff parity for Administrator on all Ticket-side operations (queue, claim/reassign, IT Priority,
  status, Public Comments, Internal Notes) — see §11.
- Zen Green visual system reused and extended for the new screens.

### Excluded
- Email invitations, password-reset email, multi-factor authentication, social login, single sign-on.
- Self-registration and Requester-created accounts.
- Actions Taken by IT Staff (deferred to Lab 4).
- Formal SLA calculation, escalation rules, notification services, dashboards/KPI analytics.
- Multi-tenant organizations, departments, customer administration.
- Multiple roles per user; user deletion, bulk user operations, import/export, account-history screens.
- Login rate-limiting / account lockout, account unlocking, and other advanced identity-management flows.
- Mandatory pagination, multi-column sorting, and multiple simultaneous filters on the user list.
- Production-grade deployment or cloud infrastructure changes.

## 4. Functional Requirements

**Authentication & session**
- FR-01 Provide a Login screen (email, password) with validation, a busy state, and safe failure feedback.
- FR-02 On successful login with `mustChangePassword = false`, establish an authenticated session and enter
  the application in the user's role context.
- FR-03 On successful login with `mustChangePassword = true`, allow only the Change Password screen; every
  other application screen and API stays unreachable until a valid new password is saved.
- FR-04 Provide a Change Password screen enforcing password rules and confirmation; on success it clears
  `mustChangePassword` and continues into the application without re-authenticating.
- FR-05 Provide a Logout action that invalidates the session server-side and returns the user to Login.
- FR-06 The application shell shows the current authenticated user's name and role, and only the
  navigation permitted for that role.

**Requester regression**
- FR-07 Remove the Development Requester Selector and Change Requester action entirely; Create Ticket, My
  Tickets, Ticket Detail, and Attachments all derive the current Requester from the authenticated session.
- FR-08 Add a Public Comments section to Requester Ticket Detail: list existing comments, post a new one.
- FR-09 Add a "Problem Appears Resolved" action to Requester Ticket Detail, available only to the owning
  Requester, that never changes Current Status.

**IT Staff**
- FR-10 Provide an IT Staff Ticket Queue screen listing tickets across all Requesters, with search,
  filters, sorting, and pagination.
- FR-11 The Ticket Queue shows ownership (assigned/unassigned), and Current Status/Priority badges, and
  links to Ticket Detail.
- FR-12 Provide an IT Staff Ticket Detail screen extending Lab 2 Ticket Detail with: claim/reassign
  ownership, IT Priority, permitted status changes, Public Comments, Internal Notes, existing Attachments.
- FR-13 IT Staff/Administrator can claim an unassigned Ticket, or reassign an already-owned Ticket to
  another active IT Staff/Administrator.
- FR-14 IT Staff/Administrator can change IT Priority independently of Requested Priority.
- FR-15 IT Staff/Administrator can change Current Status only along the permitted transition matrix (§5.2).
- FR-16 IT Staff/Administrator can post Internal Notes, visible only to IT Staff and Administrator.

**Administrator**
- FR-17 Provide an Administrator User Management screen: user list (Name, Email, Role, Status, Edit action),
  search by name/email, and an optional role filter.
- FR-18 Administrator can create a user with name, email, one role, activation state, and an initial
  password.
- FR-19 Administrator can edit a user's name, email, role, and activation state.
- FR-20 Administrator can set a new initial password for a user, forcing a mandatory change at next login.
- FR-21 Administrator actions enforce: no duplicate email, no self-deactivation, and at least one active
  Administrator remains at all times.

**Cross-cutting**
- FR-22 Every protected endpoint enforces authentication and role/ownership authorization server-side,
  independent of what the frontend shows or hides.
- FR-23 All Lab 3 screens reuse the Zen Green visual system and existing shared components (badges, form
  conventions) rather than introducing a second visual style.
- FR-24 All Lab 3 screens work at desktop (≥992px), tablet (768–991px), and mobile (<768px) without
  horizontal scrolling or clipped content.

## 5. Business Rules

**Given (mandatory) examples, kept verbatim:**
- BR-01 Only an active user with valid credentials may authenticate.
- BR-02 A user marked as requiring a password change cannot enter the normal application until a new valid
  password is saved.
- BR-03 The authenticated user identity, not a `requesterId` supplied by the client, determines ownership of
  Requester operations.
- BR-04 Public Comments are visible to the Requester, IT Staff, and Administrator. Internal Notes are
  visible only to IT Staff and Administrator.
- BR-05 A Requester may indicate that the problem appears resolved, but cannot formally set the Ticket to
  Resolved or Closed.

**Authentication & session**
- BR-06 Passwords are stored only as a salted bcrypt hash; plaintext passwords are never persisted or
  logged, and `passwordHash` is never included in any API response.
- BR-07 A login failure — whether the email does not exist or the password is wrong — returns the same
  generic "Invalid email or password" message and 401 status, so a failed attempt cannot be used to
  enumerate registered accounts.
- BR-08 A login with correct credentials for an inactive account returns a distinct "This account is
  inactive" message (401) rather than the generic invalid-credentials message, since the caller has already
  proven they hold valid credentials for an existing account (BR-01).
- BR-09 A successful login sets an HTTP-only, `SameSite=Lax` session cookie (`Secure` in production); the
  session itself is stored server-side and referenced only by an opaque cookie value.
- BR-10 A session expires automatically 24 hours after login. Logout invalidates the server-side session
  immediately, regardless of the cookie's remaining lifetime.
- BR-11 Every endpoint except login, logout, and the health check requires a valid, unexpired session; an
  unauthenticated request receives 401.
- BR-12 Lab 3 does not implement login rate-limiting or account lockout after repeated invalid attempts
  (excluded per §3 — account-unlocking and advanced identity-management flows); documented as a known
  limitation, not a defect.

**First-login password change**
- BR-13 `mustChangePassword = true` blocks every application endpoint except current-user retrieval,
  change-password, and logout until a new password is saved.
- BR-14 A new password must be at least 8 characters. The change-password request requires the new password
  twice (confirmation) and rejects a mismatch before hashing.
- BR-15 Saving a new password clears `mustChangePassword`, replaces the stored hash, and does not require
  re-authentication — the existing session remains valid.

**Identity & ownership**
- BR-16 The current-user endpoint returns `id`, `name`, `email`, `role`, `isActive`, and
  `mustChangePassword`, and never returns `passwordHash`.
- BR-17 `Ticket.requesterId` is set from the authenticated session at creation and is immutable thereafter;
  a client-supplied `requesterId` in the request body is ignored (extends BR-03).
- BR-18 All Lab 2 ownership rules (`docs/lab-02/specification.md` BR-11–BR-13, BR-33, BR-40) continue to
  apply in Lab 3, now keyed to the authenticated user's id instead of a selector-supplied id.

**Ticket ownership, IT Priority, and status**
- BR-19 A Ticket's owner (`ownerId`) must be an active User with role IT Staff or Administrator, or null
  (unassigned); a Requester or an inactive user can never be set as owner.
- BR-20 Any active IT Staff or Administrator may claim an unassigned Ticket, or reassign an already-owned
  Ticket to a different active IT Staff/Administrator — the Queue is shared, so there is no
  "must be current owner to reassign" restriction.
- BR-21 `itPriority` is initialized equal to `requestedPriority` when a Ticket is created and is never
  client-supplied at creation; `requestedPriority` is permanently read-only after creation.
- BR-22 Only IT Staff/Administrator may change `itPriority`, at any time regardless of Current Status.
- BR-23 Current Status transitions are restricted to the matrix in §5.2; a request for a transition not
  listed there is rejected with 409 Conflict.
- BR-24 A Requester may only ever set Current Status to Cancelled, and only while it is New or Open, and
  only on a Ticket they own; every other status transition is IT Staff/Administrator-only.

**Problem-resolved indication**
- BR-25 "Problem Appears Resolved" sets a `requesterConfirmedResolvedAt` timestamp on the Ticket and never
  modifies Current Status (extends given BR-05); only the owning Requester may set it, and only while
  Current Status is not already Resolved, Closed, or Cancelled.

**Public Comments & Internal Notes**
- BR-26 A Public Comment or Internal Note requires 1–2000 characters of non-whitespace content after
  trimming; empty or whitespace-only content is rejected with 400.
- BR-27 Public Comments and Internal Notes are append-only in Lab 3: no edit or delete endpoint exists.
- BR-28 Each Comment/Note's author and creation time are set by the backend from the authenticated session,
  never accepted from the client.
- BR-29 A Requester calling an Internal Notes endpoint directly is rejected 403 without revealing whether
  any notes exist on that ticket (extends given BR-04).

**Administrator**
- BR-30 An Administrator may create a user with exactly one role (Requester, IT Staff, or Administrator), a
  name, an email, an initial password, and an activation state.
- BR-31 Email addresses are unique case-insensitively; creating or editing a user with an email that already
  exists (any case) is rejected with 409.
- BR-32 An Administrator may edit a user's name, email, role, and activation state, but cannot delete the
  user or view/set their password directly — only "set a new initial password," which forces
  `mustChangePassword = true`.
- BR-33 Setting a new initial password immediately sets `mustChangePassword = true` on that user.
- BR-34 An Administrator cannot deactivate their own account (rejected 409), independent of the
  last-Administrator rule.
- BR-35 The system rejects any update that would leave zero active Administrator accounts — deactivating or
  role-changing the last active Administrator is rejected 409.
- BR-36 Deactivating a user (`isActive = false`) does not delete or alter their historical Tickets,
  Comments, Notes, or ownership; it only prevents future login and (for IT Staff/Admin) future assignment.

**Migration & regression**
- BR-37 All Lab 2 Ticket and Attachment data and ownership remain valid and correctly attributed after the
  `Requester` → `User` migration; no Ticket loses its `requesterId` association.
- BR-38 Every seeded Lab 2 Requester receives a documented, local-development-only initial password and
  `mustChangePassword = true` as part of the migration, since Lab 3 excludes email-delivered credentials.
- BR-39 The Development Requester Selector, its client-side stored selection, and the
  `requesterId`-as-parameter pattern (Lab 2 BR-08, BR-41) are fully removed; no code path accepts a
  client-supplied `requesterId` for a Requester-scoped write.

### 5.1. Authorization Matrix

Administrator has full IT Staff parity on Ticket operations in Lab 3 (§11) — every "IT Staff" column value
below also applies to Administrator, in addition to Administrator's own User Management column.

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| Login / Logout / current user / change own password | ✓ (self) | ✓ (self) | ✓ (self) |
| Create Ticket | ✓ | ✗ | ✗ |
| View/list own Tickets, Ticket Detail, Attachments | ✓ (own only) | ✗ | ✗ |
| Add/download/soft-remove own Attachments | ✓ (own only) | ✗ | ✗ |
| Post Public Comment on own Ticket | ✓ (own only) | — | — |
| Post Public Comment on any Ticket | ✗ | ✓ | ✓ |
| View Public Comments | ✓ (own ticket) | ✓ | ✓ |
| Set "Problem Appears Resolved" | ✓ (own ticket) | ✗ | ✗ |
| Cancel own Ticket (New/Open only) | ✓ (own) | ✓ (any, per §5.2) | ✓ (any, per §5.2) |
| View IT Staff Ticket Queue | ✗ | ✓ | ✓ |
| View any Ticket Detail (staff view) | ✗ | ✓ | ✓ |
| Claim / reassign Ticket ownership | ✗ | ✓ | ✓ |
| Set IT Priority | ✗ | ✓ | ✓ |
| Change Current Status (IT-side transitions) | ✗ | ✓ | ✓ |
| Post / view Internal Notes | ✗ | ✓ | ✓ |
| View User Management screen | ✗ | ✗ | ✓ |
| Create / edit user, assign role, activate/deactivate, reset password | ✗ | ✗ | ✓ |

### 5.2. Status Transition Matrix

Cancelled is terminal — no transition leads out of it. Closed is not: a Closed ticket can still move to
Reopened if the issue recurs, distinct from Cancelled's "never valid to begin with" semantics.

| From | To | Who |
|---|---|---|
| *(create)* | New | system |
| New | Open | IT Staff / Administrator |
| New, Open | Cancelled | Requester (own ticket, BR-24) or IT Staff / Administrator |
| Open | In Progress | IT Staff / Administrator |
| Open, In Progress, Waiting for Requester | Cancelled | IT Staff / Administrator only |
| In Progress | Waiting for Requester | IT Staff / Administrator |
| Waiting for Requester | In Progress | IT Staff / Administrator (manual — a Requester's Public Comment reply does not auto-transition the ticket) |
| Open, In Progress, Waiting for Requester | Resolved | IT Staff / Administrator |
| Resolved | Closed | IT Staff / Administrator |
| Resolved, Closed | Reopened | IT Staff / Administrator |
| Reopened | In Progress | IT Staff / Administrator |

## 6. UI Specification Summary

Full detail lives in `ui-spec.md`; this is the cross-reference summary.

- **Login**: email/password fields, validation, busy state, safe generic failure message, no account
  enumeration.
- **Change Password** (mandatory-gate screen): new password + confirmation, rule hints, validation, success
  continues straight into the application.
- **Application shell**: current user's name + role badge, role-scoped navigation (no unauthorized
  destinations rendered), Logout action — replaces the Lab 2 Development Requester display entirely.
- **Requester Ticket Detail**: existing Lab 2 layout, plus a Public Comments section (list + post) and a
  "Problem Appears Resolved" action, visually distinct from IT-only controls (which stay absent for this
  role).
- **IT Staff Ticket Queue**: search box, filters, sort control, pagination, ownership/status/priority
  badges, desktop table / mobile card layout, loading/empty/no-results/failure states.
- **IT Staff Ticket Detail**: extends Ticket Detail with ownership (claim/reassign), IT Priority control,
  status-change control (grayed-out/hidden options outside the permitted matrix), Public Comments and
  Internal Notes shown in visually distinct sections so private content can't be mistaken for public.
- **Administrator User Management**: user list (desktop table / mobile cards) with Name/Email/Role/Status/
  Edit, search box, role filter, Create User and Edit User forms, "set new initial password" as a distinct
  action from normal editing.
- **Zen Green tokens**: unchanged from Lab 2 (`#006B3C` primary, `#0B7A46` secondary, `#EAF6EF` pale,
  `#F5F7F6` background) — new badge variants added for Role and IT Priority, reusing the existing badge
  component.

## 7. Data Changes

New/changed Prisma models (full migration detail owned by the Authentication Foundation issue's branch,
summarized here per the Spec DD requirement to record the design before implementation):

| Model | Key fields | Notes |
|---|---|---|
| `User` (renamed from `Requester`) | `id`, `name`, `email` (unique, stored lowercased), `passwordHash`, `role` (enum `REQUESTER\|IT_STAFF\|ADMINISTRATOR`), `isActive` (default `true`, existing), `mustChangePassword` (default `true`), `createdAt` (existing), `updatedAt` (new) | Same table/ids as Lab 2's `Requester` — existing Ticket FKs stay valid (BR-37). |
| `Ticket` (extend existing) | + `ownerId` (nullable FK → `User`, must reference an active IT_STAFF/ADMINISTRATOR — app-enforced, not a DB constraint), + `itPriority` (enum `Priority`, defaults to `requestedPriority` at creation), + `requesterConfirmedResolvedAt` (nullable `DateTime`) | `currentStatus` enum gains `OPEN` and `WAITING_FOR_REQUESTER` (the other five values were already reserved in Lab 2's schema). |
| `Comment` (new) | `id`, `ticketId` (FK), `authorId` (FK → `User`), `content` (`@db.Text`), `createdAt` | Public Comments — append-only, no `updatedAt`. |
| `Note` (new) | `id`, `ticketId` (FK), `authorId` (FK → `User`), `content` (`@db.Text`), `createdAt` | Internal Notes — same shape as `Comment`, kept as a separate model (not a `visibility` flag on one table) so a query bug can't leak a Note through the Public Comments endpoint. |

Relationships: one `User` (role Requester) → many `Ticket` (as `requester`); one `User` (role IT Staff/Admin)
→ many `Ticket` (as `owner`, optional); one `Ticket` → many `Comment`; one `Ticket` → many `Note`; one `User`
→ many `Comment`/`Note` (as `author`). Existing `Category`, `RelatedSystem`, and `Attachment` relationships
are unchanged.

**Seed data minimums** (labsheet §5.3): at least 4 active + 1 inactive Requester `User` rows, 3 active + 1
inactive IT Staff `User` rows, and 1 active Administrator `User` row, plus realistic Tickets distributed
across Requesters/statuses/priorities/assigned-and-unassigned ownership, and example Comments/Notes that
don't expose sensitive information — all idempotent to re-run (BR-37/BR-38).

**Migration strategy**: rename the `Requester` table/model to `User` in place (same primary keys), add the
new columns with safe defaults (`mustChangePassword` defaults `true` so every migrated row lands in the
first-login-change state), backfill `passwordHash` for existing seeded Requesters with a documented
dev-only password (BR-38), and add new seed rows for IT Staff and Administrator accounts on the same table.
No existing `Ticket.requesterId` value changes.

## 8. API Contract

Full detail lives in `api-spec.md`; summary of required endpoints:

| Method & Path | Purpose |
|---|---|
| `POST /api/auth/login` | Authenticate, set session cookie |
| `POST /api/auth/logout` | Invalidate the current session |
| `GET /api/auth/me` | Current authenticated user (id, name, email, role, isActive, mustChangePassword) |
| `POST /api/auth/change-password` | Set a new password; clears `mustChangePassword` |
| `POST /api/tickets` | Create a ticket for the authenticated Requester (unchanged from Lab 2, identity now session-derived) |
| `GET /api/tickets` | Authenticated Requester's own tickets — search/filter/sort/paginate |
| `GET /api/tickets/:id` | One owned ticket, with attachments and Public Comments |
| `POST /api/tickets/:id/attachments`, `GET .../attachments`, `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id` | Unchanged from Lab 2, ownership now session-derived |
| `POST /api/tickets/:id/comments` | Post a Public Comment (Requester on own ticket; IT Staff/Administrator on any) |
| `GET /api/tickets/:id/comments` | List Public Comments (Requester on own ticket; IT Staff/Administrator on any) |
| `PATCH /api/tickets/:id/resolved-indication` | Requester sets `requesterConfirmedResolvedAt` on an owned ticket |
| `PATCH /api/tickets/:id/status` | Requester (Cancel only, own ticket) or IT Staff/Administrator (per §5.2) |
| `GET /api/staff/tickets` | IT Staff/Administrator Ticket Queue — search/filter/sort/paginate |
| `GET /api/staff/tickets/:id` | Staff-view Ticket Detail (includes Internal Notes) |
| `PATCH /api/staff/tickets/:id/owner` | Claim or reassign ownership |
| `PATCH /api/staff/tickets/:id/priority` | Set IT Priority |
| `POST /api/staff/tickets/:id/notes`, `GET .../notes` | Create/list Internal Notes (IT Staff/Administrator only) |
| `GET /api/admin/users` | List users — search by name/email, optional role filter |
| `POST /api/admin/users` | Create a user with one role |
| `PATCH /api/admin/users/:id` | Edit name/email/role/activation state |
| `POST /api/admin/users/:id/reset-password` | Set a new initial password (forces `mustChangePassword`) |

Every endpoint above except `POST /api/auth/login` requires a valid session (BR-11); `/api/staff/*` and
`/api/admin/users*` additionally require the caller's role per §5.1.

## 9. Acceptance Criteria

**Given (mandatory) examples, kept verbatim:**
- AC-01 Given an active user with valid credentials, when the user logs in, then the backend establishes
  authenticated access and returns the permitted user identity and role.
- AC-02 Given a user who must change the initial password, when login succeeds, then normal application
  screens remain unavailable until a valid new password is saved.
- AC-03 Given an authenticated Requester, when the client supplies another `requesterId`, then the backend
  still applies the authenticated identity and does not return another Requester's data.
- AC-04 Given a Requester account, when an Internal Note endpoint is requested, then the operation is
  rejected without exposing note content.

**Login & Password Change**
- AC-05 Given an inactive user's correct credentials, when they attempt login, then a distinct
  "account inactive" message is shown and no session is created.
- AC-06 Given a user with `mustChangePassword = true` completes login, when they attempt to navigate
  directly to any other application screen, then they are redirected to Change Password until a valid new
  password is saved.
- AC-07 Given a new password shorter than 8 characters, when the user submits Change Password, then a
  length-validation message appears and no password is changed.
- AC-08 Given mismatched new-password and confirmation fields, when the user submits, then a mismatch
  message appears and no API call is made.
- AC-09 Given an authenticated user, when they click Logout, then the session is invalidated server-side and
  a subsequent request with the old cookie returns 401.
- AC-10 Given no active session, when a user attempts to navigate directly to a protected URL, then they are
  redirected to Login and no protected data is rendered.

**Requester regression**
- AC-11 Given Requester A is authenticated, when they open My Tickets, then only Requester A's tickets are
  listed and no Requester-selection screen is reachable.
- AC-12 Given Requester A is authenticated, when they submit Create Ticket, then the created Ticket's
  `requesterId` is Requester A's id regardless of any client-supplied value.
- AC-13 Given a Ticket owned by Requester A, when Requester B (authenticated) requests it directly by id,
  then a not-found response is returned and no Ticket data is exposed.
- AC-14 Given an owned Ticket, when the Requester posts a Public Comment, then it appears immediately with
  the Requester's name and timestamp.
- AC-15 Given an owned Ticket not yet Resolved/Closed/Cancelled, when the Requester sets
  "Problem Appears Resolved," then `requesterConfirmedResolvedAt` is set but Current Status is unchanged.

**IT Staff Ticket Queue**
- AC-16 Given tickets exist across multiple Requesters, when IT Staff opens the Ticket Queue, then tickets
  from all Requesters are listed.
- AC-17 Given a Requester calls the Queue endpoint directly, when the request is made, then it is rejected
  with 403.
- AC-18 Given the Queue has more results than one page, when IT Staff paginates, sorts, or filters, then the
  result set and pagination metadata update accordingly.
- AC-19 Given no tickets match the current Queue filters, when the Queue loads, then a no-results state with
  a clear-filters action is shown.

**IT Staff Ticket operations**
- AC-20 Given an unassigned Ticket, when IT Staff clicks Claim, then `ownerId` is set to that IT Staff
  member and the Queue/Detail reflect the new owner.
- AC-21 Given a Ticket already owned by IT Staff member X, when IT Staff member Y reassigns it to
  themselves, then `ownerId` updates to Y.
- AC-22 Given a Ticket in status New, when IT Staff attempts to set status directly to Resolved, then the
  transition is rejected (409) because it is not in the permitted matrix.
- AC-23 Given a Ticket in status Open, when IT Staff sets IT Priority to a different value than Requested
  Priority, then IT Priority updates and Requested Priority remains unchanged.
- AC-24 Given a Ticket, when IT Staff posts an Internal Note, then it is visible on staff Ticket Detail but
  never returned by any Requester-facing endpoint.
- AC-25 Given a Ticket in New or Open owned by its Requester, when the Requester cancels it, then Current
  Status becomes Cancelled; the same action attempted while In Progress is rejected.
- AC-26 Given an Administrator, when they claim, reassign, set IT Priority, change status, or post an
  Internal Note on any Ticket, then the action succeeds identically to IT Staff (full parity, §11).

**Administrator User Management**
- AC-27 Given an Administrator creates a user with an email already in use (any case), when they submit,
  then a duplicate-email error is shown and no user is created.
- AC-28 Given an Administrator sets a new initial password for a user, when that user next logs in with it,
  then they are routed to the mandatory Change Password screen.
- AC-29 Given the only active Administrator, when they attempt to deactivate their own account, then the
  action is rejected with a clear message.
- AC-30 Given exactly one active Administrator exists, when an attempt is made to deactivate or change that
  account's role away from Administrator, then the action is rejected.
- AC-31 Given a non-Administrator user, when they call any `/api/admin/*` endpoint directly, then the
  request is rejected with 403.
- AC-32 Given the Administrator searches the user list by partial name or email, when the search executes,
  then only matching users are shown.
- AC-33 Given the Administrator applies a role filter, when the filter is applied, then only users with that
  role are shown.

**Responsive & accessibility**
- AC-34 Given the viewport is resized to mobile width (<768px), when the Ticket Queue and User Management
  screens are viewed, then no horizontal scrolling occurs and all controls remain reachable.
- AC-35 Given a keyboard-only user, when they tab through the Login screen, then all controls are reachable
  with a visible focus indicator.

## 10. Definition of Done

**Product completion**
- All FR/BR/AC above are implemented and traceable to a passing automated test (see `tests.md`).
- `npm test` passes in both `client/` and `server/` from a clean `main` checkout, and the documented
  `e2e/lab-03` command passes against a running dev stack.
- No required test is skipped, disabled, or commented out.
- Screens and APIs conform to `ui-spec.md` and `api-spec.md`.
- Every Lab 2 acceptance criterion (`docs/lab-02/specification.md` §9) still passes under the authenticated
  identity — full regression, not just spot checks.
- Authorization, ownership, and status-transition rules behave exactly per §5.1/§5.2 for every screen and
  API, verified with direct API calls (not only through the UI).
- README setup/test/seed instructions are current and were verified via a fresh-clone run.

**Course delivery**
- Each Issue implemented on its own feature branch, PR'd into `lab3-staging`, peer-reviewed.
- One release PR from `lab3-staging` into `main`; GitHub Project Kanban shows all Issues in Done.
- `docs/lab-03/{specification.md, tests.md, ui-spec.md, api-spec.md, reviewer.md, ai-use.md}` all present
  and rendered in the submission PDF.
- Required screenshots captured under
  `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/`.
- Submission PDF uses the exact "Answer Part 1"–"Answer Part 9" headings.

## 11. Assumptions and Decisions

- **Session mechanism**: HTTP-only, `SameSite=Lax` session cookie backed by a server-side session store
  (decided with the user ahead of drafting, over JWT-in-localStorage, to keep the session token out of
  reach of client-side JS). Given the SPA and API are same-origin (Vite dev proxy in development, and a
  simple same-origin deploy in production), `SameSite=Lax` without a separate CSRF token is judged
  sufficient for this course-lab threat model; a dedicated CSRF token is noted as a known limitation for
  production hardening, not a Lab 3 requirement.
- **Session store**: `connect-pg-simple` (or equivalent) against the existing Postgres database, avoiding a
  new infrastructure dependency (e.g. Redis) and surviving server restarts.
- **Session lifetime**: fixed 24-hour absolute expiry, no sliding refresh — simple and sufficient for a
  course lab; Logout always invalidates immediately regardless of remaining lifetime.
- **Administrator/IT Staff parity decision**: the labsheet explicitly flags that "an Administrator does not
  automatically need to perform IT Staff Ticket operations unless the approved authorization matrix
  explicitly permits it." Decided with the user (ahead of drafting) to grant Administrator full IT Staff
  parity on Ticket operations, in addition to User Management — see §5.1. This also satisfies the given
  BR-04's requirement that Internal Notes be visible to Administrator.
- **Status transition matrix** (§5.2): worked out with the user ahead of drafting. Only Cancelled is
  terminal (decided explicitly); Closed can still move to Reopened, since "the issue recurred after being
  closed" is a normal, expected path that Cancelled's "shouldn't have been opened" semantics don't share.
  A Requester's only status power is self-Cancel from New/Open; every other transition is
  IT-Staff/Administrator-only; a Requester's Public Comment reply while Waiting for Requester does not
  auto-transition the ticket back to In Progress (kept manual so a comment alone can't silently change
  ticket state).
- **"Problem Appears Resolved" is a flag, not a transition**: decided with the user ahead of drafting, as
  `requesterConfirmedResolvedAt` on `Ticket`, purely informational — keeps BR-05's line clean (only IT
  Staff/Administrator ever touch `currentStatus` for Resolved/Closed).
- **Inactive vs. invalid login messaging**: an inactive account with correct credentials gets a distinct
  message from a wrong-credentials attempt (BR-07 vs. BR-08), since the caller has already proven they hold
  valid credentials — this doesn't weaken the anti-enumeration property of BR-07, which only governs the
  case of *unproven* credentials.
- **No login lockout/rate-limiting**: out of scope per the labsheet's exclusion of account-unlocking and
  advanced identity-management flows; documented as a known limitation, not a defect (BR-12).
- **Password rules**: minimum 8 characters, no additional complexity requirement — course-lab scope,
  consistent with Lab 2's preference for simple, clearly-testable validation rules over elaborate ones.
- **Email uniqueness**: case-insensitive, enforced by storing `email` lowercased and comparing
  lowercased input; avoids a Postgres `citext` extension dependency.
- **`User` model name (not `Requester`, not a new `Auth`/`Account` table)**: this is exactly the migration
  Lab 2's `Requester` model was deliberately named to anticipate (`docs/lab-02/specification.md` §11) — same
  table, same ids, new columns, rather than a parallel identity model.
- **`itPriority` vs. `requestedPriority`**: both use the existing `Priority` enum; `itPriority` is
  initialized equal to `requestedPriority` at creation (BR-21) and diverges only when IT Staff/Administrator
  changes it later.
- **`Comment`/`Note` as separate models**, not one table with a `visibility` flag: chosen so an
  authorization bug in one query path can't accidentally leak Internal Note content through the Public
  Comments endpoint — a stronger guarantee than a flag-based filter.
- **Comment/Note length limits**: 1–2000 characters after trimming, matching Lab 2's Description field's
  upper bound; empty/whitespace-only rejected (BR-26).
- **Endpoint namespacing**: `/api/auth/*`, `/api/staff/*`, `/api/admin/*` prefixes make the required
  authorization boundary visible directly in the route table, and let role-checking middleware be applied
  per-namespace instead of per-route.
- **Migrated Requester initial passwords**: every existing seeded Lab 2 Requester gets a documented,
  local-development-only initial password and `mustChangePassword = true` (BR-38) — Lab 3 excludes
  email-delivered credentials, so there is no other in-scope delivery mechanism.
- **Client test directory naming**: continuing the Lab 1/Lab 2 convention, Lab 3 client tests live in
  `client/tests/lab-03/` (no space), even though the labsheet prints `client/.../lab-03 tests/`.
- **Ticket Number scheme, ownership-failure status codes, and other Lab 2 decisions**
  (`docs/lab-02/specification.md` §11) carry forward unchanged.
