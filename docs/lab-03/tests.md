# Lab 3 Test Plan and Results

## 1. Test Strategy

Tests are planned from `specification.md` before implementation (Test DD),
then drive implementation (TDD). Lab 3 adds two coverage levels beyond
Lab 2: **Security/Authorization** (direct API tests proving a hidden UI
control is not a security boundary) and **Migration/Regression** (proving
every Lab 1/Lab 2 test still passes after the User-model migration).
Every Acceptance Criterion maps to at least one automated test with a
real file path.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-06 | Password hashing utility | bcrypt hash produced; plaintext never equals stored hash | `server/tests/lab-03/password.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-11 | Status transition validator | Valid pairs allowed; invalid pairs rejected per matrix | `server/tests/lab-03/status-transition.unit.test.ts` | Pending |
| API-01 | API | AC-01, BR-01 | Valid login | Authenticated response; safe user data (no password hash) | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-02 | API | AC-05, BR-05 | Login with wrong password / inactive account / unknown email | Identical generic error message in all three cases | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-03 | API | AC-02, BR-02 | Access protected route before required password change | Rejected/redirected until password changed | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-04 | API | BR-07 | Change password with weak new password | 400 with rule violations listed | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-05 | API | AC-15 | Access protected route after logout | 401 Unauthorized | `server/tests/lab-03/auth.api.test.ts` | Pending |
| API-06 | API | AC-03, BR-03 | Requester supplies another user's requesterId in a ticket request | Backend ignores supplied ID; uses session identity | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-07 | API | AC-14 | Non-Administrator calls /api/admin/users directly | 403 Forbidden regardless of UI state | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| API-08 | API | AC-04, BR-14 | Requester requests Internal Notes endpoint | 403 Forbidden; no note content returned | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-09 | API | BR-13 | IT Staff/Requester/Admin retrieve Public Comments on an accessible Ticket | Comment returned to all three roles | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-10 | API | BR-16 | Post empty/whitespace-only Comment or Note | 400 validation error | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| API-11 | API | AC-06 | IT Staff claims an unassigned Ticket | Ticket Owner set to claiming staff member | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-12 | API | AC-07 | Administrator reassigns an owned Ticket | Ticket Owner changes to new IT Staff member | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-13 | API | AC-08 | Invalid status transition attempted (e.g. New -> Closed) | 400 rejected per transition matrix | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-14 | API | BR-10 | IT Staff updates IT Priority | IT Priority updated independently of Requested Priority | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-15 | API | AC-11, BR-12 | Requester sets "problem appears resolved" flag | Flag set; Current Status unchanged | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | Pending |
| API-16 | API | — | IT Staff Queue: search/filter/sort/pagination | Correct filtered/sorted/paginated results | `server/tests/lab-03/staff-queue.api.test.ts` | Pending |
| API-17 | API | AC-12, BR-19 | Create user with duplicate email | 400 validation error | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-18 | API | AC-13, BR-20 | Administrator attempts to deactivate own account | 400 rejected | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-19 | API | AC-13, BR-21 | Deactivate the last active Administrator | 400 rejected | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-20 | API | BR-17 | Create user with valid single role and initial password | 201; mustChangePassword = true | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| API-21 | API | — | Search users by name/email; filter by role | Correct filtered results | `server/tests/lab-03/users-admin.api.test.ts` | Pending |
| UI-01 | UI | AC-01 | Login form valid submit | Redirects to role-appropriate landing screen | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-02 | UI | AC-05 | Login form invalid submit | Generic safe error message shown | `client/tests/lab-03/Login.test.tsx` | Pending |
| UI-03 | UI | AC-02 | Mandatory password change flow | Cannot navigate away until valid new password saved | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-04 | UI | BR-07 | Password rule checklist | Live-updates as user types (length/case/number/special) | `client/tests/lab-03/ChangePassword.test.tsx` | Pending |
| UI-05 | UI | — | Role-based navigation rendering | Only permitted nav items shown per role | `client/tests/lab-03/AppShell.test.tsx` | Pending |
| UI-06 | UI | — | IT Staff Queue renders with badges | Status/Priority/Owner badges render correctly | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-07 | UI | — | Queue empty/no-results/forbidden states | Correct distinct state shown per condition | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| UI-08 | UI | AC-06 | Claim button on unassigned Ticket | Ticket Owner updates in UI after claim | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-09 | UI | AC-08 | Invalid status option disabled/rejected | UI blocks or backend-rejects invalid transition attempt | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-10 | UI | BR-13/BR-14 | Public Comments vs Internal Notes visual distinction | Internal Notes panel visually distinct (e.g. amber tint) | `client/tests/lab-03/StaffTicketDetail.test.tsx` | Pending |
| UI-11 | UI | AC-14 | User Management screen — non-Admin | Screen not reachable / redirects for non-Admin sessions | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-12 | UI | AC-12 | Create user with duplicate email in UI | Field-level validation error shown | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| UI-13 | UI | AC-13 | Self-deactivation attempt in UI | Deactivate control disabled/blocked with message | `client/tests/lab-03/UserManagement.test.tsx` | Pending |
| STYLE-01 | UI Style | Zen Green consistency | Role badge and status badge styling consistent with Lab 2 tokens | `client/tests/lab-03/StaffTicketQueue.test.tsx` | Pending |
| RESP-01 | Responsive | Section 8.7 | Login/Change Password at desktop/tablet/mobile | No clipping/overlap/horizontal scroll | Playwright screenshot | Pending |
| RESP-02 | Responsive | Section 8.7 | Staff Queue and Ticket Detail at all viewports | Table→card representation correct; usable at all sizes | Playwright screenshot | Pending |
| RESP-03 | Responsive | Section 8.7 | User Management at all viewports | Form and list usable at all sizes | Playwright screenshot | Pending |
| SEC-01 | Security | AC-14 | Direct fetch to /api/admin/* as Requester/IT Staff (bypassing UI) | 403 for every admin endpoint | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-02 | Security | AC-04 | Direct fetch to Internal Notes endpoint as Requester | 403; response body contains no note content | `server/tests/lab-03/comments-notes.api.test.ts` | Pending |
| SEC-03 | Security | AC-03 | Direct fetch with a forged requesterId in the request body | Backend ignores it; session identity used instead | `server/tests/lab-03/authorization.api.test.ts` | Pending |
| SEC-04 | Security | AC-15 | Reuse an old session cookie after logout | 401 Unauthorized | `server/tests/lab-03/auth.api.test.ts` | Pending |
| MIG-01 | Migration/Regression | AC-16, BR-23 | Run migration against seeded Lab 2 data | Every RequesterUser becomes a User with role REQUESTER | `server/tests/lab-03/migration.test.ts` | Pending |
| MIG-02 | Migration/Regression | AC-16, BR-24 | Ticket ownership after migration | Every pre-existing Ticket's requesterId resolves correctly | `server/tests/lab-03/migration.test.ts` | Pending |
| MIG-03 | Migration/Regression | — | Full Lab 1 + Lab 2 test suite after migration | All prior tests still pass unmodified in assertions | `server/tests/lab-01/*`, `server/tests/lab-02/*`, `client/tests/lab-01/*`, `client/tests/lab-02/*` | Pending |
| E2E-01 | E2E | AC-01, AC-02 | Full login flow including mandatory password change | User reaches role-appropriate home screen only after valid change | `e2e/lab-03/authentication.spec.ts` | Pending |
| E2E-02 | E2E | AC-06, AC-09, AC-10 | IT Staff claims a Ticket, posts a Public Comment and an Internal Note | Comment visible to Requester; Note never visible to Requester | `e2e/lab-03/staff-ticket-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-12, AC-13 | Administrator creates a user, then attempts self-deactivation | User created successfully; self-deactivation blocked | `e2e/lab-03/user-administration.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Description | Covered By |
|---|---|---|
| AC-01 | Valid login establishes session | API-01, UI-01, E2E-01 |
| AC-02 | Mandatory password change blocks access | API-03, UI-03, E2E-01 |
| AC-03 | Client-supplied requesterId ignored | API-06, SEC-03 |
| AC-04 | Requester blocked from Internal Notes | API-08, SEC-02 |
| AC-05 | Inactive/invalid login generic error | API-02, UI-02 |
| AC-06 | Claim unassigned Ticket | API-11, UI-08, E2E-02 |
| AC-07 | Reassign owned Ticket | API-12 |
| AC-08 | Invalid status transition rejected | API-13, UI-09 |
| AC-09 | Public Comment visible to Staff/Admin | API-09, E2E-02 |
| AC-10 | Internal Note never visible to Requester | API-08, E2E-02 |
| AC-11 | Requester resolution flag independent of status | API-15 |
| AC-12 | Duplicate email rejected | API-17, UI-12, E2E-03 |
| AC-13 | Self-deactivation / last-admin protection | API-18, API-19, UI-13, E2E-03 |
| AC-14 | Non-Admin blocked from admin endpoints | API-07, UI-11, SEC-01 |
| AC-15 | Logged-out session rejected | API-05, SEC-04 |
| AC-16 | Migration preserves Ticket ownership | MIG-01, MIG-02 |

## 4. Responsive and Visual Checklist

To be completed with real screenshots during the E2E/visual testing Issue:

- [ ] Desktop (>=992px): Login, Staff Queue, Staff Ticket Detail, User Management
- [ ] Tablet (768-991px): same four screens
- [ ] Mobile (<768px): same four screens — fields stack, no horizontal scroll
- [ ] Role badges legible and distinguishable without relying on color alone
- [ ] Internal Notes panel visually distinct from Public Comments at all viewports
- [ ] Editable vs read-only field styling consistent with Lab 2 tokens

Screenshot paths: `artifacts/lab-03/screenshots/authentication/`,
`artifacts/lab-03/screenshots/staff-queue/`,
`artifacts/lab-03/screenshots/staff-ticket-detail/`,
`artifacts/lab-03/screenshots/user-management/`

## 5. Test Commands

```bash
# Backend unit + API tests
cd server
npm run test

# Frontend unit + UI tests
cd client
npm run test

# E2E tests (Playwright)
npx playwright test e2e/lab-03/

# Full regression (Lab 1 + Lab 2 + Lab 3)
cd server && npm run test
cd ../client && npm run test
npx playwright test
```

## 6. Final Results

[กรอกหลังรัน test จริงครบทุก Issue: จำนวน test ผ่าน/ทั้งหมด, screenshot
terminal output, วันที่รันบน `main` branch, ยืนยันว่า Lab 1/Lab 2 test
เดิมทั้งหมดยังผ่านหลัง migration]

## 7. Known Limitations or Deferred Tests

[กรอกถ้ามี test ใดที่ตัดสินใจไม่ทำใน Lab 3 นี้ พร้อมเหตุผล เช่น
CSRF token testing ถ้าตัดสินใจไม่ทำ CSRF protection แบบเต็มรูปแบบ
เนื่องจากเป็น local dev scope]
