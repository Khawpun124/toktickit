# Issue 5 Verification: Role Dashboards

| Item | Value |
|---|---|
| Date | 2026-11-01 |
| Branch | `feature/5-lab4-role-dashboards` |
| `git rev-parse HEAD` | `66b67449f56928e0577a47ae87572a5066f7de71` |
| `git rev-parse origin/lab4-staging` | `76d55a39ebb0f6b9e28d46685bd5259ede03ef7d` |
| `node -v` | `v24.14.0` |

All figures come from the CP3 run on this commit:

1. `docker compose down -v`, `docker compose up -d`, `pg_isready`, `prisma migrate deploy` (10 migrations), `prisma db seed` (14 Lab 4 users, 10 of 10 Lab 4 Tickets).
2. The server suite was run 3 times and the client suite 3 times, each with the Vitest JSON reporter.
3. Playwright was run once.
4. `git restore artifacts/` was run afterwards.

Per-test numbers are read from the JSON reports of round 1. Rounds 2 and 3 gave the same totals per folder.

**TypeScript, build, and the wiring check:** these were run again on the same commit (working tree clean) while this file was written.

## 1. Acceptance Tests of Issue 5

`docs/lab-04/tests.md` lists **25** rows with Planned Issue "Issue 5"; all 25 are below.

**Tests** counts the tests whose name starts with the ID, in `tests/lab-04` only. Some IDs (UI-11, UI-12, UI-13, STYLE-02) are also used by older tests in `client/tests/lab-02` and `client/tests/lab-03`; those Lab 2/3 tests are not counted here.

