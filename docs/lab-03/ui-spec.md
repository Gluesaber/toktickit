# Lab 3 UI Specification — Zen Green Theme (extended)

Governs Login, Change Password, the authenticated application shell, the Requester Ticket Detail additions
(Public Comments, Problem Appears Resolved), the IT Staff Ticket Queue and Ticket Detail, and the
Administrator User Management screen. Create Ticket, My Tickets, and the read-only body of Ticket Detail
are unchanged from `docs/lab-02/ui-spec.md` except that the current Requester now comes from the
authenticated session (§2) instead of the Development Requester Selector, which is removed. Field names
match `specification.md` §7 and `api-spec.md`; every state below maps to a Business Rule (BR) or
Acceptance Criterion (AC) in `specification.md`.

## 1. Visual Foundation

Lab 2's tokens, typography, spacing, field states, and button hierarchy (`docs/lab-02/ui-spec.md` §1.1–1.4)
carry forward unchanged and are reused as-is — no new font, spacing unit, or control-height system is
introduced. This section only adds what Lab 3 needs on top.

### 1.1 New Color Tokens

| Token | Value | Use |
|---|---|---|
| `--zg-info-bg` | `#E3F1FB` | Status badges for "actively moving forward" states (Open), role badge for IT Staff |
| `--zg-info-text` | `#1B4C73` | Text/border for the above |
| `--zg-neutral-bg` | `#E7EAE8` | Status badge for a completed-and-inactive state (Closed) |
| `--zg-neutral-text` | `#5B6B63` | Same as `--zg-text-muted` — text for the above |

Every existing token (`--zg-primary`, `--zg-secondary`, `--zg-pale`, `--zg-warning`/`--zg-warning-bg`,
`--zg-error`/`--zg-error-bg`, `#FDE6D8`/`#9A3412`) is reused for the new badges below rather than
introducing more one-off colors than necessary.

### 1.2 Status Badges (all 8 values)

`StatusBadge` (`client/src/components/Badges.tsx`) gains six new mappings; `NEW` is unchanged from Lab 2.

| Status | Fill | Text | Label | Rationale |
|---|---|---|---|---|
| `NEW` | `--zg-pale` | `--zg-primary` | "New" | unchanged from Lab 2 |
| `OPEN` | `--zg-info-bg` | `--zg-info-text` | "Open" | acknowledged, not yet actively worked |
| `IN_PROGRESS` | `#D9EDE1` | `--zg-secondary` | "In Progress" | active work, strongest "green" signal after New |
| `WAITING_FOR_REQUESTER` | `--zg-warning-bg` | `--zg-warning` | "Waiting for Requester" | blocked on someone, amber matches the existing warning semantics |
| `RESOLVED` | `--zg-pale` | `--zg-secondary` | "Resolved" | positive but distinct from New's primary-green |
| `CLOSED` | `--zg-neutral-bg` | `--zg-neutral-text` | "Closed" | completed and currently inactive — de-emphasized gray, not colored; still reopenable (§5.2) |
| `REOPENED` | `#FDE6D8` | `#9A3412` | "Reopened" | reuses the existing "High priority" orange — signals renewed attention needed |
| `CANCELLED` | `--zg-error-bg` | `--zg-error` | "Cancelled" | terminal — the only status that never reopens (§5.2) — and did *not* complete, the one status badge sharing the error palette |

### 1.3 Role Badges (new component: `RoleBadge`)

| Role | Fill | Text | Label |
|---|---|---|---|
| `REQUESTER` | `--zg-pale` | `--zg-primary` | "Requester" |
| `IT_STAFF` | `--zg-info-bg` | `--zg-info-text` | "IT Staff" |
| `ADMINISTRATOR` | `--zg-warning-bg` | `--zg-warning` | "Administrator" |

Used in the application shell's identity chip, the Ticket Queue's "Ticket Owner" column, and every row of
the Administrator User Management list.

### 1.4 IT Priority

IT Priority reuses the exact same `PriorityBadge` component and color mapping as Requested Priority
(`docs/lab-02/ui-spec.md` §1.5) — same enum, same visual language. The two badges are distinguished by a
small caption above each ("Requested Priority" / "IT Priority"), never by giving IT Priority a different
color scheme, since they are the same underlying concept (urgency) viewed from two sources.

## 2. Application Shell & Role-Based Navigation

- Header bar (unchanged chrome from Lab 2: `--zg-primary` background, white "TokTickIT" wordmark) — the
  Development Requester identity chip and "Change Requester" link are removed entirely and replaced with:
  the current user's name, a `RoleBadge`, and a "Logout" action (FR-06, BR replaces Lab 2's BR-08/BR-41).
