# Lab 4 — Peer Review Record

## My Information
- Name: [ชื่อ-นามสกุล]
- Student ID: [รหัสนักศึกษา]
- GitHub Username: Khawpun124

## My Reviewer
- Name: [ชื่อ-นามสกุล ของ reviewer]
- Student ID: [รหัสนักศึกษาของ reviewer]
- GitHub Username: [username ของ reviewer]

## 1. Pull Requests I Authored (Reviewed by Partner)

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1: Specification, Test Plan, UI and API Contracts | `feature/1-lab4-spec-and-test-plan` | [PR #47](https://github.com/Khawpun124/toktickit/pull/47) | Approved after fixes |
| Issue 2: Actions Taken Foundation (migration, rollback, API) | `feature/2-lab4-actions-taken-foundation` | [PR #50](https://github.com/Khawpun124/toktickit/pull/50) | Approved after 2 rounds of fixes |
| Issue 3: Actions Taken UI | `feature/3-lab4-actions-taken-ui` | [PR #51](https://github.com/Khawpun124/toktickit/pull/51) | [Approved / Approved after N rounds] |
| Issue 4: Ticket Workflow and Resolution Gate | `feature/4-lab4-ticket-workflow` | [PR #56](https://github.com/Khawpun124/toktickit/pull/56) | Approved after 2 rounds of fixes |
| Issue 5: Role Dashboards | `feature/5-lab4-role-dashboards` | [PR #57](https://github.com/Khawpun124/toktickit/pull/57) | Approved (no blocking issues) |
| Issue 6: Final Hardening | `feature/6-lab4-final-hardening` | [PR #<เลข>](<ลิงก์>) | Approved after verification round |
| Issue 7: E2E, Visual, and Accessibility Tests | `feature/7-lab4-e2e-visual-tests` | [PR #<เลข>](<ลิงก์>) | [ผล] |
| Fix: flaky E2E job on CI | `fix/lab4-ci-e2e-flaky` | [PR #<เลข>](<ลิงก์>) | [ผล] |
| Release: `lab4-staging` to `main` | `lab4-staging` | [PR #<เลข>](<ลิงก์>) | [ผล] |

## Detailed Peer Reviews Received from Partner

### Issue 1 (Specification, Test Plan, UI and API Contracts)

**Reviewer Comment — Round 1:**
1. The API contract and the UI contract disagreed with each other.
2. The migration and rollback sections were not detailed enough to follow.
3. Dashboard time handling was not deterministic (BR-28).
4. Creating an Action directly as COMPLETED did not require a Result.
5. "Needs your attention" had no stated ordering (BR-39 / AC-38).
6. The condition for Urgent Tickets was not stated.
7. The browser time-zone rule was missing.

**My Response:** Reconciled `api-spec.md` and `ui-spec.md`. Added the
exact command order, expected results, and both rollback routes
(Option A with `lab4_down.sql`, Option B restore from backup) to the
migration section. Defined one `generatedAt` UTC instant per request
and a 30 x 24 hour inclusive window. Required a Result when an Action
is created as COMPLETED. Added `Ticket.statusChangedAt` and ordered
"Needs your attention" by the longest wait. Defined Urgent Tickets as
active and High IT Priority. Stated that times are only displayed in
the browser time zone and never used for calculation. Final contract:
24 FR, 39 BR, 38 AC, 104 test rows.

[วาง comment จริงและลิงก์ thread จากหน้า PR #47]

### Issue 2 (Actions Taken Foundation)

**Reviewer Comment — Round 1:** Before merge, verify with real data and
real runs, not by reading code: (1) the migration on a Lab 3 database
that already holds data, (2) rollback and snapshot validation, and
(3) stale update, replay idempotency, and authorization through tests.

**My Response:** Built a Lab 3 database with the released Lab 3 app,
over HTTP only (15 users, 28 Tickets covering all 8 statuses, 12
comments, 9 internal notes, 7 attachments of which 2 were removed with
a reason). Upgraded following the README literally: `verify --at-upgrade`
passed 26 checks, backfill changed 0 rows, and the sha256 of 34 Lab 3
API responses was identical before and after. Rolled back with 117
real Actions (export file had 117 rows with identical ids,
`--after-rollback` passed 24 checks, Lab 3 ran on the rolled-back
database and a write smoke test passed), restored with Option B, and
upgraded again. Fired 20 parallel requests over real HTTP: one 201 and
nineteen 200 for the same `clientRequestId` (1 row), and one 200 with
nineteen 409 `STALE_VERSION` for one `expectedVersion`; the
authorization matrix matched the contract in 28 of 28 cells. Evidence:
`docs/lab-04/evidence/issue-2-rehearsal.md`.

**Reviewer Comment — Round 2:** Five things remain before merge:
(1) migration on a database with data, with Ticket, Comment, Note, and
Attachment tables unchanged; (2) a real `db:rollback:lab4` with
snapshot, row-count, and checksum checks, and Lab 1 to 3 unchanged;
(3) `statusChangedAt` must change only when the status changes, and not
for owner, priority, comment, or Action edits; (4) run the concurrency
and authorization live checks (stale 409, no duplicate on replay,
Requester, Administrator, IT Staff, and inactive-user behavior); (5)
run the test suites and confirm CI is green.

**My Response:** Items 1, 2, and 4 are covered by the rehearsal above.
For item 3 I added `--mode status-changed-at` to
`lab4-live-check.ts`: two rounds of 14 steps, reading `statusChangedAt`
and `updatedAt` after every step. Comment, note, owner, priority, Action
create, edit, and status change, and a rejected status change left
`statusChangedAt` unchanged (owner and priority changed `updatedAt`,
proving the two columns are independent), while each real status change
moved it forward, including re-entering Waiting for Requester. For item
5: 25 server files / 233 tests passed in 3 runs, 48 of 48 Lab 1 to 3
client tests passed unchanged, Playwright 23 passed and 4 skipped
(existing `test.skip()` in Lab 3), CI [ลิงก์ run].

[วาง comment จริงและลิงก์ thread จากหน้า PR #50]

### Issue 3 (Actions Taken UI)

**Reviewer Comment:** [สรุปหรือคัดลอก comment ที่ได้รับจาก PR #51]

**My Response:** [คำตอบและ commit ที่แก้] The PR itself listed 8
decisions the contract did not state (card placement on the Staff and
Requester screens, messages after create and save, validation of
`actionAt` on the server only, sending only changed fields with
`expectedVersion`, accessible confirmations, the conflict message) and
9 things automated tests cannot check, so the reviewer could confirm or
correct them.

### Issue 4 (Ticket Workflow and Resolution Gate)

**Reviewer Comment — Round 1 (Pre-Merge Requirements):** The code and
principles are mostly correct, but before merge: (1) check every Issue
4 acceptance test in `tests.md`, mark Pass only for tests that really
ran, and attach test output to the PR; (2) the client and server suites
must pass with no new failure; (3) verify the six acceptance criteria:
backend transition matrix, resolution gate, stale-version conflict
handling, UI confirmation dialog, refresh after a status change, and a
readable gate callout; (4) build and TypeScript must pass with no
error, there must be no regression in Lab 1 to 3, and GitHub CI must be
green.

**My Response:** Wrote `docs/lab-04/evidence/issue-4-verification.md`
from real runs: each of the 16 Issue 4 rows (UNIT-04, UNIT-06, API-18 to
API-27, API-39, UI-08 to UI-10) maps to real test names and results.
Server 28 files / 313 tests and client 14 files / 121 tests passed in 3
identical runs, split by Lab folder. The server `tsc` had two
"Cannot find name 'Role'" errors in `app.ts` present since Lab 3; fixed
with one import in its own commit (`ba19b89`). The race between
creating an Action and resolving the Ticket was run 20 times (6 times
the create won and the resolve was blocked, 14 times the resolve won and
the create was refused; never an unfinished Action on a Resolved
Ticket). Manual checks with screenshots covered the six criteria.

**Reviewer Comment — Round 2 (short check):** Confirm four things:
real test results for Lab 4 server and client, build, and Lab 1 to 3
regression; `tests.md` must be Pass because of the real runs, not just
written; the six acceptance criteria; and that CI and required checks
are green.

**My Response:** Answered per heading with numbers from the evidence
file. One honest note: the change that marks the Issue 4 rows Pass was
not in the merged commit, so I carried it as the first commit of the
Issue 5 branch (`104c0ca`) and stated that in the Issue 5 PR
description.

[วาง comment จริงและลิงก์ thread จากหน้า PR #56]

### Issue 5 (Role Dashboards)

**Reviewer Comment:** No blocking issues; ready to approve once CI and
the required checks pass. Suggestion (not required in this PR): keep
role and path constants in one place to avoid duplication and drift
between the dashboard screens.

**My Response:** Confirmed CI was green before merge. Took the
suggestion in Issue 6: `client/src/roles.ts` now holds the roles, route
names, and landing paths, used by `App.tsx`, `AppHeader.tsx`, and
`DashboardRoute.tsx`. While building this PR, three existing client
tests conflicted with the draft rule "every role lands on its
dashboard after login". The lab sheet does not require that for
Requesters, so I changed the contract (a Requester keeps landing on My
Tickets; IT Staff and Administrators land on the staff dashboard)
rather than editing old tests, and recorded it under "Contract
clarifications" in the PR.

### Issue 6 (Final Hardening)

**Reviewer Comment:** Server and client hardening are good, but verify
four things before merge: (1) duplicate-submission protection and
network retry for every important form, (2) form data preserved after a
recoverable error, (3) the app-level error middleware on a real runtime
(malformed JSON, oversized body, unknown route, uncaught error), and
(4) GitHub Actions and the required checks.

**My Response:** Added a table-driven client test over the 12 important
forms of Labs 1 to 4 (two quick clicks send one request, values stay
after a network failure or a 5xx, values clear only on success; 24 cases
plus a test that the form list is complete). It found a real gap: the
Admin create-user form did not clear itself after a successful save;
fixed (`21bf258`) with its own test. Ran the real server with
`npm run dev` under `NODE_ENV=production` and `development` and sent 20
requests: invalid JSON gave 400, a body over 100 KB gave 413, an unknown
`/api` path gave 404, an unsupported charset gave 415 (added to the
contract), and an error that escaped a handler gave 500 with the
database stopped; `/api/health/ready` answered 503 `NOT_READY` and
recovered after the database came back. Production and development gave
identical answers, and the server log kept one line per error with no
cookie, request body, stack, or database address. Stated the limit
plainly: for the Lab 2 and 3 forms duplicate protection is on the UI
only (no idempotency key). CI [ลิงก์ run และชื่อ checks]. Evidence:
`docs/lab-04/evidence/issue-6-verification.md`.

[วาง comment จริงและลิงก์ thread จากหน้า PR]

### Issue 7 (E2E, Visual, and Accessibility Tests)

**Reviewer Comment:** [สรุปหรือคัดลอก comment ที่ได้รับจาก PR]

**My Response:** [คำตอบและ commit] While preparing the PR, the CI run
failed with "Cannot use import statement outside a module" at
`await import("./lab-04/support/prepare")` in `e2e/global-setup.ts`: it
loaded on Node 24 locally but not on Node 20 in CI. Fixed by importing
the function statically at the top of the file (`[hash]`). The new
tests also found real defects that were fixed in the same PR: text
contrast below 4.5:1 (4.26 to 4.36 before, 6.11 to 6.29 after), dashboard
card names that did not contain their visible text (WCAG 2.5.3), an
Actions Taken table whose View button was clipped between 768 and
1280 px, and a success message that covered headings and pushed content
down. Evidence: `docs/lab-04/evidence/issue-7-verification.md`.

### Fix PR (flaky E2E on CI) and Release PR

**Reviewer Comment:** [สรุป comment ของ PR fix/lab4-ci-e2e-flaky]

**My Response:** Split the E2E job into start servers, wait (hard 30 s),
run, and upload artifacts (`ci-logs`, `playwright-report`,
`test-results`), with traces, screenshots, and video kept on failure.
Measured the result (10 of 10 runs passed across the matrix before the
matrix was removed) and recorded that the root cause was not proven.

**Reviewer Comment (Release PR):** [สรุป comment ของ Release PR]

**My Response:** [คำตอบ]

## 2. Pull Requests I Reviewed for My Partner

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 2 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 3 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 4 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 5 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 6 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |
| Issue 7 | [branch ของ partner] | [ลิงก์ PR ของ partner] | [ผล] |

### Detailed Reviews I Provided to Partner

[กรอกทีละ Issue: comment ที่คุณให้ partner จริง และ partner ตอบหรือแก้อย่างไร
(คัดลอกจากหน้า PR ของ partner)]

How I reviewed: I asked for evidence from real runs instead of
statements, checked `git diff --stat` for files unrelated to the Issue
and for edits to earlier Labs' tests, compared the acceptance criteria
with the tests that cover them, and looked at the CI result.

## Evidence

[แนบ/แปะ screenshot หน้า PR ที่แสดงสถานะ "Approved" สำหรับทุก PR ของ Lab 4
ทั้งที่ partner approve ให้คุณ (Issue 1 ถึง 7, fix PR และ Release PR)
และที่คุณ approve ให้ partner]
