# Lab 4 Test Plan and Results

## 1. Test Strategy

Tests are planned from `specification.md` before implementation (Test DD) and then
drive the work (TDD): write the failing test, implement the smallest correct behavior,
refactor while everything stays green. Coverage spans unit, API/integration, UI
component, UI style, accessibility, responsive, authorization/security, workflow,
concurrency, migration/regression, performance-smoke, and end-to-end levels. Every
Acceptance Criterion (AC-01 to AC-38) maps to at least one test with a real file path.

Test data and isolation rules (learned from Labs 2-3):
- Vitest runs test files in parallel against one shared database. A test must not assume
  global counts or fixed ids. Each test creates its own Tickets and Actions with a unique
  prefix and looks up seeded users by email constant, never by a hardcoded id.
- Dashboard tests use users that no other file touches (dedicated seeded users or users
  created in `beforeAll`), so their counts are exact.
- Migration and upgrade-path tests run sequentially in their own Vitest project because they
  reshape the schema.
- Race and concurrency tests repeat the race at least 20 times to expose intermittent bugs.
- Every suite must pass on a fresh database (`docker compose down -v`, migrate, seed) and
  be run at least three times in a row with identical results.
- End-to-end specs use dedicated seeded users that Lab 2 and Lab 3 specs do not use, reset
  the database in global setup, and contain no fallback that skips an assertion. A skip is
  allowed only through documented project configuration.
- Old test files are never edited to make them pass. MIG-05 checks that the Lab 1-3 test
  files are byte-identical to `main` before Lab 4 and that they pass.
- A visual or accessibility box is ticked only after the matching screenshot has been opened
  and inspected.

## 2. Planned Tests

Status legend (the Final column):
- Pending: planned, not yet implemented or not yet run. This is the honest value for every row
  until the test has actually been run.
- Pass: the test was run and passed. The Issue named in "Planned Issue" records the evidence (terminal
  output or the CI run link) in its Pull Request, and only then changes the row.
