# Lab 2 UI Specification — Zen Green Theme

## 1. Color Tokens

| Token | Value | Usage |
|---|---|---|
| `--zg-primary` | `#006B3C` | App header background, primary buttons, strong emphasis |
| `--zg-secondary` | `#0B7A46` | Active tabs, focus accents, links, hover states |
| `--zg-pale` | `#EAF6EF` | Selected rows, success backgrounds, subtle section emphasis |
| `--zg-bg` | `#F5F7F6` | Page background |
| `--zg-surface` | `#FFFFFF` | Cards, panels, form containers (with subtle border + restrained shadow) |
| `--zg-text` | `#1F2A24` (dark charcoal-green) | Body text — never pure black |
| `--zg-field-editable-bg` | `#FFFFFF` | Editable field background, clear neutral border |
| `--zg-field-readonly-bg` | `#F1EFE6` (warm ivory) or `#EDF2EF` (gray-green) | Read-only field background |
| `--zg-error` | `#8A1F1F` text / `#C0392B` border | Error text and field border |
| `--zg-warning` | `#B8860B` (amber) | Warning callouts/badges only, not decoration |
| `--zg-success` | `#0B7A46` on `--zg-pale` | Success confirmation, paired with a checkmark icon (not color alone) |

## 2. Typography and Spacing

- Base font size: 16px; line-height 1.5 for body text.
- Headings: app title 24px/bold, section headings 18px/semibold, field labels
  14px/medium.
- Spacing scale: 4px base unit — field gaps 16px, section gaps 32px, card
  padding 24px (desktop), 16px (mobile).
- All interactive targets (buttons, dropdown items) minimum 44x44px touch area
  on mobile per accessibility guidance.

## 3. Field States

| State | Visual Rule |
|---|---|
| Editable | `--zg-field-editable-bg`, 1px neutral gray border (`#C9D2CD`) |
| Read-only | `--zg-field-readonly-bg`, no border highlight on focus (not focusable) |
| Invalid | `--zg-error` border, error message directly below field, red icon optional |
| Disabled | 50% opacity, `cursor: not-allowed`, no hover/focus effects |
| Focused | 2px `--zg-secondary` outline, visible for keyboard navigation (never
  `outline: none` without a replacement) |

Required-field marker: red asterisk (`*`) immediately after the label text.
The asterisk never substitutes for the validation message — both are always
required together per labsheet section 8.3.

## 4. Button Hierarchy

| Type | Style | Example Use |
|---|---|---|
| Primary | Solid `--zg-primary` bg, white text | Submit, Create Ticket, Continue |
| Secondary | White bg, `--zg-secondary` border + text | Cancel, Back |
| Tertiary | Text-only, `--zg-secondary` color, underline on hover | Clear Filters, links |
| Destructive | Solid `--zg-error` bg, white text | Remove Attachment |
| Disabled | Gray bg (`#D8DDD9`), gray text, no hover state | Any button while invalid/loading |
| Busy | Primary style + inline spinner + disabled interaction | Submit while request in flight |

All buttons show visible text; icons (if used) support but never replace text.
Every icon-only control (e.g., a small "x" remove icon) has an
`aria-label`/tooltip.

## 5. Screen States (all screens)

Every data-driven screen (Requester Selection, Create Ticket reference data,
My Tickets, Ticket Detail) must implement:

- **Initial** — screen renders with no data-dependent content flashing.
- **Loading** — skeleton or spinner, no layout shift when data arrives.
- **Validation** — inline field-level messages, form remains editable.
- **Submitting** — busy-state primary button, disabled duplicate submission.
- **Success** — clear confirmation (Ticket Number for Create Ticket).
- **Failure** — safe, non-technical message; retry path available; entered
  data preserved where applicable (Create Ticket).
- **Empty** — "you have no X yet" message + primary action if relevant.
- **No-results** — "no matches for your filters" + Clear Filters action,
  visually distinct from the Empty state.

## 6. Desktop / Tablet / Mobile Layout Rules

| Viewport | Rule |
|---|---|
| Desktop >=992px | Multi-column layout; content centered, max-width ~1140px; My Tickets renders as a table |
| Tablet 768-991px | Two-column layout where practical; Summary/Description retain full width |
| Mobile <768px | All fields stack in a single column; buttons full-width or touch-sized; My Tickets renders as stacked cards, not a horizontally-scrolled table |
| All sizes | No clipped labels, no overlapping validation messages, no hidden buttons, no unreadable attachment file names (truncate with ellipsis + full name on hover/tap) |

## 7. Accessibility

- All form controls have associated `<label>` elements (not placeholder-only).
- Tab order follows visual reading order.
- Focus outlines are never removed without a visible replacement.
- Status/priority badges use both color and text/icon (not color alone) so
  colorblind users can distinguish them.
- Error messages are associated with their field via `aria-describedby`.

## 8. Application Shell

