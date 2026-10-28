# Lab 4 Test Plan and Results

## 1. Test Strategy

Tests are planned from `specification.md` before implementation (Test DD) and then
drive the work (TDD): write the failing test, implement the smallest correct behavior,
refactor while everything stays green. Coverage spans unit, API/integration, UI
component, UI style, accessibility, responsive, authorization/security, workflow,
concurrency, migration/regression, performance-smoke, and end-to-end levels. Every
Acceptance Criterion (AC-01 to AC-33) maps to at least one test with a real file path.

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

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-11, AC-08 | Action status matrix validator | Five allowed pairs pass; every other pair rejected; terminal states have no exits | `server/tests/lab-04/action-status.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-07 to BR-10, AC-05, AC-09 | Action field validation: trimming, 5-1000 and 5-500 limits, follow-up note rule, Result required to complete or cancel | Valid input passes; each violation names its field | `server/tests/lab-04/action-validation.unit.test.ts` | Pending |
| UNIT-03 | Unit | BR-05 | `actionAt` window: IN_PROGRESS/COMPLETED not over 5 min ahead, PLANNED up to 30 days ahead | Boundary values accepted and rejected correctly | `server/tests/lab-04/action-validation.unit.test.ts` | Pending |
| UNIT-04 | Unit | BR-16 | Ticket transition matrix lookup (14 pairs) | All 14 allowed; sampled invalid pairs rejected; Cancelled terminal | `server/tests/lab-04/ticket-transition.unit.test.ts` | Pending |
| UNIT-05 | Unit | BR-27, BR-28 | Dashboard helpers: active status list, rolling 30-day window in UTC | Window edges at 29d 23h in and 30d 1h out | `server/tests/lab-04/dashboard-helpers.unit.test.ts` | Pending |
| UNIT-06 | Unit | BR-16, AC-18 | Client function deciding if a From-To pair needs confirmation | Matches the matrix: Open to Cancelled yes, Resolved to Closed no | `client/tests/lab-04/confirmation.unit.test.tsx` | Pending |
| API-01 | API | AC-01, FR-01, FR-05 | Staff creates a valid Action | 201; stored under the right Ticket; performed-by is the session user; assignee saved | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-02 | API | AC-03, BR-25 | Requester creates an Action | 403; no row written | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-03 | API | AC-03 | Requester edits or changes status of an Action | 403; data unchanged | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-04 | API | AC-04, BR-15 | Requester lists Actions on own Ticket | 200; all Actions with all fields | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-05 | API | AC-04 | Requester lists Actions on another Requester's Ticket | 404, identical to a missing Ticket | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-06 | API | AC-05, BR-09 | Follow-up required without note; follow-up false with note | 400 with field error; note discarded when false | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-07 | API | AC-06, BR-04 | Assignee inactive, a Requester, or unknown | 400 with field-level error each time | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-08 | API | AC-07, BR-03 | Body contains a different `performedBy` | Ignored; session user stored | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-09 | API | AC-08, BR-11 | Edit or status change on a terminal Action; invalid status pair | 409 `ACTION_TERMINAL`; 400 for invalid pair | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-10 | API | AC-09, BR-08 | Complete or cancel without Result | 400 for each | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-11 | API | AC-10, BR-12 | DELETE attempt; order after edits | No delete route (404 or 405); list order unchanged after editing an early Action | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-12 | API | AC-11, BR-22 | Action update with stale `expectedVersion`; missing `expectedVersion` | 409 `STALE_VERSION` and newer data intact; 400 when missing | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-13 | API | AC-12, BR-24 | Same `clientRequestId` sent twice, including in parallel | One row; second response 200 with the original | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-14 | API | BR-13 | Create on a RESOLVED, CLOSED, or CANCELLED Ticket | 409 `TICKET_NOT_ACCEPTING_ACTIONS` | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-15 | API | BR-05 | `actionAt` rules through the API | Future COMPLETED rejected; PLANNED within 30 days accepted | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-16 | API | BR-02 | Staff who is not the owner creates an Action; Ticket has no owner | 201 in both cases | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-17 | API | FR-02, FR-03, BR-22 | Edit then PLANNED to IN_PROGRESS to COMPLETED; also create directly as IN_PROGRESS and COMPLETED, and try to create as CANCELLED | Each success increments `version`; final state read-only; COMPLETED at creation needs a Result; CANCELLED at creation gives 400 | `server/tests/lab-04/actions-taken.api.test.ts` | Pending |
| API-18 | API | AC-13, BR-17 | Resolve a Ticket with an unfinished Action by calling the API directly | 409 `OPEN_ACTIONS_BLOCK_RESOLUTION` with count; status unchanged | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-19 | API | AC-14 | Resolve after all Actions are COMPLETED or CANCELLED | 200; `resolvedAt` set | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-20 | API | AC-15 | Resolve a legacy Ticket with zero Actions | 200 | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-21 | API | AC-16, BR-18 | Cancel a Ticket that has unfinished Actions | Those Actions become CANCELLED with the automatic Result and incremented versions, atomically | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-22 | API | AC-17, BR-14, BR-17 | Create an Action while resolving the same Ticket, repeated 20 times | Always one consistent outcome; never an unfinished Action on a RESOLVED Ticket | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-23 | API | AC-18, BR-22, BR-23 | Ticket status with stale `expectedVersion`; with none | 409 when stale; without it the change applies but the transition is still validated | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-24 | API | AC-19, BR-19, BR-20 | Requester "appears resolved" flag; reopen | Flag changes no status and does not lift the gate; Reopened clears `resolvedAt` and resets the flag | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-25 | API | BR-16 | Table-driven: all 14 valid transitions and sampled invalid ones | Valid give 200; invalid give 400 naming current and requested status | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-26 | API | BR-21 | Request claims a wrong "from" status | Ignored; validated against the stored status | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-27 | API | AC-11, BR-23 | Owner and priority updates with stale `expectedVersion` | 409 `STALE_VERSION`, no change | `server/tests/lab-04/ticket-workflow.api.test.ts` | Pending |
| API-28 | API | AC-02, BR-30 | Requester dashboard with a forged user id in query or body | Only the session user's data returned | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-29 | API | AC-23, BR-32 | Requester with no Tickets | All counts 0; lists empty | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-30 | API | BR-26, BR-29 | Each Requester metric and list against its database query | Counts exact; lists capped at 5 and correctly ordered | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-31 | API | AC-22 | Requester calls staff dashboard; Staff and Administrator call Requester dashboard | 403 in every case | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-32 | API | AC-20, BR-26 | Each staff metric against its database query | All six counts exact | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-33 | API | BR-29 | Staff lists: My recent Tickets, My open Actions, Urgent Tickets | Correct filter, ordering, and cap | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-34 | API | AC-24, BR-30 | User counts in staff dashboard | Present for Administrator; absent for IT Staff | `server/tests/lab-04/staff-dashboard.api.test.ts` | Pending |
| API-35 | API | AC-21, BR-31 | Follow each card's drill-down query on the list endpoints | List `totalItems` equals the card number | `server/tests/lab-04/staff-dashboard.api.test.ts` and `requester-dashboard.api.test.ts` | Pending |
| API-36 | API | Additive change | `currentStatus` comma list on both list endpoints | Valid list works; any invalid value returns 400 | `server/tests/lab-04/status-list-filter.api.test.ts` | Pending |
| API-37 | API | BR-28 | Rolling window edge for "Recently resolved" | In-window Ticket included; just outside excluded | `server/tests/lab-04/requester-dashboard.api.test.ts` | Pending |
| API-38 | API | AC-31, BR-37 | Readiness and health endpoints | `/api/health/ready` 200 when connected, 503 when the database is unreachable; `/api/health` unchanged | `server/tests/lab-04/health-ready.api.test.ts` | Pending |
| API-39 | API | Section 8 additive fields | Ticket responses | `version`, `resolvedAt`, `openActionsCount` present; all earlier fields unchanged | `server/tests/lab-04/ticket-responses.api.test.ts` | Pending |
| SEC-01 | Authorization | BR-25 | Table-driven: every new write endpoint as Requester | 403 each time, no data changed | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| SEC-02 | Authorization | BR-25 | Every new endpoint without a session | 401 each time | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| SEC-03 | Authorization | Lab 3 BR-02 | User who must change password calls new endpoints | Blocked until the password is changed | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| SEC-04 | Authorization | BR-33 | Force an unexpected server error | Body is the safe `{error, code}` shape; no stack trace, SQL, or path | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| SEC-05 | Authorization | AC-04 | Other Requester's Ticket versus a nonexistent Ticket | Responses indistinguishable (no existence leak) | `server/tests/lab-04/authorization.api.test.ts` | Pending |
| PERF-01 | Performance-smoke | AC-32 | Both dashboards with 500 seeded Tickets | Each responds in under 1 second | `server/tests/lab-04/performance-smoke.test.ts` | Pending |
| PERF-02 | Performance-smoke | AC-32 | Actions list for a Ticket with 200 Actions | Responds in under 1 second | `server/tests/lab-04/performance-smoke.test.ts` | Pending |
| MIG-01 | Migration/Regression | AC-25 | Simulated Lab 3 database with data, then Lab 4 migration | Row-by-row before and after comparison: every Ticket, Comment, Note, and Attachment preserved | `server/scripts/test-upgrade-path-lab4.ts` | Pending |
| MIG-02 | Migration/Regression | AC-25, Section 7 | Backfill result | `version` is 1; `resolvedAt` equals `updatedAt` for RESOLVED and CLOSED; no Actions exist | `server/tests/lab-04/migration.test.ts` | Pending |
| MIG-03 | Migration/Regression | Section 7 recovery | Documented rollback script | Lab 3 schema restored with data intact | `server/scripts/test-upgrade-path-lab4.ts` | Pending |
| MIG-04 | Migration/Regression | AC-27 | Run the seed twice | No duplicates; every status present; Tickets with 0, 1, and many Actions; users for zero and non-zero dashboards | `server/tests/lab-04/seed.test.ts` | Pending |
| MIG-05 | Migration/Regression | AC-26 | Lab 1-3 test files unchanged and passing | No diff against `main` for old test files; all pass | `server/tests/lab-01/*`, `server/tests/lab-02/*`, `server/tests/lab-03/*`, `client/tests/lab-01/*`, `client/tests/lab-02/*`, `client/tests/lab-03/*` | Pending |
| MIG-06 | Migration/Regression | AC-25 | Lab 3 upgrade-path script still passes after Lab 4 migrations | Ownership comparison matrix all matches | `server/scripts/test-upgrade-path.ts` | Pending |
| UI-01 | UI | FR-04, FR-17 | Actions Taken list renders (table and cards) with empty state | Rows in stable order; text status badges; empty message when none | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-02 | UI | AC-05, AC-09 | Create and edit modal validation | Field-level errors; follow-up note error appears only when required | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-03 | UI | AC-12, AC-28 | Double click on submit | One request; submit disabled while in flight; `clientRequestId` sent | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-04 | UI | AC-28, BR-34 | 409 and network failure on save | Readable message with reload action; entered values kept | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-05 | UI | AC-08 | Terminal Action | All fields read-only; no save control | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-06 | UI | AC-04, AC-03 | Requester view of Actions Taken | No create, edit, or status controls in the DOM | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-07 | UI | BR-15 | Staff sees the "visible to the Requester" label | Label present | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| UI-08 | UI | FR-17 | Status control on Staff Ticket Detail | Only permitted next statuses offered | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-09 | UI | BR-16 | Confirmation dialogs | Shown for flagged pairs (Open to Cancelled); not for Resolved to Closed or Resolved to Reopened | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-10 | UI | AC-18, AC-13 | Gate block and success | Block message shows the open Action count; success refreshes the summary status | `client/tests/lab-04/TicketWorkflow.test.tsx` | Pending |
| UI-11 | UI | FR-14, FR-18 | Staff Dashboard states | Six cards and three lists; loading, empty, forbidden, and failure states | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-12 | UI | AC-21, AC-24, FR-15 | Staff Dashboard links | Cards are links with accessible names and correct targets; user-count card only for Administrator | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| UI-13 | UI | AC-23, FR-13 | Requester Dashboard | Four cards and three lists; zero state when the user has no Tickets | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-14 | UI | AC-21 | Requester Dashboard drill-down | Links carry the comma-separated status filter | `client/tests/lab-04/RequesterDashboard.test.tsx` | Pending |
| UI-15 | UI | FR-16 | Role navigation | Dashboard entry per role, active-page indication, and correct landing page after login | `client/tests/lab-04/Navigation.test.tsx` | Pending |
| UI-16 | UI | FR-18 | Wrong role reaches a dashboard route | Redirect with a notification, never raw JSON | `client/tests/lab-04/Navigation.test.tsx` | Pending |
| UI-17 | UI | FR-14 | Refresh control | Re-fetches and updates the numbers | `client/tests/lab-04/StaffDashboard.test.tsx` | Pending |
| STYLE-01 | UI Style | Section 7 UI rules | Metric card styling | Label, value, and link use the Zen Green tokens consistently | `client/tests/lab-04/DashboardStyle.test.tsx` | Pending |
| STYLE-02 | UI Style | BR-35 | Status and priority badges | Always show text, never color alone | `client/tests/lab-04/DashboardStyle.test.tsx` | Pending |
| STYLE-03 | UI Style | Lab 2 and 3 form rules | Validation placement and required markers in the Action form | Message directly under the field; asterisk plus message | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| STYLE-04 | UI Style | BR-15 | Actions Taken versus Internal Notes | Visually distinct private and shared areas | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| A11Y-01 | Accessibility | AC-29, BR-35 | Modal dialog | Focus moves in, is trapped, Escape closes, focus returns to the opener | `client/tests/lab-04/ActionsTaken.test.tsx` | Pending |
| A11Y-02 | Accessibility | AC-29 | Keyboard operation of cards, status control, and modal | Fully operable by keyboard; focus always visible | `e2e/lab-04/accessibility.spec.ts` | Pending |
| A11Y-03 | Accessibility | AC-29 | Automated accessibility scan (axe) of both dashboards, Staff and Requester Ticket Detail | No serious or critical violations | `e2e/lab-04/accessibility.spec.ts` | Pending |
| RESP-01 | Responsive | AC-30 | Staff Dashboard at desktop, tablet, mobile | No clipping or overlap; cards reflow | Playwright screenshots (Section 4) | Pending |
| RESP-02 | Responsive | AC-30 | Requester Dashboard at three viewports | Same | Playwright screenshots (Section 4) | Pending |
| RESP-03 | Responsive | AC-30 | Actions Taken table becomes cards on mobile; modal fits | Usable at every size | Playwright screenshots (Section 4) | Pending |
| RESP-04 | Responsive | AC-30 | Programmatic check on the screens above | Page `scrollWidth` does not exceed `clientWidth` at any viewport | `e2e/lab-04/dashboards.spec.ts` and `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-01 | E2E | AC-01, AC-04, AC-08 | Staff creates, edits, starts, and completes an Action; the Requester sees it read-only | List updates for staff; Requester has no controls | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-05, AC-11, AC-28 | Follow-up validation; two staff edit the same Action | Second save shows the conflict message and keeps the typed data | `e2e/lab-04/actions-taken-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-13, AC-14, AC-19 | Resolve blocked by an unfinished Action, then complete it and resolve; direct API attempt | Blocked with the open count; allowed after completion; API bypass gets 409 | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-04 | E2E | AC-16 | Cancel a Ticket with unfinished Actions | Actions show CANCELLED with the automatic Result | `e2e/lab-04/ticket-resolution.spec.ts` | Pending |
| E2E-05 | E2E | AC-02, AC-20, AC-21, AC-23 | Both dashboards: counts, drill-down, empty Requester | Counts match the Queue and My Tickets lists they open | `e2e/lab-04/dashboards.spec.ts` | Pending |
| E2E-06 | E2E | AC-33, BR-36 | Console and link sweep through every role's primary flow | Zero console errors; no broken links | `e2e/lab-04/regression-sweep.spec.ts` | Pending |
| E2E-07 | E2E | AC-26 | Representative Lab 1-3 flow: login with password change, create Ticket with attachment, staff claim, Internal Note hidden from the Requester, Administrator creates a user | All steps behave as in Lab 3 | `e2e/lab-04/regression-sweep.spec.ts` | Pending |

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
| AC-20 | Staff metrics match the database | UNIT-05, API-32, API-33, E2E-05 |
| AC-21 | Card count equals drill-down total | API-35, UI-12, UI-14, E2E-05 |
| AC-22 | Wrong-role dashboard calls give 403 | API-31, UI-16 |
| AC-23 | Zero-ticket Requester sees zeros and empty messages | API-29, UI-13, E2E-05 |
| AC-24 | User counts only for Administrator | API-34, UI-12 |
| AC-25 | Lab 3 data survives the migration | MIG-01, MIG-02, MIG-06 |
| AC-26 | Lab 1-3 suites pass unmodified | MIG-05, E2E-07 |
| AC-27 | Seed is idempotent and complete | MIG-04 |
| AC-28 | Forms keep data; no duplicate submit | UI-03, UI-04, E2E-02 |
| AC-29 | Accessibility rules | A11Y-01, A11Y-02, A11Y-03 |
| AC-30 | Responsive with no overflow | RESP-01, RESP-02, RESP-03, RESP-04 |
| AC-31 | Readiness and health endpoints | API-38 |
| AC-32 | Performance smoke | PERF-01, PERF-02 |
| AC-33 | No console errors or broken links | E2E-06 |

Business rules covered outside an AC: BR-02 (API-16), BR-13 (API-14), BR-16 (UNIT-04,
API-25), BR-21 (API-26), BR-28 (UNIT-05, API-37), BR-33 (SEC-04), BR-34 (UI-04),
BR-37 (API-38), BR-38 (MIG-04).

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

# Lab 4 upgrade-path and rollback proof against a simulated Lab 3 database with data
cd server
npx tsx scripts/test-upgrade-path-lab4.ts
```

Repeat the full sequence at least three times in a row. Any result that differs between
runs is a flaky test and must be fixed before release.

## 6. Final Results

[Fill in after the final run on `main`: counts of passing tests per suite, terminal output
screenshots, the date, the CI run link, and confirmation that Lab 1-3 tests still pass
unmodified.]

## 7. Known Limitations or Deferred Tests

[Fill in any test intentionally not done, with the reason. For example, a real
multi-browser concurrency test is replaced by two parallel API sessions.]
