# Lab 4 — Peer Review Record

## My Information
- Name: [นายกฤตเมธ นิยมธรรม]
- Student ID: [67070501053]
- GitHub Username: Khawpun124

## My Reviewer
- Name: [นายวรพล แซ่คู]
- Student ID: [67070501085]
- GitHub Username: [Worapol360]

## 1. Pull Requests I Authored (Reviewed by Partner)

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1: Specification, Test Plan, UI and API Contracts | `feature/1-lab4-spec-and-test-plan` | [PR #47](https://github.com/Khawpun124/toktickit/pull/47) | Approved after fixes |
| Issue 2: Actions Taken Foundation (migration, rollback, API) | `feature/2-lab4-actions-taken-foundation` | [PR #50](https://github.com/Khawpun124/toktickit/pull/50) | Approved after 2 rounds of fixes |
| Issue 3: Actions Taken UI | `feature/3-lab4-actions-taken-ui` | [PR #51](https://github.com/Khawpun124/toktickit/pull/51) | [Approved / Approved after N rounds] |
| Issue 4: Ticket Workflow and Resolution Gate | `feature/4-lab4-ticket-workflow` | [PR #56](https://github.com/Khawpun124/toktickit/pull/56) | Approved after 2 rounds of fixes |
| Issue 5: Role Dashboards | `feature/5-lab4-role-dashboards` | [PR #57](https://github.com/Khawpun124/toktickit/pull/57) | Approved (no blocking issues) |
| Issue 6: Final Hardening | `feature/6-lab4-final-hardening` | [PR #<เลข>](<ลิงก์>) | Approved after verification round |
| Issue 7: E2E, Visual, and Accessibility Tests | `feature/7-lab4-e2e-visual-tests` | [PR #<เลข>](<ลิงก์>) | Approved after verification round |
| Fix: flaky E2E job on CI | `fix/lab4-ci-e2e-flaky` | [PR #<เลข>](<ลิงก์>) | Approved after 2 rounds of fixes |
| Release: `lab4-staging` to `main` | `lab4-staging` | [PR #<เลข>](<ลิงก์>) | Approved |

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
(existing `test.skip()` in Lab 3), CI.

### Issue 3 (Actions Taken UI)

**Reviewer Comment:** โดยรวมแล้วดูดี และขอบเขตของงานสอดคล้องกับ Issue 3 
ไม่พบปัญหาสำคัญของโค้ดอย่างชัดเจนในการพัฒนาส่วน Client-side เพียงอย่างเดียว 
ผมอยากแนะนำให้เช็ค CI/Checks ที่จำเป็นผ่านทั้งหมด และมีการยืนยันผลการทดสอบ 
Acceptance Test ของ Issue หากทำเรียบร้อยเเล้วให้เเจ้งกลับมา ผมจะทำการ merge ให้ครับ

**My Response:** ได้ทำการเช็ค CI/Checks และผลการทดสอบ Acceptance Test ผ่านทั้งหมดแล้ว

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
only (no idempotency key). CI. Evidence:
`docs/lab-04/evidence/issue-6-verification.md`.

### Issue 7 (E2E, Visual, and Accessibility Tests)

**Reviewer Comment:** ถ้ารัน test ผ่านหมดเเล้วให้เเจ้งกลับมา จะทำการ merge 
ให้เลยเนื่องจากตัว code ไม่มีข้อผิดพลาด

**My Response:** รันผ่านครบหมดเรียบร้อยแล้ว :)

### Fix PR (flaky E2E on CI) and Release PR

**Reviewer Comment:** สิ่งที่อยากให้แก้:

อัปโหลด test artifacts ให้ครบ: ใน .github/workflows/ci.yml บรรทัด 227–230 
ยังไม่ได้รวมโฟลเดอร์ artifacts/ ทำให้ screenshot ที่อยู่ใน artifacts/lab-02/ 
และ artifacts/lab-03/ อาจไม่ถูกอัปโหลดเมื่อ E2E fail ช่วยเพิ่ม artifacts/ 
ในรายการ path เพื่อให้เก็บไฟล์เหล่านี้ได้ด้วย

จำกัดเวลา Readiness check: ใน .github/workflows/ci.yml บรรทัด 166–200 
แต่ละรอบอาจใช้เวลา curl รวมกันถึง 4 วินาที และมี sleep 1 ทำให้การตรวจสอบอาจเกิน 30 วินาที 
ช่วยปรับ timeout ของ curl ให้ไม่เกินเวลาที่เหลือ เพื่อให้ readiness check จบภายใน 30 วินาทีจริง

**My Response:** Split the E2E job into start servers, wait (hard 30 s),
run, and upload artifacts (`ci-logs`, `playwright-report`,
`test-results`), with traces, screenshots, and video kept on failure.
Measured the result (10 of 10 runs passed across the matrix before the
matrix was removed) and recorded that the root cause was not proven.

**Reviewer Comment (Release PR):** -

**My Response:** -

## 2. Pull Requests I Reviewed for My Partner

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1 | [feature/lab4-1-specification] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/44)] | [Approved] |
| Issue 2 | [feature/lab4-2-actions-taken-api] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/45)] | [Approved] |
| Issue 3 | [feature/lab4-3-actions-taken-ui] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/48)] | [Approved after verification round] |
| Issue 4 | [feature/lab4-4-ticket-workflow] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/49)] | [Approved after 1 rounds of fixes] |
| Issue 5 | [feature/lab4-5-dashboards] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/50)] | [Approved after 1 rounds of fixes] |
| Issue 6 | [fix/lab4-client-build-baseline] | [[ลิงก์ PR ของ partner](https://github.com/Worapol360/toktickit/pull/47)] | [Approved after verification round] |

### Detailed Reviews I Provided to Partner

### Issue 1 (Sprint 4 Specification & Test Plan)

**My Comment:** ตรงตาม acceptance criteria ของขั้น Spec DD + Test DD 
ก่อนเริ่ม implementation :)

**Reviewer Response:** -

### Issue 2 (Actions Taken Foundation (DB, Seed, API))

**My Comment:** ตรงตาม acceptance criteria ของ issue2 แล้ว

**Reviewer Response:** -

### Issue 3 (Actions Taken UI on Ticket Detail)

**My Comment:** UI อาจทำให้ผู้ใช้ไม่เห็น control ได้แล้ว 
แต่สิ่งสำคัญคือ backend ยังต้อง enforce ว่า:
Requester ไม่สามารถ create/edit/delete Actions Taken ได้ แม้ผ่าน API หรือ bypass UI
IT Staff ที่ไม่ใช่ Ticket Owner / ไม่ได้รับอนุญาต ไม่ควรเข้าถึง write action
Follow-up note validation ต้องบังคับที่ backend เช่นเดียวกับ UI
conflict/409 ต้องไม่ overwrite silently และต้อง preserve ข้อมูลที่ผู้ใช้พิมพ์ไว้

**Reviewer Response:** ตรวจสอบทั้ง Backend, Frontend, Spec และ Tests แล้ว ได้ผลดังนี้
Requester ไม่สามารถแก้ไข Actions Taken ผ่าน API ได้ เพราะ Backend 
ตรวจสอบ Role และปฏิเสธด้วย 403 อยู่แล้ว รวมถึงไม่มี DELETE endpoint
IT Staff ที่ไม่ใช่เจ้าของ Ticket สามารถเพิ่มหรือแก้ไข Actions Taken ได้ 
ตาม Requirement ใน BR-02 และ AC-03 ที่อนุญาตให้ IT Staff 
หรือ Admin จัดการ Actions Taken ของ Ticket ได้ทุกใบ
Follow-up note มีการตรวจสอบที่ Backend อยู่แล้ว โดยบังคับความยาว 5–500 
ตัวอักษรเมื่อเปิดใช้งาน Follow-up
กรณี 409 Conflict ระบบจะไม่เขียนทับข้อมูลโดยอัตโนมัติ และเก็บข้อความที่ผู้ใช้กรอกไว้ 
ผู้ใช้สามารถเลือก Reload latest หรือ Keep editing ได้
เพิ่ม Regression Tests อีก 4 กรณีเพื่อให้ครอบคลุมพฤติกรรมมากขึ้น 
โดยผลทดสอบล่าสุดผ่านทั้งหมด:
Client Tests: 99/99
Client Build: Passed
Lab 4 Server Tests: 54/54
จึงยังไม่พบจุดที่ต้องแก้ไข

### Issue 4 (Ticket Workflow & Resolution Gate)

**My Comment:** ขอให้ช่วยเช็ค เกี่ยวกับการออกแบบ dependency ระหว่าง module ใน PR นี้ : 
server.ts import withAllowedTransitions จาก ticket-workflow-rules.ts 
ในขณะที่ workflow-rules module ก็ import STATUS_TRANSITIONS กลับมาจาก server.ts 
ทำให้เกิด circular dependency ระหว่าง canonical status matrix กับ helper layer
สิ่งนี้มีความเสี่ยง เพราะ module initialization order ใน ESM อาจมีผลต่อการ resolve symbol 
และในบางกรณีอาจได้รับค่าแบบ partially initialized หรือ drift ระหว่าง transition table 
กับ helper logic ซึ่งอาจทำให้ status validation และ allowedTransitions มีพฤติกรรมที่ไม่สอดคล้องกันใน runtime
นี่คือ business logic หลักของ workflow และควรไม่พึ่งพา boot ordering จึงควรแยก transition matrix 
ออกเป็น module แยกต่างหาก (เช่น ticket-status.ts) และให้ทั้ง server และ workflow helper import 
จาก single source of truth เดียวกัน เพื่อให้กฎการเปลี่ยนสถานะมีความ deterministic ลดความเสี่ยงในการเกิด 
runtime bug ระหว่างการ start app หรือ initialization ระหว่าง test

**Reviewer Response:** แก้ปัญหา Circular Dependency โดยย้าย STATUS_TRANSITIONS และ isValidStatusTransition 
ไปไว้ในไฟล์ ticket-status.ts เพื่อให้ server.ts และไฟล์ Workflow ใช้ข้อมูลจากแหล่งเดียวกัน

ปรับ import ให้ไม่ต้องอ้างอิง server.ts จากภายใน Lab 4 และยังคง export จาก server.ts 
ไว้เพื่อรองรับโค้ดเดิม

ทดสอบแล้ว TypeScript build ผ่าน และ Lab 4 tests ผ่านทั้งหมด

### Issue 5 (Role Dashboards (Requester & IT Staff/Admin))

**My Comment:** ขอให้ช่วยดู 4 จุดนี้หน่อย :
“No existing test modified” ไม่ตรงกับ diff มี test files ที่ถูกแก้ไขจริง เช่น:
client/src/tests/lab-03/StaffTicketDetail.test.tsx
server/tests/lab-01/issue1.supertest.test.ts
server/tests/lab-01/issue2.health-supertest.test.ts
ดังนั้นข้อความนี้ใน PR summary นั้นไม่ถูกต้องตาม repository state
“Screenshots: artifacts/lab-04/screenshots/...” ไม่เห็นใน changed files หรือ repo tree ที่ผมเห็น
ถ้า screenshot จริงอยู่ ต้องมี artifact/output files แต่จาก diff ไม่ปรากฏชัด
“3 consecutive green runs” / “builds pass” / “metrics vs database: paste SQL + screenshots” 
เป็น evidence ที่ไม่สามารถยืนยันจาก PR metadata หรือ changed files ได้
มันเป็นสิ่งที่ต้องมี CI log หรือ artifact จริง
“Out of scope: E2E specs” แต่ใน diff มีเพิ่ม AppNavigation, Dashboard test หลายตัวแล้ว
มันไม่ใช่ข้อผิดพลาดโดยตัวเอง แต่ก็ทำให้เรื่อง “out of scope” ดูไม่คมเท่าที่ควร

**Reviewer Response:** อัปเดต PR Description เล็กน้อย เนื่องจาก Description เดิมเขียนไว้ก่อนที่งานจะเสร็จสมบูรณ์ 
ทำให้บางส่วนไม่ตรงกับสิ่งที่ implement และ test จริง จึงปรับรายละเอียดให้ตรงกับงานล่าสุด รวมถึงรายการไฟล์ที่แก้ไขและผลการทดสอบ

### [Fix] Restore client TypeScript build on lab4-staging

**My Comment:** มีข้อเสนอก่อน merge คือ structure ของ mock response ที่กำหนดว่าเป็น success หรือ error 
ตอนนี้ทำ inline ในแต่ละ test แล้ว และครอบคลุมเฉพาะ endpoint บางตัวเท่านั้น หากสามารถรวมเป็น shared type 
เช่น ApiResult<T> หรือ ErrorEnvelope แล้ว reuse ในทุก mock จะปลอดภัยและสะอาดขึ้นกว่า
สิ่งนี้จะช่วยให้ contract ของ API สะท้อนชัดขึ้น ลดโอกาสเกิด TypeScript regression ใน mock ที่แตกต่างกันในอนาคต 
และทำให้การเพิ่ม endpoint ใหม่ไม่เสี่ยงต่อการลืม update type อีกต่อไป :)

**Reviewer Response:** -

How I reviewed: I asked for evidence from real runs instead of
statements, checked `git diff --stat` for files unrelated to the Issue
and for edits to earlier Labs' tests, compared the acceptance criteria
with the tests that cover them, and looked at the CI result.

## Evidence

[แนบ/แปะ screenshot หน้า PR ที่แสดงสถานะ "Approved" สำหรับทุก PR ของ Lab 4
ทั้งที่ partner approve ให้คุณ (Issue 1 ถึง 7, fix PR และ Release PR)
และที่คุณ approve ให้ partner]
