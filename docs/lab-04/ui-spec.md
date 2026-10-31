# Lab 4 UI Specification — Zen Green Theme, Final Application

This document extends `docs/lab-02/ui-spec.md` and `docs/lab-03/ui-spec.md`. All color
tokens, typography, spacing, field states, button hierarchy, badge pattern, screen states,
and the responsive breakpoints (desktop 992 px and wider, tablet 768-991 px, mobile under
768 px) stay in force. This file records only what is new for Lab 4: dashboards,
Actions Taken, workflow feedback, accessibility, and final polish.

## 1. Principles for Lab 4

- One coherent application: reuse existing components (cards, tabs, badges, buttons,
  forms, tables, alerts, modals). Create a new component only when none exists.
- Dashboards summarize and link; they never replace the detailed Queue, My Tickets, or
  Ticket Detail screens.
- The backend is the authority. The UI guides (hides, disables, explains) but every rule is
  also enforced server-side, and the UI must handle the server saying no.
- Do not show: "from yesterday" deltas or trend arrows (dashboards have no calendar-day metrics, BR-28), charts, export controls, or automatic polling.
- Time: every timestamp the UI shows ("Waiting since", last updated, action date/time, the "Updated" time on a dashboard) is the UTC value from the API formatted in the browser's time zone. These values are display only. The UI never uses them to compute durations, windows, or counts, and never re-sorts or re-filters API results (BR-28, BR-39).

## 2. New and Extended Tokens

| Token | Value | Usage |
|---|---|---|
| `--zg-metric-value` | 32 px, bold, `--zg-text` | Number on a metric card |
| `--zg-metric-label` | 14 px, medium, `--zg-text` at 80% | Label on a metric card |
| `--zg-action-planned` | `#EEF1EF` bg, `#3F4B45` text | Action status PLANNED |
| `--zg-action-progress` | `#E0F2F1` bg, `#00695C` text | Action status IN_PROGRESS |
| `--zg-action-done` | `--zg-pale` bg, `--zg-secondary` text | Action status COMPLETED |
| `--zg-action-cancelled` | `#F3E9E9` bg, `#8A1F1F` text | Action status CANCELLED |
| `--zg-followup` | `#FFF4E0` bg, `#8A5A00` text | "Follow-up" badge (a real attention cue, not decoration) |
| `--zg-shared-label` | `--zg-pale` bg, `--zg-secondary` text | "Visible to the Requester" label |

Every status badge carries a text label plus a symbol, so the meaning never depends on
color: PLANNED `○`, IN_PROGRESS `◐`, COMPLETED `✓`, CANCELLED `✕`, Follow-up `⚑`.
Ticket status, Requested Priority, IT Priority, and role badges are unchanged from Labs 2-3.

## 3. Routes and Navigation

| Route | Screen | Roles |
|---|---|---|
| `/dashboard` | Requester Dashboard | Requester |
| `/staff/dashboard` | IT Staff Dashboard | IT Staff, Administrator |
| `/tickets`, `/tickets/new`, `/tickets/:id` | My Tickets, Create Ticket, Requester Ticket Detail | Requester |
| `/staff/tickets`, `/staff/tickets/:id` | Queue, Staff Ticket Detail | IT Staff, Administrator |
| `/admin/users` | User Management | Administrator |

- A user who opens the dashboard route of another role is redirected to their own
  dashboard with a notification ("You do not have access to that page."). Never a raw error.
- After login (and after the mandatory password change) each role lands on its own dashboard.
- Navigation per role, with a clear active-page indicator (underline or pill in
  `--zg-secondary`, plus `aria-current="page"`):
  - Requester: Dashboard, My Tickets, Create Ticket
  - IT Staff: Dashboard, My Queue, Create Ticket
  - Administrator: Dashboard, My Queue, Admin / User Management
- The label "Admin / User Management" is kept exactly so earlier tests and screens still find it.
- On mobile the same entries sit inside the existing hamburger menu, with the active entry
  marked.

