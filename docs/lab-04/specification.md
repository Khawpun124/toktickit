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
- BR-08: Result is optional while the Action is PLANNED or IN_PROGRESS. It is required (trimmed, 5 to 1000 characters) when an Action is created as COMPLETED and when an Action is moved to COMPLETED or CANCELLED. For CANCELLED the Result holds the cancellation reason. The create case depends only on the request body, so it is a 400 on the `result` field before any state check.
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
- BR-28: Dashboard time handling is fixed so the backend and the UI always agree.
  1. Timestamps are stored and compared in UTC. At the start of each dashboard request the
     server captures one instant, `generatedAt`, and uses that single value for every
     calculation in the request. It is passed to the database as a bound parameter. SQL
     `NOW()`, `CURRENT_DATE`, and the server or database time zone are never used, so the
     process time zone cannot change a result.
  2. The only time window is "Recently resolved". `recentlyResolvedSince` is `generatedAt`
     minus 30 x 24 hours (exactly 2,592,000,000 ms). A Ticket is inside the window when
     `recentlyResolvedSince <= resolvedAt <= generatedAt`, both ends inclusive. A resolved time
     exactly 30 days earlier is included; one millisecond older is excluded.
  3. There are no calendar-day metrics (no "today" or "this week"), so day boundaries and time
     zones cannot change a count.
  4. The API returns `generatedAt` and `recentlyResolvedSince` as ISO-8601 UTC strings. The UI
     never recomputes a window or re-filters data; it only formats timestamps in the browser's
     time zone for display. Changing the browser time zone changes how times are shown, never
     which items or counts appear.
- BR-29: List sizes are at most 5. Every list has a stated primary order, and ties break by `id` in the same direction as that order (newest-first lists: `id` descending; oldest-first or earliest-first lists: `id` ascending), so the order is always deterministic.
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
| Needs your attention (list) | up to 5 WAITING_FOR_REQUESTER, longest waiting first: `statusChangedAt` ascending, then `id` ascending (BR-39) | `/tickets/:id` per row |
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
| Urgent Tickets (list) | up to 5 active Tickets with IT Priority HIGH, least recently updated first (`updatedAt` ascending, then `id` ascending), so urgent Tickets nobody has touched come first | `/staff/tickets/:id` per row |
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

### Waiting time for the Requester
- BR-39: The time a Ticket has waited is measured from `statusChangedAt`, the instant of its
  most recent status transition. It is set when the Ticket is created and on every status
  transition, and by nothing else: comments, owner, IT Priority, Action Taken changes, and other
  edits do not change it, so a later edit never makes a Ticket look like it has waited less. A
  Ticket that leaves WAITING_FOR_REQUESTER and returns starts a new wait from the new entry. For
  Tickets that existed before Lab 4 it is backfilled with `updatedAt`, the best available
  approximation (the true time was never recorded). "Needs your attention" is ordered by this
  value, longest waiting first.

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
  accessible modal. Status shows as a text badge and changes only through separate status buttons (Start, Mark completed, Cancel action), never through Save. Terminal Actions are read-only.
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
- Ticket gains `version` Int default 1, `resolvedAt` DateTime nullable, and `statusChangedAt` DateTime (required, default now; BR-39).
- Indexes:
  - ActionTaken `(ticketId, createdAt, id)` for the ordered list
  - ActionTaken `(ticketId, status)` for the resolution gate count
  - ActionTaken `(assigneeId, status)` for "My open Actions"
  - Ticket `(requesterId, currentStatus)`, `(ticketOwnerId, currentStatus)`, and
    `(currentStatus)` for dashboard counts and drill-down lists

Migration and backfill

Migration structure
- One Prisma migration folder, `server/prisma/migrations/<timestamp>_add_actions_taken_and_workflow_fields/`,
  with a hand-checked `migration.sql` wrapped in `BEGIN; ... COMMIT;` so it is all-or-nothing.
- Statements can be repeated safely: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, and the enum is created inside a `DO` block that checks `pg_type` first.
- Order inside the transaction: (1) create the enum, the table, its foreign keys and indexes;
  (2) add `Ticket.version` (NOT NULL DEFAULT 1), `Ticket.resolvedAt` (nullable), and `Ticket.statusChangedAt` (added as nullable first); (3) add the Ticket indexes; (4) backfill, then give `statusChangedAt` its default and make it NOT NULL.
- Backfill (deterministic, idempotent, no secrets, no password hashes):

