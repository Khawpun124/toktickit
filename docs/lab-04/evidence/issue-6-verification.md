# Issue 6 Verification: Final Hardening

| Item | Value |
|---|---|
| Date | 2026-11-01 |
| Branch | `feature/6-lab4-final-hardening` |
| `git rev-parse HEAD` | `db65efd3cb7cffea39139814bc6b8bf1ae443601` |
| `git rev-parse origin/lab4-staging` | `3d38d599d36bd7f591a6e62d9c23b0fe88071aa1` |
| `node -v` | `v24.14.0` |

## How these figures were produced

**CP4, on commit `db65efd`.** Every figure in sections 1 to 6 comes from this run, made in this order:

1. `docker compose down -v` and `docker compose up -d`.
2. `pg_isready` (ready after 3 tries).
3. `prisma migrate deploy`: 10 migrations applied.
4. `prisma db seed`: 14 Lab 4 users, 10 of 10 Lab 4 Tickets.
5. The server suite, run 3 times, then the client suite, run 3 times, each with the Vitest JSON reporter.
6. `tsc --noEmit` and `npm run build` on both sides.
7. Playwright, once, through `npm run test:e2e:clean` with the JSON reporter.

The JSON and log files are kept outside the repository. Per-test numbers are read from round 1. Rounds 2 and 3 gave the same totals per folder.

**CP3.** Section 7 ("README verification") comes from the CP3 run of the README commands, on the working tree that was committed as `db65efd`. After that run, only README wording changed:
- the `--at-upgrade` note;
- the sentence about seeded databases.

## 1. Acceptance Tests of Issue 6

`docs/lab-04/tests.md` assigns two rows to Issue 6.

| ID | Test file | Tests | Result |
|---|---|---|---|
| API-38 | `server/tests/lab-04/health-ready.api.test.ts` | 6 | passed (6/6) |
| SEC-04 | `server/tests/lab-04/authorization.api.test.ts`, describe "SEC-04: app-level safe errors" | 9 | passed (9/9) |

The test names, from the JSON report:

**API-38**
- `/api/health/ready` answers 200 `{ status: "ready" }` when the database answers, with no session
- readiness needs no login and ignores a session cookie, valid or not
- when the database is unreachable it answers 503 with the safe body only, and logs the real cause
- an outage also answers 503 (not 500) for a request that carries a session cookie
- readiness recovers as soon as the database answers again
- `/api/health` is unchanged and does not depend on the database

**SEC-04**
- a malformed JSON body gets 400 VALIDATION_FAILED on Lab 1-3 and Lab 4 endpoints, with no stack or HTML
- a body over the parser limit gets 413 VALIDATION_FAILED "Request body is too large."
- an unknown /api path gets 404 NOT_FOUND for every method, with or without a session
- an error that escapes a handler (session lookup fails) gets 500 INTERNAL_ERROR, and the log has the real cause but no cookie or body
- a promise rejected inside a Lab 2 handler (create Ticket, upload) gets 500 INTERNAL_ERROR instead of hanging
- NODE_ENV=production / development / test gives the same safe bodies (3 tests)
- the server log is silent under NODE_ENV=test and writes one line (no body, no cookie) otherwise

### Hardening tests without a tests.md row

These tests are named "Hardening: …" and use no tests.md ID.

| File | Tests | Result | What they check |
|---|---|---|---|
| `server/tests/lab-04/hardening.api.test.ts` | 12 | passed (12/12) | See the list below. |
| `client/tests/lab-04/Hardening.test.tsx` | 28 | passed (28/28) | See the list below. |

The server tests check:
- the INVALID_TRANSITION `to` is a string for an object, array, number, or boolean `newStatus` (4 tests), and a valid string pair is unchanged;
- the Lab 4 routes log the real cause of a 500 and answer safely;
- the server log keeps only the name, the Prisma code, and the last line of the message, cut at 300 characters, with a real P2002 and a real validation error (4 tests);
- an 11 MB upload answers "File exceeds the 5 MB limit", and the 6 MB and no-file messages are unchanged (2 tests).

The client tests check:
- the main screens of every role, rendered through the real routes, show no leftover text, and any `console.error` fails the test;
- "Ticket not found" replaces the status code;
- a scan of every file in `client/src` finds no console output, TODO or FIXME, Lorem, "Development Requester", "implemented in Issue", stub, `#` or empty links, or `alert(`;
- `roles.ts` is the single source of paths, checked on the real router for all three roles;
- three dialogs trap focus, close with Escape, and return focus;
- forms prevent a second submission and keep their values;
- answers that are not JSON show readable messages.

## 2. Test suites

### Vitest per folder (the same in rounds 1, 2, and 3)

