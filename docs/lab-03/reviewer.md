# Lab 3 — Peer Review Record

## My Information
- Name: [Krittamate Niyomthum]
- Student ID: [67070501053]
- GitHub Username: Khawpun124

## My Reviewer
- Name: [Worapol Saeku]
- Student ID: [67070501085]
- GitHub Username: Worapol360

## 1. Pull Requests I Authored (Reviewed by Partner)

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1: Sprint Specification and Test Plan | `feature/1-lab3-spec-and-test-plan` |(<https://github.com/Khawpun124/toktickit/pull/38>) | Approved |
| Issue 2: Authentication Foundation and User Migration | `feature/2-lab3-auth-foundation` |(<https://github.com/Khawpun124/toktickit/pull/40>) | Approved after 3 rounds of fixes |
| Issue 3: Requester Regression | `feature/3-lab3-requester-regression` | (<https://github.com/Khawpun124/toktickit/pull/41>) | Approved after fixes |
| Issue 4: IT Staff Ticket Queue | `feature/4-lab3-staff-queue` | (<https://github.com/Khawpun124/toktickit/pull/42>) | Approved after 2 rounds of fixes |
| Issue 5: IT Staff Ticket Detail | `feature/5-lab3-staff-ticket-detail` | (<https://github.com/Khawpun124/toktickit/pull/43>) | Approved after 2 rounds of fixes |
| Issue 6: Administrator User Management | `feature/6-lab3-admin-user-management` |(<https://github.com/Khawpun124/toktickit/pull/44>) | Approved after fixes |
| Issue 7: E2E + Visual/Responsive Testing | `feature/7-lab3-e2e-visual-tests` |(<https://github.com/Khawpun124/toktickit/pull/45>) | Approved after 2 rounds of fixes |

## Detailed Peer Reviews Received from Partner

### Issue 1 (Sprint Specification and Test Plan)

**Reviewer Comment:** Approved without requested changes.

**My Response:** N/A.

### Issue 2 (Authentication Foundation and User Migration)

**Reviewer Comment — Round 1 (Security):**
1. `X-Requester-Id` header still accepted by Ticket/Attachment endpoints
   — anyone could spoof another user's identity via the header.
2. Development Requester Selector still present in the UI.
3. `mustChangePassword` enforced only client-side; the API still allowed
   access without changing the password first.
4. Migrated user password did not match between the migration script
   and documentation (login with the documented credential failed).

**My Response:** Removed `X-Requester-Id` entirely across all Ticket/
Attachment endpoints and the client — identity now comes exclusively
from the session (`req.user.id`). Removed `RequesterSelectionScreen`
and `RequesterContext`. Added a `requirePasswordChanged` middleware
enforced server-side on all protected routes. Unified the migrated
user's initial password behind a single `MIGRATED_USER_INITIAL_PASSWORD`
constant referenced by the migration script, seed, and README.

**Reviewer Comment — Round 2:** The hardcoded password hash in
`migration.sql` line 69 still did not match `ChangeMe123!`.

**My Response:** Removed the hardcoded hash from `migration.sql`
entirely (schema-only now); the migration script computes the hash
dynamically from the shared constant instead. Verified with
`bcrypt.compareSync` against the real database value, and confirmed
login succeeds with the documented credential.

### Issue 3 (Requester Regression)

**Reviewer Comment:** `migration.sql` created the `Ticket.requesterId
-> User.id` foreign key without any step to copy data from
`RequesterUser` to `User` in the same migration — applying it against
an existing Lab 2 database (not a fresh install) would fail with a
foreign key violation, since `migrate-users.ts` only runs after
`prisma migrate deploy` completes.

**My Response:** Used Prisma's expand-and-contract pattern: added a
migration that temporarily drops the FK constraint, ran the user/ticket
data migration, then added a second migration restoring the FK once
data was consistent — without touching the already-applied migration.
Wrote `scripts/test-upgrade-path.ts`, which simulates a real
pre-existing Lab 2 database and produces a Ticket Ownership Comparison
Matrix proving every ticket's requester email matches before and after
migration (not just that the FK constraint exists).

### Issue 4 (IT Staff Ticket Queue)

**Reviewer Comment — Round 1:**
1. The Queue's "View" button routed to the Requester-owned
   `/tickets/:id` route, which has an ownership check — Staff opening
   another Requester's ticket got a 404.
2. `currentStatus` query parameter had no whitelist validation; an
   invalid value could surface as a 500 instead of 400.

**My Response:** Added a dedicated `/staff/tickets/:id` route with a
basic Staff-accessible detail view calling
`GET /api/staff/tickets/:id`. Added whitelist validation for
`currentStatus` matching the existing pattern for priority filters.

**Reviewer Comment — Round 2:** `cookies.txt` (a manual curl-testing
artifact) was committed to the PR.

**My Response:** Removed it from tracking and added it to `.gitignore`.

### Issue 5 (IT Staff Ticket Detail)

**Reviewer Comment:**
1. Attachment endpoints still checked Requester-style ownership, so
   Staff could not open attachments on tickets they didn't submit —
   the frontend silently showed "No attachments found" instead of an
   error.
2. Internal Notes had no server-side length limit (client-only
   `maxLength`).
3. Status confirmation dialogs checked only the destination status
   instead of the From→To pair, so transitions like Resolved→Closed
   incorrectly triggered a confirmation the spec didn't require.

**My Response:** Updated attachment endpoints to allow Staff/Admin
access regardless of ownership, and fixed the frontend to distinguish
real errors from genuine empty states. Added server-side 2000-character
validation to Internal Notes matching Public Comments. Fixed the
confirmation logic to check From→To pairs against the full Status
Transition Matrix.

### Issue 6 (Administrator User Management)

**Reviewer Comment:** Admin could set a weak password (e.g. "a") for a
new or reset user account — only an empty-string check existed, not
the actual password strength rules.

**My Response:** Wired the existing `validatePasswordRules()` (used by
`change-password`) into both `POST /api/admin/users` and
`POST /api/admin/users/:id/reset-password`. Extracted a reusable
`PasswordRuleChecklist.tsx` live-feedback component shared between the
mandatory password-change screen and both Admin password forms.

### Issue 7 (E2E + Visual/Responsive Testing)

**Reviewer Comment:**
1. `authentication.spec.ts` had a fallback that skipped the Mandatory
   Password Change assertion if the test user no longer required one
   — meaning AC-02 was never actually verified after the first run.
2. No E2E job existed in CI; E2E coverage was manual-only, risking
   undetected regressions.

**My Response:** Added `server/scripts/reset-db.ts`, wired into
Playwright's `globalSetup`, so every E2E run starts from a clean seeded
database and the fallback could be removed entirely. Added an
`e2e-tests` job to `.github/workflows/ci.yml` running after the
server/client test jobs. While wiring this up, discovered and fixed a
test-isolation bug where Lab 2 and Lab 3 E2E suites shared the same
seeded Requester, and a duplicate HTML `id` bug in
`UserManagementScreen.tsx` causing overlapping error messages on
self-deactivation attempts.

## 2. Pull Requests I Reviewed for My Partner

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|---|---|---|---|
| Issue 1 | [feature/lab3-1-specification] | [https://github.com/Worapol360/toktickit/pull/30] | [Approved] |
| Issue 2 | [feature/lab3-2-auth-foundation] | [https://github.com/Worapol360/toktickit/pull/31] | [Approved] |
| Issue 3 | [fix/lab3-auth-test-isolation] | [https://github.com/Worapol360/toktickit/pull/32] | [Approved] |
| Issue 3 | [feature/lab3-3-staff-queue] | [https://github.com/Worapol360/toktickit/pull/33] | [Approved] |
| Issue 4 | [feature/lab3-4-staff-ticket-ops] | [https://github.com/Worapol360/toktickit/pull/34] | [Approved] |
| Issue 5 | [feature/lab3-5-user-admin] | [https://github.com/Worapol360/toktickit/pull/37] | [Approved] |

### Detailed Reviews I Provided to Partner

### Issue 1: add sprint specification, api-spec, ui-spec, and test plan- #30

**My Comment:** Pass all acceptance criteria :)

**Reviewer's Response:** N/A.

### Issue 2: Authentication foundation & requester migration

**My Comment:** ตรงตาม Acceptance criteria :)

**Reviewer's Response:** N/A.

### fix Issue #3: Isolate auth test user updates- #32

**My Comment:** ครบถ้วนตามรายละเอียดการแก้ไข :)

**Reviewer's Response:** N/A.

### Issue #3:  IT Staff Ticket Queue (Issue 3)

**My Comment:** ผ่านตามเกณฑ์ Acceptance criteria :)

**Reviewer's Response:** N/A.

### Issue #4: IT Staff ticket operations, comments & internal notes

**My Comment:** ครบถ้วนตาม description :)

**Reviewer's Response:** N/A.

### Issue #5: Administrator user management

**My Comment:** ตรงตามรายละเอียดครบถ้วน :)

**Reviewer's Response:** N/A.

