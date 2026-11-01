# Issue 4 Verification: Ticket Workflow and Resolution Gate

| Item | Value |
|---|---|
| Date | 2026-10-31 |
| Branch | `feature/4-lab4-ticket-workflow` |
| `git rev-parse HEAD` | `f9a1c24db103763c160a2d89b6dce1f13fb117ce` |
| `git rev-parse origin/lab4-staging` | `989fa0982565b6163fb8698ad0c3f8bb7ab30789` |
| `node -v` | `v24.14.0` |
| Working tree at run time | `HEAD` plus one uncommitted line in `server/src/app.ts` (see "TypeScript and build") |

All numbers below come from the runs made for this file:

1. The database was reset with `npm run db:reset --prefix server`.
2. The full suites were run with the Vitest JSON reporter.
3. Each `tests/lab-04` folder was then run on its own.
4. Playwright was run last, and the database was reset again afterwards.

## 1. Acceptance Tests of Issue 4

These are the 16 rows that `docs/lab-04/tests.md` assigns to Issue 4. **Tests** counts the tests whose name starts with the ID, read from the JSON report of the full run.

| ID | Test file | Tests | Result |
|---|---|---|---|
| UNIT-04 | `server/tests/lab-04/ticket-transition.unit.test.ts` | 18 | passed (18/18) |
| UNIT-06 | `client/tests/lab-04/confirmation.unit.test.tsx` | 17 | passed (17/17) |
| API-18 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 2 | passed (2/2) |
| API-19 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 1 | passed (1/1) |
| API-20 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 1 | passed (1/1) |
| API-21 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 2 | passed (2/2) |
| API-22 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 1 | passed (1/1) |
| API-23 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 3 | passed (3/3) |
| API-24 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 1 | passed (1/1) |
| API-25 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 15 | passed (15/15) |
| API-26 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 1 | passed (1/1) |
| API-27 | `server/tests/lab-04/ticket-workflow.api.test.ts` | 3 | passed (3/3) |
| API-39 | `server/tests/lab-04/ticket-responses.api.test.ts` | 4 | passed (4/4) |
| UI-08 | `client/tests/lab-04/TicketWorkflow.test.tsx` | 10 | passed (10/10) |
| UI-09 | `client/tests/lab-04/TicketWorkflow.test.tsx` | 6 | passed (6/6) |
| UI-10 | `client/tests/lab-04/TicketWorkflow.test.tsx` | 7 | passed (7/7) |

### Related rows that stay Pending

**API-42** (`server/tests/lab-04/check-order.api.test.ts`)

- This work added the Ticket part, which is the describe block "API-42: check order of the Ticket owner, priority, and status endpoints". All 25 of its tests passed. The Actions Taken part comes from Issue 3: 35 tests, all passed.
- The row stays **Pending** because Issue 5 adds the dashboard endpoints, and those must be covered too.

**SEC-01, SEC-02 and SEC-03** (`server/tests/lab-04/authorization.api.test.ts`)

- This work added the describe block "Authorization of the Ticket workflow endpoints". It has 1 test for each ID, and all 3 passed:
  - SEC-01: Requester gets 403
  - SEC-02: no session gets 401
  - SEC-03: password change required
- These rows also stay **Pending** until Issue 5 adds the dashboard endpoints.

## 2. Test suites

### Vitest, full run per folder (after `db:reset`)

| Side | Folder | Files | Tests | Result |
|---|---|---|---|---|
| server | `tests/lab-01` | 2 | 3 | 3 passed |
| server | `tests/lab-02` | 6 | 29 | 29 passed |
| server | `tests/lab-03` | 8 | 63 | 63 passed |
| server | `tests/lab-04` | 12 | 218 | 218 passed |
| **server** | **total** | **28** | **313** | **313 passed, 0 failed** |
| client | `tests/lab-01` | 1 | 4 | 4 passed |
| client | `tests/lab-02` | 4 | 19 | 19 passed |
| client | `tests/lab-03` | 6 | 25 | 25 passed |
| client | `tests/lab-04` | 3 | 73 | 73 passed |
| **client** | **total** | **14** | **121** | **121 passed, 0 failed** |

