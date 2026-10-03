# Lab 3 UI Specification — Zen Green Theme Extension

This document extends `docs/lab-02/ui-spec.md`. All color tokens,
typography, spacing, field states, button hierarchy, and responsive
breakpoints defined in Lab 2 remain in force. This file documents only
what is new or role-specific for Lab 3.

## 1. New/Extended Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--zg-internal` | `#FFF4E0` (amber-tinted background), `#8A5A00` text | Internal Notes panel — must look clearly different from Public Comments |
| `--zg-role-requester` | `--zg-pale` bg, `--zg-secondary` text | Role badge: Requester |
| `--zg-role-staff` | `#E6F0FA` bg, `#1B5FA8` text | Role badge: IT Staff |
| `--zg-role-admin` | `#F3E8FF` bg, `#6B21A8` text | Role badge: Administrator |
| `--zg-status-*` | Reuse Lab 2 badge pattern, one shade per status (New/Open/In Progress/Waiting/Resolved/Closed/Reopened/Cancelled) — each combined with a text label, never color alone |

## 2. Authenticated Application Shell

- Header unchanged in structure from Lab 2 (`--zg-primary` background,
  "TokTickIT" title). The Development Requester display and "Change
  Requester" action are **removed entirely**.
- Replaced with: authenticated user's name + role badge (using the role
  tokens above) + a "Profile ▾" menu containing **Logout** and, where
  applicable, **Change Password**.
- Navigation items shown are role-filtered:
  - Requester: My Tickets, Create Ticket
  - IT Staff: My Queue, Create Ticket (Staff may also submit tickets as themselves if needed — otherwise omit)
  - Administrator: Admin / User Management
- A navigation item that is not shown for a role must also be rejected
  server-side if reached by direct URL — the UI hiding is a convenience,
  not the security boundary (per labsheet Section 3).

## 3. Login and Change Password (Section 8.1)

### 3.1 Login Screen
- Centered card, max-width ~420px, on `--zg-bg`.
- Fields: Email address, Password (with show/hide eye icon toggle).
- Primary button "Sign In" — busy state while request is in flight.
- Failure state: `--zg-error` bordered callout directly above the button,
  generic text "Invalid email or password. Please try again." for every
  failure case (wrong password, unknown email, inactive account) per
  BR-05 — never a state that reveals which part was wrong.
- "Forgot your password?" link present but informational/disabled
  (out of scope for Lab 3) — do not wire to a real flow.

### 3.2 Mandatory Change Password Screen
- Shown immediately after a successful login when `mustChangePassword`
  is true; no other screen is reachable until this completes.
- Fields: Current (temporary) password, New password, Confirm new
  password — all with show/hide toggles.
- Live password-rule checklist below the New Password field (per
  BR-07): minimum 8 characters, upper + lower case, a number, a special
  character — each rule shows a check/cross icon that updates as the
  user types.
- Primary button "Continue" disabled until all rules pass and
  confirmation matches.
- Success: proceeds directly into the role-appropriate landing screen
  (My Tickets / My Queue / User Management).

## 4. IT Staff Ticket Queue (Section 8.3)

- Application shell nav highlights "My Queue" as active.
- Header: "My Queue" title, short description, "Create Ticket" action
  (optional secondary), search bar (ticket number or summary).
- Filter row: Category, Requested Priority, IT Priority, Current
  Status, Ticket Owner (including an explicit "Unassigned" option) —
  wraps on smaller viewports.
- Desktop: table with sortable columns — Ticket No., Created Date,
  Summary, Category, Requested Priority, IT Priority, Status, Owner,
  Last Updated. Avoid an unreadable mega-grid: on narrower desktop
  widths, less critical columns (e.g. Category) may collapse into an
  expandable row detail.
- Mobile: card per Ticket showing Ticket No., Summary, Status badge,
  Owner (or "Unassigned"), tap to open Ticket Detail.