## 4. IT Staff Dashboard (`/staff/dashboard`)

Header row: greeting "Welcome back, <first name>" with a one-line subtitle on the left;
on the right a Refresh button (secondary) and small "Updated hh:mm" text (the API's `generatedAt` shown in the browser's time zone). Refresh shows a
busy state and re-fetches; it does not reload the page.

Metric cards (all are links; each is one focusable element with an accessible name such
as "Unassigned tickets: 7. View all"):

| Card | Number | Opens |
|---|---|---|
| Unassigned | active Tickets with no owner | Queue filtered to unassigned and active statuses |
| My Assigned | active Tickets I own | Queue filtered to me and active statuses |
| New | status NEW | Queue filtered to New |
| In Progress | status IN_PROGRESS | Queue filtered to In Progress |
| Waiting for Requester | status WAITING_FOR_REQUESTER | Queue filtered to that status |
| High IT Priority | active Tickets with IT Priority HIGH | Queue filtered to High and active statuses |

Administrator only: an extra "Users" card showing active and inactive counts, opening
`/admin/users`.

Lists (each row is a link to Staff Ticket Detail; each list has a "View all" link where a
filtered Queue exists):
- My recent Tickets: ticket number, summary, status badge, last updated.
- My open Actions: description, ticket number, Action status badge, action date/time.
  Opens the Ticket Detail of that Ticket.
- Urgent Tickets: only Tickets that are active (status New, Open, In Progress, Waiting for Requester, or Reopened; never Resolved, Closed, or Cancelled) and have IT Priority High. This is the same set as the "High IT Priority" card. Each row shows the ticket number, summary, IT Priority badge (always High), status badge, and last updated. Ordered least recently updated first (ties by ticket id ascending), so urgent Tickets that nobody has touched appear first. The API applies the condition and the order; the UI renders the rows exactly as returned and never re-filters or re-sorts them. When no Ticket matches, the list shows "No urgent tickets."

Quick actions panel: Open My Queue, Search Tickets (opens the Queue with the search box
focused), Create Ticket.

Layout:
- Desktop: six cards in one row at 1200 px and wider, three per row between 992 and
  1199 px. Below the cards, the three lists in the left two thirds and quick actions in
  the right third.
- Tablet: three cards per row; lists stacked full width; quick actions after the lists.
- Mobile: two cards per row (one per row under 360 px); everything else stacked; quick
  actions as a vertical list of full-width buttons.
- Long summaries truncate with an ellipsis (the full text is available to assistive
  technology); badges never wrap onto two lines.

## 5. Requester Dashboard (`/dashboard`)

Header row: "Welcome, <first name>" with subtitle "Here's the latest on your requests."
and the same Refresh control.

Metric cards (links, same accessible-name pattern):

| Card | Number | Opens |
|---|---|---|
| Open | NEW, OPEN, IN_PROGRESS, REOPENED | My Tickets filtered to those statuses |
| Waiting for you | WAITING_FOR_REQUESTER | My Tickets filtered to that status |
| Resolved | RESOLVED | My Tickets filtered to Resolved |
| Closed | CLOSED | My Tickets filtered to Closed |

Lists (rows open Requester Ticket Detail):
- Needs your attention: Tickets waiting for the Requester, longest waiting first. Waiting time is counted from when the Ticket entered Waiting for Requester (`waitingSince` in the API), not from its last edit, so a later comment or edit never moves a row. Each row shows the ticket number, the summary, and "Waiting since <date and time>". The date and time are the UTC `waitingSince` value formatted in the browser's time zone. This is display only: the UI never uses it to calculate a waiting duration, to sort, or to filter. The set of rows and their order come from the API (BR-39), so changing the browser time zone changes only how the time reads, never which rows appear or in what order. This list has a distinct callout style when it is not empty.
- Recently updated: ticket number, summary, status badge, last updated.
- Recently resolved: Resolved or Closed in the last 30 days.