| ID | Test file | Tests | Result |
|---|---|---|---|
| UNIT-05 | `server/tests/lab-04/dashboard-helpers.unit.test.ts` | 6 | passed (6/6) |
| API-28 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-29 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-30 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 2 | passed (2/2) |
| API-31 | `server/tests/lab-04/staff-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-32 | `server/tests/lab-04/staff-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-33 | `server/tests/lab-04/staff-dashboard.api.test.ts` | 3 | passed (3/3) |
| API-34 | `server/tests/lab-04/staff-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-35 | `server/tests/lab-04/requester-dashboard.api.test.ts`, `server/tests/lab-04/staff-dashboard.api.test.ts` | 2 | passed (2/2) |
| API-36 | `server/tests/lab-04/status-list-filter.api.test.ts` | 7 | passed (7/7) |
| API-37 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-41 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 1 | passed (1/1) |
| API-44 | `server/tests/lab-04/requester-dashboard.api.test.ts` | 1 | passed (1/1) |
| PERF-01 | `server/tests/lab-04/performance-smoke.test.ts` | 2 | passed (2/2) |
| UI-11 | `client/tests/lab-04/StaffDashboard.test.tsx` | 5 | passed (5/5) |
| UI-12 | `client/tests/lab-04/StaffDashboard.test.tsx` | 10 | passed (10/10) |
| UI-13 | `client/tests/lab-04/RequesterDashboard.test.tsx` | 3 | passed (3/3) |
| UI-14 | `client/tests/lab-04/RequesterDashboard.test.tsx` | 5 | passed (5/5) |
| UI-15 | `client/tests/lab-04/Navigation.test.tsx` | 18 | passed (18/18) |
| UI-16 | `client/tests/lab-04/Navigation.test.tsx` | 4 | passed (4/4) |
| UI-17 | `client/tests/lab-04/StaffDashboard.test.tsx` | 1 | passed (1/1) |
| UI-19 | `client/tests/lab-04/StaffDashboard.test.tsx`, `client/tests/lab-04/RequesterDashboard.test.tsx` | 2 | passed (2/2) |
| UI-21 | `client/tests/lab-04/StaffDashboard.test.tsx` | 3 | passed (3/3) |
| STYLE-01 | `client/tests/lab-04/DashboardStyle.test.tsx` | 3 | passed (3/3) |
| STYLE-02 | `client/tests/lab-04/DashboardStyle.test.tsx` | 2 | passed (2/2) |

### Shared rows now covering all new endpoints

API-42 and SEC-01 to SEC-03 are planned for Issues 2, 4, and 5. With Issue 5 they cover the Actions Taken endpoints, the Ticket owner, priority, and status endpoints, and the dashboard endpoints.

| ID | Describe block | Tests | Result |
|---|---|---|---|
| API-42 | API-42: check order of the Actions Taken endpoints | 35 | passed (35/35) |
| API-42 | API-42: check order of the Ticket owner, priority, and status endpoints | 25 | passed (25/25) |
| API-42 | API-42: check order of the dashboard endpoints | 8 | passed (8/8) |
| SEC-01 | Authorization of the Actions Taken / Ticket workflow / dashboard endpoints | 1 + 1 + 1 | passed (3/3) |
| SEC-02 | Authorization of the Actions Taken / Ticket workflow / dashboard endpoints | 1 + 1 + 1 | passed (3/3) |
| SEC-03 | Authorization of the Actions Taken / Ticket workflow / dashboard endpoints | 1 + 1 + 1 | passed (3/3) |

The API-42 blocks are in `server/tests/lab-04/check-order.api.test.ts`. The SEC blocks are in `server/tests/lab-04/authorization.api.test.ts`.

## 2. Test suites

### Vitest per folder (the same in rounds 1, 2, and 3)

| Side | Folder | Files | Tests | Result |
|---|---|---|---|---|
| server | `tests/lab-01` | 2 | 3 | 3 passed |
| server | `tests/lab-02` | 6 | 29 | 29 passed |
| server | `tests/lab-03` | 8 | 63 | 63 passed |
| server | `tests/lab-04` | 16 | 259 | 259 passed |
| **server** | **total** | **32** | **354** | **354 passed, 0 failed, 0 skipped** |
| client | `tests/lab-01` | 1 | 4 | 4 passed |
| client | `tests/lab-02` | 4 | 19 | 19 passed |
| client | `tests/lab-03` | 6 | 25 | 25 passed |
| client | `tests/lab-04` | 7 | 129 | 129 passed |
| **client** | **total** | **18** | **177** | **177 passed, 0 failed, 0 skipped** |

### Vitest summary lines, copied from the output

Server, round 1:

```
Test Files  32 passed (32)
Tests  354 passed (354)
Duration  77.54s (transform 739ms, setup 0ms, collect 16.74s, tests 47.19s, environment 6ms, prepare 5.50s)
```

Server, round 2:

```
Test Files  32 passed (32)
Tests  354 passed (354)
Duration  76.61s (transform 684ms, setup 0ms, collect 16.62s, tests 46.63s, environment 6ms, prepare 5.31s)
```

Server, round 3:

```
Test Files  32 passed (32)
Tests  354 passed (354)
Duration  77.22s (transform 667ms, setup 0ms, collect 16.50s, tests 47.07s, environment 6ms, prepare 5.45s)
```

Client, round 1:

```
Test Files  18 passed (18)
Tests  177 passed (177)
Duration  25.06s (transform 3.19s, setup 16.46s, collect 29.26s, tests 55.88s, environment 98.87s, prepare 14.70s)
```

Client, round 2:

```
Test Files  18 passed (18)
Tests  177 passed (177)
Duration  25.04s (transform 3.63s, setup 17.12s, collect 29.49s, tests 54.77s, environment 101.01s, prepare 11.84s)
```

Client, round 3:

```
Test Files  18 passed (18)
Tests  177 passed (177)
Duration  24.21s (transform 3.33s, setup 16.17s, collect 26.49s, tests 53.49s, environment 97.63s, prepare 11.46s)
```

In each client round the log has 0 lines "not wrapped in act", 0 "Unhandled", and 0 React "Warning:".

**PERF-01 timings** (from the server logs, per request, threshold under 1000 ms):

| Round | Requester dashboard | Staff dashboard |
|---|---|---|
| 1 | 29.3 ms | 35.7 ms |
| 2 | 26.6 ms | 30.3 ms |
| 3 | 27.4 ms | 33.3 ms |

### TypeScript and build

| Check | Result |
|---|---|
| server `npx tsc --noEmit` | no output, exit code 0 |
| server `npm run build` (`tsc`) | exit code 0 |
| client `npx tsc --noEmit` | no output, exit code 0 |
| client `npm run build` | `✓ 72 modules transformed.` … `✓ built in 1.42s`, exit code 0 |

### Playwright (`npx playwright test`, one run)

- **Result:** 23 passed, 4 skipped, 0 failed (1.1m), exit code 0.
- **Projects:** desktop, tablet, and mobile.
- **Reruns:** none; the first run passed.

The 4 skips are `test.skip()` calls written in `e2e/lab-03/staff-ticket-flow.spec.ts`. They are not failures.

| Skipped test | Project | Reason in the spec |
|---|---|---|
| E2E-02: IT Staff claims Ticket, posts Public Comment and Internal Note | tablet, mobile | Lines 85-90: "Skip this entire describe block for non-desktop projects to avoid shared-state issues". The desktop run passed. |
| RESP-02a: Staff Queue responsive screenshot | desktop | "Skip desktop — already captured in E2E-02 flow above" |
| RESP-02b: Staff Ticket Detail responsive screenshot | desktop | Same reason |

**Lab 3 login helper:** `loginAndHandlePasswordChange` still works now that IT Staff and Administrators land on `/staff/dashboard`.

- It is called at `staff-ticket-flow.spec.ts` lines 104, 132, 178, 229, 252, and 269, and at `user-administration.spec.ts` line 74.
- Every test that calls it passed:
  - desktop E2E-02
  - RESP-02a and RESP-02b on tablet and mobile
  - E2E-03 (Administrator) on all three projects
- The helper waits for the Logout button. The tests then open their own URL (`/staff/tickets`, `/admin/users`), so the new landing page does not change their path.

## 3. Data criteria after each server round

Columns:
- **act-, ticketwf-, dashtest-**: test users left behind.
- **TKT-PERF-**: PERF-01 Tickets left behind.
- **l4-** and **TKT-L4-**: the Lab 4 seed.
- **inactive-/authtest-**: users created by the unchanged Lab 3 tests (8 per round, expected).

The counts were queried after each round. The query output was captured in the CP3 console session; no separate file was kept.

| Point | act- | ticketwf- | dashtest- | TKT-PERF- | l4- users | TKT-L4- Tickets | ActionTaken (all) | inactive-/authtest- |
|---|---|---|---|---|---|---|---|---|
| After seed | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 0 |
| After round 1 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 8 |
| After round 2 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 16 |
| After round 3 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 24 |

## 4. Acceptance Criteria of Issue 5

The **Manual check** column is for the tester to fill in.

| # | Criterion | Test IDs | Tests (from the JSON report, shortened) | Automated result | Manual check (tester, date, result) |
|---|---|---|---|---|---|
| 1 | Card numbers equal the database | API-30, API-32, API-35 | "every count equals its own SQL count…"; "the three lists match their SQL order, are capped at 5…"; "all six staff counts equal their SQL counts"; "each Requester card's query on GET /api/tickets gives totalItems equal to the card number"; "each staff card's query on GET /api/staff/tickets gives totalItems equal to the card number (IT Staff and Administrator)" | passed (2 + 1 + 2) | |
| 2 | 30-day window and one generatedAt | API-37, UNIT-05 | "resolved exactly 30 days before generatedAt is included; 30 days plus 1 ms is excluded (fixed clock)"; "the window starts exactly 30 x 24 hours (2,592,000,000 ms) before generatedAt"; "both ends are inclusive…"; "a window across a daylight-saving change is still exactly 30 x 24 hours"; "the helpers never read the process time zone or local calendar fields" | passed (1 + 6) | |
| 3 | Same result under three server time zones | API-41 | "under TZ=UTC, Asia/Bangkok, and America/Los_Angeles both dashboards return identical results in UTC" (one child process per TZ; the test checks the three offsets 0, -420, 420) | passed (1) | |
| 4 | Needs your attention order | API-44 | "longest waiting first by statusChangedAt; a later comment or owner change does not reorder; re-entering Waiting restarts the wait" | passed (1) | |
| 5 | Urgent Tickets | API-33, UI-21 | "Urgent Tickets are only active Tickets with IT Priority HIGH, least recently updated first, ties by id ascending"; "rows are exactly the payload items in API order…"; "the UI does not filter or re-sort…"; "an empty payload shows 'No urgent tickets.'" | passed (1 + 3) | |
| 6 | Access control | API-28, API-31, SEC-01 to SEC-03 | "a forged user id in the query or body is ignored…"; "a Requester calling the staff dashboard, and IT Staff or an Administrator calling the Requester dashboard, get 403"; the dashboard SEC-01, SEC-02, SEC-03 tests (403 FORBIDDEN, 401 without a session, 403 PASSWORD_CHANGE_REQUIRED until changed) | passed (1 + 1 + 3) | |
| 7 | Drill-down from every card | API-35, UI-12, UI-14 | API-35 above; "following '<card>' opens the Queue with that filter, and the Queue's controls show it" (6 cards); "following '<card>' opens My Tickets with that filter, shown in the Status control" (4 cards); "every card is one link (<a>, not a button)…"; "the card links carry the comma-separated status filter" | passed (2 + 10 + 5) | |
| 8 | Role navigation and landing page | UI-15, UI-16 | "after login the 'Requester' lands on '/tickets'"; "after login the 'IT Staff' / 'Administrator' lands on '/staff/dashboard'"; the same after the mandatory password change; "reopening a page with a restored session keeps that page"; "navigation is buttons with the old labels and Dashboard first, wrapping instead of a menu"; "the active entry carries aria-current='page'…"; "typing '<other dashboard>' is redirected … with a notification"; "a 403 from the dashboard API shows a readable message, never raw JSON". **Wiring check:** removing the post-login redirect made 4 tests fail; restoring the old staff default path made 2 tests fail (see below). | passed (18 + 4) | |
| 9 | Responsive layout and browser time | UI-19 | "times follow the browser time zone; counts, rows, and order do not change" (Staff); "'Waiting since' and 'Updated' change with the time zone; counts, rows, and order do not" (Requester). jsdom does not lay out pages, so the responsive rules (ui-spec section 10) have no automated test; they are for the manual check. | passed (2) | |

### Wiring check for criterion 8

The landing wiring in `client/src/App.tsx` was changed temporarily, `client/tests/lab-04/Navigation.test.tsx` was run, and the file was restored. After the restore `git status` was clean and Navigation passed 22/22.

| Temporary change | Navigation.test.tsx result | Failing tests |
|---|---|---|
| A: post-login redirect disabled (`if (landing)` changed to `if (false && landing)`) | `Tests  4 failed \| 18 passed (22)` | the three deep-link landing tests (Requester, IT Staff, Administrator); "after the mandatory password change the 'Requester' lands on '/tickets'" |
| B: staff default path set back to `/staff/tickets` | `Tests  2 failed \| 20 passed (22)` | "an 'IT Staff' opening / lands on the IT Staff Dashboard"; "an 'Administrator' opening / lands on the IT Staff Dashboard" |

## 5. Regression

**Lab 1 to Lab 3 tests:** all passed in all 3 rounds, and no Lab 1-3 test file was changed.

| Side | lab-01 | lab-02 | lab-03 | Total |
|---|---|---|---|---|
| server | 3 tests, 2 files | 29 tests, 6 files | 63 tests, 8 files | 95 tests, 16 files |
| client | 4 tests, 1 file | 19 tests, 4 files | 25 tests, 6 files | 48 tests, 11 files |

The three client tests that open the app as a Requester and expect My Tickets passed without changes:

- `client/tests/lab-01/App.test.tsx`: two tests
- `client/tests/lab-02/MyTickets.test.tsx`: UI-09

This holds because a Requester keeps landing on My Tickets (FR-16 as clarified in commit `e06eaa0`).

**`git diff --stat`** of `server/tests/lab-01`, `server/tests/lab-02`, `server/tests/lab-03`, `client/tests/lab-01`, `client/tests/lab-02`, `client/tests/lab-03`, and `e2e` is **empty**:

- in the working tree;
- between `origin/lab4-staging` and `HEAD`, where `server/prisma/migrations` is also empty.

**Playwright:** 23 passed, 4 skipped (spec-defined `test.skip()`), 0 failed. All Lab 2 and Lab 3 E2E pass with the new header entries and the new staff landing page.

## 6. GitHub CI

| Item | Link / result |
|---|---|
| CI run | |
| Result | |
| Checked by / date | |