| Side | Folder | Files | Tests | Result |
|---|---|---|---|---|
| server | `tests/lab-01` | 2 | 3 | 3 passed |
| server | `tests/lab-02` | 6 | 29 | 29 passed |
| server | `tests/lab-03` | 8 | 63 | 63 passed |
| server | `tests/lab-04` | 18 | 286 | 286 passed |
| **server** | **total** | **34** | **381** | **381 passed, 0 failed, 0 skipped** |
| client | `tests/lab-01` | 1 | 4 | 4 passed |
| client | `tests/lab-02` | 4 | 19 | 19 passed |
| client | `tests/lab-03` | 6 | 25 | 25 passed |
| client | `tests/lab-04` | 8 | 157 | 157 passed |
| **client** | **total** | **19** | **205** | **205 passed, 0 failed, 0 skipped** |

### Vitest summary lines, copied from the output

Server, round 1:

```
Test Files  34 passed (34)
Tests  381 passed (381)
Duration  82.50s (transform 683ms, setup 0ms, collect 17.67s, tests 49.98s, environment 7ms, prepare 5.79s)
```

Server, round 2:

```
Test Files  34 passed (34)
Tests  381 passed (381)
Duration  81.32s (transform 706ms, setup 0ms, collect 17.18s, tests 50.15s, environment 6ms, prepare 5.58s)
```

Server, round 3:

```
Test Files  34 passed (34)
Tests  381 passed (381)
Duration  83.80s (transform 772ms, setup 0ms, collect 18.05s, tests 51.52s, environment 7ms, prepare 5.72s)
```

Client, round 1:

```
Test Files  19 passed (19)
Tests  205 passed (205)
Duration  25.64s (transform 4.20s, setup 16.88s, collect 35.99s, tests 63.81s, environment 110.86s, prepare 13.16s)
```

Client, round 2:

```
Test Files  19 passed (19)
Tests  205 passed (205)
Duration  24.81s (transform 5.94s, setup 18.68s, collect 37.16s, tests 63.34s, environment 107.57s, prepare 11.14s)
```

Client, round 3:

```
Test Files  19 passed (19)
Tests  205 passed (205)
Duration  25.52s (transform 6.29s, setup 18.17s, collect 37.50s, tests 61.26s, environment 99.30s, prepare 12.68s)
```

The logs were checked for unwanted output in every round:

- Server: 0 lines from the server error log reached the console.
- Client: 0 "not wrapped in act", 0 "Unhandled", 0 React "Warning:", and 0 stderr blocks.

**PERF timings** (server logs, per request):

| Round | PERF-01 requester | PERF-01 staff | PERF-02 actions |
|---|---|---|---|
| 1 | 32.2 ms | 48.5 ms | 30.5 ms |
| 2 | 26.3 ms | 32.1 ms | 26.7 ms |
| 3 | 26.1 ms | 34.5 ms | 24.9 ms |

## 3. TypeScript, build, and Playwright

| Check | Result |
|---|---|
| server `npx tsc --noEmit` | no output, exit code 0 |
| server `npm run build` | exit code 0 |
| client `npx tsc --noEmit` | no output, exit code 0 |
| client `npm run build` | `✓ 74 modules transformed.` … `✓ built in 1.71s`, exit code 0 |

### Playwright (`npm run test:e2e:clean -- --reporter=list,json`, one run)

| Metric | Value |
|---|---|
| Result | 23 passed, 4 skipped, 0 failed, 0 flaky (66.6 s), exit code 0 |
| Reruns | none |
| desktop | 7 passed, 2 skipped |
| tablet | 8 passed, 1 skipped |
| mobile | 8 passed, 1 skipped |

The 4 skips are `test.skip()` calls written in `e2e/lab-03/staff-ticket-flow.spec.ts`:

| Skipped test | Project | Reason in the spec |
|---|---|---|
| E2E-02: IT Staff claims Ticket, posts Public Comment and Internal Note | tablet, mobile | "Skip this entire describe block for non-desktop projects to avoid shared-state issues"; it passed on desktop |
| RESP-02a and RESP-02b: responsive screenshots | desktop | "Skip desktop — already captured in E2E-02 flow above" |

After the run, the script printed `[e2e-restore] Restoring the committed screenshots: git restore artifacts/` and `[e2e-restore] Playwright exit code: 0`. `git status --short -- artifacts` was empty.

## 4. Data criteria after each server round

Columns:
- **act- / ticketwf- / dashtest- / hardtest-**: test users left behind.
- **TKT-PERF-**: PERF-01 Tickets left behind.
- **l4-** and **TKT-L4-**: the Lab 4 seed.
- **inactive-/authtest-**: users that the unchanged Lab 3 tests create, 8 per round (expected).