- Fail: the test was run and failed; the row stays Fail until fixed.
- Deferred: intentionally not done, with the reason written in section 7.
- Nothing is changed to Pass without a real run. Issue 1 is documentation only and runs none of
  these tests, so every row is still Pending after Issue 1.

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Planned Issue | Final |
|---|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-11, AC-08 | Action status matrix validator | Five allowed pairs pass; every other pair rejected; terminal states have no exits | `server/tests/lab-04/action-status.unit.test.ts` | Issue 2 | Pending |
| UNIT-02 | Unit | BR-07 to BR-10, AC-05, AC-09 | Action field validation: trimming, 5-1000 and 5-500 limits, follow-up note rule, Result required to create as COMPLETED, to complete, or to cancel | Valid input passes; each violation names its field | `server/tests/lab-04/action-validation.unit.test.ts` | Issue 2 | Pending |
| UNIT-03 | Unit | BR-05 | `actionAt` window: IN_PROGRESS/COMPLETED not over 5 min ahead, PLANNED up to 30 days ahead | Boundary values accepted and rejected correctly | `server/tests/lab-04/action-validation.unit.test.ts` | Issue 2 | Pending |
| UNIT-04 | Unit | BR-16 | Ticket transition matrix lookup (14 pairs) | All 14 allowed; sampled invalid pairs rejected; Cancelled terminal | `server/tests/lab-04/ticket-transition.unit.test.ts` | Issue 4 | Pending |
| UNIT-05 | Unit | BR-27, BR-28 | Dashboard helpers: active status list, rolling 30-day window in UTC | Window is `generatedAt - 30 x 24 h`, both ends inclusive: exactly 30 days is in, 30 days plus 1 ms is out; the helper never reads the process time zone | `server/tests/lab-04/dashboard-helpers.unit.test.ts` | Issue 5 | Pending |
| UNIT-06 | Unit | BR-16, AC-18 | Client function deciding if a From-To pair needs confirmation | Matches the matrix: Open to Cancelled yes, Resolved to Closed no | `client/tests/lab-04/confirmation.unit.test.tsx` | Issue 4 | Pending |
| API-01 | API | AC-01, FR-01, FR-05 | Staff creates a valid Action | 201; stored under the right Ticket; performed-by is the session user; assignee saved | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-02 | API | AC-03, BR-25 | Requester creates an Action | 403; no row written | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-03 | API | AC-03 | Requester edits or changes status of an Action | 403; data unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-04 | API | AC-04, BR-15 | Requester lists Actions on own Ticket | 200; all Actions with all fields | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-05 | API | AC-04 | Requester lists Actions on another Requester's Ticket | 404, identical to a missing Ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-06 | API | AC-05, BR-09 | Follow-up required without note; follow-up false with note | 400 with field error; note discarded when false | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-07 | API | AC-06, BR-04 | Assignee inactive, a Requester, or unknown | 400 with field-level error each time | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-08 | API | AC-07, BR-03 | Body contains `performedBy`, `version`, `createdAt`, or `updatedAt` | All ignored; the session user and server-generated values are stored | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-09 | API | AC-08, BR-11 | Edit or status change on a terminal Action; invalid status pair | 409 `ACTION_TERMINAL`; 400 for invalid pair | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-10 | API | AC-09, BR-08 | Complete or cancel without Result; create directly as COMPLETED without Result | 400 with `fields.result` for each (the create case is a request-body check, step 5 of the check order); creating as PLANNED or IN_PROGRESS without a Result succeeds | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-11 | API | AC-10, BR-12 | DELETE attempt; order after edits | No delete route (404 or 405); list order unchanged after editing an early Action | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-12 | API | AC-11, BR-22 | Action update with stale `expectedVersion`; missing `expectedVersion` | 409 `STALE_VERSION` and newer data intact; 400 when missing | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-13 | API | AC-12, BR-24 | Same `clientRequestId` sent twice, including in parallel | One row; second response 200 with the original; the same id used for another Ticket gives 400 | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-14 | API | BR-13 | Create on a RESOLVED, CLOSED, or CANCELLED Ticket | 409 `TICKET_NOT_ACCEPTING_ACTIONS` | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-15 | API | BR-05 | `actionAt` rules through the API | Future COMPLETED rejected; PLANNED within 30 days accepted | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-16 | API | BR-02 | Staff who is not the owner creates an Action; Ticket has no owner | 201 in both cases | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-17 | API | FR-02, FR-03, BR-22 | Edit then PLANNED to IN_PROGRESS to COMPLETED; also create directly as IN_PROGRESS and COMPLETED, and try to create as CANCELLED | Each success increments `version`; final state read-only; COMPLETED at creation needs a Result; CANCELLED at creation gives 400 | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-18 | API | AC-13, BR-17 | Resolve a Ticket with an unfinished Action by calling the API directly | 409 `OPEN_ACTIONS_BLOCK_RESOLUTION` with count; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-19 | API | AC-14 | Resolve after all Actions are COMPLETED or CANCELLED | 200; `resolvedAt` set | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-20 | API | AC-15 | Resolve a legacy Ticket with zero Actions | 200 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-21 | API | AC-16, BR-18 | Cancel a Ticket that has unfinished Actions | Those Actions become CANCELLED with the automatic Result and incremented versions, atomically; the response reports `cancelledActionsCount` | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-22 | API | AC-17, BR-14, BR-17 | Create an Action while resolving the same Ticket, repeated 20 times | Always one consistent outcome; never an unfinished Action on a RESOLVED Ticket | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-23 | API | AC-18, BR-22, BR-23 | Ticket status with stale `expectedVersion`; with none | 409 when stale; without it the change applies but the transition is still validated | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-24 | API | AC-19, BR-19, BR-20 | Requester "appears resolved" flag; reopen | Flag changes no status and does not lift the gate; Reopened clears `resolvedAt` and resets the flag | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-25 | API | BR-16 | Table-driven: all 14 valid transitions and sampled invalid ones | Valid give 200; invalid give 400 naming current and requested status | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-26 | API | BR-21 | Request claims a wrong "from" status | Ignored; validated against the stored status | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-27 | API | AC-11, BR-23 | Owner and priority updates with stale `expectedVersion` | 409 `STALE_VERSION`, no change | `server/tests/lab-04/ticket-workflow.api.test.ts` | Issue 4 | Pending |
| API-28 | API | AC-02, BR-30 | Requester dashboard with a forged user id in query or body | Only the session user's data returned | `server/tests/lab-04/requester-dashboard.api.test.ts` | Issue 5 | Pending |
| API-29 | API | AC-23, BR-32 | Requester with no Tickets | All counts 0; lists empty | `server/tests/lab-04/requester-dashboard.api.test.ts` | Issue 5 | Pending |
| API-30 | API | BR-26, BR-29 | Each Requester metric and list against its database query | Counts exact; lists capped at 5 and correctly ordered; response carries `generatedAt` and `recentlyResolvedSince` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Issue 5 | Pending |
| API-31 | API | AC-22 | Requester calls staff dashboard; Staff and Administrator call Requester dashboard | 403 in every case | `server/tests/lab-04/staff-dashboard.api.test.ts` | Issue 5 | Pending |
| API-32 | API | AC-20, BR-26 | Each staff metric against its database query | All six counts exact | `server/tests/lab-04/staff-dashboard.api.test.ts` | Issue 5 | Pending |
| API-33 | API | BR-29 | Staff lists: My recent Tickets, My open Actions, Urgent Tickets | Correct filter, ordering, and cap; Urgent Tickets contain only active Tickets with IT Priority HIGH (RESOLVED, CLOSED, CANCELLED, and non-HIGH Tickets are excluded) and are least recently updated first, ties by `id` ascending | `server/tests/lab-04/staff-dashboard.api.test.ts` | Issue 5 | Pending |
| API-34 | API | AC-24, BR-30 | User counts in staff dashboard | Present for Administrator; absent for IT Staff | `server/tests/lab-04/staff-dashboard.api.test.ts` | Issue 5 | Pending |
| API-35 | API | AC-21, BR-31 | Follow each card's drill-down query on the list endpoints | List `totalItems` equals the card number | `server/tests/lab-04/staff-dashboard.api.test.ts` and `requester-dashboard.api.test.ts` | Issue 5 | Pending |
| API-36 | API | Additive change | `currentStatus` comma list on both list endpoints | Valid list works; any invalid value returns 400 | `server/tests/lab-04/status-list-filter.api.test.ts` | Issue 5 | Pending |
| API-37 | API | BR-28 | Rolling window edge for "Recently resolved" | Resolved exactly 30 days before `generatedAt` is included; 30 days plus 1 ms is excluded (fake clock); `recentlyResolvedSince` equals `generatedAt` minus 30 x 24 h | `server/tests/lab-04/requester-dashboard.api.test.ts` | Issue 5 | Pending |
| API-38 | API | AC-31, BR-37 | Readiness and health endpoints | `/api/health/ready` 200 when connected, 503 when the database is unreachable; `/api/health` unchanged | `server/tests/lab-04/health-ready.api.test.ts` | Issue 6 | Pending |
| API-39 | API | Section 8 additive fields | Ticket responses | `version`, `resolvedAt`, `statusChangedAt`, `openActionsCount` present; all earlier fields unchanged | `server/tests/lab-04/ticket-responses.api.test.ts` | Issue 4 | Pending |
| API-40 | API | AC-37, BR-01 | Edit endpoint with `status` or `ticketId` in the body; a body with no changes | 400 `VALIDATION_FAILED` pointing to the status endpoint; 400 "No changes supplied"; nothing changed | `server/tests/lab-04/actions-taken.api.test.ts` | Issue 2 | Pending |
| API-41 | API | AC-36, BR-28 | Dashboards with the server process run under TZ=UTC, Asia/Bangkok, and America/Los_Angeles | Identical counts and lists; `generatedAt` and `recentlyResolvedSince` are UTC strings | `server/tests/lab-04/requester-dashboard.api.test.ts` (run once per TZ value) | Issue 5 | Pending |
| API-42 | API | API spec section 0 check order | Table-driven requests that break several rules at once (no session, password change required, wrong role, missing resource, invalid body, stale version, terminal Action) | The first failing check in the documented order decides the response | `server/tests/lab-04/check-order.api.test.ts` | Issues 2, 4 | Pending |
| API-43 | API | AC-38, BR-39 | `statusChangedAt` maintenance | Set at creation; changed by every status transition; not changed by owner, IT Priority, comment, Action, or other edits; reopening and re-entering Waiting restarts the clock | `server/tests/lab-04/status-changed-at.api.test.ts` | Issue 2 | Pending |
| API-44 | API | AC-38, BR-29, BR-39 | Needs-your-attention ordering | Longest waiting first by `statusChangedAt`; a later comment or edit to the longest-waiting Ticket does not reorder; a Ticket that leaves and re-enters Waiting is counted from the new entry; equal times order by `id` ascending; each row carries `waitingSince` | `server/tests/lab-04/requester-dashboard.api.test.ts` | Issue 5 | Pending |
| SEC-01 | Authorization | BR-25 | Table-driven: every new write endpoint as Requester | 403 each time, no data changed | `server/tests/lab-04/authorization.api.test.ts` | Issues 2, 4, 5 | Pending |
| SEC-02 | Authorization | BR-25 | Every new endpoint without a session | 401 each time | `server/tests/lab-04/authorization.api.test.ts` | Issues 2, 4, 5 | Pending |
| SEC-03 | Authorization | Lab 3 BR-02 | User who must change password calls new endpoints | Blocked until the password is changed | `server/tests/lab-04/authorization.api.test.ts` | Issues 2, 4, 5 | Pending |
| SEC-04 | Authorization | BR-33 | Force an unexpected server error | Body is the safe `{error, code}` shape; no stack trace, SQL, or path | `server/tests/lab-04/authorization.api.test.ts` | Issue 6 | Pending |
| SEC-05 | Authorization | AC-04 | Other Requester's Ticket versus a nonexistent Ticket | Responses indistinguishable (no existence leak) | `server/tests/lab-04/authorization.api.test.ts` | Issue 2 | Pending |
| PERF-01 | Performance-smoke | AC-32 | Both dashboards with 500 seeded Tickets | Each responds in under 1 second | `server/tests/lab-04/performance-smoke.test.ts` | Issue 5 | Pending |
| PERF-02 | Performance-smoke | AC-32 | Actions list for a Ticket with 200 Actions | Responds in under 1 second | `server/tests/lab-04/performance-smoke.test.ts` | Issue 2 | Pending |
| MIG-01 | Migration/Regression | AC-25 | Simulated Lab 3 database with data, then Lab 4 migration | Snapshot taken first, then migration: every Lab 1-3 table has the same row count and per-row checksums, and the comparison table is printed | `server/scripts/test-upgrade-path-lab4.ts` | Issue 2 | Pending |
| MIG-02 | Migration/Regression | AC-25, Section 7, BR-39 | Backfill values on a simulated Lab 3 database (a per-Ticket table is printed), and the schema structure on the dev database (columns, defaults, foreign keys, indexes) | `version` is 1; `resolvedAt` equals `updatedAt` for RESOLVED and CLOSED and is NULL for every other status; `statusChangedAt` equals `updatedAt` for every Ticket and is never NULL; no Actions exist; the structure matches the migration | `server/scripts/test-upgrade-path-lab4.ts` (values) and `server/tests/lab-04/migration.test.ts` (structure) | Issue 2 | Pending |
| MIG-03 | Migration/Regression | Section 7 recovery | Rollback (`db:rollback:lab4 -- --confirm`) after a successful migration, and the backup restore procedure | Actions exported first; Lab 4 objects and the migration record removed; every Lab 1-3 table except Session equals the snapshot (counts and per-row checksums); the migration can be applied again | `server/scripts/test-upgrade-path-lab4.ts` | Issue 2 | Pending |
| MIG-04 | Migration/Regression | AC-27 | Run the seed twice | No duplicates; every status present; Tickets with 0, 1, and many Actions; users for zero and non-zero dashboards | `server/tests/lab-04/seed.test.ts` | Issue 2 | Pending |
| MIG-05 | Migration/Regression | AC-26 | Lab 1-3 test files unchanged and passing | No diff against `main` for old test files; all pass | `server/tests/lab-01/*`, `server/tests/lab-02/*`, `server/tests/lab-03/*`, `client/tests/lab-01/*`, `client/tests/lab-02/*`, `client/tests/lab-03/*` | Every Issue, final in Issue 7 | Pending |
| MIG-06 | Migration/Regression | AC-25 | Lab 3 upgrade-path script still passes after Lab 4 migrations | Ownership comparison matrix all matches | `server/scripts/test-upgrade-path.ts` | Issue 2 | Pending |
| MIG-07 | Migration/Regression | AC-34 | Force a failure in the middle of a copy of the migration | psql finds the root cause (the first error is 42P01 at the forced statement) and leaves no partial schema; `prisma migrate deploy` exits non-zero, its `_prisma_migrations` row keeps `finished_at` NULL, and no partial schema remains (its error text is printed but not checked, because Prisma shows only 25P02); after `migrate resolve --rolled-back` and restoring the good file, deploy succeeds | `server/scripts/test-upgrade-path-lab4.ts` | Issue 2 | Pending |
| MIG-08 | Migration/Regression | AC-25, AC-35 | `db:verify:lab4` after the upgrade and after the rollback | After the upgrade every check passes; after the rollback ActionTaken, the enum, the columns, and the migration record are gone and every Lab 1-3 table except Session equals the snapshot; applying again works | `server/scripts/test-upgrade-path-lab4.ts` | Issue 2 | Pending |
| UI-01 | UI | FR-04, FR-17 | Actions Taken list renders (table and cards) with empty state | Rows in stable order; text status badges; empty message when none | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-02 | UI | AC-05, AC-09 | Create and edit modal validation | Field-level errors; follow-up note error appears only when required; Result shows its asterisk and an error when Status is COMPLETED in create mode | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-03 | UI | AC-12, AC-28 | Double click on submit | One request; submit disabled while in flight; `clientRequestId` sent | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-04 | UI | AC-28, BR-34 | 409 and network failure on save | Readable message with reload action; entered values kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-05 | UI | AC-08 | Terminal Action | All fields read-only; no save control | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-06 | UI | AC-04, AC-03 | Requester view of Actions Taken | No create, edit, or status controls in the DOM | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-07 | UI | BR-15 | Staff sees the "visible to the Requester" label | Label present | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-08 | UI | FR-17 | Status control on Staff Ticket Detail | Only permitted next statuses offered | `client/tests/lab-04/TicketWorkflow.test.tsx` | Issue 4 | Pending |
| UI-09 | UI | BR-16 | Confirmation dialogs | Shown for flagged pairs (Open to Cancelled); not for Resolved to Closed or Resolved to Reopened | `client/tests/lab-04/TicketWorkflow.test.tsx` | Issue 4 | Pending |
| UI-10 | UI | AC-18, AC-13 | Gate block and success | Block message shows the open Action count; success refreshes the summary status | `client/tests/lab-04/TicketWorkflow.test.tsx` | Issue 4 | Pending |
| UI-11 | UI | FR-14, FR-18 | Staff Dashboard states | Six cards and three lists; loading, empty, forbidden, and failure states | `client/tests/lab-04/StaffDashboard.test.tsx` | Issue 5 | Pending |
| UI-12 | UI | AC-21, AC-24, FR-15 | Staff Dashboard links | Cards are links with accessible names and correct targets; user-count card only for Administrator | `client/tests/lab-04/StaffDashboard.test.tsx` | Issue 5 | Pending |
| UI-13 | UI | AC-23, FR-13 | Requester Dashboard | Four cards and three lists; zero state when the user has no Tickets; Needs-your-attention rows show "Waiting since" formatted in the browser's time zone | `client/tests/lab-04/RequesterDashboard.test.tsx` | Issue 5 | Pending |
| UI-14 | UI | AC-21 | Requester Dashboard drill-down | Links carry the comma-separated status filter | `client/tests/lab-04/RequesterDashboard.test.tsx` | Issue 5 | Pending |
| UI-15 | UI | FR-16 | Role navigation | Dashboard entry per role, active-page indication, and correct landing page after login | `client/tests/lab-04/Navigation.test.tsx` | Issue 5 | Pending |
| UI-16 | UI | FR-18 | Wrong role reaches a dashboard route | Redirect with a notification, never raw JSON | `client/tests/lab-04/Navigation.test.tsx` | Issue 5 | Pending |
| UI-17 | UI | FR-14 | Refresh control | Re-fetches and updates the numbers | `client/tests/lab-04/StaffDashboard.test.tsx` | Issue 5 | Pending |
| UI-18 | UI | AC-37, FR-03 | Status buttons in the Action dialog: Start, Mark completed, Cancel action | Buttons follow the Action matrix; completing needs a Result in the step panel; cancelling asks for a reason and a confirmation; buttons are disabled while the form has unsaved edits; Save never changes the status | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-19 | UI | AC-36, BR-28 | Render the same dashboard payload under different browser time zones | Displayed times ("Waiting since", last updated, "Updated") change with the browser time zone; counts, rows, and order do not; the rendered order equals the API order, so the UI does not sort or filter by these times | `client/tests/lab-04/StaffDashboard.test.tsx` and `client/tests/lab-04/RequesterDashboard.test.tsx` | Issue 5 | Pending |
| UI-20 | UI | BR-13, FR-17 | A Ticket that no longer accepts actions | The Add Action button is replaced by the "Reopen the Ticket" note; a 409 from the server disables Save with an explanation | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| UI-21 | UI | AC-20, BR-27, BR-29 | Urgent Tickets list on the Staff Dashboard | Rows are exactly the items in the API payload, in API order; every row shows an IT Priority High badge and an active status badge (text); an empty payload shows "No urgent tickets."; the UI does not filter or re-sort the rows itself | `client/tests/lab-04/StaffDashboard.test.tsx` | Issue 5 | Pending |
| STYLE-01 | UI Style | Section 7 UI rules | Metric card styling | Label, value, and link use the Zen Green tokens consistently | `client/tests/lab-04/DashboardStyle.test.tsx` | Issue 5 | Pending |
| STYLE-02 | UI Style | BR-35 | Status and priority badges | Always show text, never color alone | `client/tests/lab-04/DashboardStyle.test.tsx` | Issue 5 | Pending |
| STYLE-03 | UI Style | Lab 2 and 3 form rules | Validation placement and required markers in the Action form | Message directly under the field; asterisk plus message | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| STYLE-04 | UI Style | BR-15 | Actions Taken versus Internal Notes | Visually distinct private and shared areas | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| A11Y-01 | Accessibility | AC-29, BR-35 | Modal dialog | Focus moves in, is trapped, Escape closes, focus returns to the opener | `client/tests/lab-04/ActionsTaken.test.tsx` | Issue 3 | Pending |
| A11Y-02 | Accessibility | AC-29 | Keyboard operation of cards, status control, and modal | Fully operable by keyboard; focus always visible | `e2e/lab-04/accessibility.spec.ts` | Issue 7 | Pending |
| A11Y-03 | Accessibility | AC-29 | Automated accessibility scan (axe) of both dashboards, Staff and Requester Ticket Detail | No serious or critical violations | `e2e/lab-04/accessibility.spec.ts` | Issue 7 | Pending |
| RESP-01 | Responsive | AC-30 | Staff Dashboard at desktop, tablet, mobile | No clipping or overlap; cards reflow | Playwright screenshots (Section 4) | Issue 7 | Pending |
| RESP-02 | Responsive | AC-30 | Requester Dashboard at three viewports | Same | Playwright screenshots (Section 4) | Issue 7 | Pending |
| RESP-03 | Responsive | AC-30 | Actions Taken table becomes cards on mobile; modal fits | Usable at every size | Playwright screenshots (Section 4) | Issue 7 | Pending |
| RESP-04 | Responsive | AC-30 | Programmatic check on the screens above | Page `scrollWidth` does not exceed `clientWidth` at any viewport | `e2e/lab-04/dashboards.spec.ts` and `e2e/lab-04/actions-taken-flow.spec.ts` | Issue 7 | Pending |
| E2E-01 | E2E | AC-01, AC-04, AC-08 | Staff creates, edits, starts, and completes an Action; the Requester sees it read-only | List updates for staff; Requester has no controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Issue 7 | Pending |
| E2E-02 | E2E | AC-05, AC-11, AC-28 | Follow-up validation; two staff edit the same Action | Second save shows the conflict message and keeps the typed data | `e2e/lab-04/actions-taken-flow.spec.ts` | Issue 7 | Pending |
| E2E-03 | E2E | AC-13, AC-14, AC-19 | Resolve blocked by an unfinished Action, then complete it and resolve; direct API attempt | Blocked with the open count; allowed after completion; API bypass gets 409 | `e2e/lab-04/ticket-resolution.spec.ts` | Issue 7 | Pending |
| E2E-04 | E2E | AC-16 | Cancel a Ticket with unfinished Actions | Actions show CANCELLED with the automatic Result | `e2e/lab-04/ticket-resolution.spec.ts` | Issue 7 | Pending |
| E2E-05 | E2E | AC-02, AC-20, AC-21, AC-23 | Both dashboards: counts, drill-down, empty Requester | Counts match the Queue and My Tickets lists they open; the Urgent Tickets list shows the seeded active High-priority Tickets and not a seeded Resolved High-priority Ticket or a seeded active Medium-priority one | `e2e/lab-04/dashboards.spec.ts` | Issue 7 | Pending |
| E2E-06 | E2E | AC-33, BR-36 | Console and link sweep through every role's primary flow | Zero console errors; no broken links | `e2e/lab-04/regression-sweep.spec.ts` | Issue 7 | Pending |
| E2E-07 | E2E | AC-26 | Representative Lab 1-3 flow: login with password change, create Ticket with attachment, staff claim, Internal Note hidden from the Requester, Administrator creates a user | All steps behave as in Lab 3 | `e2e/lab-04/regression-sweep.spec.ts` | Issue 7 | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Description | Covered By |
|---|---|---|
| AC-01 | Valid Action saved with creator and assignee | API-01, API-16, API-17, E2E-01 |
| AC-02 | Requester dashboard shows only own data | API-28, E2E-05 |
| AC-03 | Requester cannot create or edit Actions | API-02, API-03, SEC-01, UI-06 |
| AC-04 | Requester views own Actions read-only; others 404 | API-04, API-05, SEC-05, UI-06, E2E-01 |
| AC-05 | Follow-up note rule | UNIT-02, API-06, UI-02, E2E-02 |
| AC-06 | Inactive or non-staff assignee rejected | API-07 |
| AC-07 | Performed-by is the authenticated user | API-08 |
| AC-08 | Terminal Actions immutable; invalid pairs rejected | UNIT-01, API-09, UI-05, E2E-01 |
| AC-09 | Result required to complete or cancel | UNIT-02, API-10 |
| AC-10 | No delete; stable order | API-11 |
| AC-11 | Stale update gives 409; version required | API-12, API-27, E2E-02 |
| AC-12 | Duplicate create is safe | API-13, UI-03 |
| AC-13 | Gate blocks Resolved, including direct API | API-18, UI-10, E2E-03 |
| AC-14 | Resolve succeeds once Actions are finished | API-19, E2E-03 |
| AC-15 | Legacy Ticket with zero Actions can be resolved | API-20 |
| AC-16 | Ticket cancel cascades to Actions | API-21, E2E-04 |
| AC-17 | Create versus resolve race is consistent | API-22 |
| AC-18 | Stale Ticket update 409; summary refreshes | UNIT-06, API-23, UI-10 |
| AC-19 | Advisory flag changes nothing; reopen resets | API-24, E2E-03 |
| AC-20 | Staff metrics and lists match the database | UNIT-05, API-32, API-33, UI-21, E2E-05 |
| AC-21 | Card count equals drill-down total | API-35, UI-12, UI-14, E2E-05 |
| AC-22 | Wrong-role dashboard calls give 403 | API-31, UI-16 |
| AC-23 | Zero-ticket Requester sees zeros and empty messages | API-29, UI-13, E2E-05 |
| AC-24 | User counts only for Administrator | API-34, UI-12 |
| AC-25 | Lab 3 data survives the migration | MIG-01, MIG-02, MIG-06, MIG-08 |
| AC-26 | Lab 1-3 suites pass unmodified | MIG-05, E2E-07 |
| AC-27 | Seed is idempotent and complete | MIG-04 |
| AC-28 | Forms keep data; no duplicate submit | UI-03, UI-04, E2E-02 |
| AC-29 | Accessibility rules | A11Y-01, A11Y-02, A11Y-03 |
| AC-30 | Responsive with no overflow | RESP-01, RESP-02, RESP-03, RESP-04 |
| AC-31 | Readiness and health endpoints | API-38 |
| AC-32 | Performance smoke | PERF-01, PERF-02 |
| AC-33 | No console errors or broken links | E2E-06 |
| AC-34 | A failed migration leaves nothing partial and can be re-run | MIG-07 |
| AC-35 | Rollback restores all Lab 1-3 data and the migration can be re-applied | MIG-03, MIG-08 |
| AC-36 | Exact inclusive 30-day UTC window, independent of time zone | UNIT-05, API-37, API-41, UI-19 |
| AC-37 | Action status changes only through the status endpoint and dedicated buttons | API-40, UI-18 |
| AC-38 | Needs your attention is ordered by time waiting, not last edit | API-43, API-44, UI-13 |