```sql
UPDATE "Ticket" SET "resolvedAt" = "updatedAt"
WHERE "currentStatus" IN ('RESOLVED', 'CLOSED') AND "resolvedAt" IS NULL;

UPDATE "Ticket" SET "statusChangedAt" = "updatedAt" WHERE "statusChangedAt" IS NULL;
ALTER TABLE "Ticket" ALTER COLUMN "statusChangedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Ticket" ALTER COLUMN "statusChangedAt" SET NOT NULL;
```

  `updatedAt` is the best available approximation of the real resolution time. Tickets in other
  statuses keep `resolvedAt` NULL, every existing Ticket gets `version` 1 from the column default,
  and no ActionTaken rows are created. `statusChangedAt` is backfilled with `updatedAt` for the same reason (the real time of the last status change was never recorded), so the order of "Needs your attention" for Tickets that were already waiting before the upgrade is approximate, and exact for every Ticket that changes status afterwards. Each statement above can be repeated safely: a second run finds no NULL values and changes nothing.
- Legacy Tickets without Actions Taken are valid: they show the empty Actions state, can be
  resolved (BR-17 has no minimum), and are counted normally by dashboards. All existing Users,
  Tickets, Attachments, Public Comments, and Internal Notes remain valid.

Scripts (all under `server/`, run from the repository root with `npm run <name> --prefix server`)

| Script | npm name | Purpose |
|---|---|---|
| `scripts/lab4-backup.ts` | `db:backup` | `pg_dump` through Docker into `server/backups/lab3-before-lab4-<UTC>.sql`; stops without writing if the container's `POSTGRES_DB` differs from the database named in `DATABASE_URL` |
| `scripts/lab4-snapshot.ts` | `db:snapshot` | Row counts and per-row checksums of every Lab 1-3 table except Session into `server/backups/snapshot-<UTC>.json` |
| `scripts/lab4-verify.ts` | `db:verify:lab4` | Post-migration and post-rollback checks (below); exits non-zero on any failure |
| `scripts/lab4-backfill.ts` | `db:backfill:lab4` | Runs only the idempotent backfill UPDATE and prints how many rows changed |
| `scripts/lab4-rollback.ts` | `db:rollback:lab4` | Exports Actions Taken, then runs `prisma/rollback/lab4_down.sql` (needs `--confirm`) |
| `prisma/rollback/lab4_down.sql` | | The reverse SQL, in one transaction |
| `scripts/test-upgrade-path-lab4.ts` | | Automated proof of the whole procedure on a simulated Lab 3 database |

The `server/backups/` folder is in `.gitignore` and is never committed. Snapshot tables: Category, RequesterUser, RelatedSystem, User, Ticket, Attachment, PublicComment, InternalNote. `Session` is deliberately excluded: its rows change constantly and hold no business data (decision 12). The scripts run with `npm run <name> --prefix server`, which makes `server/` the working directory, so `--snapshot backups/snapshot-<UTC>.json` means `server/backups/...`; each script also prints the absolute path of the file it writes.

Upgrade procedure (existing Lab 3 database)
1. Stop the backend and any test runs.
2. `npm run db:backup --prefix server` (runs `docker compose exec -T postgres pg_dump -U <user> <db>`).
3. `npm run db:snapshot --prefix server` and keep the printed file name.
4. `cd server && npx prisma migrate deploy`.
5. `npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --at-upgrade`.
6. Optionally run the seed, then start the application.

Checks run by `db:verify:lab4` after the upgrade (it prints a table of table, before, after, match):
- ActionTaken exists and has 0 rows.
- Every Lab 1-3 table except Session has the same row count as the snapshot.
- Every Lab 1-3 table except Session has identical per-row checksums for its original columns.
- No Ticket has `version` other than 1.
- No RESOLVED or CLOSED Ticket has `resolvedAt` NULL.
- Every RESOLVED or CLOSED Ticket has `resolvedAt` equal to `updatedAt` (only with `--at-upgrade`).
- No Ticket in another status has a `resolvedAt`.
- No Ticket has `statusChangedAt` NULL.
- Every Ticket has `statusChangedAt` equal to `updatedAt` (only with `--at-upgrade`).

If the migration fails midway
- The file is one transaction, so a failure leaves no partial change. Confirm with
  `npm run db:verify:lab4 --prefix server -- --expect-absent`: ActionTaken, the enum, and the new
  Ticket columns must not exist.
- Prisma records the migration as failed (its `_prisma_migrations` row keeps `finished_at` NULL and `logs` stays empty). The error it prints is only `25P02 current transaction is aborted`, which does not name the failing statement (observed in the upgrade test; the likely reason, that the file's own `BEGIN;` leaves Prisma's connection inside an aborted transaction, is inferred, not observed). To find the real error, run the migration file against a copy of the database with `psql -v ON_ERROR_STOP=1 -v VERBOSITY=verbose`; the first error it prints is the cause. Fix the cause, then run `npx prisma migrate resolve --rolled-back <migration_name>` and deploy again. The upgrade test (MIG-07) exercises exactly this sequence.
- If verification still shows a partial state (it should not), stop and restore the backup
  (Rollback, option B), then investigate. The error and the fix are written in the PR.

