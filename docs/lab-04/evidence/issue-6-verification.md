# Issue 6 Verification: Final Hardening

| Item | Value |
|---|---|
| Date | 2026-11-01 |
| Branch | `feature/6-lab4-final-hardening` |
| `git rev-parse HEAD` | `85a70c982b98064234a2f6c9ff4f0b25f61cfdfe` |
| `git rev-parse origin/lab4-staging` | `3d38d599d36bd7f591a6e62d9c23b0fe88071aa1` |
| `node -v` | `v24.14.0` |
| Working tree at run time | `HEAD` plus one new SEC-04 test (the 415 case) in `server/tests/lab-04/authorization.api.test.ts` |

## How these figures were produced

**The final run** produced every test, build, and data figure in sections 1 to 5, in this order:

1. `docker compose down -v` and `docker compose up -d`.
2. `pg_isready` (ready after 4 tries).
3. `prisma migrate deploy`: 10 migrations.
4. `prisma db seed`: 14 Lab 4 users, 10 of 10 Lab 4 Tickets.
5. The server suite, run 3 times, then the client suite, run 3 times, each with the Vitest JSON reporter.
6. `tsc --noEmit` and `npm run build` on both sides.
7. Playwright, once, through `npm run test:e2e:clean`.
8. `npm run db:reset --prefix server`.

The JSON and log files are kept outside the repository. Per-test numbers are read from round 1. Rounds 2 and 3 gave the same totals per folder.

**Earlier runs.** Two sections come from separate runs, as stated in each:
- Section 7, "Runtime verification": a real server started with `npm run dev --prefix server`.
- Section 8, "README verification": the CP3 run of the README commands.

## 1. Acceptance Tests of Issue 6

`docs/lab-04/tests.md` assigns two rows to Issue 6.

| ID | Test file | Tests | Result |
|---|---|---|---|
| API-38 | `server/tests/lab-04/health-ready.api.test.ts` | 6 | passed (6/6) |
| SEC-04 | `server/tests/lab-04/authorization.api.test.ts`, describe "SEC-04: app-level safe errors" | 10 | passed (10/10) |

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
- a body in a charset the parser cannot read keeps its 415 with the safe body, and logs one line without the body or cookie
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
| `client/tests/lab-04/Hardening.test.tsx` | 53 | passed (53/53) | See the list below. |

The server tests check:
- the INVALID_TRANSITION `to` is a string (5 tests);
- the Lab 4 routes log the real cause of a 500 (1 test);
- the server log keeps only the name, the Prisma code, and the last message line, cut at 300 characters (4 tests);
- the upload size messages (2 tests).

The client tests check:
- leftovers on the main screens of every role, and any `console.error` fails the test;
- "Ticket not found" replaces the status code;
- a scan of every source file;
- `roles.ts` is the single source of paths, on the real router for all roles;
- three dialogs trap focus, close with Escape, and return focus;
- sign-in with answers that are not JSON;
- the **12 important forms × 2 failure kinds**, plus a check that the form table covers every file that submits (25 tests, see section 6).

## 2. Test suites

### Vitest per folder (the same in rounds 1, 2, and 3)

| Side | Folder | Files | Tests | Result |
|---|---|---|---|---|
| server | `tests/lab-01` | 2 | 3 | 3 passed |
| server | `tests/lab-02` | 6 | 29 | 29 passed |
| server | `tests/lab-03` | 8 | 63 | 63 passed |
| server | `tests/lab-04` | 18 | 287 | 287 passed |
| **server** | **total** | **34** | **382** | **382 passed, 0 failed, 0 skipped** |
| client | `tests/lab-01` | 1 | 4 | 4 passed |
| client | `tests/lab-02` | 4 | 19 | 19 passed |
| client | `tests/lab-03` | 6 | 25 | 25 passed |
| client | `tests/lab-04` | 8 | 182 | 182 passed |
| **client** | **total** | **19** | **230** | **230 passed, 0 failed, 0 skipped** |

