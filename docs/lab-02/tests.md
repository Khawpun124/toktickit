# Lab 2 Test Plan and Results

## 1. Test Strategy

Tests are planned from `specification.md` before implementation begins (Test DD),
then used to drive implementation (TDD): write the failing test first, implement the
smallest correct behavior, refactor while keeping tests green. Coverage spans six
levels: unit, API/integration, UI component, UI style/visual, responsive, and E2E.
Every Acceptance Criterion maps to at least one automated test with a real file path.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What It Tests | Expected Result | Automated Test File | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-01 | Ticket Number generator produces unique `TKT-YYYY-NNNNNN` format | Format matches regex; two calls in sequence differ | `server/tests/lab-02/ticket-number.unit.test.ts` | Pending |
| UNIT-02 | Unit | BR-14 | Page-size clamping helper | Values >50 or <1 fall back to default (10) | `server/tests/lab-02/pagination.unit.test.ts` | Pending |
| API-01 | API | AC-01, BR-01, BR-02 | `POST /api/tickets` with valid data | 201; Ticket saved with Status `New`; unique Ticket Number returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-02 | API | AC-04, BR-15 | Backend defense-in-depth re-validation for POST /api/tickets with Summary < 5 chars (bypassing frontend) | 400; field-level error; no Ticket persisted | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-03 | API | BR-16 | `POST /api/tickets` with Description > 2000 chars | 400; field-level error | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-04 | API | BR-17 | `POST /api/tickets` with inactive Category | 400; field-level error | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-05 | API | AC-03, BR-10 | `GET /api/tickets/:id` for a Ticket owned by another Requester | Not-found response; no Ticket data leaked | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-06 | API | AC-13, BR-10, BR-11 | `GET /api/tickets` scoped per Requester | Only current Requester's Tickets returned | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-07 | API | BR-12 | `GET /api/tickets` with combined filters (Category + Status) | Results match AND logic of both filters | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-08 | API | BR-13 | `GET /api/tickets` default sort | Results ordered by createdAt desc, ticketNumber desc as tiebreaker | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-09 | API | AC-10, BR-14 | `GET /api/tickets` with out-of-range page param | Falls back to default page size, no error | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-10 | API | AC-05, BR-21 | `POST /api/tickets/:id/attachments` valid JPG under 5MB | 201; Attachment saved as active | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-11 | API | AC-06, BR-22 | `POST /api/tickets/:id/attachments` 6MB PDF | 400/413; clear size-limit error; not saved | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-12 | API | BR-21 | `POST /api/tickets/:id/attachments` unsupported type (.docx) | 400; clear type error | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-13 | API | AC-07, BR-23 | 6th attachment on a Ticket with 5 active Attachments | 400; clear count-limit error | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-14 | API | AC-08, BR-24, BR-25 | `DELETE /api/attachments/:id` then `GET .../download` | Metadata still visible; download blocked (403/404) | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-15 | API | BR-26 | Soft-remove an Attachment belonging to another Requester's Ticket | Not-found/forbidden response; Attachment unchanged | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-16 | API | AC-12, BR-06 | `GET /api/requesters` | Inactive Requester excluded from results | `server/tests/lab-02/requesters.api.test.ts` | Pending |
| API-17 | API | BR-27 | Ticket creation succeeds while one attached file fails upload | 201 for Ticket; per-file error reported; Ticket retrievable afterward | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| UI-01 | UI | FR-01, BR-06 | Requester Selection screen loads active Requesters only | Dropdown lists active Requesters; inactive absent | `client/.../lab-02 tests/RequesterSelection.test.tsx` | Pending |
| UI-02 | UI | AC-02, BR-08 | Navigate to My Tickets with no Requester selected | Redirected to Requester Selection screen | `client/.../lab-02 tests/RequesterSelection.test.tsx` | Pending |
| UI-03 | UI | AC-04 | Submit Create Ticket with empty Summary | Field-level message shown; no API call made | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| UI-04 | UI | AC-01 | Submit Create Ticket with valid data | Success state shows generated Ticket Number | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| UI-05 | UI | AC-11, BR-19, BR-20 | Backend failure during Create Ticket submission | Safe error message; entered field values preserved | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| UI-06 | UI | BR-18 | Submit button behavior during request | Busy state shown; button disabled to prevent double-submit | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| UI-07 | UI | AC-09 | My Tickets with zero owned Tickets | Empty state shown (not no-results state) | `client/.../lab-02 tests/MyTickets.test.tsx` | Pending |
| UI-08 | UI | AC-10 | My Tickets with filters matching zero Tickets | No-results state shown (distinct from empty state) | `client/.../lab-02 tests/MyTickets.test.tsx` | Pending |
| UI-09 | UI | AC-13 | Change Requester from A to B on My Tickets | List reloads to show only Requester B's Tickets | `client/.../lab-02 tests/MyTickets.test.tsx` | Pending |
| UI-10 | UI | FR-12, BR-30 | Requester Ticket Detail renders | All header fields read-only; no edit controls present | `client/.../lab-02 tests/RequesterTicketDetail.test.tsx` | Pending |
| UI-11 | UI | AC-08 | Soft-remove an Attachment in the UI | Attachment shown as removed metadata; download disabled | `client/.../lab-02 tests/AttachmentSection.test.tsx` | Pending |
| UI-12 | UI | AC-06 | Select an oversized file for attachment | Client-side rejection message shown before upload attempt | `client/.../lab-02 tests/AttachmentSection.test.tsx` | Pending |
| STYLE-01 | UI Style | Section 7 Zen Green tokens | Required field asterisk + validation message placement | Asterisk present; message renders directly below field | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| STYLE-02 | UI Style | Section 8.3 | Read-only vs editable field visual distinction | Read-only fields use distinct shading class | `client/.../lab-02 tests/CreateTicket.test.tsx` | Pending |
| RESP-01 | Responsive | AC-14 | Create Ticket at desktop/tablet/mobile viewports | No clipping, overlap, or horizontal scroll at any size | Playwright screenshot, see Section 4 | Pending |
| RESP-02 | Responsive | AC-14 | My Tickets table (desktop) vs card list (mobile) | Correct representation per viewport; no broken layout | Playwright screenshot, see Section 4 | Pending |
| RESP-03 | Responsive | AC-14 | Ticket Detail + Attachments at all viewports | Attachment controls remain usable and unclipped | Playwright screenshot, see Section 4 | Pending |
| E2E-01 | E2E | AC-01, AC-13 | Full flow: select Requester -> create Ticket -> find in My Tickets | Ticket appears in the correct Requester's list with matching number | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-03 | Switch Requester and attempt direct URL access to another Requester's Ticket Detail | Access denied / not-found behavior; no data shown | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-05, AC-08 | Add an attachment then soft-remove it via the UI | Attachment lifecycle reflected correctly end-to-end | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Description | Covered By |
|---|---|---|
| AC-01 | Valid submission saves Ticket + shows number | API-01, UI-04, E2E-01 |
| AC-02 | No Requester selected redirects to selection | UI-02 |
| AC-03 | Cross-Requester ticket access denied | API-05, E2E-02 |
| AC-04 | Summary too short blocked client-side | API-02, UI-03 |
| AC-05 | Valid attachment accepted | API-10, E2E-03 |
| AC-06 | Oversized attachment rejected | API-11, UI-12 |
| AC-07 | 6th active attachment rejected | API-13 |
| AC-08 | Soft-removed attachment retains metadata, blocks download | API-14, UI-11, E2E-03 |
| AC-09 | Zero-ticket empty state | UI-07 |
| AC-10 | Filtered no-results state | API-09, UI-08 |
| AC-11 | Backend failure preserves form data | UI-05 |
| AC-12 | Inactive Requester excluded from selector | API-16 |
| AC-13 | Requester switch scopes My Tickets correctly | API-06, UI-09, E2E-01 |
| AC-14 | Responsive layout integrity at all breakpoints | RESP-01, RESP-02, RESP-03 |

