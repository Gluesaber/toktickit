# Lab 4 UI Specification — Zen Green Theme (final)

Covers the Requester, IT Staff and Administrator Dashboards; the Actions Taken and Status History
additions to both Ticket Detail screens; the status-control changes (resolution gate, stale-update
conflict, Requester indication); URL-driven filters on the list screens; and the final hardening pass
across every screen. Anything not mentioned is unchanged from `docs/lab-03/ui-spec.md` (and through it
`docs/lab-02/ui-spec.md`). Every state below maps to a BR or AC in `specification.md`.

## 1. Visual Foundation

No new tokens, fonts, spacing units or control heights. Lab 2's and Lab 3's tokens (`--zg-primary`
`#006B3C`, `--zg-secondary` `#0B7A46`, `--zg-pale` `#EAF6EF`, `--zg-bg` `#F5F7F6`, `--zg-info-*`,
`--zg-neutral-*`, `--zg-warning*`, `--zg-error*`) cover every new element.

### 1.1 Action Status Badges (new component: `ActionStatusBadge`)

Shaped like `StatusBadge` (pill, text label always present), but kept as a separate component, because an
Action's status is not a Ticket's status and the two must never be confused on the same screen.

| Status | Fill | Text | Label |
|---|---|---|---|
| `PLANNED` | `--zg-info-bg` | `--zg-info-text` | "Planned" |
| `IN_PROGRESS` | `#D9EDE1` | `--zg-secondary` | "In Progress" |
| `COMPLETED` | `--zg-pale` | `--zg-primary` | "✓ Completed" |
| `CANCELLED` | `--zg-neutral-bg` | `--zg-neutral-text` | "Cancelled" |

Cancelled Actions use neutral gray, not the error palette. Withdrawing a planned step is not a failure,
unlike a Cancelled Ticket.

### 1.2 Other new cues

- **Follow-up badge**: `--zg-warning-bg` / `--zg-warning`, text "Follow-up", shown on any Action with
  `followUpRequired`.
- **Requester indication pill** (Staff Ticket Detail, Queue row): `--zg-pale` / `--zg-primary`, text
  "Requester says resolved · <date>".
- **Inactive assignee**: the assignee name is followed by muted text "(inactive)". The name is never
  hidden.
- **Metric card**: white card, 1px `--zg-pale` border, label (small, `--zg-text-muted`), value (2rem,
  `--zg-primary`, bold), and a drill-down link "View" whose accessible name repeats the metric, e.g.
  "View 3 unassigned tickets".
- **Read-only vs editable fields**: the Lab 2 §1.3 rule applies to the Action form exactly as it does
  everywhere else. Locked Actions render as text, never as disabled inputs.

## 2. Application Shell & Navigation

- Nav links per role, with **Dashboard** first:
  - Requester: Dashboard, My Tickets, Create Ticket.
  - IT Staff: Dashboard, Ticket Queue.
  - Administrator: Dashboard, Ticket Queue, User Management.
- The active link has `aria-current="page"`, a heavier font weight and an underline. The cue is never
  color alone (AC-41).
- Route `/dashboard` renders the role's dashboard. `/` and the post-login redirect go to `/dashboard`
  (FR-15). Existing role-scoped routing is unchanged: routes a role cannot use are not mounted, and a
  direct URL to one redirects to `/dashboard`.
- Below 992px the nav collapses behind the "Toggle navigation" button, unchanged from Lab 3.

## 3. Dashboards

### 3.1 Shared layout and states

- Page title "Dashboard" (h1). A muted subtitle reads "Counts since <windowStart, local date>" so the
  7-day window boundary is visible (BR-29). A tertiary "Refresh" button re-fetches the data.
- Metric cards in a responsive grid:
  - desktop (≥992px): 4 per row;
  - tablet (768–991px): 2 per row;
  - mobile (<768px): 1 per row, full width.
- Lists are below the cards: two columns on desktop, stacked on tablet and mobile. Each list is a card with
  a heading and at most 5 rows, each row a link to the Ticket.

