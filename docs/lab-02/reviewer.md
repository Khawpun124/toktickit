# Lab 2 — Peer Review Record

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
| Issue 1: Sprint Specification and Test Plan | `feature/1-spec-and-test-plan` | [PR #<1>](<https://github.com/Khawpun124/toktickit/pull/21>) | Approved after fixes |
| Issue 2: Development Requester Context | `feature/2-requester-context` | [PR #<2>](<https://github.com/Khawpun124/toktickit/pull/22>) | Approved after fixes |
| Issue 3: Ticket Creation | `feature/3-create-ticket` | [PR #<3>](<https://github.com/Khawpun124/toktickit/pull/23>) | Approved |
| Issue 4: My Tickets List | `feature/4-my-tickets` | [PR #<4>](<https://github.com/Khawpun124/toktickit/pull/24>) | Approved after fixes |
| Issue 5: Requester Ticket Detail + Attachments | `feature/5-ticket-detail-attachments` | [PR #<5>](<https://github.com/Khawpun124/toktickit/pull/25>) | Approved after fixes |
| Issue 6: E2E + Visual/Responsive Testing | `feature/6-e2e-visual-tests` | [PR #<6>](<https://github.com/Khawpun124/toktickit/pull/26>) | Approved after fixes |
| Issue 7: Post-MVP fixes — attachment wiring, routing, download header, and README update | `feature/7-post-mvp-fixes` | [PR #<6>](<https://github.com/Khawpun124/toktickit/pull/29>) | Approved after fixes |

## Detailed Peer Reviews Received from Partner

### Issue 1 (Sprint Specification and Test Plan)

**Reviewer Comment:**
1. Requester ID channel was inconsistent — `specification.md` allowed
   both a header and a query parameter, while `api-spec.md` mandated
   the header only.
2. HTTP status codes for missing/invalid Requester ID were mixed up
   between 400 and 401.
3. The relationship between frontend and backend Summary validation
   read as contradictory (frontend blocks under 5 characters, but a
   backend 400 test also exists).

**My Response:** Fixed all three. Standardized on the `X-Requester-Id`
header only across both documents. Defined the rule clearly: missing
header entirely -> 401 (no context at all); header present but
invalid/inactive requester -> 400 (bad request). Clarified in BR-15
that frontend validation is a UX convenience while backend validation
is the authoritative defense-in-depth check that also covers direct
API calls bypassing the UI.

### Issue 2 (Development Requester Context + Reference Data)

**Reviewer Comment:** `GET /api/categories` was not filtering by active
status — the `Category` Prisma model did not yet have an `isActive`
field, and the route was not applying `where: { isActive: true }`.

**My Response:** Added `isActive` (default `true`) to the `Category`
model via a new migration, matching the pattern already used for
`RelatedSystem`. Updated `GET /api/categories` to filter on
`isActive: true`. Existing Lab 1 categories default to active so no
data was affected. Added a test confirming inactive categories are
excluded; all existing tests (Lab 1 + Lab 2) still pass.

### Issue 3 (Ticket Creation)

**Reviewer Comment:** Approved without requested changes.

**My Response:** N/A.

### Issue 4 (My Tickets List)

**Reviewer Comment:**
1. Priority and Status query filters did not validate incoming values
   — an arbitrary/invalid value should return 400 Bad Request
   immediately instead of silently returning empty results.
2. Requested that all tests pass and that CI show a green checkmark.

**My Response:** Added validation for `requestedPriority`, `itPriority`,
and `currentStatus` query parameters against their allowed enum values,
returning 400 with a clear message when invalid (page/pageSize clamping
behavior was left unchanged per BR-14). Set up a new GitHub Actions
workflow (`.github/workflows/ci.yml`) running both server and client
test suites against a PostgreSQL service container on every push and
pull request. CI is green.

### Issue 5 (Requester Ticket Detail + Attachments)

**Reviewer Comment — Blocking:**
1. Uploaded files were not deleted when an authorization check failed,
   leaving orphaned files in storage.
2. A race condition allowed the 5-active-attachment limit to be
   exceeded when two uploads happened concurrently.

**Reviewer Comment — Non-blocking:**
3. `removalReason` had no maximum length.
4. Client-side and server-side file-type validation lists did not match.

**My Response:** Reordered/guarded the upload flow so an unauthorized
request's file is cleaned up via `fs.unlink` if it cannot be rejected
before being written. Wrapped the active-attachment count check and the
insert into a single Prisma transaction to make the limit check atomic,
preventing concurrent uploads from exceeding five. Capped
`removalReason` at 500 characters, validated on both client and server.
Unified the allowed file-type list into a single source of truth shared
by client and server. Added tests for the orphaned-file cleanup and a
concurrent-upload scenario. All tests pass.

### Issue 6 (E2E + Visual/Responsive Testing)

**Reviewer Comment:**
1. `docs/lab-02/tests.md` Section 4 (Visual Checklist) and Section 6
   (Final Results) still showed placeholder/Pending status instead of
   real, verified results.
2. E2E-02 only tested cross-Requester access via UI navigation, not via
   a direct URL visit.
3. Leftover default Playwright scaffolding files
   (`tests/example.spec.ts`, `.github/workflows/playwright.yml`) were
   not part of the project's scope.

**My Response:** Manually verified every screenshot in
`artifacts/lab-02/screenshots/` against the Section 4 checklist and
checked each item accordingly; updated Section 6 with real PASS results
and screenshot references. Added a new E2E-02 test case using
`page.goto()` to directly navigate to another Requester's Ticket Detail
URL, confirming access is denied. Removed both leftover scaffolding
files; E2E tests continue to run locally via `npx playwright test`
(not yet wired into CI by design, to keep CI scope focused for now).

### Issue 7: Post-MVP fixes — attachment wiring, routing, download header, and README update- #29

**Reviewer Comment:**
1. [UX/Security Alignment] เช็คสิทธิ์เจ้าของ Ticket ก่อนโหลดหน้ารายละเอียด (AC-03)
2. [UI Bug/State] ป้องกันการกดปุ่ม Download ซ้ำซ้อน (Double Click Race Condition)

**My Response:** All Important and Minor items addressed:
Important:
1. Ownership check — RequesterTicketDetailScreen now catches 403/404 
   from GET /api/tickets/:id and redirects to /tickets with a toast 
   notification instead of showing a broken/loading state.
2. Download race condition — download button is now disabled while 
   downloadingId matches, preventing duplicate concurrent requests.
Minor:
3. Added Content-Disposition: attachment header to the download 
   endpoint so browsers force-download instead of previewing.
4. Verified and aligned ALLOWED_ATTACHMENT_MIME_TYPES / 
   MAX_ATTACHMENT_SIZE_BYTES between client and server constants.
5. My Tickets search/filters/sort/page now sync to URL query 
   parameters via useSearchParams, so Back navigation from Ticket 
   Detail preserves the previous filter state.

## 2. Pull Requests I Reviewed for My Partner

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1 | [feature/lab2-1-specification] | [https://github.com/Worapol360/toktickit/pull/16] | [Approved] |
| Issue 2 | [feature/lab2-2-requester-context] | [https://github.com/Worapol360/toktickit/pull/17] | [Approved] |
| Issue 3 | [feature/lab2-3-create-ticket] | [https://github.com/Worapol360/toktickit/pull/18] | [Approved] |
| Issue 4 | [feature/lab2-4-my-tickets] | [https://github.com/Worapol360/toktickit/pull/20] | [Approved] |
| Issue 5 | [feature/lab2-5-ticket-detail-attachments] | [https://github.com/Worapol360/toktickit/pull/21] | [Approved after fixes] |

### Detailed Reviews I Provided to Partner

### Issue 1: Sprint Specification & Test Plan

**My Comment:** ครบถ้วนตาม Acceptance Criteria 

**Reviewer's Response:** N/A.

### Issue 2: Development Requester Context

**My Comment:** ครบถ้วนตาม Acceptance Criteria 

**Reviewer's Response:** N/A.

### Issue #3: Create Ticket — API, validation, attachments, UI states

**My Comment:** ครบถ้วนตาม Acceptance Criteria 

**Reviewer's Response:** N/A.

### Issue #4: My Tickets — search, filter, sort, pagination

**My Comment:** ครบถ้วนตาม Acceptance Criteria 

**Reviewer's Response:** N/A.

### Issue #5: Requester Ticket Detail & Attachments (+ Lab 2 docs)

**My Comment:**
สิ่งที่ต้องแก้ไข
1. Database Migration & Schema: ต้องอัปเดตโมเดล Attachment ใน prisma/schema.prisma ให้มีฟิลด์ removedAt (DateTime, nullable) และ removalReason (String, nullable, max 250 chars) จากนั้นรัน npx prisma migrate dev เพื่อป้องกัน Runtime Error ใน server.ts
2. Environment & Gitignore: กำหนดค่า ATTACHMENT_STORAGE_PATH ใน .env / .env.example และเพิ่ม storage/ ลงใน .gitignore
3. Scope Verification: รันคำสั่ง git diff lab2-staging --stat เพื่อยืนยันว่าไม่มีการเปลี่ยนแปลงนอกเหนือจาก 11 ไฟล์ที่เกี่ยวข้องกับ Issue #5
4. PR Body: เติม Acceptance Criteria IDs (เช่น AC-13, AC-14) ลงในส่วนที่เว้นว่างไว้

**Reviewer's Response:** แก้ไขครบถ้วนตามคอมเมนต์ทุกข้อแล้ว

## Evidence

