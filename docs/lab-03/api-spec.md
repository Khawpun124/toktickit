# Lab 3 REST API Contract

Base path: `/api`. Extends `docs/lab-02/api-spec.md` — all Lab 2 Ticket/
Attachment endpoints remain at the same paths but are now **session-scoped**
instead of using the `X-Requester-Id` header (removed in Lab 3).

## 0. Authentication Mechanism

- **Session-based**, server-side session store, delivered via an
  **httpOnly, SameSite=Lax cookie** named `tk_session` (Secure flag set
  in production).
- Every protected endpoint reads the session cookie via middleware,
  resolves it to a `User` record, and attaches `req.user = { id, role }`.
  Handlers **never** trust a client-supplied user/requester ID for
  determining the acting identity (BR-03).
- Session lifetime: 8 hours sliding expiration (refreshed on activity).
  Logout deletes the session server-side immediately.
- Passwords hashed with bcrypt; hashes are never included in any API
  response.

---

## 1. POST /api/auth/login

**Purpose:** Authenticate and establish a session.

**Request body:**
```json
{ "email": "jenderson@tiktockit.com", "password": "TempPass123!" }
```

**Response 200 (active account, correct credentials):**
```json
{
  "id": 12,
  "name": "Jennifer Anderson",
  "email": "jenderson@tiktockit.com",
  "role": "REQUESTER",
  "mustChangePassword": true
}
```
Sets the `tk_session` cookie.

**Response 401 (any failure — wrong password, unknown email, inactive account):**
```json
{ "error": "Invalid email or password" }
```
(BR-05 — identical message and status for every failure case.)

**Response 400:** malformed request body (missing email/password).

---

## 2. POST /api/auth/logout

**Purpose:** Invalidate the current session.

**Headers:** valid `tk_session` cookie

**Response 200:**
```json
{ "success": true }
```
Session is deleted server-side; cookie is cleared in the response.

**Response 401:** no valid session present.

---

## 3. GET /api/auth/me

**Purpose:** Retrieve the current authenticated user's identity and role.

**Response 200:**
```json
{
  "id": 12,
  "name": "Jennifer Anderson",
  "email": "jenderson@tiktockit.com",
  "role": "REQUESTER",
  "mustChangePassword": false
}
```

**Response 401:** no valid session.

---

## 4. POST /api/auth/change-password

**Purpose:** Change the current user's password (mandatory first-login flow, or voluntary later).

**Headers:** valid `tk_session` cookie

**Request body:**
```json
{
  "currentPassword": "TempPass123!",
  "newPassword": "NewSecure456!",
  "confirmPassword": "NewSecure456!"
}
```

**Response 200:**
```json
{ "success": true, "mustChangePassword": false }
```

**Response 400 (validation, BR-07):**
```json
{
  "error": "Password does not meet requirements",
  "rules": {
    "minLength": true,
    "hasUpperLower": false,
    "hasNumber": true,
    "hasSpecialChar": false
  }
}
```

**Response 400:** `newPassword` and `confirmPassword` do not match.
**Response 401:** `currentPassword` incorrect, or no valid session.

---

## 5–10. Lab 2 Requester Endpoints (Migrated to Session Auth)

`GET/POST /api/tickets`, `GET /api/tickets/:id`,
`POST/GET /api/tickets/:id/attachments`,
`GET /api/attachments/:id/download`, `DELETE /api/attachments/:id` —
identical request/response shapes to `docs/lab-02/api-spec.md`, with one
change: **the `X-Requester-Id` header is removed.** The acting
Requester's ID is taken from `req.user.id` (session), and every handler
verifies `req.user.role === 'REQUESTER'` in addition to the existing
ownership check. A non-Requester calling these endpoints (e.g. IT Staff
trying to hit `POST /api/tickets` as if creating their own ticket) is
rejected with 403 unless explicitly permitted by the approved
authorization matrix.

**New addition — PATCH /api/tickets/:id/resolution-flag**

**Purpose:** Requester marks their own Ticket as "problem appears resolved" (BR-12).

