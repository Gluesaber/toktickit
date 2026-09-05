# Lab 2 UI Specification — Zen Green Theme

Governs the Development Requester Selection screen, Create Ticket, My Tickets, and Requester Ticket
Detail. Field names match `specification.md` §7 and `api-spec.md`; every state below maps to a Business
Rule (BR) or Acceptance Criterion (AC) in `specification.md`.

## 1. Visual Foundation

### 1.1 Color Tokens

| Token | Value | Use |
|---|---|---|
| `--zg-primary` | `#006B3C` | App header, primary buttons, strong emphasis |
| `--zg-secondary` | `#0B7A46` | Active nav tab, focus accents, links, hover states |
| `--zg-pale` | `#EAF6EF` | Selected rows, success surfaces, subtle section emphasis, active-status badge fill |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards, form panels |
| `--zg-border` | `#D8E2DE` | Card/table border |
| `--zg-text` | `#1F2A24` | Body text (dark charcoal-green, not pure black) |
| `--zg-text-muted` | `#5B6B63` | Secondary text, helper copy, read-only labels |
| `--zg-field-editable-bg` | `#FFFFFF` | Editable input/select/textarea background |
| `--zg-field-editable-border` | `#C7D1CC` | Editable field border (neutral, not green — green is reserved for focus/active) |
| `--zg-field-readonly-bg` | `#EDF2EE` | Read-only field background (soft gray-green) |
| `--zg-field-readonly-text` | `#3E4A44` | Read-only field text — slightly muted, still readable |
| `--zg-error` | `#B3261E` | Error text, error field border |
| `--zg-error-bg` | `#FBEAE9` | Error message background (when boxed) |
| `--zg-warning` | `#8A5A00` | Warning text |
| `--zg-warning-bg` | `#FFF3CD` | Warning callout/badge fill |
| `--zg-success-text` | `#0B7A46` | Success message text (same as secondary green) |

Every color-coded state (error/warning/success/priority/status) also carries a text label or icon — color
is never the only signal, per the Zen Green rule.

### 1.2 Typography & Spacing

- Font: the existing Bootstrap system-font stack (`-apple-system, "Segoe UI", Roboto, Helvetica Neue,
  Arial, sans-serif`) — no new font is introduced.
- Scale: page title 28px/700, section heading 20px/600, field label 14px/600, body/input text 16px/400,
  helper/validation text 13px/500, badge text 12px/600.
- Spacing unit: 8px, following Bootstrap's spacer scale (`0.5rem` steps: 8/16/24/32/48px) so no custom
  spacing system is needed — cards use 24px internal padding, form field groups stack with 16px gaps,
  major sections separate with 32px.
- Line length: form text inputs/textareas cap at a `max-width` inside a centered `container` (Bootstrap
  default `xl` breakpoint, ~1140px) so lines of text stay readable on ultra-wide desktop screens (§7).

### 1.3 Field States

One consistent control height applies to every single-line control: `40px` (`2.5rem`), including inputs,
selects, and buttons. Multiline `Description` starts at 3 rows tall and is vertically resizable only
(`resize: vertical`), never horizontally.

| State | Appearance |
|---|---|
| Editable, default | White bg (`--zg-field-editable-bg`), `1px solid --zg-field-editable-border` |
| Editable, focused | Border becomes `--zg-secondary`, plus a `2px` outer focus ring (`box-shadow`) — never border-only, so it's visible for keyboard users on any background |
| Editable, invalid | Border becomes `--zg-error`; error text appears directly below the field, same width as the field |
| Read-only (system-generated) | `--zg-field-readonly-bg` fill, `--zg-field-readonly-text` color, no border-highlight on focus/hover (not interactive), a small "system-generated" helper caption under the field on first appearance (Ticket Number, Ticket Date, Requester on Create Ticket) |
| Disabled | 60% opacity, `cursor: not-allowed`, no hover/focus styling — visually distinct from read-only (disabled = temporarily unavailable; read-only = permanently system-owned) |

Required fields show a red asterisk (`*`) immediately after the label text, in `--zg-error`. The asterisk
is a visual hint only — it never replaces the field's validation message when left blank.

### 1.4 Button Hierarchy & States