**Why the server count is 382:** the server code did not change in this final round. The one extra test is the new SEC-04 415 case. The client count went up because of:
- the 25 form tests;
- the Admin Create User fix (described in section 6).

### Vitest summary lines, copied from the output

Server, round 1:

```
Test Files  34 passed (34)
Tests  382 passed (382)
Duration  78.94s (transform 716ms, setup 0ms, collect 15.88s, tests 49.92s, environment 6ms, prepare 5.20s)
```

Server, round 2:

```
Test Files  34 passed (34)
Tests  382 passed (382)
Duration  78.61s (transform 665ms, setup 0ms, collect 15.96s, tests 49.28s, environment 6ms, prepare 5.39s)
```

Server, round 3:

```
Test Files  34 passed (34)
Tests  382 passed (382)
Duration  78.37s (transform 625ms, setup 0ms, collect 15.92s, tests 49.27s, environment 6ms, prepare 5.26s)
```

Client, round 1:

```
Test Files  19 passed (19)
Tests  230 passed (230)
Duration  35.12s (transform 4.29s, setup 17.84s, collect 31.84s, tests 74.00s, environment 93.32s, prepare 10.53s)
```

Client, round 2:

```
Test Files  19 passed (19)
Tests  230 passed (230)
Duration  34.14s (transform 3.51s, setup 15.36s, collect 26.80s, tests 73.54s, environment 87.37s, prepare 9.96s)
```

Client, round 3:

```
Test Files  19 passed (19)
Tests  230 passed (230)
Duration  34.38s (transform 3.63s, setup 14.15s, collect 25.34s, tests 72.99s, environment 87.15s, prepare 11.12s)
```

The logs were checked for unwanted output in every round:

- Server: 0 lines from the server error log reached the console.
- Client: 0 "not wrapped in act", 0 "Unhandled", 0 React "Warning:", and 0 stderr blocks.

**PERF timings** (server logs, per request):

| Round | PERF-01 requester | PERF-01 staff | PERF-02 actions |
|---|---|---|---|
| 1 | 22.9 ms | 29.4 ms | 23.1 ms |
| 2 | 20.6 ms | 29.1 ms | 25.1 ms |
| 3 | 23.9 ms | 27.8 ms | 23.1 ms |

## 3. TypeScript, build, and Playwright

| Check | Result |
|---|---|
| server `npx tsc --noEmit` | no output, exit code 0 |
| server `npm run build` | exit code 0 |
| client `npx tsc --noEmit` | no output, exit code 0 |
| client `npm run build` | `✓ 74 modules transformed.` … `✓ built in 1.55s`, exit code 0 |

### Playwright (`npm run test:e2e:clean -- --reporter=list,json`, one run)

| Metric | Value |
|---|---|
| Result | 23 passed, 4 skipped, 0 failed, 0 flaky (59.4 s), exit code 0 |
| Reruns | none |
| desktop | 7 passed, 2 skipped |
| tablet | 8 passed, 1 skipped |
| mobile | 8 passed, 1 skipped |

`e2e/lab-03/user-administration.spec.ts` E2E-03 (Administrator creates a new user, self-deactivation, last-administrator protection) passed on desktop, tablet, and mobile after the Admin Create User fix.

The 4 skips are `test.skip()` calls written in `e2e/lab-03/staff-ticket-flow.spec.ts`:

| Skipped test | Project | Reason in the spec |
|---|---|---|
| E2E-02: IT Staff claims Ticket, posts Public Comment and Internal Note | tablet, mobile | "Skip this entire describe block for non-desktop projects to avoid shared-state issues"; it passed on desktop |
| RESP-02a and RESP-02b: responsive screenshots | desktop | "Skip desktop — already captured in E2E-02 flow above" |