| State | Presentation |
|---|---|
| Loading | Each card shows a placeholder value "—" with `aria-busy="true"` on the region, plus a visually-hidden "Loading dashboard". No numbers are shown until the response arrives |
| Loaded | Numbers plus drill-down links |
| Zero / empty (AC-28) | The card shows **0** (a real value, not a placeholder), and its "View" link stays usable, opening the correctly empty filtered list. Each empty list shows a sentence, e.g. "No tickets updated in the last 7 days." |
| Failure (AC-32) | The whole metrics area is replaced by the standard safe-failure alert "We couldn't load your dashboard. Please try again." with a Retry button. Numbers from an earlier successful load are cleared, never shown as current |
| Forbidden (403) | The standard "You don't have access to this page." panel (Lab 3 §8.2 pattern). It is only reachable by a client bug, since routes are role-scoped |

### 3.2 Requester Dashboard (FR-12)

- Cards: Open tickets · Waiting for you · Resolved · Updated in the last 7 days.
- "Waiting for you" gets the warning-color left border when its value is greater than 0, together with
  the text "Needs your reply". The cue is never color alone.
- Lists: "Recently updated" (Ticket Number, Summary, status badge, relative "updated" time) and
  "Recently resolved" (Ticket Number, Summary, resolved date).
- A primary "Create Ticket" button sits in the header area, so the dashboard remains a starting point.
- No Ticket outside the Requester's own is ever shown. This is guaranteed by the API (BR-30); the UI does
  no filtering of its own.

### 3.3 IT Staff Dashboard (FR-13)

- **Row 1, operational cards**: Unassigned · My open tickets · Waiting for Requester · Resolved, awaiting
  close · Requester says resolved.
- **Row 2, "My work" panel**: the "My open actions" and "My follow-ups" counts side by side, then the
  `myActions` list. Each row shows Ticket Number, Action description (truncated to one line with a
  full-text `title`), `ActionStatusBadge`, a Follow-up badge when set, and the Action date. Each row links
  to `/queue/:ticketId`, scrolled to the Actions Taken card (`#actions`).
- **Row 3, breakdowns**: "Tickets by status" and "Open tickets by IT Priority" as compact two-column
  lists. Each line is a status or priority badge (label text included), its count, and a link to the
  filtered Queue. They are deliberately not charts, so every value stays readable, keyboard-reachable and
  clickable at mobile width without a charting library.
- **Row 4**: the "Urgent and recent" list (Ticket Number, Summary, IT Priority badge, status badge, owner
  or "Unassigned", updated time).

### 3.4 Administrator Dashboard (FR-14)

The full IT Staff Dashboard, plus a final "Users" card group: "Active Requesters / IT Staff /
Administrators" (each linking to `/admin/users?role=…`) and "Inactive users" (linking to `/admin/users`).

## 4. List Screens: URL-driven Filters (FR-16)

- **My Tickets**, the **Ticket Queue** and **User Management** initialize their search, filters, sort and
  page from the URL query string on load, and write them back with `replace` navigation on change. A
  drill-down link therefore opens a pre-filtered list, and browser back/forward and refresh keep the
  filters.
- Unknown or invalid query values are dropped with a quiet "Some filters in the link were not recognized
  and were cleared." notice. The screen never shows a raw 400.
- The Queue's Current Status filter gains a first option, **"All open"** (`statusGroup=open`). The Queue
  also gains a **"Requester says resolved"** checkbox filter (`requesterResolved=true`). My Tickets'
  status filter gains "All open", and its sort control gains "Last Updated".