## 4. Responsive and Visual Checklist

To be completed with real screenshots during Issue 6 (E2E + visual testing):

- [ ] Desktop (>=992px): Create Ticket, My Tickets, Ticket Detail — no clipping
- [ ] Tablet (768-991px): same three screens — two-column layout where practical
- [ ] Mobile (<768px): same three screens — fields stack vertically, no horizontal
      scroll, touch-friendly buttons
- [ ] Badge consistency for Requested Priority / IT Priority / Current Status
      across all viewports
- [ ] Filters, pagination, and attachment controls remain usable at all sizes
- [ ] No unintended horizontal page scrolling at any breakpoint

Screenshot paths: `artifacts/lab-02/screenshots/create-ticket/`,
`artifacts/lab-02/screenshots/my-tickets/`, `artifacts/lab-02/screenshots/ticket-detail/`

## 5. Test Commands

```bash
# Backend unit + API tests
cd server
npm run test

# Frontend unit + UI tests
cd client
npm run test

# E2E tests (Playwright)
npx playwright test e2e/lab-02/
```

## 6. Final Results

[กรอกหลังรัน test จริงครบทุก Issue: จำนวน test ผ่าน/ทั้งหมด, screenshot terminal
output, วันที่รันบน `main` branch]

## 7. Known Limitations or Deferred Tests

[กรอกถ้ามี test ใดที่ตัดสินใจไม่ทำใน Lab 2 นี้ พร้อมเหตุผล เช่น
tests ที่เกี่ยวกับ Lab 3 authentication ที่ยังไม่เกี่ยวข้อง]