### Business-rule coverage

Every business rule has at least one test.

| BR | Covered By |
|---|---|
| BR-01 | API-01, API-40 |
| BR-02 | API-16 |
| BR-03 | API-01, API-08 |
| BR-04 | API-07, UI-02 |
| BR-05 | UNIT-03, API-15 |
| BR-06 | API-08, API-12 |
| BR-07 | UNIT-02 |
| BR-08 | UNIT-02, API-10, UI-02 |
| BR-09 | UNIT-02, API-06 |
| BR-10 | UNIT-02 |
| BR-11 | UNIT-01, API-09, API-17 |
| BR-12 | API-11, UI-01 |
| BR-13 | API-14, UI-20 |
| BR-14 | API-21, API-22 |
| BR-15 | API-04, UI-07, STYLE-04 |
| BR-16 | UNIT-04, API-25, UI-08, UI-09 |
| BR-17 | API-18, API-19, API-20, API-22, UI-10 |
| BR-18 | API-21, E2E-04 |
| BR-19 | API-19, API-24 |
| BR-20 | API-24, E2E-03 |
| BR-21 | API-26 |
| BR-22 | API-12, API-17, API-23, API-27 |
| BR-23 | API-12, API-23, API-27 |
| BR-24 | API-13, UI-03 |
| BR-25 | SEC-01, SEC-02, API-02, API-03, API-31 |
| BR-26 | API-30, API-32, API-35 |
| BR-27 | UNIT-05, API-32, API-33, UI-21 |
| BR-28 | UNIT-05, API-37, API-41, UI-19 |
| BR-29 | API-30, API-33, API-44, UI-21 |
| BR-30 | API-28, API-34 |
| BR-31 | API-35, E2E-05 |
| BR-32 | API-29, UI-13, E2E-05 |
| BR-33 | SEC-04 |
| BR-34 | UI-04, E2E-02 |
| BR-35 | A11Y-01, A11Y-02, A11Y-03, STYLE-02 |
| BR-36 | E2E-06 |
| BR-37 | API-38 |
| BR-38 | MIG-04 |
| BR-39 | API-43, API-44, MIG-02 |