After the run, the script printed `[e2e-restore] Playwright exit code: 0` and restored `artifacts/`. `git status --short -- artifacts` was empty.

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
| 1 | Consistent, readable messages (no raw JSON or status code) | **Server:** SEC-04 safe bodies; section 7. **Client:** Hardening "a missing ticket on Staff Ticket Detail reads 'Ticket not found', not a status code", the not-JSON sign-in tests, "Mark Problem as Resolved shows a failure inside the dialog (no window.alert)", and every form test (readable message, no raw JSON). The Lab 3 "403 Forbidden" titles are kept, with the sentence under them, as ui-spec section 12 allows. | passed | |
| 2 | Duplicate submission prevented and values kept | Section 6: 12 forms × network failure and 5xx | passed (after the Admin Create User fix) | |
| 3 | Leftovers removed | The source scan Hardening tests. Removed: `getRequesters`, `checkSystem`, `SystemStatus`, `checkHealth`, `HealthResponse`, `RequesterUser`, `downloadAttachmentUrl`, `checkPasswordRules`, `.zg-callout-info`, the unused AppHeader props, `removedAttachments`, and the `passwordRules` prop. | passed | |
| 4 | No console errors and no broken links | Every client Hardening test fails on any `console.error`; the real-router tests for all three roles; Playwright passed | passed | |
| 5 | App-level safe errors | SEC-04 (10 tests), API-38 (6 tests), the 12 server Hardening tests, and section 7 on a real server under both NODE_ENV values | passed | |
| 6 | Accessibility | Hardening dialog tests (focus trap, Escape, focus return, `aria-labelledby`, Admin overlay only on narrow screens); `aria-label` on the My Tickets search; `role="alert"` on the Staff comment and note errors. Visible focus, contrast, and the layout at 360/768/1280 have no automated test. | passed (automated part) | |
| 7 | README current | Section 8 | passed (see the "not run" rows) | |
| 8 | `.gitignore` complete | `coverage/` and `*.tsbuildinfo` were added. History check: the only temporary file ever committed was `cookies.txt` (added in `33b0ae0`, removed in `e0fee9e`), which held only cookie-jar comment lines and is already ignored. `git status` after every run showed no new untracked temporary file. | passed | |

## 6. Important forms (FR-19, BR-34)

**File:** `client/tests/lab-04/Hardening.test.tsx`, describe "Hardening: forms keep their values, block a second submission, and retry once".

**Coverage check:** the test "Hardening: forms: the table covers every Lab 1-3 file that submits a form or a file" confirms that the table below lists every Lab 1-3 file in `client/src` that submits a form or a file. The Lab 4 Action dialog and the Ticket owner, priority, and status controls are covered by UI-03, UI-04, and UI-10.

**What each form test does** (once after a network failure and once after a 5xx):
1. Two quick submissions must send one request, with the control disabled while it is in flight.
2. After the failure, every entered value is still there, the form is still open, the message is readable with no raw JSON, and the control works again.
3. Submitting again sends one new request with the same values, and only that success clears or closes the form.

| Form | File | Tests (name prefix "Hardening: forms: …") | Blocks a second submission | Keeps values after a failure | Result |
|---|---|---|---|---|---|
| Create Ticket | `CreateTicketScreen.tsx` | "Create Ticket after a network failure", "… after a 5xx" | yes | yes (category, system, priority, summary, description) | passed (2/2) |
| Public Comment (Requester) | `RequesterTicketDetailScreen.tsx` | "Public Comment (Requester) after a …" | yes | yes | passed (2/2) |
| Upload Attachment | `RequesterTicketDetailScreen.tsx` | "Upload Attachment (Requester) after a …" | yes (the file input is disabled) | not applicable (the file is chosen again) | passed (2/2) |
| Remove Attachment | `RequesterTicketDetailScreen.tsx` | "Remove Attachment (Requester) after a …" | yes | yes (reason; the dialog stays open) | passed (2/2) |
| Mark Problem as Resolved | `RequesterTicketDetailScreen.tsx` | "Mark Problem as Resolved (Requester) …" | yes | not applicable (a confirmation; the dialog stays open) | passed (2/2) |
| Public Comment (Staff) | `StaffTicketDetailScreen.tsx` | "Public Comment (Staff) after a …" | yes | yes | passed (2/2) |
| Internal Note (Staff) | `StaffTicketDetailScreen.tsx` | "Internal Note (Staff) after a …" | yes | yes | passed (2/2) |
| Login | `LoginScreen.tsx` | "Login after a …" | yes | yes (email and password) | passed (2/2) |
| Change Password | `ChangePasswordScreen.tsx` | "Change Password after a …" | yes | yes (all three fields) | passed (2/2) |
| Admin Create User | `UserManagementScreen.tsx` | "Admin Create User after a …" | yes | yes | passed (2/2) |
| Admin Edit User | `UserManagementScreen.tsx` | "Admin Edit User after a …" | yes | yes (after success the form shows the saved record) | passed (2/2) |
| Admin Reset Password | `UserManagementScreen.tsx` | "Admin Reset Password after a …" | yes | yes | passed (2/2) |