**Response 200:**
```json
{ "id": 101, "problemAppearsResolved": true }
```
**Response 404:** Ticket not found or not owned by the current Requester.
**Response 400:** Ticket is already Closed or Cancelled.

---

## 11. GET /api/staff/tickets

**Purpose:** IT Staff Ticket Queue — search, filter, sort, paginate across all Tickets.

**Headers:** valid session; `req.user.role` must be `IT_STAFF` or `ADMINISTRATOR`

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | none | ticketNumber (partial) or summary (partial) |
| `categoryId` | number | none | exact match |
| `requestedPriority` | LOW\|MEDIUM\|HIGH | none | exact match |
| `itPriority` | LOW\|MEDIUM\|HIGH | none | exact match |
| `currentStatus` | string | none | exact match |
| `ticketOwnerId` | number \| "unassigned" | none | exact match, or filter to unassigned |
| `sortBy` | createdAt\|ticketNumber\|itPriority | createdAt | |
| `sortDir` | asc\|desc | desc | |
| `page` | number | 1 | |
| `pageSize` | number | 10 | clamped 1–50 |

**Response 200:** same pagination envelope shape as Lab 2 `GET /api/tickets`, with each item additionally including `itPriority`, `currentStatus`, `ticketOwnerName` (or `null` if unassigned), `problemAppearsResolved`.

**Response 403:** `req.user.role === 'REQUESTER'`.

---

## 12. GET /api/staff/tickets/:id

**Purpose:** Retrieve full Ticket detail for IT Staff operations (no ownership restriction — any Staff/Admin may view any Ticket).

**Response 200:** full Ticket record including Requester name/email, Category, Related System, Requested/IT Priority, Current Status, Ticket Owner, `problemAppearsResolved`, Attachments metadata.

**Response 403:** non-Staff/Admin role.
**Response 404:** Ticket does not exist.

---

## 13. PATCH /api/staff/tickets/:id/owner

**Purpose:** Claim (if unassigned) or reassign Ticket ownership (BR-08, BR-09).

**Request body:**
```json
{ "ticketOwnerId": 7 }
```
(`ticketOwnerId: null` to unassign, if permitted by the approved contract.)

**Response 200:** updated Ticket with new `ticketOwnerId`/`ticketOwnerName`.
**Response 400:** target user is not an active IT Staff/Administrator.
**Response 403:** non-Staff/Admin role.
**Response 404:** Ticket not found.

---

## 14. PATCH /api/staff/tickets/:id/priority

**Purpose:** Set IT Priority (BR-10).

**Request body:**
```json
{ "itPriority": "HIGH" }
```

**Response 200:** updated Ticket.
**Response 400:** invalid priority value.
**Response 403:** non-Staff/Admin role.

---

## 15. PATCH /api/staff/tickets/:id/status

**Purpose:** Perform a status transition (BR-11, per the Status Transition Matrix).

**Request body:**
```json
{ "newStatus": "IN_PROGRESS" }
```

**Response 200:** updated Ticket with new `currentStatus`.

**Response 400 (invalid transition):**
```json
{
  "error": "Invalid status transition",
  "from": "NEW",
  "to": "CLOSED"
}
```

**Response 403:** non-Staff/Admin role.
**Response 404:** Ticket not found.

---

## 16. POST /api/tickets/:id/comments — Public Comments

**Purpose:** Create a Public Comment (Requester who owns the Ticket, or any Staff/Admin).

**Request body:**
```json
{ "content": "We are looking into this now." }
```

**Response 201:**
```json
{
  "id": 55,
  "ticketId": 101,
  "authorId": 7,
  "authorName": "Michael Brown",
  "authorRole": "IT_STAFF",
  "content": "We are looking into this now.",
  "createdAt": "2026-09-10T10:00:00.000Z"
}
```

**Response 400:** empty/whitespace-only content, or content exceeds 2000 characters (BR-16).
**Response 403:** Requester attempting to comment on a Ticket they do not own.
**Response 404:** Ticket not found.