- Pagination: same pattern as Lab 2 My Tickets ("Showing X to Y of Z
  tickets").
- States: loading, empty ("No tickets in the queue yet"), no-results
  (filtered to zero), forbidden (non-Staff/Admin session reaching this
  route — redirect + notification, not a bare error), and safe failure.

## 5. IT Staff Ticket Detail (Section 8.4)

- Extends the Lab 2 Ticket Detail layout. Header fields (Ticket No.,
  Category, Related System, Requester, Requested Priority, Summary,
  Description) remain **read-only** exactly as in Lab 2.
- New editable operational fields, grouped in a distinct "Ticket
  Operations" panel below the read-only header:
  - **Ticket Owner**: dropdown of active IT Staff/Administrator users,
    plus "Unassigned"; changing it calls claim/reassign.
  - **IT Priority**: dropdown (Low/Medium/High), independent of
    Requested Priority which stays read-only alongside it for
    comparison.
  - **Current Status**: dropdown restricted to valid transitions from
    the current status (per the Status Transition Matrix in
    `specification.md`); transitions requiring confirmation open a
    confirm dialog before the API call fires.
- Tabs below Ticket Operations: **Public Comments** | **Internal
  Notes** | **Attachments** (Lab 2, unchanged) — Internal Notes tab
  uses `--zg-internal` styling throughout (tab background, note cards)
  so it is unmistakably different from Public Comments even to a
  distracted user, preventing accidental public posting of private
  information.
- Requester's "Problem Appears Resolved" flag is shown as a read-only
  badge/indicator near the header (visible to Staff/Admin, set only by
  the Requester on their own Ticket Detail screen — see Section 6).

## 6. Requester Ticket Detail (Regression + Additions, Section 8.2)

- Layout otherwise unchanged from Lab 2 (read-only header, Attachments
  section).
- Adds a **Public Comments** panel identical in style/behavior to the
  Staff version (Requester sees the same comment thread, can post new
  ones).
- Adds a **"Mark problem as resolved"** action (a button or toggle) —
  confirmation required before submitting, since it communicates status
  to IT Staff even though it does not change Current Status (BR-12).
- Internal Notes tab is **never rendered** for this role (not hidden
  via CSS — the component/route is not present at all for a Requester
  session).

## 7. Administrator User Management (Section 8.5)

- Single screen, two-panel layout on desktop (list left/main, create/
  edit as a right-side slide-over panel); on mobile, the slide-over
  becomes a full-screen modal.
- List columns: Name, Email, Role (badge), Status (Active/Inactive
  badge), Edit action.
- Search bar (name or email) + optional Role filter dropdown — no
  pagination, no multi-column sort, no multiple simultaneous filters
  (explicitly out of scope per labsheet Section 4.2).
- "Create User" primary button opens the slide-over with: Full Name,
  Email Address, Role (dropdown: Requester/IT Staff/Administrator),
  Active toggle, Initial Password field with a note "User will be
  required to change this password at first login."
- Edit mode: same form pre-filled, plus a separate "Set New Initial
  Password" action (distinct from the main Save, since resetting a
  password is a deliberate, confirmed action) and a "Deactivate User"
  destructive-style button.
- Validation: duplicate email shown as a field-level error under
  Email Address; self-deactivation and last-active-Administrator
  removal are blocked with a clear inline message near the
  Deactivate/Save action, not a silent failure.
- Forbidden state: a non-Administrator session reaching this route is
  redirected with a notification, consistent with the Ticket Detail
  ownership-check pattern established in Lab 2 Issue 7.

## 8. Screen States (all Lab 3 screens)

In addition to the Lab 2 standard set (Initial, Loading, Validation,
Submitting, Success, Failure, Empty, No-results), Lab 3 screens must
also implement:
- **Forbidden** — role-appropriate redirect + notification (never a
  raw 403 JSON body rendered to the user).
- **Conflict** — e.g. duplicate email, or attempting to deactivate the
  last Administrator — shown inline near the relevant control.

## 9. Responsive and Accessibility

Same breakpoints and rules as Lab 2 Section 6/7 (Desktop >=992px,
Tablet 768-991px, Mobile <768px). Additional Lab 3-specific checks:
- Role badges remain legible and distinguishable at all sizes without
  relying on color alone (text label always present).
- The Internal Notes vs Public Comments visual distinction must survive
  the mobile card/tab layout — not just the desktop tabbed view.
- Password visibility toggles and the live password-rule checklist
  remain usable and readable on mobile.

## 10. Visual Inspection Checklist

- [ ] Role badges (Requester/IT Staff/Administrator) visually distinct and consistent across all screens
- [ ] Internal Notes panel unmistakably different from Public Comments at every viewport
- [ ] Editable vs read-only field styling consistent with Lab 2 tokens on new Staff/Admin screens
- [ ] Confirmation dialogs appear for every status transition/action marked "Yes" in the Status Transition Matrix
- [ ] Forbidden/redirect behavior never shows a raw JSON error to the user
- [ ] No clipped labels, overlapping messages, or unintended horizontal scrolling on any new screen at any viewport

## 11. Screenshot Paths

- `artifacts/lab-03/screenshots/authentication/` (login + change password, desktop/tablet/mobile)
- `artifacts/lab-03/screenshots/staff-queue/` (desktop/tablet/mobile)
- `artifacts/lab-03/screenshots/staff-ticket-detail/` (desktop/tablet/mobile)
- `artifacts/lab-03/screenshots/user-management/` (desktop/tablet/mobile)