- When a list opens from a drill-down, an inline chip shows the applied filters ("Showing: All open ·
  Unassigned") next to "Clear filters". The total shown matches the card the user came from (AC-26/27).
- Queue rows show the "Requester says resolved" pill when the indication is set.

## 5. IT Staff Ticket Detail (extended)

Card order, top to bottom:
1. Header and read-only Ticket body
2. Attachments
3. Ownership
4. IT Priority
5. **Status** (changed)
6. **Actions Taken** (new)
7. **Status History** (new)
8. Public Comments
9. Internal Notes

### 5.1 Status card (changed)

- The current status badge. Beside it, the **Requester indication pill** when
  `requesterConfirmedResolvedAt` is set (FR-10, AC-20).
- The "Change Status" control still lists only transitions from specification §5.2 for the caller's role.
- **Resolution gate (AC-17)**: while the Ticket has no Completed Action, the "Resolved" option is still
  listed but disabled, with the visible helper text "Record at least one completed action before
  resolving." Selecting it is impossible. If the API still returns `RESOLUTION_REQUIRES_COMPLETED_ACTION`
  (stale screen), the same text appears as an error.
- The confirmation step for Resolved, Closed and Cancelled is unchanged. On success the badge, version,
  history and the cleared indication all update in place (FR-08).

### 5.2 Stale-update conflict (FR-11, AC-22/24)

On `409 STALE_UPDATE` from any status, owner, priority or Action edit:
- An alert at the top of the affected card reads "This ticket was changed by someone else since you
  opened it." with a **Reload ticket** button.
- The user's pending selection or form input is **kept**. Nothing is cleared until they choose Reload.
- Reload re-fetches the Ticket. An open Action form keeps the user's typed values next to a "Latest saved
  version" read-only summary, so they can re-apply them.
- Focus moves to the alert (`role="alert"`) so screen-reader and keyboard users notice it.

### 5.3 Actions Taken card (FR-01–FR-05)

**Header**: "Actions Taken (n)" plus a primary **Add Action** button. The button is hidden when the Ticket
is Closed or Cancelled, and the card then reads "This ticket is closed; actions are read-only."

**List** (BR-13 order):
- Desktop and tablet (≥768px): a table with columns Date/Time · Description · Result · Status · Performed
  by · Assignee · Follow-up · (actions). Description and Result wrap; they are never cut off.
- Mobile (<768px): one card per Action. Field label/value pairs are stacked and the actions sit at the
  bottom.
- Each row has a **View** button. Non-locked rows also have an **Edit** button. Locked rows (Completed,
  Cancelled) never show Edit (AC-10).
- Empty state: "No actions recorded yet." plus the Add Action button.

**Create mode** (inline panel opened inside the card under the header, not a modal, so the Ticket context
stays visible):

| Control | Type | Default | Validation shown (client first, then server) |
|---|---|---|---|
| Action Date/Time | `datetime-local` | now | required. Not before the Ticket was created. Completed: not in the future (AC-08) |
| Action Description | textarea | — | required, ≤ 2000 |
| Status | select (Planned / In Progress / Completed) | Planned | — |
| Result | textarea | — | required when Status is Completed (AC-07). The label gains "(required)" live |
| Assignee | select of active staff (`GET /api/staff/users`) | me | server `INVALID_ASSIGNEE` shown under the field (AC-05) |
| Follow-Up Required? | checkbox | off | — |
| Follow-up Note | textarea, shown only when Follow-Up Required is checked | — | required when shown (AC-06) |
| Attachment Notes | text input | — | ≤ 500. Helper text: "Which attachment or file to look at, e.g. screenshot-2.png" |
| Performed by | read-only text | current user's name | — (BR-04: shown for clarity, never editable) |

- Buttons: **Save Action** (primary) and **Cancel** (tertiary). While saving, Save shows the busy state and
  is disabled. The form generates its `clientRequestId` once when it opens, so a double click or retry
  can never create two Actions (AC-14, AC-37).
- On success the panel closes, the new Action appears in the list in its sorted position and is briefly
  highlighted, focus returns to Add Action, and a polite live region announces "Action saved."
- Every error is shown next to its field, plus a summary line at the top of the form. All input is kept
  (AC-38).

**View mode**: the same panel showing every field as read-only text, plus "Last edited by <name> on
<date>" when `updatedBy` is set. It has **Edit** (non-locked Actions only) and **Close** buttons.

**Edit mode**: the same form as create, pre-filled, with Performed by as text. The Status select offers
only the moves allowed from the stored status (specification §5.3), plus "Cancel this action" as a
secondary button with an inline confirmation step. It sends `version` (BR-23).

**Completing early** *(added after PR #56 review)*: a Planned action may be scheduled in the future, but
a Completed action can't be dated in the future (BR-07). When the user switches Status to Completed,
in create or edit mode, while Action Date/Time is still more than 5 minutes ahead, the form:
- sets Action Date/Time to now;
- shows the helper text "Date set to now because the action is being completed."

The user can still change the date to an earlier time before saving. The backend rule stays as it is.
The form only stops users from running into a validation error they had no way to anticipate.

**After a Reopen**: when the Ticket's latest history entry is "→ Reopened", the card shows an info line
"Reopened — record what is done to fix the recurrence." (specification §5.2 note).

### 5.4 Status History card (FR-09)

- A vertical timeline, oldest first. Each entry: "<From> → <To>" using both status badges (text labels),
  then the changer's name and `RoleBadge`, and the timestamp.
- Creation entries read "Created as New".
- A legacy Ticket (no rows, or no creation entry) shows a first line in muted text: "History before
  <first entry date or 'this upgrade'> was not recorded." (BR-21)
- Read-only. No control on any screen edits or removes an entry (AC-19).

## 6. Requester Ticket Detail (extended)

- A new **Actions Taken** card (read-only) between Attachments and Comments.
  - It uses the same list layout as §5.3 without the Add, Edit or View-mode edit controls. Every field is
    visible (BR-15).
  - Empty state: "IT hasn't recorded any actions on this ticket yet."
  - Labels use plain language, e.g. "What was done", "Result", "Who did it", and "Follow-up planned" for
    the follow-up fields.
- A new **Status History** card, the same component as §5.4.
- The "Mark Problem as Resolved" action is unchanged (Lab 3 §5.2). After the indication is cleared by a
  Reopen or In Progress (BR-18), the button becomes available again.
- The Cancel Ticket control (Lab 3 §5.3) now sends `version`. On `STALE_UPDATE` it shows "This ticket was
  just updated by IT. Reload to see the latest." with Reload.
- Internal Notes remain absent from this screen's code path (Lab 3 BR-29).

## 7. Hardening Rules (all screens)

- **One feedback vocabulary** (FR-19). Every screen uses the existing components:
  - Loading: spinner plus "Loading…" text;
  - Empty and No-results: sentence plus action;
  - Validation: field message plus form summary;
  - Success: live-region announcement or toast;
  - Forbidden (403): access panel;
  - Not found (404): "This ticket doesn't exist or you don't have access to it." with a link back;
  - Conflict (409): §5.2 pattern;
  - Safe failure (500 or network): generic message plus Retry.

  No screen may show a raw error code or stack trace.
- **Double-submit protection** (FR-17). Every submit button sets `disabled` and `aria-busy` while its
  request is in flight. This covers Login, Change Password, Create Ticket, Comments, Notes, Actions,
  status, owner, priority, and every User Management form.
- **Data retention** (FR-18). Forms keep user input after any recoverable failure. Password fields are the
  exception and are cleared, as in Lab 3.
- **Cleanup** (FR-20). No leftover dev-only text, `console.log`, TODO placeholders or dead links. The
  browser console stays clean on every screen during E2E (checked by E2E-08).

## 8. Responsive Rules

Same principles as Lab 2 §7 and Lab 3 §9, applied to every Lab 4 screen:
- no horizontal page scroll at 375px, 820px or 1280px;
- touch targets ≥ 40px;
- no clipped labels, overlapping controls or hidden buttons;
- truncated text always has a full-text tooltip.

The Actions Taken table switches to cards below 768px, so the eight-column table never forces horizontal
scroll.

## 9. Accessibility Rules

Lab 2 §8 and Lab 3 §10 carry forward. Lab 4 additions:
- Metric cards are `<section>`s with a heading. The value is plain text, not an image, and each drill-down
  link has a descriptive accessible name (§1.2).
- The Action form:
  - every control has a `<label>`;
  - errors are linked with `aria-describedby`;
  - the conditional Follow-up Note field appears right after its checkbox in DOM order, so tab order
    follows it;
  - opening the panel moves focus to its heading, and closing it returns focus to the button that opened
    it.
- Disabled "Resolved" status option: the reason is visible text linked with `aria-describedby`, not only
  a tooltip.
- Status, priority, Action status, follow-up and Requester-indication cues always carry text. They are
  never color alone (AC-40).
- Every new `.btn-zg-*` style gets an explicit `:focus-visible` rule (Lab 3 lesson: Bootstrap does not
  provide one for custom button classes).

## 10. Screenshot Plan

Captured from the disposable demo database (never the shared dev DB or a documented seed account through
the browser) under `artifacts/lab-04/screenshots/`. "3 vp" means desktop (1280), tablet (820) and mobile
(375).

- `staff-dashboard/`:
  - `staff-dashboard.png` (3 vp), `admin-dashboard-user-counts.png`;
  - `drilldown-unassigned-to-queue.png`, `drilldown-requester-says-resolved.png`, `my-work-list.png`;
  - `loading.png`, `empty-zero-state.png` (as Riley Osei, via a disposable clone account),
    `failure-retry.png`, `forbidden-requester.png`;
  - `metric-vs-psql.png` (count evidence).
- `requester-dashboard/`:
  - `requester-dashboard.png` (3 vp);
  - `drilldown-open-to-my-tickets.png`, `waiting-for-you.png`;
  - `empty-zero-state.png`, `failure-retry.png`, `forbidden-staff.png`.
- `actions-taken/`:
  - `list-multiple-actions.png` (3 vp), `create-form.png`, `validation-errors.png`;
  - `follow-up-required.png`, `inactive-assignee-rejected.png`, `view-mode.png`, `edit-mode.png`;
  - `complete-action.png`, `cancel-action.png`, `locked-completed.png`;
  - `stale-conflict.png`, `requester-read-only.png` (3 vp).
- `ticket-workflow/`:
  - `resolved-disabled-gate.png`, `resolve-success.png`, `status-history.png`;
  - `requester-indication-staff-view.png`, `reopen-clears-indication.png`.
- `regression/`: one representative capture each for Login, My Tickets, Create Ticket, Ticket Detail with
  attachments and comments, Queue, Internal Notes and User Management.

## 11. Visual and Accessibility Checklist

Signed off before Issue 4-7 is done. Each tick must name the test or verification behind it, as in
Lab 3 §11.

- [ ] Every new badge (Action status, Follow-up, Requester indication) uses only §1 tokens and always has
      a text label.
- [ ] Dashboard cards show correct values, readable labels and working drill-downs at all 3 viewports.
- [ ] Zero, empty, loading, failure and forbidden states render as specified on both dashboards.
- [ ] The Actions Taken table becomes cards below 768px, with no horizontal page scroll at 375px.
- [ ] Editable vs read-only fields are visually distinct, and locked Actions show no edit control.
- [ ] Validation messages appear under the right field and in the form summary, and input is kept after
      errors.
- [ ] The disabled "Resolved" option shows its reason as visible text.
- [ ] Stale-update conflict banner, Reload, and input retention all work.
- [ ] Keyboard-only: full Action create/edit flow, dashboard drill-downs and status change are reachable
      with a visible focus ring.
- [ ] No clipping, overlap or horizontal overflow on any Lab 4 screen at 375, 820 and 1280.
- [ ] The nav shows "Dashboard" first for every role, with `aria-current` on the active link.
- [ ] No console errors on any screen during the E2E run, and no placeholder text or dead links.