- Header: `--zg-primary` background, "TokTickIT" title (left), My Tickets /
  Create Ticket nav (center), current Requester name + "Change Requester" +
  Profile-style menu (right).
- Active nav item: `--zg-secondary` underline or pill background.
- Mobile: header collapses to a hamburger menu below 768px; Requester name
  and Change Requester remain reachable within the menu.

## 9. Screen-Specific Layouts

### 9.1 Development Requester Selection
- Centered card on `--zg-bg`, max-width ~480px.
- Icon, "Select Development Requester" heading, explanatory text (testing-only
  disclaimer), dropdown, info callout ("Only active development requesters are
  shown"), secondary note about Lab 3 authentication, Cancel + Continue
  buttons.
- Loading: dropdown shows a disabled "Loading requesters..." placeholder.
- Empty: message + guidance to contact instructor/seed data if zero active
  Requesters exist.
- Failure: safe error message + Retry action.

### 9.2 Create Ticket
- System-generated/read-only fields (Ticket Number placeholder, Ticket Date)
  grouped near the top with read-only styling.
- Classification fields (Category, Related System, Requested Priority)
  grouped together, dropdowns.
- Summary: single-line input, full width, character counter near max length.
- Description: multiline textarea, resizable vertically only, full width,
  character counter.
- Attachments: drag-and-drop or file-picker zone below main fields; shows
  selected files with remove-before-submit option; inline errors for
  rejected files (type/size).
- Primary action (Submit) + secondary action (Cancel) at the bottom,
  right-aligned on desktop, full-width stacked on mobile.
- Success view: replaces or overlays the form with the generated Ticket
  Number and a "View Ticket" / "Create Another" action pair.

### 9.3 My Tickets
- Header: "My Tickets" title, short description, "Create Ticket" primary
  button (top-right on desktop, full-width on mobile), "Clear Filters"
  tertiary action.
- Search bar (ticket number / summary) full-width on mobile, fixed width on
  desktop.
- Filter row: Category, Requested Priority, IT Priority, Current Status
  dropdowns — wrap to multiple rows on smaller viewports.
- Desktop: table with sortable column headers (Ticket No., Created Date,
  Summary, Category, Requested Priority, IT Priority, Current Status,
  Last Updated); sort indicator arrow on active column.
- Mobile: each Ticket renders as a card showing Ticket No., Summary, Status
  badge, and Created Date; tapping opens Ticket Detail.
- Pagination: Previous/Next + page numbers, centered below the list;
  "Showing X to Y of Z tickets" label.
- Empty state: illustration/icon + "You haven't created any tickets yet" +
  Create Ticket button.
- No-results state: "No tickets match your filters" + Clear Filters button.

### 9.4 Requester Ticket Detail
- Read-only header section: Ticket No., Ticket Date, Category, Related
  System, Requester, Requested Priority, IT Priority (badge, shows
  "Not yet assigned" if null), Current Status (badge), Summary, Description.
- Attachments section, visually separated (card or bordered panel) below the
  header: list of attachments with filename, size, upload date, and
  active/removed state; download icon (disabled + grayed for removed);
  remove icon (active attachments only) opening a confirmation with a
  required removal-reason field; "Add Attachment" control respecting the
  5-file/5MB/type limits.
- No Public Comments, Internal Notes, Actions Taken, or status-change
  controls appear anywhere on this screen (explicitly out of scope).

## 10. Badge Rules

| Badge Type | Values | Style |
|---|---|---|
| Requested Priority | LOW / MEDIUM / HIGH | Low: gray-green pill; Medium: amber pill; High: red-toned pill (paired with text label, not color alone) |
| IT Priority | LOW / MEDIUM / HIGH / (unset) | Same as above; unset shows a neutral "—" or "Not yet assigned" pill |
| Current Status | New (Lab 2 only) | `--zg-pale` background, `--zg-secondary` text |

## 11. Visual Inspection Checklist (to complete during Issue 6)

- [ ] Color tokens applied consistently (no ad-hoc hex values in components)
- [ ] Editable vs read-only fields visually distinguishable at a glance
- [ ] Every required field shows both an asterisk and, when invalid, a message
- [ ] Button hierarchy consistent across all three screens
- [ ] No clipped labels, overlapping messages, or hidden buttons at any
      viewport
- [ ] No unintended horizontal scrolling on mobile
- [ ] Desktop table vs mobile card representation both usable for My Tickets
- [ ] Badges legible and distinguishable without relying on color alone

## 12. Screenshot Paths

- `artifacts/lab-02/screenshots/create-ticket/` (desktop, tablet, mobile ×
  initial/validation/success/failure states)
- `artifacts/lab-02/screenshots/my-tickets/` (desktop, tablet, mobile ×
  populated/empty/no-results states)
- `artifacts/lab-02/screenshots/ticket-detail/` (desktop, tablet, mobile ×
  with attachments)