**Admin Create User:** found not clearing after success, fixed in `21bf258`. After a successful create, the form kept the entered values, so a second click would have sent the same user again. The form now clears name, email, password, role, and active state, and keeps showing "User created successfully.".

### Network retry

The Lab 1-3 forms prevent a duplicate submission **in the UI only**: the control is disabled while the request is in flight. They send no idempotency key.

If a first request succeeds on the server but its response is lost (for example the connection drops after the server committed), the user sees a network error. Submitting again then creates a second record. This applies to:

- Create Ticket;
- Public Comments;
- Internal Notes;
- Upload Attachment.

Only the Lab 4 Actions Taken create sends a `clientRequestId`, which the server uses to replay the first result instead of creating a second Action. The test is "UI-03: after a network failure on create, Save again sends the same clientRequestId" in `client/tests/lab-04/ActionsTaken.test.tsx`, with the server side in API-03 and API-42.

## 7. Runtime verification (real server)

The server was started with the README command `npm run dev --prefix server`, once with `NODE_ENV=production` and once with `NODE_ENV=development`. Its stdout and stderr were written to a file outside the repository, and the requests were sent with `curl`.

**What was hidden:**
- The session cookie came from a login with a seed account. It was kept in a shell variable only and was never printed or written to a file.
- Request bodies carried the marker `MARKER_BODY_7731`, and query strings carried `MARKER_QUERY_5521`, to prove they never reach the log.

**The database outage** was made with `docker compose stop postgres` and ended with `docker compose start postgres`, followed by `pg_isready`.