## 4. Responsive, Visual, and Accessibility Checklist

To be completed during the end-to-end and visual testing Issue. Tick a box only after
opening the screenshot and inspecting it.

- [ ] Desktop (992 px and wider): Staff Dashboard, Requester Dashboard, Ticket Detail with Actions Taken, Ticket workflow
- [ ] Tablet (768-991 px): the same four screens
- [ ] Mobile (under 768 px): the same four screens, with no horizontal page scrolling
- [ ] Metric cards are consistent in size, label, value, and link style
- [ ] Status, priority, and role badges are legible and always carry text
- [ ] Actions Taken is visually distinct from Internal Notes and shows the "visible to the Requester" label
- [ ] Editable and read-only fields are clearly different, and terminal Actions look read-only
- [ ] Validation messages sit directly under their fields
- [ ] Modal dialog is fully visible on mobile and does not clip
- [ ] Visible focus on every interactive element, and tab order follows reading order
- [ ] Empty, no-results, forbidden, conflict, and failure states look consistent across all screens
- [ ] No placeholder text, unfinished controls, or leftover UI from earlier labs

Screenshot paths: `artifacts/lab-04/screenshots/staff-dashboard/`,
`artifacts/lab-04/screenshots/requester-dashboard/`,
`artifacts/lab-04/screenshots/actions-taken/`,
`artifacts/lab-04/screenshots/ticket-workflow/`