- Navigation links are role-scoped and never rendered for a role that cannot use them — not just disabled:
  - **Requester**: "My Tickets", "Create Ticket".
  - **IT Staff**: "Ticket Queue".
  - **Administrator**: "Ticket Queue", "User Management" (full IT Staff parity, `specification.md` §11).
- Below ≥992px: full horizontal nav. Below 992px: nav collapses into a hamburger-triggered offcanvas
  (unchanged mechanism from Lab 2 §2); the identity chip + role badge stay visible in the collapsed bar.
- If no session exists (BR-11), the shell renders no navigation at all and routes straight to Login
  (AC-10). If the session's `mustChangePassword` is `true` (BR-13), the shell renders only the Change
  Password screen — every nav link and route is suppressed until it clears (AC-06).

## 3. Login Screen

Layout: centered single card (max-width ~420px) on the `--zg-bg` page background — same card treatment as
Lab 2's Requester Selection screen, replacing it.

1. "TokTickIT" title.
2. Email field (native `type="email"`), Password field (native `type="password"`, no visibility toggle
   required but permitted).
3. Primary "Log In" button — disabled while either field is empty or a request is in flight.

States:
- **Initial**: both fields empty, Log In disabled.
- **Validation** (client-side, before any request): blank email/password shows "Email is required." /
  "Password is required." directly under the field, same pattern as Lab 2's Create Ticket (§4.2 there).