| Style | Use | Example |
|---|---|---|
| Primary | One per screen/section — the main forward action | Submit, Continue |
| Secondary | Alternate action, same importance tier as primary but not the default path | Cancel, Change Requester |
| Tertiary (link-style) | Low-emphasis action | Clear filters |
| Destructive | Removal action, uses `--zg-error` instead of `--zg-primary` | Remove Attachment |
| Disabled | 60% opacity, `cursor: not-allowed`, no click handler fires | any button while its precondition isn't met |
| Busy | Spinner + unchanged label text (e.g. "Submitting…"), button disabled, minimum 300ms visible so fast responses don't flash | Submit while `POST /api/tickets` is in flight |

Every icon-only control (e.g. a small "×" remove icon) carries an `aria-label` and a native `title`
tooltip — icons support text, they never replace it, per the labsheet's component rule.

### 1.5 Badges

Priority and status badges always render as filled pill + text label (never a bare color swatch):

| Badge | Fill | Text color | Label text |
|---|---|---|---|
| Priority `LOW` | `--zg-pale` | `--zg-secondary` | "Low" |
| Priority `MEDIUM` | `--zg-warning-bg` | `--zg-warning` | "Medium" |
| Priority `HIGH` | `#FDE6D8` | `#9A3412` | "High" |
| Priority `URGENT` | `--zg-error-bg` | `--zg-error` | "Urgent" |
| Status `NEW` | `--zg-pale` | `--zg-primary` | "New" (the only status reachable in Lab 2) |

## 2. Application Shell & Navigation

- Header bar: `--zg-primary` background, white "TokTickIT" wordmark (left), nav links "My Tickets" /
  "Create Ticket" (center-left), current-Requester identity chip + "Change Requester" link (right).
- Active-page indication: the active nav link gets a `--zg-secondary` underline/background and
  `aria-current="page"` — never color alone.
- Below ≥992px: full horizontal nav. Below 992px: nav collapses into a hamburger-triggered offcanvas
  (Bootstrap `Navbar` + `Offcanvas`), Requester identity chip stays visible in the collapsed bar so the
  user always knows who they're testing as.
- If no Requester is selected (BR-10), the shell suppresses My Tickets/Create Ticket links entirely and
  routes straight to the Selection screen (AC-02).

## 3. Development Requester Selection Screen

Layout: centered single card (max-width ~480px) on the `--zg-bg` page background.