## 5. Test Commands

```bash
# Fresh database, as used in CI
docker compose down -v
docker compose up -d
cd server
npx prisma migrate deploy
npx prisma db seed

# Server: unit, API, authorization, workflow, performance-smoke, migration
npm run test

# Client: UI, style, accessibility
cd ../client
npm run test

# End-to-end (resets the database in global setup)
cd ..
npx playwright test

# Operator steps for an existing Lab 3 database (details in specification.md section 7)
npm run db:backup --prefix server
npm run db:snapshot --prefix server
cd server && npx prisma migrate deploy && cd ..
npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --at-upgrade

# Lab 4 upgrade-path, failure, and rollback proof against a simulated Lab 3 database with data
cd server
npx tsx scripts/test-upgrade-path-lab4.ts
```

Repeat the full sequence at least three times in a row. Any result that differs between
runs is a flaky test and must be fixed before release.

## 6. Results Recorded

| Issue | Executable tests in this Issue | Recorded |
|---|---|---|
| 1 (contract) | None; documentation only | No row changed. Every row stays Pending. The consistency audit in section 8 was done and recorded. |

A row moves to Pass only in the Issue named in "Planned Issue", after the test has really run, with
evidence in that Issue's Pull Request.

### Final results (filled in at release)

[Fill in after the final run on `main`: counts of passing tests per suite, terminal output
screenshots, the date, the CI run link, and confirmation that Lab 1-3 tests still pass
unmodified.]