- **Busy** (AC-11 region): Log In shows the busy state from §1.4, fields become read-only for the duration.
- **Invalid credentials** (BR-07, AC-05 counterpart): one generic message above the form —
  "Invalid email or password." — never attached to a specific field (doesn't imply which one was wrong).
- **Inactive account** (BR-08, AC-05): a distinct message — "This account is inactive. Contact an
  administrator." — visually identical placement to the invalid-credentials message but different text,
  so a screenshot can show both states are handled without looking like the same case.
- **Network/API failure**: same safe-failure pattern as Lab 2 (§4.3 there) — generic error banner, entered
  email retained (password field is cleared for safety, never retained across a failed submission).
- **Success**: navigates to the mandatory Change Password screen (if `mustChangePassword`) or the
  role-appropriate landing screen (My Tickets for Requester, Ticket Queue for IT Staff/Administrator).

## 4. Change Password Screen (mandatory gate)

Same centered-card layout as Login. Shown instead of any other screen whenever the session's
`mustChangePassword` is `true` (FR-03/FR-04, BR-13) — there is no way to dismiss or skip it.

1. Explanatory text: *"Your account has an initial password. Choose a new password to continue."*
2. New Password field, Confirm New Password field.
3. Primary "Set Password" button.

States:
- **Validation**: new password shorter than 8 characters → "Password must be at least 8 characters."
  (AC-07); confirmation mismatch → "Passwords do not match." (AC-08); both checked client-side before any
  request, then re-validated server-side per BR-14.
- **Busy / Success / Failure**: same visual pattern as Login §3 — success continues directly into the
  application without a second login (BR-15).

## 5. Requester Ticket Detail — Public Comments & Problem Appears Resolved

Extends `docs/lab-02/ui-spec.md` §6 without changing its existing header/classification/description/
attachment sections. Two new sections are added below Attachments, each in its own card (same visual
separation principle Lab 2 used to set aside the Attachment section):

### 5.1 Public Comments section

- Heading "Comments". A chronological list (oldest first) of existing comments, each showing author name,
  role badge, timestamp, and content.
- A "Post Comment" text area + submit button below the list. Empty/whitespace-only content is blocked
  client-side before any request (BR-26); the submit button follows the same busy-state pattern as other
  forms.
- New comments appear at the bottom of the list immediately after a successful post (AC-14) — no page
  reload.

### 5.2 Problem Appears Resolved action

- A single secondary-style button, "Mark Problem as Resolved", visible only while Current Status is not
  already Resolved, Closed, or Cancelled (BR-25).
- On success, the button is replaced by a static confirmation line: "You indicated this problem appears
  resolved on \<date\>." — it does not change the Current Status badge shown elsewhere on the screen
  (AC-15), and the UI copy makes clear this is informational, not a formal resolution (BR-05).

Internal Notes are never rendered anywhere on this screen — there is no code path on the Requester Ticket
Detail view that can request Note data, matching BR-29/AC-04 at the UI layer (defense in depth on top of
the backend's own rejection).

## 6. IT Staff Ticket Queue Screen

### 6.1 Layout

Same responsive shape as Lab 2's My Tickets (`docs/lab-02/ui-spec.md` §5.1): desktop table, tablet table
with wrapping toolbar, mobile one-ticket-per-card.

### 6.2 Columns / card fields

Ticket Number, Created Date, Summary, Requested Priority (badge), IT Priority (badge), Current Status
(badge), Ticket Owner (name + `RoleBadge`, or "Unassigned" in muted text), Last Updated. Category is
intentionally left out of the default column set (available via the Category filter and on Ticket Detail)
to avoid the "unreadable mega-grid" the labsheet warns against (§8.3) — eight columns already fills a
1280px desktop viewport; a ninth pushes the table into horizontal scroll on smaller desktops.

### 6.3 Controls

- **Search**: single text box, matches Ticket Number or Summary (same pattern as My Tickets).
- **Filters**: Current Status, Requested Priority, IT Priority, Ticket Owner (including an explicit
  "Unassigned" option), Category — each a `<select>`; "Clear filters" tertiary link once any filter/search
  is active. Category is a filter rather than a table column (§6.2) precisely so it stays reachable
  without contributing to the "unreadable mega-grid" the labsheet warns against.
- **Sort**: Created Date (default: newest first) / Current Status / IT Priority / Last Updated, plus
  direction toggle — reuses the exact sort-control component from My Tickets.
- **Pagination**: identical page-size (10/25/50) + prev/next + indicator pattern as My Tickets.

### 6.4 States

Same four-state pattern as My Tickets (`docs/lab-02/ui-spec.md` §5.4: Loading / Empty / No results /
Failure / Loaded), with copy adjusted for the Queue's audience — e.g. empty state reads "No tickets in the
queue yet" (no "Create Ticket" call-to-action, since IT Staff don't create tickets).

## 7. IT Staff Ticket Detail Screen

Extends the same read-only header/classification/description/attachment layout from
`docs/lab-02/ui-spec.md` §6.1–6.2 (IT Staff can view but not edit those fields — Lab 3 doesn't change
Ticket content itself, only its operational metadata). Below Attachments, four new sections appear, each
visually separated by its own card so operational controls are never confused with the read-only ticket
record:

### 7.1 Ownership section

- Current owner (name + `RoleBadge`, or "Unassigned").
- "Claim" primary button (visible only when unassigned) or "Reassign" secondary button (visible when
  owned) opening a searchable `<select>` of active IT Staff/Administrator users (BR-19/BR-20).

### 7.2 IT Priority section

- Requested Priority shown read-only (badge, §1.4) alongside an editable IT Priority `<select>` badge — the
  read-only vs. editable contrast here directly reuses Lab 2's editable/read-only field styling rule
  (`docs/lab-02/ui-spec.md` §1.3) rather than inventing a new visual language for "staff-editable."

### 7.3 Status section

- Current Status badge + a "Change Status" control offering only the transitions permitted from the
  ticket's current status per `specification.md` §5.2 — the control is populated from the same transition
  table the backend enforces, not a static full list, so the UI can never offer (even temporarily) a
  transition the API will reject with 409 (AC-22).
- Changing status to Cancelled, Closed, or Resolved shows a brief inline confirmation ("Set status to
  Resolved?") before submitting, since these are harder to walk back within Lab 3's scope.

### 7.4 Comments & Notes sections

- **Public Comments**: identical component to §5.1, reused verbatim — IT Staff/Administrator can read and
  post on any ticket (not just owned ones, per §5.1 of `specification.md`).
- **Internal Notes**: same list/post shape as Public Comments, but rendered in a card with a distinct
  header treatment — `--zg-warning-bg` card header background + a small "Internal — IT Staff/Administrator
  only" caption — so it cannot be visually mistaken for the Public Comments card above it. This is the
  labsheet's explicit requirement (§8.4: "visually distinct so private information is not accidentally
  posted publicly") implemented as a persistent visual cue, not just a label at post time.

## 8. Administrator User Management Screen

### 8.1 Layout

- **List view** (default): desktop table / mobile cards, same responsive shape as the Ticket Queue.
  Columns: Name, Email, Role (badge), Status ("Active"/"Inactive" as a small pill, green/gray — not the
  status-badge palette, to avoid implying these are Ticket statuses), Edit action.
- Toolbar above the list: search box (name/email), role filter `<select>` (all roles + "All"), "Create
  User" primary button.
- **Create/Edit** opens as a modal or side panel (not a full navigation away from the list, so the
  Administrator's place in a long/filtered list isn't lost) containing: Name, Email, Role (`<select>` of
  the three roles), Activation toggle, and — Create only — an Initial Password field. Edit mode instead
  shows a separate "Set New Initial Password" secondary action distinct from the main Save action, per
  BR-32 (editing basic fields and resetting a password are deliberately two different operations, not one
  combined form submit, so an Administrator can't accidentally reset a password while just fixing a typo
  in someone's name).

### 8.2 Validation & safety-rule feedback

| Condition | Presentation |
|---|---|
| Duplicate email (BR-31, AC-27) | Inline field error on Email: "This email is already in use." |
| Invalid role value | Field error on Role select (should be unreachable via the UI's own `<select>`, but the same message space is reserved for a rejected API response) |
| Self-deactivation attempt (BR-34, AC-29) | The Activation toggle for the currently-logged-in Administrator's own row is disabled with a tooltip: "You cannot deactivate your own account."; if attempted anyway via a stale form, the safe-failure banner shows the same message |
| Last-active-Administrator protection (BR-35, AC-30) | Same pattern as above, applied to the last remaining active Administrator's row/role field, regardless of who is editing it |
| Forbidden (non-Administrator hits this screen) | Full-screen "You don't have access to this page." — this screen is never reachable via navigation for other roles (§2) but is defended here too for direct-URL access |

### 8.3 States

Loading / Empty ("No users yet" — unreachable in practice since seed data always includes users, but kept
for consistency) / No results (search or role filter matches nothing, "Clear filters" action) / Failure —
same visual pattern as every other list screen in the app.

## 9. Responsive Rules

Same table and principles as `docs/lab-02/ui-spec.md` §7, applied to the four new/changed screens (Login,
Change Password, Ticket Queue, IT Staff Ticket Detail, User Management): no horizontal page scroll at any
viewport, all buttons remain ≥40px touch targets, no clipped labels/overlapping messages/hidden buttons,
no truncated names (user or ticket) without a full-text tooltip.

## 10. Accessibility Rules

Lab 2's rules (`docs/lab-02/ui-spec.md` §8) carry forward unchanged and apply to every new screen. Two
additions specific to Lab 3:
- Login and Change Password are fully keyboard-operable end to end (tab order: fields → submit button),
  matching the accessibility bar Lab 2 set for the Requester Selection screen it replaces (AC-35).
- The Internal Notes card's distinct visual treatment (§7.4) is never color-only: the "Internal —
  IT Staff/Administrator only" text caption is present regardless of color perception.

## 11. Visual Inspection Checklist

Run against Login, Change Password, Ticket Queue, IT Staff Ticket Detail, and User Management at
desktop/tablet/mobile before marking a Lab 3 UI Issue done — mirrors the checklist discipline established
in `docs/lab-02/ui-spec.md` §9 (each item backed by an automated test or a direct manual verification
pass, not a glance):

- [ ] All 8 status badges and all 3 role badges match §1.2/§1.3 exactly, reusing `zen-green.css` tokens —
      no ad-hoc colors introduced anywhere in Lab 3 screens
- [ ] Navigation never renders a destination a role cannot use (§2) — confirmed for all three roles, not
      just visually hidden but actually unreachable by direct URL
- [ ] Login's generic-invalid vs. inactive-account messages are visibly distinct in copy while identically
      positioned (§3)
- [ ] The Change Password gate cannot be bypassed by direct navigation while `mustChangePassword` is true
- [ ] Public Comments and Internal Notes cards are unmistakably distinct at a glance (§7.4) — not just on
      close reading
- [ ] IT Priority's editable control and Requested Priority's read-only badge are visually distinguishable
      per the existing editable/read-only rule (§7.2, reusing `docs/lab-02/ui-spec.md` §1.3)
- [ ] The Status-change control on IT Staff Ticket Detail only ever offers transitions valid from the
      current status (§7.3) — verified against `specification.md` §5.2, not just spot-checked
- [ ] User Management's self-deactivation and last-Administrator protections are visible as disabled
      controls with explanatory tooltips, not just server-side 409s with no UI cue (§8.2)
- [ ] No horizontal scrolling at mobile width on any of the five new/changed screens (§9)
- [ ] Desktop table vs. mobile card behavior both remain fully usable on Ticket Queue and User Management

## 12. Screenshot Plan

Captured under `artifacts/lab-03/screenshots/` per area, each at desktop (1280px)/tablet (820px)/mobile
(375px) where noted:

- `authentication/` — `login-initial.png`, `login-validation.png`, `login-invalid-credentials.png`,
  `login-inactive-account.png`, `login-busy.png`, `change-password-initial.png`,
  `change-password-validation.png`, `change-password-success.png`, `logout-then-blocked-access.png`.
- `staff-queue/` — `queue-loaded.png` (3 viewports), `search-active.png`, `filters-active.png`,
  `sorted.png`, `pagination.png`, `empty-state.png`, `no-results.png`, `unassigned-vs-owned-badges.png`.
- `staff-ticket-detail/` — `claim-unassigned.png`, `reassign-owned.png`, `it-priority-change.png`,
  `status-change-permitted-options.png`, `status-change-rejected-attempt.png`, `public-comments.png`,
  `internal-notes-distinct-styling.png` (3 viewports for the base detail view).
- `user-management/` — `user-list.png` (3 viewports), `search-active.png`, `role-filter-active.png`,
  `create-user.png`, `duplicate-email-error.png`, `edit-user.png`, `set-new-initial-password.png`,
  `self-deactivation-blocked.png`, `last-administrator-protected.png`, `forbidden-non-admin.png`.