Quick actions: Create Ticket ("Submit a new request") and View My Tickets ("Track existing
requests"). The dashboard does not repeat the full My Tickets table.

Layout: four cards in one row on desktop, two by two on tablet and mobile; lists stacked
on tablet and mobile, with lists in the left two thirds and quick actions on the right on
desktop.

## 6. Actions Taken on Staff Ticket Detail

Placement: a card titled "Actions Taken" between the Ticket Operations panel and the tabs
(Public Comments, Internal Notes, Attachments). It is always visible, not hidden in a tab.

Card header:
- Title with the count, for example "Actions Taken (3)".
- A "Visible to the Requester" label (`--zg-shared-label`, with an eye icon and text), so
  staff do not enter private information. Private notes belong under Internal Notes, which
  keeps its amber styling from Lab 3.
- An "Add Action" primary button. If the Ticket is RESOLVED, CLOSED, or CANCELLED the
  button is replaced by a short note ("Reopen the Ticket to add actions.").

List, stable order (oldest created first):
- Desktop and tablet: a table with columns Date/Time, Description (two lines, truncated),
  Status (badge), Assigned to, Follow-up (badge when required), and a View button. Result,
  Performed by, Follow-up Note, and Attachment Notes appear in the dialog, which keeps the
  table readable instead of a wide grid.
- Mobile: one card per Action showing the same fields stacked, with the View button as a
  full-width control.
- Empty: "No actions recorded yet." with the Add Action button.

Dialog (one component, three modes):
- Create: "Add Action". View: "Action details" with an Edit button for non-terminal
  Actions. Edit: "Edit Action". Terminal Actions (COMPLETED, CANCELLED) open in view
  mode only, with a note "Completed and cancelled actions cannot be changed."
- Fields in order:
  1. Action Date/Time (required, defaults to now)
  2. Description (required, multiline, counter to 1000)
  3. Status. In create mode a select offering PLANNED (default), IN_PROGRESS, and COMPLETED (the
     create request carries the status). In view and edit mode it is a read-only status badge,
     because the field-edit request does not accept a status (see "Changing an Action's status".)
  4. Assigned to (required; lists only active IT Staff and Administrators; defaults to the
     current user)
  5. Performed by (read-only, filled automatically, ivory read-only styling)
  6. Result (multiline, counter to 1000; in create mode it shows the required asterisk, and an error if left empty, when Status is COMPLETED; in the status step panel it is required to complete or cancel, and the cancel label reads "Reason for cancelling")
  7. Follow-up required? (switch). When on, the Follow-up Note (required, counter to 500)
     appears directly below; when off it is hidden and cleared.
  8. Attachment Notes (optional, up to 500), with helper text "Describe which file to look
     for, for example the screenshot added under Attachments. Files themselves are added
     under the Attachments tab."
- Buttons: Save (primary, busy state, disabled while a request is running) and Cancel
  (secondary). The dialog never closes on a failed save.
- Changing an Action's status (view and edit mode, non-terminal Actions only). Status never
  changes through Save. A separate "Change status" row under the fields shows one button per
  permitted next status, and each button calls the status endpoint with the Action's current
  `version`:
  - PLANNED shows "Start" (to IN_PROGRESS), "Mark completed", and "Cancel action".
  - IN_PROGRESS shows "Mark completed" and "Cancel action".
  - COMPLETED and CANCELLED show no status buttons.
  - "Start" is one click with no extra dialog.
  - "Mark completed" opens a step panel inside the dialog with the Result field (required,
    prefilled with the stored Result), the note "Completed actions become read-only.", and
    Back and Confirm buttons. Confirm sends status COMPLETED together with the Result.
  - "Cancel action" opens the same kind of step panel, with the field labeled "Reason for
    cancelling" (required) and the text "Cancel this action? This cannot be undone." Confirm
    sends status CANCELLED with the reason.
  - The status buttons are disabled while the form has unsaved edits, with the hint "Save or
    discard your changes first", so a field edit and a status change can never race inside one
    dialog.
  - After a successful change the dialog stays open in view mode showing the new status badge,
    and the list row refreshes. Errors (INVALID_TRANSITION, ACTION_TERMINAL, STALE_VERSION)
    use the same alert pattern as a failed save.
- Validation messages appear directly under their field, with the asterisk kept (the
  asterisk never replaces the message). The first invalid field receives focus on submit.
- Failure handling:
  - Network error or 5xx: an alert inside the dialog ("We couldn't save this action.
    Please try again.") with every entered value kept.
  - 409 stale version: an alert naming who changed it and when (if provided) and stating
    that the changes were not saved, with a "Load latest version" button. The user's text
    stays in the fields until they choose to load; loading while the form has unsaved edits
    asks for confirmation.
  - 409 Ticket no longer accepts actions: the alert explains the Ticket status and the
    Save button is disabled.
- Each successful Create sends a new `clientRequestId`; a retry after a lost response reuses
  the same one so no duplicate is created.
- Mobile: the dialog is a full-screen sheet with a sticky footer for Save and Cancel and
  safe-area padding. The page behind it does not scroll while it is open.

## 7. Actions Taken on Requester Ticket Detail

- The same card sits between the Ticket header and the tabs, titled "Actions Taken by IT
  Staff", in read-only mode only.
- No Add, Edit, or status control is rendered at all (not merely disabled).
- Each row opens a read-only dialog with every field, including Follow-up Note and
  Attachment Notes. Internal Notes are never rendered for a Requester (unchanged from Lab 3).
- Empty: "No actions have been recorded for this ticket yet."

## 8. Ticket Workflow and Resolution Feedback

Status control (in Ticket Operations on Staff Ticket Detail):
- Lists the current status and only the permitted next statuses from the matrix.
- Changes use the Ticket's `version`, so a stale change returns a conflict message with a
  reload action instead of silently overwriting.
- Confirmation for the pairs flagged in the matrix (for example Open to Cancelled,
  Closed to Reopened), shown with the browser's native `window.confirm` (not a custom modal), so the
  Lab 3 tests that spy on it stay valid and unchanged. It states "Change status from X to Y?". For Cancelled it also says
  that unfinished actions (with their count) will be cancelled automatically. Resolved to
  Closed and Resolved to Reopened show no dialog.
- Resolution gate: when the Ticket has unfinished actions, the Resolved option is disabled
  in the list and a callout under the control says "N unfinished action(s) must be
  completed or cancelled before this ticket can be resolved." with a "Go to Actions Taken"
  link that moves focus to the card. If the server still answers 409 (the data was stale),
  the same callout appears and the counts refresh.
- A successful change shows a short confirmation in a polite live region and refreshes the
  Ticket summary status badge and version without a page reload.
- When the Ticket is Closed or Cancelled the operations fields are read-only.
- The Requester's "problem appears resolved" indicator stays a read-only badge for staff and
  never enables or disables any control.

## 9. Screen States (all Lab 4 screens)

Every data-driven screen implements the Lab 2 and Lab 3 states, plus these specifics:
- Loading: dashboards show skeleton cards of the final size (no layout shift) with
  `aria-busy="true"`; Actions Taken shows skeleton rows.
- Empty: zero-count cards still show 0 and still link; empty lists show a friendly
  message, not a blank area.
- No-results: the filtered Queue or My Tickets reached from a card shows the normal
  no-results state.
- Forbidden: redirect with notification (never raw JSON).
- Conflict: a readable alert with the action to recover (reload).
- Failure: a safe message with a Retry button, layout intact. Dashboard data arrives from
  one request, so failure replaces the data area only, not the whole page.
- Success: short confirmation in a live region; no blocking dialog.

## 10. Responsive Rules

| Viewport | Dashboards | Actions Taken |
|---|---|---|
| Desktop, 992 px and wider | Cards in one row (six at 1200 px and wider); lists left, quick actions right | Table with six columns; centered dialog, maximum width about 640 px |
| Tablet, 768-991 px | Three cards per row (two for the Requester); lists stacked | Same table; dialog about 80% width |
| Mobile, under 768 px | Two cards per row (one under 360 px); everything stacked | Cards instead of a table; full-screen dialog |

At every size: no clipped labels or badges, no overlapping controls, no hidden buttons, no
unintended horizontal page scrolling, touch targets of at least 44 by 44 px, and unreadable
text never replaced by truncation of the only copy of important data.

## 11. Accessibility Rules

- Semantics: a header with navigation, one `main`, one `h1` per page, ordered headings,
  lists for lists, tables with header cells for tables.
- A metric card is a single link whose accessible name combines label, value, and action
  ("Open tickets: 3. View all"). The number alone is never the whole name.
- Dialogs use `role="dialog"` with `aria-modal="true"` and an `aria-labelledby` title. On
  open, focus moves into the dialog; Tab and Shift+Tab stay inside; Escape closes it (after
  the unsaved-changes confirmation if needed); on close, focus returns to the control that
  opened it. The unsaved-changes confirmation inside the Action dialog follows the same rules; the status-change
  confirmation in Ticket Operations is the browser's native `window.confirm` and is exempt (BR-35 applies to dialogs this app builds).
- Forms: every control has a visible label tied to it; errors use `aria-invalid` and
  `aria-describedby`; required fields carry the asterisk and `aria-required`.
- Live regions: save and status confirmations use `role="status"`; errors that need
  immediate attention use `role="alert"`.
- Focus is always visible (2 px `--zg-secondary` outline with an offset) and never removed
  without a replacement. Tab order follows the reading order.
- Never color alone: statuses, priorities, roles, and Follow-up carry text and a symbol.
- Contrast: body text and badge text meet 4.5:1 against their backgrounds.
- Motion: skeleton shimmer and transitions respect "reduce motion".

## 12. Final Polish and Cleanup Rules

- Search the client for leftovers and remove them: "Development Requester", "implemented in
  Issue", "stub", "TODO", "Lorem", "placeholder", `console.log`, commented-out screens, and
  unused components, routes, and styles (for example the old Check System page if it is
  still reachable).
- One label per concept everywhere (for example always "Ticket Owner", always "IT Priority",
  always "Waiting for Requester").
- Buttons follow the hierarchy: one primary action per area, secondary for dismissal,
  destructive style only for cancelling or removing.
- Every link goes somewhere real: no `#` links, no empty destinations, no dead routes.
- Date and time format is consistent and shown in the browser's time zone.
- Error text is human-readable; no screen may show raw JSON, status codes, or stack traces.

## 13. Visual and Accessibility Inspection Checklist

- [ ] Cards, lists, badges, buttons, and forms look like one design language across Labs 1-4
- [ ] Staff and Requester dashboards match the layout rules at three viewports
- [ ] Actions Taken table and cards are readable; the dialog fits without clipping
- [ ] Shared (Actions Taken) and private (Internal Notes) areas are visually distinct
- [ ] Status badges show text and symbol, never color alone
- [ ] Editable, read-only, and terminal fields are clearly different
- [ ] Validation and conflict messages are in the right place and understandable
- [ ] Focus is visible everywhere; the dialog traps and restores focus
- [ ] No horizontal scrolling, overlap, or hidden controls at any viewport
- [ ] Urgent Tickets shows only active High-priority Tickets; "Waiting since" and other times read in the browser's time zone and never change the rows or their order
- [ ] No leftover or inconsistent UI from earlier labs

## 14. Screenshot Paths

- `artifacts/lab-04/screenshots/staff-dashboard/` (desktop, tablet, mobile; populated, empty, failure)
- `artifacts/lab-04/screenshots/requester-dashboard/` (desktop, tablet, mobile; populated, empty)
- `artifacts/lab-04/screenshots/actions-taken/` (list, create, edit, validation, conflict, terminal, Requester read-only; all three viewports)
- `artifacts/lab-04/screenshots/ticket-workflow/` (permitted transitions, confirmation, gate block, success)