| Case | Command (no secrets) | HTTP | Body | Server log line (one per error) |
|---|---|---|---|---|
| (a) malformed JSON, 3 bodies × Lab 3 login | `curl -X POST /api/auth/login?trace=… -H "Content-Type: application/json" --data-binary <bad JSON>` | 400 ×3 | `{"error":"Request body is not valid JSON.","code":"VALIDATION_FAILED"}` | `POST /api/auth/login SyntaxError: Expected double-quoted property name in JSON at position 44 (line 2 column 1)` (and the two other parser messages) |
| (a) malformed JSON, 3 bodies × Lab 3 comments | `curl -X POST /api/tickets/1/comments …` | 400 ×3 | same | `POST /api/tickets/1/comments SyntaxError: …` |
| (a) malformed JSON, 3 bodies × Lab 4 actions | `curl -X POST /api/staff/tickets/1/actions …` | 400 ×3 | same | `POST /api/staff/tickets/1/actions SyntaxError: …` |
| (b) body over 100 KB (128 KB) | `curl -X POST /api/tickets/1/comments --data-binary <128 KB JSON>` | 413 | `{"error":"Request body is too large.","code":"VALIDATION_FAILED"}` | `POST /api/tickets/1/comments PayloadTooLargeError: request entity too large` |
| (c) unknown path, GET | `curl /api/nope?secret=…` | 404 | `{"error":"Not found","code":"NOT_FOUND"}` | none (not an error) |
| (c) unknown path, POST | `curl -X POST /api/nope --data-binary '{"x": 1}'` | 404 | `{"error":"Not found","code":"NOT_FOUND"}` | none (not an error) |
| (d) unknown charset | `curl -X POST /api/auth/login -H "Content-Type: application/json; charset=klingon-9" …` | 415 | `{"error":"Request body could not be read.","code":"VALIDATION_FAILED"}` | `POST /api/auth/login UnsupportedMediaTypeError: unsupported charset "KLINGON-9"` |
| (e) before the outage, with the seed session | `curl /api/tickets?search=… -H "Cookie: <session>"` | 403 | `{"error":"Password change required before accessing this resource"}` (the Lab 3 body; this seed account must change its password) | none |
| (e) database stopped | `curl /api/tickets?search=… -H "Cookie: <session>"` | 500 | `{"error":"Unexpected error. Please try again.","code":"INTERNAL_ERROR"}` | `GET /api/tickets PrismaClientKnownRequestError [P1017]: Server has closed the connection.` |
| (e) database stopped | `curl /api/health/ready` | 503 | `{"status":"unavailable","code":"NOT_READY"}` | `GET /api/health/ready PrismaClientKnownRequestError [P1001]: Please make sure your database server is running at <host:port>.` |
| (e) database stopped | `curl /api/health` | 200 | `{"status":"ok","service":"TokTickIT API"}` | none |
| (e) after `docker compose start postgres` and `pg_isready` | the same three requests | 403, 200, 200 | the same as before the outage; readiness `{"status":"ready"}` | none |

All 20 responses were `application/json; charset=utf-8`.

**Server log check** (`Select-String` over the server log, the same for both runs):

| Check | Result |
|---|---|
| error lines | 13, one for each request that failed (9 parse, 1 too large, 1 charset, 2 outage) |
| session token from the cookie | not found |
| the session cookie name | not found |
| body marker | not found |
| query marker | not found |
| development password | not found |
| stack frames | not found |

The P1001 line names the database host and port on the server side only; that part is replaced by `<host:port>` above. No response contained it.

**NODE_ENV comparison:** the 20 responses under `NODE_ENV=production` and `NODE_ENV=development` were identical (status, content type, and body), and both logs held the same 13 lines.

**Afterwards:**
- `docker compose ps` showed `postgres Up`.
- The server was stopped; ports 3000 and 5173 were free.
- `npm run db:reset --prefix server` exited 0.

## 8. README verification (CP3 run)

The commands below were run in CP3. The test suites in it were run again in the final run, and their numbers are in section 2.