1. "TokTickIT" title.
2. Explanatory text (the labsheet's suggested copy): *"Select a Development Requester to test
   requester-specific ticket behavior. This is not a login screen. Authentication and role-based access
   will be introduced in Lab 3."*
3. Requester dropdown (native `<select>` for full keyboard/screen-reader support), populated from
   `GET /api/requesters`.
4. Primary "Continue" button — disabled until a Requester is chosen.

States:
- **Loading**: dropdown replaced by a skeleton/placeholder + disabled Continue, while
  `GET /api/requesters` is in flight.
- **Empty** (BR-39, AC-27): "No active Development Requesters are available. Contact an administrator." —
  no dropdown, Continue never enabled.
- **Failure** (AC-28): a safe inline error card ("Unable to load Development Requesters. Try again.") with
  a Retry button; no stack trace or raw error text.
- **Success**: on Continue, the Requester id is stored (`localStorage`), and the app shell navigates to
  My Tickets in that Requester's context.

## 4. Create Ticket Screen

### 4.1 Layout (top to bottom)

1. **System-generated group** (read-only field styling, §1.3): Ticket Number ("Assigned after
   submission"), Ticket Date ("Today"), Requester (current selection's name).
2. **Classification group**: Category, Related System, Requested Priority — three selects side by side on
   desktop, stacked on mobile.
3. **Summary** — single-line text input, full width.
4. **Description** — full-width textarea, 3 rows minimum, resizable.
5. **Attachments** — file picker + selected-file list (§4.4), below the main fields.
6. **Actions** — Submit (primary) and Cancel (secondary), bottom-right on desktop, full-width stacked
   buttons on mobile.

### 4.2 Field-by-field validation

| Field | Trigger | Message |
|---|---|---|
| Summary | blur or submit, blank or outside 5–120 chars | "Summary is required." / "Summary must be 5–120 characters." |
| Description | blur or submit, blank or outside 10–2000 chars | "Description is required." / "Description must be 10–2000 characters." |
| Category / Related System / Requested Priority | submit, nothing selected | "Please select a \<field\>." |

Validation messages render directly under their field (AC-04, AC-05) — never as a single banner at the
top only. On backend rejection, the same per-field message positions are reused for any `fields` returned
by the API's `VALIDATION_ERROR` response (`api-spec.md` §0).

### 4.3 Screen states

| State | Behavior |
|---|---|
| Initial | Empty form, reference-data selects populated from the API, Submit enabled |
| Validation failure | Offending field(s) get red border + message; all other entered values are preserved (BR-24); focus moves to the first invalid field |
| Submitting | Submit shows busy state (spinner + disabled) per §1.4; all fields become read-only for the duration so no edits are lost mid-request |
| Success | Form is replaced by a confirmation panel: generated Ticket Number, a "View Ticket" primary action, and a "Create Another" secondary action (AC-01, AC-06) |
| API/network failure | A safe error banner ("Unable to submit your ticket. Please try again.") appears above the form; every entered value remains exactly as typed (BR-25, AC-10) |

### 4.4 Attachment selection UI

- A file picker button ("Add file") plus a list of selected files, each row showing: filename, size, a
  per-row status (queued / uploading / uploaded / failed), and a remove-before-submit control.
- Client-side checks run before any network call: type (JPG/JPEG/PNG/WEBP/PDF), size (≤5MB), and count
  (≤5 total) — rejections show inline under the file list, never as a silent drop (AC-07, AC-08, AC-09).
- A rejected file never enters the selected list; accepted files upload only after the Ticket itself is
  successfully created (per `api-spec.md`'s two-step design) — so the attachment rows show "Uploading…"
  right after the success confirmation appears, not before.
- If one file's upload fails after the Ticket is saved, only that row shows a failed state with a Retry
  action; the Ticket confirmation and any already-uploaded files are unaffected (BR-26, BR-34).

## 5. My Tickets Screen

### 5.1 Layout

- **Desktop (≥992px)**: a table — columns below — with search/filter/sort controls in a toolbar above it.
- **Tablet (768–991px)**: same table, filter controls wrap to a second row if needed.
- **Mobile (<768px)**: one ticket per card (Ticket Number + Summary as the card title, remaining fields as
  labeled rows), search/filters collapse into a "Filters" disclosure to avoid vertical crowding.

### 5.2 Columns / card fields

Ticket Number, Summary, Category, Related System, Requested Priority (badge), Current Status (badge),
Last Updated (relative + absolute on hover). Ticket Number is a link to Ticket Detail on every layout.

### 5.3 Controls

- **Search**: single text box (debounced), matches Ticket Number or Summary (BR-14).
- **Filters**: Category, Related System, Requested Priority, Current Status — each a `<select>`; a
  "Clear filters" tertiary link appears once any filter or search is active.
- **Sort**: a `<select>` of Ticket Date / Ticket Number / Current Status / Requested Priority, plus a
  direction toggle; the active choice is reflected in a column-header indicator on desktop.
- **Pagination**: page-size `<select>` (10/25/50) + prev/next + page indicator ("Page 2 of 5"), placed
  below the list on every layout.

### 5.4 States

| State | Behavior |
|---|---|
| Loading | Skeleton rows/cards while `GET /api/tickets` is in flight |
| Empty (BR-37) | No search/filter active, zero tickets total: "You haven't created any tickets yet" + a "Create Ticket" primary action |
| No results (BR-38) | Search/filter active, zero matches: "No tickets match your filters" + "Clear filters" action |
| Failure | Safe error card + Retry, list area does not silently render blank |
| Loaded | Table/cards + pagination controls as above |

## 6. Requester Ticket Detail Screen

### 6.1 Layout

- **Header block** (read-only): Ticket Number, Current Status badge, Requested Priority badge, Ticket
  Date.
- **Classification block** (read-only): Category, Related System.
- **Description block** (read-only): Summary (as a sub-heading) + full Description text.
- **Attachment section** — visually separated (card border + heading "Attachments") from the read-only
  ticket fields above, containing the attachment list and the "Add Attachment" control. This separation
  is deliberate: it's the only interactive part of an otherwise read-only screen, and keeps room for
  Comments/Notes/Actions Taken to be added as their own separate sections in later labs without
  reshuffling this one.

### 6.2 Attachment section states

Each attachment row shows: filename, type icon, size, uploaded date, and a status:

| Row state | Presentation |
|---|---|
| Active | Filename as a download link, "Remove" destructive-style action |
| Uploading (just added) | Progress indicator in place of the download link, no Remove action yet |
| Removed (BR-32) | Filename in muted/struck-through text, "Removed \<date\>" + reason (if provided) shown, no download link — replaced with a disabled "Unavailable" label carrying a tooltip explaining why (AC-23) |
| Add-failed | Filename + red "Upload failed" text + Retry action, distinct from a removed row |

The "Add Attachment" control reuses the exact same file-picker component and client-side validation as
Create Ticket §4.4, including the 5-active-attachment limit check before any request is sent (AC-09,
AC-25).

### 6.3 Ownership-blocked state

If `GET /api/tickets/:id` returns `404` (foreign or nonexistent ticket, per `api-spec.md`), the screen
shows a single centered "Ticket not found" message with a "Back to My Tickets" action — never a blank
page, a raw error, or any fragment of the requested ticket's data (BR-40, AC-21).

## 7. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥ 992px | Multi-column layouts as described per screen; content centered, `max-width` container |
| Tablet 768–991px | Two-column where practical; Summary/Description keep full available width |
| Mobile < 768px | Fields stack vertically; all buttons remain ≥40px tall (touch target); no horizontal page scroll |
| All sizes | No clipped labels, no overlapping messages, no hidden buttons, no truncated attachment names without a full-name tooltip |

## 8. Accessibility Rules

- Every form control has a associated `<label>` (not placeholder-only labeling).
- Tab order follows visual order on every screen; focus is never trapped.
- Focus rings (§1.3) are visible against both white cards and the pale-green page background.
- Status/priority/validation/warning/success states all carry a text label, never color alone
  (Zen Green rule, §1.1/§1.5).
- Icon-only controls carry `aria-label` + `title` (§1.4).
- The Development Requester Selection screen (the one screen every session starts on) is fully
  operable by keyboard alone: dropdown → Continue, no mouse-only interaction (AC-30).

## 9. Visual Inspection Checklist

Run against Create Ticket, My Tickets, and Ticket Detail at desktop/tablet/mobile before marking a UI
Issue done. Completed as of Issue 2-9 — each item below is backed by either an automated test
(`tests.md` §2/§3) or a direct manual verification pass (fresh-clone browser walkthroughs across Issues
2-3–2-8), not just visual inspection at a glance:

- [x] Zen Green tokens match §1.1 exactly (no ad-hoc colors introduced) — one shared `zen-green.css`
      defines every token; no component sets an ad-hoc color
- [x] Editable vs. read-only fields are visually distinguishable without reading the label — confirmed in
      the Create Ticket/Ticket Detail screenshots (soft gray-green read-only fill vs. white editable)
- [x] Every required field shows its asterisk and, when invalid, a message directly below it (STYLE-01)
- [x] Primary/secondary/tertiary/destructive buttons are visually distinct from each other —
      `.btn-zg-primary`/`btn-outline-secondary`/`btn-link`/`btn-outline-danger` all render distinctly
- [x] Submit shows a busy state and cannot be double-clicked into two requests (UI-06, `.btn-busy`)
- [x] No clipped labels, overlapping text, or hidden controls at any of the three viewports (RESP-01–04,
      9 executions passing across 4 repeated runs — see `tests.md` §2/§6)
- [x] No horizontal page scrolling at the mobile viewport (RESP-01; also directly confirmed via
      `scrollWidth === clientWidth` during Issue 2-5's manual verification)
- [x] Priority and status badges are consistent in color + label across all three screens — `Badges.tsx`
      is one shared component used identically in My Tickets and Ticket Detail, not per-screen copies
- [x] Desktop table vs. mobile card/collapsed-filter behavior both remain fully usable (RESP-02/RESP-03)
- [x] Empty state and no-results state are visually distinct from each other on My Tickets (STYLE-05)
- [x] Removed attachments are visually distinct from active ones and cannot be clicked to download
      (UI-17, E2E-04, and manually confirmed during Issue 2-7's browser walkthrough)

## 10. Screenshot Plan

Captured under `artifacts/lab-02/screenshots/` per screen, each at desktop (1280px)/tablet (820px)/mobile
(375px) where noted:

- `create-ticket/` — `initial.png` (3 viewports), `validation-error.png`, `submitting.png`,
  `success.png`, `api-failure.png`, `invalid-attachment.png`, `requester-selector-dropdown.png`,
  `requester-selector-loading.png`, `requester-selector-failure.png`.
- `my-tickets/` — `requester-a-list.png`, `requester-b-list-after-switch.png`, `search-active.png`,
  `filters-active.png`, `sorted.png`, `pagination.png`, `empty-state.png`, `no-results.png` (3 viewports
  each for the base list view).
- `ticket-detail/` — `owned-view.png`, `add-attachment.png`, `download-active.png`,
  `soft-remove-with-reason.png`, `removed-metadata-retained.png`, `blocked-removed-download.png`,
  `unauthorized-access-blocked.png` (3 viewports each for the base detail view).