## 7. Known Limitations or Deferred Tests

[Fill in any test intentionally not done, with the reason. For example, a real
multi-browser concurrency test is replaced by two parallel API sessions.]

## 8. Traceability Audit (Issue 1 review)

Checked every Acceptance Criterion, business rule, and specified behavior against the plan.

- AC-01 to AC-38: each maps to at least one test row that exists in section 2 (verified by listing
  every referenced Test ID against the table).
- Gaps found and closed by adding rows: AC-34 to AC-37 and their tests (MIG-07, MIG-08, API-40,
  API-41, UI-18, UI-19); check-order behavior (API-42); the "Add Action replaced by a note" state
  (UI-20); the creation-status rule (extended API-17); ignored server-generated fields (extended
  API-08); `clientRequestId` reuse across Tickets (extended API-13); the cascade count (extended
  API-21); and the dashboard window fields (extended API-30 and API-37).
- All 39 business rules map to tests (see Business-rule coverage in section 3).
- Test file paths are the planned locations. The four server files, four client files, and three
  end-to-end files required by the labsheet are all used; the additional files are listed in the
  table and will be created in the Issue named in "Planned Issue".
- Second review round: (1) creating an Action as COMPLETED requires a Result, now stated in BR-08
  and the API spec and tested by the extended API-10, UNIT-02, and UI-02; (2) "Needs your attention"
  ordering now uses a new `statusChangedAt` clock (BR-39, AC-38) instead of `updatedAt`, with tests
  API-43 and API-44 and a backfill check in MIG-02.
- Third review round: (1) the Urgent Tickets condition (active status and IT Priority High) is now
  stated in the UI spec and asserted by API-33, the new UI-21, and E2E-05; (2) the browser time zone
  rule for "Waiting since" and every other displayed time is stated in the UI spec, with the rule
  that times are display only and never used to calculate, sort, or filter, asserted by UI-13 and UI-19.