| Command (as in the README) | Run? | Result, or why it was not run |
|---|---|---|
| `cp .env.example .env` and the two client/server copies | not run | Would overwrite the existing local `.env` files |
| `npm install` (root, client, server) | run | Exit code 0, "up to date" in all three; no lockfile changed |
| `npx playwright install chromium` | run | Exit code 0 (already installed) |
| `docker compose up -d` | run | Exit code 0 |
| `npx prisma generate` | run | Exit code 0 |
| `npx prisma migrate deploy` | run | Exit code 0, "No pending migrations to apply." |
| `npx prisma db seed` | run | Exit code 0 (idempotent) |
| Option B: upgrading a Lab 2 database (`npm run migrate:users`) | not run | Needs a Lab 2 database with `RequesterUser` data, which this machine does not have; the commands are unchanged from Lab 3 |
| `npm run db:backup --prefix server` | run | Exit code 0; the dump was written to `server/backups/` (git-ignored) |
| `npm run db:snapshot --prefix server` | run | Exit code 0; snapshot written to `server/backups/` |
| `npm run db:verify:lab4 --prefix server -- --snapshot … --at-upgrade` | run | Exit code 1, as designed. `ActionTaken has 0 rows` and the two backfill equalities failed on the seeded development database; the Lab 1-3 snapshot comparison passed. The README now says that `--at-upgrade` is valid only right after migrating a Lab 3 database. The real upgrade check passed in `issue-2-rehearsal.md`, "Step 2. Upgrade, following the README word for word". |
| `npm run db:backfill:lab4 --prefix server` | run | Exit code 0, "already fully backfilled" (0 rows) |
| `--expect-absent`, the psql run on a copy, `npx prisma migrate resolve --rolled-back …` | not run | Only for a migration that failed midway. Proven by MIG-07 (forced failure on a copy) with `server/scripts/test-upgrade-path-lab4.ts` in Issue 2 |
| `npm run db:rollback:lab4 --prefix server -- --confirm` (Option A) and `--after-rollback` | not run | Deletes all Actions Taken. Evidence: `issue-2-rehearsal.md`, "Step 4. Rollback Option A on the database with real Actions" |
| `DROP SCHEMA` plus the psql restore (Option B) | not run | Erases the whole database. Evidence: `issue-2-rehearsal.md`, "Step 5. Upgrade again, restore the backup (Option B), upgrade a final time" |
| `npx tsx scripts/test-upgrade-path-lab4.ts` | not run | Temporarily moves the Lab 4 migration folder and creates and drops its own database. Proven in Issue 2 (MIG-07) |
| `npm run dev` (server and client) | run | Up on ports 3000 and 5173; stopped afterwards |
| `curl /api/health`, `curl /api/health/ready` | run | 200 `{"status":"ok","service":"TokTickIT API"}`; 200 `{"status":"ready"}` |
| `curl /api/nope`, and a login with a malformed JSON body | run | 404 `NOT_FOUND`; 400 "Request body is not valid JSON." |
| Login with a seed account through the API | run | HTTP 200, role REQUESTER, `mustChangePassword: true` (the cookie was not printed) |
| `cd client && npm test`, `npm run db:reset`, `cd server && npm test` | run | All passed; rerun in the final run (section 2) |
| `npm run test:e2e:clean` | run | Passed; rerun in the final run (section 3) |
| `npm run test:e2e:clean` (failure path) | run | With a modified screenshot and `--grep ZZZ_NO_SUCH_TEST`: "No tests found", exit code 1, artifacts restored to clean |
| `npm run test:e2e` | not run separately | The same `playwright test` that `test:e2e:clean` runs; CI uses it unchanged |

## 9. Regression

**Lab 1 to Lab 3 tests:** all passed in all 3 rounds of the final run, and no Lab 1-3 test file was changed.

| Side | lab-01 | lab-02 | lab-03 | Total |
|---|---|---|---|---|
| server | 3 tests, 2 files | 29 tests, 6 files | 63 tests, 8 files | 95 tests, 16 files |
| client | 4 tests, 1 file | 19 tests, 4 files | 25 tests, 6 files | 48 tests, 11 files |

**`git diff --stat`** of `server/tests/lab-01`, `server/tests/lab-02`, `server/tests/lab-03`, `client/tests/lab-01`, `client/tests/lab-02`, `client/tests/lab-03`, and `e2e` is **empty**:

- in the working tree;
- between `origin/lab4-staging` and `HEAD`.

**Playwright:** 23 passed, 4 skipped (spec-defined), 0 failed. All Lab 2 and Lab 3 E2E pass, including the Administrator flow after the Create User fix.

**Lab 1-3 behaviour kept:** the Lab 1-3 error bodies are unchanged. Two behaviours changed on purpose:

- **The 10 MB multer case:** it used to answer "No file uploaded" and now answers "File exceeds the 5 MB limit". No test pinned the old message.
- **The Admin create form:** it now clears after a success.

**Reported, not changed:** Lab 1-3 path ids are parsed with `parseInt`, so `"12abc"` is read as 12 (12 places in `server/src/app.ts`, plus `findStaffTicket` in `server/src/routes/ticket-workflow.ts`).

## 10. GitHub CI

| Item | Link / result |
|---|---|
| CI run | |
| Result | |
| Checked by / date | |