The folder sums match the Vitest totals on both sides: 313 for the server and 121 for the client.

### Vitest summary lines, copied from the output

Server, full run (`npx vitest run`):

```
Test Files  28 passed (28)
Tests  313 passed (313)
```

Server, Lab 4 suite (`npx vitest run tests/lab-04`):

```
Test Files  12 passed (12)
Tests  218 passed (218)
```

Client, full run (`npx vitest run`):

```
Test Files  14 passed (14)
Tests  121 passed (121)
```

Client, Lab 4 suite (`npx vitest run tests/lab-04`):

```
Test Files  3 passed (3)
Tests  73 passed (73)
```

The Lab 4 suite also contains the Issue 1 to Issue 3 tests that live in `tests/lab-04`.

### TypeScript and build

| Check | Result |
|---|---|
| server `npx tsc --noEmit` (before the fix) | 2 errors: `src/app.ts(1502,23): error TS2304: Cannot find name 'Role'.` and `src/app.ts(1578,102): error TS2304: Cannot find name 'Role'.` |
| server `npx tsc --noEmit` (after the fix) | no output, exit code 0 |
| server `npm run build` (`tsc`) | no errors, exit code 0 |
| client `npx tsc --noEmit` | no output, exit code 0 (run twice: before and after the test runs) |
| client `npm run build` | `✓ 64 modules transformed.` … `✓ built in 1.56s`, exit code 0 |

**About the Role errors**

- `Role` is a Prisma enum, defined at `server/prisma/schema.prisma` line 13.
- `origin/main:server/src/app.ts` already uses `role as Role` at lines 1655 and 1731 without importing it. The errors therefore existed before Issue 4.
- The fix is this single line, added after the existing `import { Priority } from "@prisma/client";`:

  ```ts
  import type { Role } from "@prisma/client";
  ```

  Nothing else in `app.ts` was changed for this fix.

### Playwright (`npx playwright test`, one run, run last)

- **Result:** 23 passed, 4 skipped, 0 failed (1.1m), exit code 0.
- **Projects:** desktop, tablet and mobile.
- **Reruns:** none; the first run passed.

The 4 skips are `test.skip()` calls written in `e2e/lab-03/staff-ticket-flow.spec.ts`. They are not failures.

| Skipped test | Project | Reason in the spec |
|---|---|---|
| E2E-02: IT Staff claims Ticket, posts Public Comment and Internal Note | tablet, mobile | Lines 85-90: "Skip this entire describe block for non-desktop projects to avoid shared-state issues". The desktop run of E2E-02 passed. |
| RESP-02a: Staff Queue responsive screenshot | desktop | Lines 220-222: "Skip desktop — already captured in E2E-02 flow above" |
| RESP-02b: Staff Ticket Detail responsive screenshot | desktop | Lines 241-243: same reason |

After the run, `git restore artifacts/` reverted the regenerated screenshots, and `npm run db:reset --prefix server` restored the database. A check after the reset found 14 `l4-` users, 10 `TKT-L4-` Tickets, 13 ActionTaken rows, and 0 `act-` or `ticketwf-` test users.

## 3. Acceptance Criteria of Issue 4

Each row lists the test names shortened from the JSON report. The **Manual check** column is for the tester to fill in.