| Point | act- | ticketwf- | dashtest- | hardtest- | TKT-PERF- | l4- users | TKT-L4- Tickets | ActionTaken (all) | inactive-/authtest- |
|---|---|---|---|---|---|---|---|---|---|
| After seed | 0 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 0 |
| After round 1 | 0 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 8 |
| After round 2 | 0 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 16 |
| After round 3 | 0 | 0 | 0 | 0 | 0 | 14 | 10 | 13 | 24 |

## 5. Issue 6 criteria

The **Manual check** column is for the tester to fill in.

| # | Criterion | Automated test or evidence | Result | Manual check (tester, date, result) |
|---|---|---|---|---|
| 1 | Consistent, readable messages (no raw JSON or status code) | **Server:** SEC-04 safe bodies. **Client:** Hardening "a missing ticket on Staff Ticket Detail reads 'Ticket not found', not a status code", "a Login answer that is not JSON shows the readable message", "a Change Password answer that is not JSON …", "Mark Problem as Resolved shows a failure inside the dialog (no window.alert)". The Lab 3 "403 Forbidden" titles are kept, with the sentence under them, as ui-spec section 12 allows. | passed | |
| 2 | Duplicate submission prevented and values kept | Hardening "Login sends once while in flight, then keeps both fields after a failure"; "Remove Attachment keeps the typed reason and stays open after a failure, and ignores Escape while removing". The other forms were checked in CP0 (already disabled while saving and keeping their values). | passed | |
| 3 | Leftovers removed | The source scan Hardening tests (console, TODO, Lorem, "Development Requester", stub, `#` links, `alert(`). Removed: `getRequesters`, `checkSystem`, `SystemStatus`, `checkHealth`, `HealthResponse`, `RequesterUser`, `downloadAttachmentUrl`, `checkPasswordRules`, `.zg-callout-info`, the unused AppHeader props, `removedAttachments`, and the `passwordRules` prop. | passed | |
| 4 | No console errors and no broken links | Every client Hardening test fails on any `console.error`; the main screens of every role were rendered through the real routes; "the Role starts at landingPathFor and every header entry opens its ROUTES path" for all three roles; Playwright passed. | passed | |
| 5 | App-level safe errors | SEC-04 (9 tests); API-38 (6 tests); Hardening server tests for the log content (4), the INVALID_TRANSITION `to` (5), Lab 4 route logging (1), and the upload size message (2). | passed | |
| 6 | Accessibility | Hardening dialog tests for Remove Attachment, Mark Problem as Resolved, and the Admin overlay (focus trap, Escape, focus return, `aria-labelledby`, dialog only on narrow screens). `aria-label` was added to the My Tickets search, and `role="alert"` to the Staff comment and note errors. Visible focus, contrast, and the layout at 360/768/1280 have no automated test. | passed (automated part) | |
| 7 | README current | Section 7 below | passed (see the "not run" rows) | |
| 8 | `.gitignore` complete | `coverage/` and `*.tsbuildinfo` were added. History check: the only temporary file ever committed was `cookies.txt` (added in `33b0ae0`, removed in `e0fee9e`); it held only cookie-jar comment lines and is already ignored. `git status` after every run in CP3 and CP4 showed no new untracked temporary file. | passed | |

## 6. Regression

**Lab 1 to Lab 3 tests:** all passed in all 3 rounds, and no Lab 1-3 test file was changed.

| Side | lab-01 | lab-02 | lab-03 | Total |
|---|---|---|---|---|
| server | 3 tests, 2 files | 29 tests, 6 files | 63 tests, 8 files | 95 tests, 16 files |
| client | 4 tests, 1 file | 19 tests, 4 files | 25 tests, 6 files | 48 tests, 11 files |

**`git diff --stat`** of `server/tests/lab-01`, `server/tests/lab-02`, `server/tests/lab-03`, `client/tests/lab-01`, `client/tests/lab-02`, `client/tests/lab-03`, and `e2e` is **empty**:

- in the working tree;
- between `origin/lab4-staging` and `HEAD`, where `server/prisma/migrations` is also empty.

**Playwright:** 23 passed, 4 skipped (spec-defined), 0 failed. All Lab 2 and Lab 3 E2E pass.

**Lab 1-3 behaviour kept:**

- The 4xx and 5xx bodies that Lab 1-3 handlers send themselves are unchanged.
- The Ticket owner, priority, and status endpoints keep their Lab 3 500 texts.
- The only Lab 2 message change is the multer 10 MB case, which used to answer "No file uploaded" and now answers "File exceeds the 5 MB limit". No test pinned the old message.