Re-running
- After `migrate resolve --rolled-back`, run `npx prisma migrate deploy` again; the same file
  applies safely.
- If the migration is already applied and only the backfill must be repeated (for example a
  Ticket was resolved by an old application instance during the upgrade window), run
  `npm run db:backfill:lab4 --prefix server`. A second run changes 0 rows.

Rollback and recovery
- Option A, reverse SQL (removes only Lab 4 objects; keeps all Lab 1-3 data and any data written
  after the migration to Lab 3 tables):
  1. Stop the application.
  2. `npm run db:rollback:lab4 --prefix server -- --confirm`. The script refuses to run without
     `--confirm`, prints how many Actions Taken rows will be lost, and first writes them to
     `backups/actions-taken-export-<UTC>.json`.
  3. In one transaction `lab4_down.sql` drops the ActionTaken table (its indexes and foreign keys
     go with it), the `ActionStatus` enum, the Lab 4 Ticket indexes, `Ticket.version`, `Ticket.resolvedAt`, and `Ticket.statusChangedAt`, and deletes the Lab 4 row from `_prisma_migrations` so the migration can be
     applied again later.
- Option B, restore the backup (the whole database returns to the moment of the backup and
  everything written after it is lost). Inside the container `POSTGRES_USER` and `POSTGRES_DB` come from `.env`:

```bash
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < server/backups/lab3-before-lab4-<UTC>.sql
```

  Run these from the repository root (the backup is in `server/backups/`). The single quotes make the
  container's shell, not yours, expand `POSTGRES_USER` and `POSTGRES_DB`, so nothing needs to be set on
  your machine. Phase 12 of the upgrade test automates the same drop-and-restore on the test
  database with the database name passed explicitly; the two commands above are the manual form for the
  main database and have not been run verbatim against it.

Verifying that the original data came back
- Run `npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback`.
  It passes only when ActionTaken, the enum, the Ticket columns, and the Lab 4 migration row are
  gone, and every Lab 1-3 table except Session matches the snapshot in row count and per-row checksums. It prints
  the same before and after table.
- Then run the Lab 3 server tests and the Lab 3 upgrade-path script as a smoke check, and apply
  the migration again to prove it can be re-applied.

Automated proof: `server/scripts/test-upgrade-path-lab4.ts` builds a Lab 3 database with data, takes
the snapshot, migrates, verifies, rolls back, verifies, migrates again, verifies; and also forces a
failure in a copy of the migration, confirms nothing partial remains, resolves it, and re-runs. It
prints every comparison table and exits non-zero on any mismatch (tests MIG-01 to MIG-03, MIG-07,
MIG-08).

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
- AC-34: Given the migration fails midway, then no partial schema remains, and after the cause is fixed and `migrate resolve --rolled-back` is run, running the migration again succeeds.
- AC-35: Given the rollback is run after a successful migration, then every Lab 1-3 table except Session matches the pre-migration snapshot in row count and per-row checksums, the Lab 4 objects and migration record are gone, and the migration can be applied again.
- AC-36: Given a Ticket resolved exactly 30 x 24 hours before `generatedAt`, then it is included in "Recently resolved", and one resolved 1 ms earlier is excluded; the results are identical whatever the server process time zone is.
- AC-37: Given an Action edit request that contains `status` or `ticketId`, then it is rejected with 400; given a status change, then it goes only through the status endpoint, used by the dedicated status buttons in the UI.
- AC-38: Given several Tickets waiting for the Requester, when "Needs your attention" is retrieved, then they are ordered by time since entering WAITING_FOR_REQUESTER (longest first, ties by `id` ascending); a later comment, owner, priority, or other edit does not change the order, and a Ticket that leaves and re-enters Waiting is counted from the new entry.

## 10. Definition of Done

Product completion
- FR-01 to FR-24 are implemented and demonstrable.
- AC-01 to AC-38 each pass with a linked automated test.
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
5. Dashboards use one server-captured UTC instant (`generatedAt`) and a single inclusive 30 x 24 hour window (BR-28), with no calendar-day metrics, so time zones and day boundaries cannot change a result.
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
11. "Longest waiting" is measured from a new `statusChangedAt` column (the last status transition), not from `updatedAt`, because any edit changes `updatedAt` and would make a Ticket look as if it had waited less. Existing Tickets are backfilled with `updatedAt` as the best available approximation.
12. The snapshot, and therefore every "matches the snapshot" check, excludes the `Session` table: its rows change with every login and hold no business data. All other Lab 1-3 tables are covered.