| # | Acceptance Criterion | Test IDs | Tests (from the JSON report, shortened) | Automated result | Manual check (tester, date, result) |
|---|---|---|---|---|---|
| 1 | Backend Transition Matrix | UNIT-04, API-25, API-26, API-21 | "has exactly the 14 pairs of BR-16"; "every other pair of the 8 statuses (50 pairs …) is rejected"; "Cancelled is terminal"; 14 × "X -> Y gives 200"; "every pair not in the matrix gives 400 naming the current and requested status"; "a 'from' status claimed by the client is ignored"; "cancelling cancels every PLANNED and IN_PROGRESS Action …" | passed (18 + 15 + 1 + 2) | |
| 2 | Resolution Gate | API-18, API-19, API-20, API-22, API-24 | "resolving … while an Action is unfinished gives 409 with the count and changes nothing"; "a pair that is not in the matrix gives 400 INVALID_TRANSITION, not the gate"; "once every Action is COMPLETED or CANCELLED … Resolved succeeds"; "a Ticket with zero Actions can be resolved"; "creating a PLANNED Action while resolving …, 20 times, always gives one consistent outcome"; "the Requester's flag … does not lift the gate" | passed (2 + 1 + 1 + 1 + 1) | |
| 3 | Stale Version Conflict | API-23, API-27, API-39, UI-10 | "a stale expectedVersion gives 409 STALE_VERSION with the current header and changes nothing"; "without expectedVersion the change applies, but the pair and the gate are still checked"; "owner and IT Priority with a stale expectedVersion give 409"; "a STALE_VERSION body carries the same header"; "a 409 STALE_VERSION shows the conflict with a Reload button and does not overwrite"; "owner and priority conflicts … offer a Reload too" | passed (3 + 3 + 1 + 2) | |
| 4 | UI Confirmation Dialog | UNIT-06, UI-09 | 14 × "X -> Y needs confirmation: true/false"; "the question names both statuses, and Cancelled adds the count of unfinished actions"; "Open to Cancelled asks with the count …; Cancel sends nothing, OK sends the change"; "RESOLVED to CLOSED does not ask"; "CLOSED to REOPENED asks 'Change status from Closed to Reopened?' first" | passed (17 + 6) | |
| 5 | Refresh After Status Change | UI-10, API-39 | "a successful change refreshes the summary status badge and version without reloading, and announces it politely"; "a change sends expectedVersion only when the Ticket has a version"; "status, owner, and priority return the Ticket header …" | passed (2 + 1) | |
| 6 | Readable Gate Callout | UI-10, UI-08 | "with unfinished actions Resolved is disabled, the callout shows the count, and its link moves focus to the Actions Taken card"; "a 409 gate from the server (stale data) shows the same callout and refreshes the counts"; "completing an Action lowers the count in the callout"; "a Cancelled Ticket offers no transition and its Ticket Operations fields are read-only" | passed (3 + 1) | |

## 4. Regression

**Lab 1 to Lab 3 tests**

- All passed. No Lab 1 to Lab 3 test file was changed.
  - Server: lab-01 3, lab-02 29, lab-03 63, for 95 tests in 16 files.
  - Client: lab-01 4, lab-02 19, lab-03 25, for 48 tests in 11 files.

**`git diff --stat origin/lab4-staging` on the protected paths**

- `server/tests/lab-01`, `server/tests/lab-02`, `server/tests/lab-03`, `client/tests/lab-01`, `client/tests/lab-02`, `client/tests/lab-03`, `e2e` and `server/prisma/migrations`: **empty**.
- `docs`: **not empty**.
  - Three files differ from `origin/lab4-staging`:
    - `docs/lab-04/api-spec.md` (18 lines)
    - `docs/lab-04/tests.md` (90 lines)
    - `docs/lab-04/ui-spec.md` (8 lines)
  - Two documentation commits by the branch author on this branch made these changes:
    - `92b7091` "docs(lab-04): Issue 4 contract clarifications"
    - `9dd2e30` "docs(lab-04): mark the Issue 2 and Issue 3 test rows Pass with evidence"
  - No code commit of Issue 4 touches `docs`. This file is the only new file under `docs` in this verification.

**Playwright:** 23 passed, 4 skipped (spec-defined `test.skip()`), 0 failed. Lab 2 and Lab 3 E2E pass, including the desktop run of `e2e/lab-03/staff-ticket-flow.spec.ts` E2E-02 against the Staff Ticket Detail page changed in Issue 4.

## 5. GitHub CI

| Item | Link / result |
|---|---|
| CI run | |
| Result | |
| Checked by / date | |