## GET /api/tickets/:id/comments

**Response 200:** array of Public Comments (shape as above), visible to the owning Requester and any Staff/Admin (BR-13).

---

## 17. POST /api/tickets/:id/notes — Internal Notes

**Purpose:** Create an Internal Note (IT Staff/Administrator only, BR-14).

**Request body:**
```json
{ "content": "Escalating to network team." }
```

**Response 201:** same shape as a Public Comment.
**Response 403 (Requester attempts to create or read):**
```json
{ "error": "Forbidden" }
```
No note content is ever included in a 403 response (AC-04).

## GET /api/tickets/:id/notes

**Response 200:** array of Internal Notes, **only** returned when `req.user.role` is `IT_STAFF` or `ADMINISTRATOR`.
**Response 403:** Requester role — empty error body, no note data (AC-04, AC-10).

---

## 18. GET /api/admin/users

**Purpose:** List users (Administrator only).

**Query parameters:** `search` (name or email, partial match), `role` (optional exact filter).

**Response 200:**
```json
[
  { "id": 12, "name": "Jennifer Anderson", "email": "jenderson@tiktockit.com", "role": "REQUESTER", "isActive": true }
]
```
(No pagination, no multi-column sort — out of scope per labsheet 4.2.)

**Response 403:** non-Administrator role.

---

## 19. POST /api/admin/users

**Purpose:** Create a user with one role and an initial password (BR-17).

**Request body:**
```json
{
  "name": "Alex Thompson",
  "email": "alex.thompson@tiktockit.com",
  "role": "IT_STAFF",
  "isActive": true,
  "initialPassword": "Welcome123!"
}
```

**Response 201:** created user (no password hash included), `mustChangePassword: true`.

**Response 400 (duplicate email, BR-19):**
```json
{ "error": "A user with this email already exists" }
```

**Response 403:** non-Administrator role.

---

## 20. PATCH /api/admin/users/:id

**Purpose:** Edit name, email, role, or activation state (BR-18).

**Request body (any subset):**
```json
{ "name": "Alex T. Thompson", "role": "ADMINISTRATOR", "isActive": true }
```

**Response 200:** updated user.

**Response 400:**
- duplicate email (BR-19)
- would leave zero active Administrators (BR-16, BR-21)

**Response 403:**
- non-Administrator role
- attempting to deactivate one's own account (BR-15, BR-20):
  ```json
  { "error": "You cannot deactivate your own account" }
  ```

---

## 21. POST /api/admin/users/:id/reset-password

**Purpose:** Set a new initial password that the user must change at next login.

**Request body:**
```json
{ "newInitialPassword": "TempReset456!" }
```

**Response 200:**
```json
{ "success": true, "mustChangePassword": true }
```

**Response 403:** non-Administrator role.
**Response 404:** user not found.

---

## 22. HTTP Status Code Summary

| Status | Meaning | Example Use |
|---|---|---|
| 200 | Success | Login, logout, GET/PATCH operations |
| 201 | Created | User created, Comment/Note created |
| 400 | Invalid input / business rule violation | Weak password, duplicate email, invalid status transition, last-admin protection |
| 401 | Not authenticated | No/invalid session cookie, wrong login credentials |
| 403 | Authenticated but forbidden | Wrong role for the endpoint, self-deactivation, Requester reading Internal Notes |
| 404 | Resource not found or not owned | Ticket/Attachment/User not found |
| 500 | Unexpected server error | Database or unhandled exception |

## 23. Cross-Cutting Authorization Notes

- Every `/api/staff/*` and `/api/admin/*` route is protected by role
  middleware checked **before** any business logic runs — a request from
  a disallowed role never reaches the handler.
- Every Lab 2 Ticket/Attachment route re-derives the acting Requester
  from `req.user.id`; any `requesterId` field present in a request body
  is ignored (BR-03, AC-03).
- 403 responses never include the protected resource's data (AC-04,
  AC-10) — the response body is a generic error object only.