**Reported, not changed:** Lab 1-3 path ids are parsed with `parseInt`, so `"12abc"` is read as 12 (12 places in `server/src/app.ts`, plus `findStaffTicket` in `server/src/routes/ticket-workflow.ts`).

## 7. README verification (CP3 run)

| Command (as in the README) | Run? | Result, or why it was not run |
|---|---|---|
| `cp .env.example .env` and the two client/server copies | not run | Would overwrite the existing local `.env` files |
| `npm install` (root, client, server) | run | Exit code 0, "up to date" in all three; no lockfile changed |
| `npx playwright install chromium` | run | Exit code 0 (already installed) |
| `docker compose up -d` | run | Exit code 0, `toktickit-db Running` |
| `npx prisma generate` | run | Exit code 0 |
| `npx prisma migrate deploy` | run | Exit code 0, "No pending migrations to apply." |
| `npx prisma db seed` | run | Exit code 0 (idempotent) |
| Option B: upgrading a Lab 2 database (`npm run migrate:users`) | not run | Needs a Lab 2 database with `RequesterUser` data, which this machine does not have; the commands are unchanged from Lab 3 |
| `npm run db:backup --prefix server` | run | Exit code 0; the dump was written to `server/backups/` (git-ignored) |
| `npm run db:snapshot --prefix server` | run | Exit code 0; snapshot file written to `server/backups/` |
| `npm run db:verify:lab4 --prefix server -- --snapshot … --at-upgrade` | run | Exit code 1, as designed. 3 checks failed: `ActionTaken has 0 rows` (13 rows) and the two backfill equalities. These hold only right after migrating a Lab 3 database, and the README now says so. The Lab 1-3 table comparison against the snapshot passed. The real upgrade check passed in `issue-2-rehearsal.md`, "Step 2. Upgrade, following the README word for word". |
| `npm run db:backfill:lab4 --prefix server` | run | Exit code 0, "0 row(s) updated … already fully backfilled" |
| `--expect-absent`, the psql run on a copy, `npx prisma migrate resolve --rolled-back …` | not run | Only for a migration that failed midway. Proven by MIG-07 (forced failure on a copy) with `server/scripts/test-upgrade-path-lab4.ts` in Issue 2 |
| `npm run db:rollback:lab4 --prefix server -- --confirm` (Option A) and `--after-rollback` | not run | Deletes all Actions Taken. Evidence: `issue-2-rehearsal.md`, "Step 4. Rollback Option A on the database with real Actions" (117 rows exported, then `--after-rollback` passed) |
| `DROP SCHEMA` plus the psql restore (Option B) | not run | Erases the whole database. Evidence: `issue-2-rehearsal.md`, "Step 5. Upgrade again, restore the backup (Option B), upgrade a final time" |
| `npx tsx scripts/test-upgrade-path-lab4.ts` | not run | Temporarily moves the Lab 4 migration folder and creates and drops its own database. Proven in Issue 2 (MIG-07) |
| `npm run dev` (server and client) | run | Up on ports 3000 and 5173; stopped afterwards |
| `curl http://localhost:3000/api/health` | run | `{"status":"ok","service":"TokTickIT API"}`, HTTP 200 |
| `curl http://localhost:3000/api/health/ready` | run | `{"status":"ready"}`, HTTP 200 |
| `curl` of `/api/nope`, and a login with a malformed JSON body | run | 404 `{"error":"Not found","code":"NOT_FOUND"}`; 400 `{"error":"Request body is not valid JSON.","code":"VALIDATION_FAILED"}` |
| Login with a seed account through the API (`l4-sweep-requester@example.com`) | run | HTTP 200, role REQUESTER, `mustChangePassword: true` (the cookie was not printed) |
| `cd client && npm test` | run | `Test Files  19 passed (19)`, `Tests  205 passed (205)` |
| `npm run db:reset` | run | Exit code 0 (the documented step before the server tests; it erases the development database only) |
| `cd server && npm test` | run | `Test Files  34 passed (34)`, `Tests  381 passed (381)`; data criteria as in section 4 |
| `npm run test:e2e:clean` | run | 23 passed, 4 skipped, exit code 0; artifacts restored |
| `npm run test:e2e:clean` (failure path) | run | With a modified screenshot and `--grep ZZZ_NO_SUCH_TEST`: "No tests found", exit code 1, artifacts restored to clean |
| `npm run test:e2e` | not run separately | The same `playwright test` that `test:e2e:clean` runs; CI uses it unchanged |

## 8. GitHub CI

| Item | Link / result |
|---|---|
| CI run | |
| Result | |
| Checked by / date | |
