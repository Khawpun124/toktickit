# Lab 4 Sprint Engineering Specification

## 1. Sprint Goal

Complete the core TokTickIT service-desk workflow. IT Staff and Administrators
record the real work done on a Ticket as Actions Taken (a child list under the
Ticket), the backend enforces the final Ticket status rules including a
resolution gate that blocks Resolved while work is unfinished, and each role
gets a concise dashboard that links to the detailed screens. Everything built
in Labs 1 to 3 keeps working, and the whole application is hardened, accessible,
responsive, and consistent under the Zen Green design language.

## 2. Stakeholder Request Interpretation

The service desk can already receive Tickets and communicate through comments
and notes, but it cannot plan or track the actual work. IT Staff need an
Actions Taken list under each Ticket where every line says when something was
done, what was done, what the result was, who did it, whether follow-up is
needed (and what), and where to look for related files. The Ticket Owner stays
responsible for the Ticket as a whole, but other IT Staff may do and record
actions. Requesters can see this work but cannot change it, and their
"problem appears resolved" signal stays advisory: only IT Staff formally
resolve a Ticket, and the system must refuse to resolve one while actions are
still unfinished, even if someone calls the API directly. Requesters and IT
Staff each get a short dashboard of counts and recent items, every card linking
to the existing detailed list. Finally the product is polished and hardened so
it can be demonstrated end to end.

## 3. Scope

### Included
- Actions Taken: create, edit, assign, status changes (start, complete, cancel), list
- Final Ticket status-transition matrix and the resolution gate, enforced by the backend
- Cancellation cascade for unfinished Actions Taken
- Stale-update detection (optimistic concurrency) and safe duplicate-create handling
- Requester dashboard and IT Staff dashboard (Administrator reuses the IT Staff dashboard plus user counts)
- Role-appropriate navigation with a Dashboard entry and active-page indication
- Prisma migration (additive), backfill, and seed extensions
- Final hardening: regression of Labs 1-3, accessibility, consistent feedback states,
  removal of obsolete UI, console and link cleanliness, README, readiness endpoint
- Unit, API, UI, UI style, responsive, authorization, workflow, migration/regression,
  performance-smoke, and end-to-end tests

### Excluded
- Automatic SLA clocks, escalation, on-call scheduling, breach notifications
- Email, SMS, LINE, push, or any external notification service
- Inventory, spare parts, purchasing, cost accounting
- Time-sheet billing, payroll, labor-cost calculation
- Multi-level approvals and electronic signatures
- Advanced BI, custom report builders, export warehouses
- Multi-tenant organizations and production-scale cloud operations
- Deleting Actions Taken, uploading files directly to an Action Taken (it holds
  only free-text Attachment Notes; real files stay on the Ticket's Attachments)
- Requester-created or Requester-edited Actions Taken
- Editing or deleting Public Comments and Internal Notes (still append-only)
- A separate audit-history screen
- Any feature not listed under Included

### Preservation of earlier increments
- No Lab 1-3 endpoint is removed or renamed. Existing request shapes stay valid;
  responses only gain additive fields (`version`, `resolvedAt`, `openActionsCount`).
- All Lab 1-3 automated tests must pass unmodified. If a Lab 4 change forces an
  edit to an old test, it must be justified in the PR and may not weaken any assertion.
- The navigation label "Admin / User Management" is kept as is so existing
  tests and screens still find it.
- The migration is additive only (new table, new columns with defaults); nothing
  from Labs 1-3 is dropped or rewritten.

## 4. Functional Requirements

- FR-01: IT Staff and Administrators shall create an Action Taken under a Ticket.
- FR-02: IT Staff and Administrators shall edit an Action Taken's description, result,
  action date/time, assignee, follow-up fields, and attachment notes while it is not terminal.
- FR-03: IT Staff and Administrators shall change an Action Taken's status
  (start, complete, cancel) according to the Action status matrix.
- FR-04: The system shall list a Ticket's Actions Taken in a stable order.
  IT Staff and Administrators see any Ticket's list; a Requester sees only the
  list of their own Ticket, read-only.
- FR-05: The system shall record "Performed by" automatically from the authenticated session.
- FR-06: The system shall let an Action Taken be assigned only to an active IT Staff
  or Administrator and reject inactive or non-staff assignees.
- FR-07: The system shall require a Follow-up Note when Follow-Up Required is true.
- FR-08: The system shall enforce the final Ticket status-transition matrix on the backend.
- FR-09: The system shall enforce the resolution gate on the backend.
- FR-10: The system shall cancel all unfinished Actions Taken when a Ticket is cancelled.
- FR-11: The system shall detect stale updates through an expected-version check
  and answer 409 without overwriting newer data.
- FR-12: The system shall make Action Taken creation safe against repeated clicks
  and network retries.
- FR-13: Requesters shall have a dashboard summarizing only their own Tickets.
- FR-14: IT Staff and Administrators shall have a dashboard of operational metrics
  and recent or urgent items; Administrators additionally see concise user counts.
- FR-15: Every actionable dashboard card or row shall open the matching filtered
  list or Ticket Detail.
- FR-16: Navigation shall show a Dashboard entry per role with a clear active-page
  indication, and each role shall land on its Dashboard after login.
- FR-17: The Staff and Requester Ticket Detail screens shall show Actions Taken;
  the Staff screen shall offer only permitted status transitions and refresh the
  Ticket summary after a successful change.
- FR-18: All screens shall show consistent loading, validation, success, empty,
  no-results, forbidden, conflict, not-found, and safe-failure feedback.
- FR-19: Important forms shall keep entered data after recoverable failures and
  shall prevent duplicate submission while a request is in flight.
- FR-20: The application shall meet the accessibility rules in section 6.
- FR-21: Temporary, duplicate, obsolete, or inconsistent UI from earlier labs,
  console errors, broken links, and placeholder text shall be removed.
- FR-22: A readiness endpoint shall report database connectivity.
- FR-23: README, seed, migration, test, and demonstration instructions shall be current.
- FR-24: All Lab 1-3 behavior shall continue to work.

## 5. Business Rules

### Actions Taken structure and ownership
- BR-01: An Action Taken belongs to exactly one Ticket. `ticketId` is required and immutable.
- BR-02: The Ticket Owner coordinates the Ticket, but any active IT Staff or
  Administrator may create and update Actions Taken on any Ticket, whether or not
  they are the owner and whether or not the Ticket has an owner.
- BR-03: "Performed by" is the authenticated creator, set by the server at creation
  and immutable. A `performedBy` value sent by the client is ignored.
- BR-04: Each Action Taken has an assignee: the active IT Staff or Administrator
  expected to carry it out. It defaults to the creator and may be changed while the
  Action is not terminal. An inactive user, a Requester, or an unknown user is
  rejected with a field-level 400 error.
- BR-05: `actionAt` is the date and time of the action. It defaults to the server's
  current time. For status IN_PROGRESS or COMPLETED it may not be more than 5 minutes
  in the future; for PLANNED it may be at most 30 days in the future.
- BR-06: `createdAt`, `updatedAt`, and `version` are system-generated and cannot be set by the client.
- BR-07: Action Description is required, trimmed, 5 to 1000 characters.
- BR-08: Result is optional while the Action is PLANNED or IN_PROGRESS, and required
  (trimmed, 5 to 1000 characters) to complete or cancel it. For CANCELLED the Result
  holds the cancellation reason.
- BR-09: Follow-Up Required defaults to false. When true, Follow-up Note is required
  (trimmed, 5 to 500 characters). When false the server stores no Follow-up Note.
- BR-10: Attachment Notes is optional free text up to 500 characters describing which
  file to look for (for example a screenshot). It is not a file upload and not a link.

### Actions Taken status and lifecycle
- BR-11: Action statuses are PLANNED, IN_PROGRESS, COMPLETED, CANCELLED. Allowed
  transitions: PLANNED to IN_PROGRESS, PLANNED to COMPLETED, PLANNED to CANCELLED,
  IN_PROGRESS to COMPLETED, IN_PROGRESS to CANCELLED. COMPLETED and CANCELLED are
  terminal: every field becomes read-only and any edit returns 409. An Action may be
  created as PLANNED (the default), IN_PROGRESS, or COMPLETED, so staff can record work
  that is already done in one step (a COMPLETED Action needs a Result); it can never be
  created as CANCELLED.
- BR-12: Actions Taken are append-only: there is no delete operation. The list is
  ordered by `createdAt` ascending with `id` ascending as the tiebreaker, so the
  order never changes when an Action is edited.
- BR-13: An Action Taken can be created only while the Ticket is NEW, OPEN, IN_PROGRESS,
  WAITING_FOR_REQUESTER, or REOPENED. Otherwise the API returns 409
  `TICKET_NOT_ACCEPTING_ACTIONS`.
- BR-14: Invariant: no PLANNED or IN_PROGRESS Action Taken may exist on a Ticket that is
  RESOLVED, CLOSED, or CANCELLED. BR-13, BR-17, and BR-18 together maintain it.
- BR-15: Visibility: a Requester sees every Action Taken of their own Ticket with all
  fields, read-only. The UI labels the section as visible to the Requester so staff
  do not put private information in it (private information belongs in Internal Notes).

### Ticket workflow and resolution
- BR-16: The Ticket statuses stay New, Open, In Progress, Waiting for Requester,
  Resolved, Closed, Reopened, Cancelled. The final matrix is the Lab 3 matrix,
  unchanged, with the gate in BR-17 added. Only IT Staff and Administrators perform
  transitions. Cancelled is terminal. A transition not listed is rejected with 400
  naming the current and requested status.

| From | To | Permitted Roles | Confirmation in UI | Resolution gate |
|---|---|---|---|---|
| New | Open | IT Staff, Administrator | No | - |
| New | Cancelled | IT Staff, Administrator | Yes | cascade (BR-18) |
| Open | In Progress | IT Staff, Administrator | No | - |
| Open | Cancelled | IT Staff, Administrator | Yes | cascade (BR-18) |
| In Progress | Waiting for Requester | IT Staff, Administrator | No | - |
| In Progress | Resolved | IT Staff, Administrator | Yes | applies |
| In Progress | Cancelled | IT Staff, Administrator | Yes | cascade (BR-18) |
| Waiting for Requester | In Progress | IT Staff, Administrator | No | - |
| Waiting for Requester | Resolved | IT Staff, Administrator | Yes | applies |
| Waiting for Requester | Cancelled | IT Staff, Administrator | Yes | cascade (BR-18) |
| Resolved | Closed | IT Staff, Administrator | No | - |
| Resolved | Reopened | IT Staff, Administrator | No | - |
| Closed | Reopened | IT Staff, Administrator | Yes | - |
| Reopened | Open | IT Staff, Administrator | No | - |

- BR-17: Resolution gate. A transition to RESOLVED is rejected with 409
  `OPEN_ACTIONS_BLOCK_RESOLUTION` (including the number of blocking Actions) while any
  Action Taken of that Ticket is PLANNED or IN_PROGRESS. The check runs on the backend
  inside the same transaction that holds a lock on the Ticket row, so it cannot be
  bypassed by calling the API directly or by racing an Action creation. There is no
  minimum number of Actions: a Ticket with zero Actions can be resolved.
- BR-18: Cancelling a Ticket cancels, in the same transaction, every PLANNED or
  IN_PROGRESS Action Taken, setting Result to "Cancelled automatically because the
  Ticket was cancelled." and incrementing their versions.
- BR-19: Transition to RESOLVED sets `resolvedAt` to the current time. Transition to
  REOPENED clears `resolvedAt` and resets `problemAppearsResolved` to false.
- BR-20: The Requester's "problem appears resolved" flag stays advisory. It never changes
  the Ticket status and never bypasses or influences the gate.
- BR-21: The status transition is validated against the persisted current status inside
  the transaction. A "from" status claimed by the client is never trusted.

### Concurrency and duplicates
- BR-22: Tickets and Actions Taken have an integer `version`, starting at 1 and incremented
  by every successful update through an atomic compare-and-set. If the client sends
  `expectedVersion` and it differs from the stored version, the API returns 409
  `STALE_VERSION` with the current state and changes nothing.
- BR-23: `expectedVersion` is required (400 if missing) on every Action Taken update. On the
  existing Ticket owner, priority, and status endpoints it is optional so Lab 3 clients and
  tests keep working, but it is enforced whenever supplied, and the Lab 4 UI always sends it.
- BR-24: Action Taken creation accepts an optional `clientRequestId` (UUID). A second
  request with the same id from the same user returns the original Action with 200
  instead of creating another; the first request returns 201. The UI always sends one
  and also disables the submit control while a request is in flight.

### Authorization (additions for Lab 4)

| Operation | Requester | IT Staff | Administrator |
|---|---|---|---|
| List Actions Taken of a Ticket | Own Ticket only; other Ticket gives 404 | Any Ticket | Any Ticket |
| Create Action Taken | 403 | Yes | Yes |
| Edit Action Taken fields | 403 | Yes | Yes |
| Change Action Taken status | 403 | Yes | Yes |
| Delete Action Taken | Not available | Not available | Not available |
| Change Ticket status | 403 | Yes | Yes |
| Requester dashboard | Yes | 403 | 403 |
| Staff dashboard | 403 | Yes | Yes (plus user counts) |

- BR-25: Every operation above is enforced by the backend. Hiding or disabling a control
  in the UI is feedback only, never the security boundary.

### Dashboards
- BR-26: Dashboard figures are calculated by the backend from the database at request
  time. The client never computes metrics, and nothing is cached.
- BR-27: "Active" statuses are NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED.
  RESOLVED, CLOSED, and CANCELLED are not active.
- BR-28: Time windows are rolling and evaluated in UTC (for example "last 30 days" means
  now minus 30 times 24 hours). There are no calendar-day metrics, so day boundaries and
  time zones cannot change a count. The UI shows timestamps in the browser's time zone.
- BR-29: List sizes are at most 5, with `id` descending as the tiebreaker.
- BR-30: Requester dashboard data comes only from the authenticated user's Tickets. Any
  user id sent by the client is ignored.
- BR-31: A card's number must equal the total of the list it links to. This is tested.
- BR-32: A metric with no matching records shows 0 and still links to its filtered list,
  which then shows the normal no-results state. A list with no rows shows an empty message.

Requester dashboard

| Item | Definition (own Tickets only) | Drill-down |
|---|---|---|
| Open | status in NEW, OPEN, IN_PROGRESS, REOPENED | `/tickets?currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED` |
| Waiting for you | status WAITING_FOR_REQUESTER | `/tickets?currentStatus=WAITING_FOR_REQUESTER` |
| Resolved | status RESOLVED | `/tickets?currentStatus=RESOLVED` |
| Closed | status CLOSED | `/tickets?currentStatus=CLOSED` |
| Needs your attention (list) | up to 5 WAITING_FOR_REQUESTER, oldest `updatedAt` first | `/tickets/:id` per row |
| Recently updated (list) | up to 5, any status, newest `updatedAt` first | `/tickets/:id` per row |
| Recently resolved (list) | up to 5 RESOLVED or CLOSED with `resolvedAt` in the last 30 days, newest first | `/tickets/:id` per row |

IT Staff / Administrator dashboard

| Item | Definition (all Tickets unless stated) | Drill-down |
|---|---|---|
| Unassigned | no owner and active status | `/staff/tickets?ticketOwnerId=unassigned&currentStatus=<active list>` |
| My Assigned | owner is me and active status | `/staff/tickets?ticketOwnerId=<my id>&currentStatus=<active list>` |
| New | status NEW | `/staff/tickets?currentStatus=NEW` |
| In Progress | status IN_PROGRESS | `/staff/tickets?currentStatus=IN_PROGRESS` |
| Waiting for Requester | status WAITING_FOR_REQUESTER | `/staff/tickets?currentStatus=WAITING_FOR_REQUESTER` |
| High IT Priority | IT Priority HIGH and active status | `/staff/tickets?itPriority=HIGH&currentStatus=<active list>` |
| My recent Tickets (list) | up to 5 owned by me, newest `updatedAt` first | `/staff/tickets/:id` per row |
| My open Actions (list) | up to 5 Actions assigned to me with status PLANNED or IN_PROGRESS, earliest `actionAt` first | `/staff/tickets/:ticketId` per row |
| Urgent Tickets (list) | up to 5 active Tickets with IT Priority HIGH, oldest `updatedAt` first | `/staff/tickets/:id` per row |
| User counts (Administrator only) | number of active and inactive users | `/admin/users` |

### Hardening and regression
- BR-33: Error responses use `{ "error": "<safe message>", "code": "<MACHINE_CODE>" }` (code
  where one is defined). 5xx responses never expose stack traces, SQL, or file paths.
- BR-34: After a recoverable failure (validation, 409, network, 5xx) the form keeps the
  entered values. They are cleared only after success.
- BR-35: Modal dialogs trap focus, can be closed with Escape, and return focus to the
  control that opened them. Every control has a label, focus is always visible, and
  status, priority, and role are never conveyed by color alone.
- BR-36: No placeholder text, unfinished controls, or obsolete or duplicate UI may remain,
  and the primary flows produce no console errors and no broken links.
- BR-37: `GET /api/health` is unchanged. `GET /api/health/ready` checks the database and
  returns 200 `{ "status": "ready" }` or 503 `{ "status": "unavailable" }`.
- BR-38: The seed is idempotent (safe to run repeatedly) and documents its development
  credentials. It contains no real secrets.

## 6. UI Specification Summary

See `docs/lab-04/ui-spec.md` for the full specification. Summary:
- Navigation: each role gets a Dashboard entry with an active-page indicator.
  Requester: Dashboard, My Tickets, Create Ticket. IT Staff: Dashboard, My Queue,
  Create Ticket. Administrator: Dashboard, My Queue, Admin / User Management.
  Each role lands on its Dashboard after login (and after the mandatory password change).
- Requester Dashboard: four metric cards (Open, Waiting for you, Resolved, Closed)
  with View all links, and lists for Needs your attention, Recently updated, and
  Recently resolved, plus quick actions. No duplication of the My Tickets table.
- IT Staff Dashboard: six metric cards (Unassigned, My Assigned, New, In Progress,
  Waiting for Requester, High IT Priority), lists for My recent Tickets, My open
  Actions, and Urgent Tickets, and quick actions. Administrators also see a
  user-counts card. A Refresh control re-fetches the data.
- Actions Taken on Staff Ticket Detail: a section between Ticket Operations and the
  tabs, shown as a table on desktop and cards on mobile, with create and edit in an
  accessible modal. Status shows as a text badge. Terminal Actions are read-only.
  Conflict (409) shows a readable message with a reload action, never raw JSON.
- Actions Taken on Requester Ticket Detail: the same list, read-only, no create or edit
  controls rendered at all.
- Ticket workflow feedback: the status control lists only permitted transitions,
  confirmation dialogs follow the matrix, a gate block explains how many Actions are
  still open, and a successful change refreshes the Ticket summary status.
- Every metric card is a labeled link (value, label, accessible name) that is
  keyboard operable.
- Loading, empty, no-results, forbidden (redirect with notification), conflict,
  not-found, and safe-failure states follow the Lab 2 and Lab 3 conventions.
- Responsive rules, tokens, badges, and focus styles are inherited from Labs 2 and 3.

## 7. Data Changes

Additive Prisma migration. Nothing from Labs 1-3 is dropped or rewritten.

- New enum `ActionStatus`: PLANNED, IN_PROGRESS, COMPLETED, CANCELLED.
- New model `ActionTaken`:
  - `id` Int, primary key
  - `ticketId` Int, FK to Ticket, on delete restrict
  - `actionAt` DateTime
  - `description` String
  - `result` String, nullable
  - `performedById` Int, FK to User
  - `assigneeId` Int, FK to User
  - `status` ActionStatus, default PLANNED
  - `followUpRequired` Boolean, default false
  - `followUpNote` String, nullable
  - `attachmentNotes` String, nullable
  - `clientRequestId` String, nullable, unique together with `performedById`
  - `version` Int, default 1
  - `createdAt`, `updatedAt` DateTime
- Ticket gains `version` Int default 1 and `resolvedAt` DateTime nullable.
- Indexes:
  - ActionTaken `(ticketId, createdAt, id)` for the ordered list
  - ActionTaken `(ticketId, status)` for the resolution gate count
  - ActionTaken `(assigneeId, status)` for "My open Actions"
  - Ticket `(requesterId, currentStatus)`, `(ticketOwnerId, currentStatus)`, and
    `(currentStatus)` for dashboard counts and drill-down lists

Migration and backfill
- Steps, in one migration: create the enum and table, add the Ticket columns with
  defaults, then backfill `resolvedAt = updatedAt` for Tickets that are RESOLVED or CLOSED
  (the best available approximation of the resolution time). The backfill is plain,
  deterministic SQL with no secrets and no password hashes.
- Legacy Tickets without Actions Taken are valid: they show the empty Actions state,
  can be resolved (BR-17 has no minimum), and are counted normally by dashboards.
  All existing Users, Tickets, Attachments, Public Comments, and Internal Notes remain valid.
- Recovery: take a `pg_dump` before applying. A documented manual rollback script drops
  the new table, enum, and columns. The migration, the backfill, and the rollback are
  tested by a script that simulates a Lab 3 database that already contains data
  (not a fresh install) and prints a before and after comparison.

Seed
- Idempotent. Tickets cover every status, all priorities, and both owned and unowned
  cases. There are Tickets with zero, one, and several Actions Taken in different
  statuses (including one with a follow-up). There is a Requester with no Tickets (to
  demonstrate zero metrics) and one with many. Dedicated users exist for each Lab 4
  end-to-end spec so they do not share state with Lab 2 or Lab 3 specs. Development
  credentials are documented in the README.

Database design decisions
1. Separate `ActionTaken` table instead of a JSON column on Ticket. Dashboards and the
   gate need to count and filter Actions by status and assignee, foreign keys keep each
   Action tied to a real Ticket and real Users, and each Action gets its own version.
2. Integer `version` compare-and-set instead of comparing `updatedAt`. Timestamps can
   collide or lose precision, while a counter is exact and can be updated atomically in a
   single `UPDATE ... WHERE id = ? AND version = ?`.
3. Row lock on the Ticket for gate-sensitive operations. Creating an Action and resolving
   the Ticket both lock the same Ticket row inside a transaction, so exactly one of two
   racing requests wins consistently and BR-14 can never be violated.
4. Idempotency key (`clientRequestId`, unique per creator) instead of time-window
   duplicate detection, which would be fragile and could reject legitimate similar actions.
5. Foreign keys use restrict on delete and there is no delete endpoint, so the work
   record cannot disappear silently.

## 8. API Contract

See `docs/lab-04/api-spec.md` for full request and response shapes.

| Method | Path | Purpose | Roles |
|---|---|---|---|
| GET | /api/tickets/:id/actions | List Actions Taken in stable order | Requester (own), IT Staff, Administrator |
| POST | /api/staff/tickets/:id/actions | Create an Action Taken | IT Staff, Administrator |
| PATCH | /api/staff/actions/:actionId | Edit fields (`expectedVersion` required) | IT Staff, Administrator |
| PATCH | /api/staff/actions/:actionId/status | Change Action status (`expectedVersion` required) | IT Staff, Administrator |
| PATCH | /api/staff/tickets/:id/status | Existing; now applies the gate and optional `expectedVersion` | IT Staff, Administrator |
| PATCH | /api/staff/tickets/:id/owner | Existing; optional `expectedVersion` | IT Staff, Administrator |
| PATCH | /api/staff/tickets/:id/priority | Existing; optional `expectedVersion` | IT Staff, Administrator |
| GET | /api/dashboard/requester | Requester metrics and lists | Requester |
| GET | /api/dashboard/staff | Staff metrics and lists (plus user counts for Administrator) | IT Staff, Administrator |
| GET | /api/health/ready | Database readiness | Public |

Additive changes to existing endpoints
- `GET /api/tickets` and `GET /api/staff/tickets`: `currentStatus` accepts a
  comma-separated list. Every value is validated against the whitelist; an invalid
  value returns 400.
- `GET /api/tickets/:id` and `GET /api/staff/tickets/:id` responses add `version` and
  `resolvedAt`. The Staff response also adds `openActionsCount`.

Status codes: 200 success or idempotent replay, 201 created, 400 validation or
invalid transition, 401 not authenticated, 403 forbidden role, 404 not found or not
owned, 409 conflict (`STALE_VERSION`, `OPEN_ACTIONS_BLOCK_RESOLUTION`,
`TICKET_NOT_ACCEPTING_ACTIONS`, `ACTION_TERMINAL`), 500 unexpected, 503 not ready.

## 9. Acceptance Criteria

- AC-01: Given a permitted IT Staff user and valid data, when an Action Taken is created, then it is saved under the correct Ticket with the authenticated creator as performed-by and the approved assignee.
- AC-02: Given an authenticated Requester, when dashboard data is retrieved, then only metrics and recent Tickets owned by that Requester are returned, even if the client sends another user id.
- AC-03: Given a Requester, when they try to create or edit an Action Taken, then the request is rejected with 403 and nothing is saved.
- AC-04: Given a Requester viewing their own Ticket, when the Actions list loads, then all Actions with all fields are shown read-only with no create or edit controls; given another Requester's Ticket, then the response is 404.
- AC-05: Given Follow-Up Required is true and no note, when the Action is saved, then 400 with a field-level error; given it is false, then any note is discarded.
- AC-06: Given an inactive user or a Requester as assignee, when the Action is saved, then 400 with a field-level error.
- AC-07: Given a request containing a different performed-by, when the Action is created, then the authenticated user is stored instead.
- AC-08: Given an Action in a terminal status, when an edit or status change is sent, then 409 `ACTION_TERMINAL`; given an invalid status pair, then 400.
- AC-09: Given completing or cancelling an Action without a Result, when it is saved, then 400.
- AC-10: Given any Action, when a delete is attempted, then no delete route exists; given an Action is edited, then the list order is unchanged.
- AC-11: Given an update whose `expectedVersion` is stale, when it is sent, then 409 `STALE_VERSION` and the newer data is not overwritten; given `expectedVersion` is missing on an Action update, then 400.
- AC-12: Given two Action create requests with the same `clientRequestId`, when both are sent, then exactly one Action exists and the second returns the original with 200.
- AC-13: Given a Ticket with an unfinished Action, when a Resolved transition is sent directly to the API, then 409 `OPEN_ACTIONS_BLOCK_RESOLUTION` and the status is unchanged.
- AC-14: Given every Action is COMPLETED or CANCELLED, when Resolved is requested from a permitted status, then it succeeds and `resolvedAt` is set.
- AC-15: Given a legacy Ticket with zero Actions, when Resolved is requested, then it succeeds.
- AC-16: Given a Ticket with unfinished Actions, when the Ticket is cancelled, then those Actions become CANCELLED in the same transaction with the automatic Result text.
- AC-17: Given an Action creation and a Resolved transition racing on the same Ticket, when both run, then exactly one consistent outcome results and BR-14 holds.
- AC-18: Given a stale Ticket status update, when it is sent with `expectedVersion`, then 409; given a successful status change in the UI, then the Ticket summary status refreshes.
- AC-19: Given a Requester marked the problem as appears resolved, when the Ticket has unfinished Actions, then the status does not change and the gate still blocks Resolved; given the Ticket is reopened, then the flag resets.
- AC-20: Given seeded data, when the IT Staff dashboard is retrieved, then every metric equals the result of its defined database query.
- AC-21: Given any dashboard card, when its drill-down link is followed, then the list total equals the card number.
- AC-22: Given a Requester calling the staff dashboard, or Staff calling the Requester dashboard, then 403.
- AC-23: Given a Requester with no Tickets, when the dashboard loads, then all counts are 0 and each list shows its empty message.
- AC-24: Given an Administrator, when the staff dashboard loads, then user counts are included; given IT Staff, then they are absent.
- AC-25: Given a Lab 3 database that already contains data, when the Lab 4 migration runs, then all Tickets, Comments, Notes, and Attachments are preserved, `version` is 1, `resolvedAt` is backfilled for Resolved and Closed Tickets, and no Actions exist.
- AC-26: Given the full Lab 1-3 test suites, when they run unmodified after Lab 4, then they all pass.
- AC-27: Given the seed runs twice, then no duplicates appear, and the data covers every status and Tickets with 0, 1, and many Actions.
- AC-28: Given a conflict, network failure, or validation error on a form, then the entered values remain; given a double click on submit, then only one request is made.
- AC-29: Given a modal opens, then focus moves into it, is trapped, Escape closes it, and focus returns to the opener; all controls are keyboard operable and status or priority is shown with text as well as color.
- AC-30: Given the Dashboard and Actions Taken screens at desktop, tablet, and mobile widths, then there is no clipping, overlap, or horizontal page scrolling.
- AC-31: Given the database is reachable, then `GET /api/health/ready` returns 200; given it is not, then 503; `GET /api/health` is unchanged.
- AC-32: Given 500 seeded Tickets and their Actions, when the dashboards and Actions list are requested, then each responds within the smoke threshold of 1 second.
- AC-33: Given the primary flows of every role, when they run end to end, then there are no console errors and no broken links.

## 10. Definition of Done

Product completion
- FR-01 to FR-24 are implemented and demonstrable.
- AC-01 to AC-33 each pass with a linked automated test.
- All Lab 1-4 tests pass on a fresh database, repeated several times with no flaky result,
  on `main` and in CI (server, client, and end-to-end jobs all green).
- The migration was proven with a simulated Lab 3 database containing data, including a
  before and after comparison and the documented rollback.
- Authorization, the resolution gate, and concurrency are verified by direct API tests,
  not only through the UI.
- Visual and accessibility checklists are completed against real screenshots at three viewports.
- No console errors, broken links, placeholder text, or obsolete UI remain.
- README covers setup, Docker, migration and upgrade, seed credentials, tests, and demo steps.
- `git status` is clean: no cookies, test-results, overwritten screenshots, or temp files committed.

Course delivery
- GitHub Issues cover the sprint and reach Done.
- Every feature branch merged into `lab4-staging` through a peer-reviewed Pull Request.
- One release Pull Request from `lab4-staging` to `main`, with all commits already on
  `lab4-staging` before merging.
- `reviewer.md` and `ai-use.md` are completed with real evidence.
- The PDF follows the Answer Part 1 to Part 9 format.

## 11. Assumptions and Decisions

The labsheet leaves these open. They are decisions to review before implementation.

1. Action Taken has an assignee and its own status, because Part 6 of the report and AC-01
   mention assigning, completing, cancelling, an approved assignee, and inactive-assignee
   rejection, while the stakeholder text lists only seven data fields. "Performed by (auto)"
   is the creator; the assignee is who is expected to do the work and defaults to the creator.
2. "Unfinished" means PLANNED or IN_PROGRESS. A COMPLETED Action marked as needing
   follow-up does not block resolution; the follow-up is meant to be captured as a new Action.
   There is no minimum number of Actions, so legacy Tickets stay resolvable.
3. Cancelling a Ticket automatically cancels its unfinished Actions, to keep related
   records consistent.
4. `expectedVersion` is required for new Action endpoints but optional on the existing
   Lab 3 Ticket endpoints, so Lab 3 clients and tests keep working. It can become required
   in a later release.
5. Dashboards use rolling UTC windows and no calendar-day metrics, which avoids time-zone
   and day-boundary ambiguity.
6. All Action Taken fields are visible to the Requester (labsheet 8.3). The UI warns staff,
   and private information belongs in Internal Notes.
7. Idempotent creation uses a client-supplied `clientRequestId`, chosen over time-window
   duplicate detection.
8. The Administrator navigation gains Dashboard and My Queue next to Admin / User
   Management, because the Administrator performs IT Staff behavior; the existing label
   is preserved.
9. The `currentStatus` list filter on two existing endpoints is extended additively so
   dashboard cards with several statuses can link to a filtered list.
10. Performance is a smoke check (1 second at 500 Tickets in CI), not a service-level target.
