# Lab 2 REST API Contract

Base path: `/api`. All requester-scoped endpoints require the current
Development Requester's ID, passed as header `X-Requester-Id: <number>`
(a Lab 2 testing mechanism only — replaced by real auth in Lab 3).
All responses are JSON. All list endpoints wrap results in a pagination
envelope (see section 10).

---

## 1. GET /api/categories

**Purpose:** Retrieve active Categories for Create Ticket and My Tickets filters.

**Request:** none

**Response 200:**
```json
[
  { "id": 1, "name": "Account and Access" },
  { "id": 2, "name": "Hardware" },
  { "id": 3, "name": "Software" },
  { "id": 4, "name": "Network" }
]
```

**Errors:** 500 on unexpected DB failure — `{ "error": "Unable to load categories" }`

---

## 2. GET /api/related-systems

**Purpose:** Retrieve active Related Systems for Create Ticket.

**Request:** none

**Response 200:**
```json
[
  { "id": 1, "name": "Email" },
  { "id": 2, "name": "Campus Wi-Fi" },
  { "id": 3, "name": "VPN" },
  { "id": 4, "name": "LEB2 App" },
  { "id": 5, "name": "Grade Submission App" },
  { "id": 6, "name": "Printer" },
  { "id": 7, "name": "Corporate Laptop" }
]
```

**Errors:** 500 — `{ "error": "Unable to load related systems" }`

---

## 3. GET /api/requesters

**Purpose:** Retrieve active Development Requesters for the Selection screen.

**Request:** none

**Response 200:**
```json
[
  { "id": 1, "name": "Jennifer Anderson", "email": "jennifer.anderson@example.com" },
  { "id": 2, "name": "Michael Brown", "email": "michael.brown@example.com" }
]
```
Inactive Requesters are never included (BR-06).

**Errors:** 500 — `{ "error": "Unable to load requesters" }`

---

## 4. POST /api/tickets

**Purpose:** Create a Ticket owned by the current Requester (BR-09).

**Headers:** `X-Requester-Id: <number>` (required)

**Request body:**
```json
{
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual...",
  "requestedPriority": "MEDIUM"
}
```

**Response 201:**
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000042",
  "requesterId": 1,
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual...",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "createdAt": "2026-08-20T09:14:00.000Z",
  "updatedAt": "2026-08-20T09:14:00.000Z",
  "attachmentUploadErrors": []
}
```

**Validation errors 400 (BR-15, BR-16, BR-17):**
```json
{
  "error": "Validation failed",
  "fields": {
    "summary": "Summary must be between 5 and 150 characters",
    "categoryId": "Category is invalid or inactive"
  }
}
```

**Requester context errors (see Requester ID Header Validation Rules in Section 12):**
- 401 if `X-Requester-Id` header is missing — `{ "error": "Missing X-Requester-Id header" }`
- 400 if `X-Requester-Id` header is invalid (non-numeric) or requester ID is non-existent/inactive — `{ "error": "Invalid or inactive requester ID" }`

**Partial attachment failure (BR-27):** Ticket still returns 201; failed files
listed:
```json
{
  "...ticket fields as above...": "...",
  "attachmentUploadErrors": [
    { "fileName": "photo.heic", "reason": "Unsupported file type" }
  ]
}
```

**Unexpected error 500:** `{ "error": "Unable to create ticket" }`

---

## 5. GET /api/tickets

**Purpose:** List the current Requester's own Tickets with search, filter,
sort, and pagination (BR-10 through BR-14).

**Headers:** `X-Requester-Id: <number>` (required)

**Query parameters:**

| Param | Type | Default | Notes |
|---|---|---|---|
| `search` | string | none | Matches ticketNumber (partial) or summary (case-insensitive partial) |
| `categoryId` | number | none | Exact match filter |
| `requestedPriority` | LOW\|MEDIUM\|HIGH | none | Exact match filter (invalid values return 400 Bad Request) |
| `itPriority` | LOW\|MEDIUM\|HIGH | none | Exact match filter (invalid values return 400 Bad Request) |
| `currentStatus` | string | none | Exact match filter; allowed enum: NEW (invalid values return 400 Bad Request) |
| `sortBy` | createdAt\|ticketNumber | createdAt | Sort field |
| `sortDir` | asc\|desc | desc | Sort direction |
| `page` | number | 1 | 1-indexed |
| `pageSize` | number | 10 | Clamped to 1-50; out-of-range falls back to default (BR-14) |

**Example:** `GET /api/tickets?search=laptop&page=1&pageSize=10`

**Response 200:**
```json
{
  "data": [
    {
      "id": 101,
      "ticketNumber": "TKT-2026-000042",
      "summary": "Laptop battery drains quickly",
      "categoryName": "Hardware",
      "requestedPriority": "MEDIUM",
      "itPriority": null,
      "currentStatus": "NEW",
      "createdAt": "2026-08-20T09:14:00.000Z",
      "updatedAt": "2026-08-20T09:14:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 42,
    "totalPages": 5
  }
}
```

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 400 for a genuinely malformed (non-numeric) `categoryId`
- 400 if filter parameter (`requestedPriority`, `itPriority`, `currentStatus`) contains an invalid value:
```json
{ "error": "Invalid requestedPriority. Allowed values: LOW, MEDIUM, HIGH" }
```
- 500 for unexpected server failure. Out-of-range `page`/`pageSize` never errors (BR-14) — it clamps instead.

---

## 6. GET /api/tickets/:id

**Purpose:** Retrieve one Ticket owned by the current Requester (BR-10).

**Headers:** `X-Requester-Id: <number>` (required)

**Response 200:**
```json
{
  "id": 101,
  "ticketNumber": "TKT-2026-000042",
  "requesterId": 1,
  "categoryName": "Hardware",
  "relatedSystemName": "Corporate Laptop",
  "summary": "Laptop battery drains quickly",
  "description": "My laptop battery is draining much faster than usual...",
  "requestedPriority": "MEDIUM",
  "itPriority": null,
  "currentStatus": "NEW",
  "createdAt": "2026-08-20T09:14:00.000Z",
  "updatedAt": "2026-08-20T09:14:00.000Z"
}
```

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 404 (not owned by current Requester, or does not exist — BR-10):
```json
{ "error": "Ticket not found" }
```
The same generic message is returned in both cases to avoid revealing that a
ticket ID belongs to a different Requester (AC-03).

---

## 7. POST /api/tickets/:id/attachments

**Purpose:** Upload an Attachment to an owned Ticket (BR-21, BR-22, BR-23, BR-26).

**Headers:** `X-Requester-Id: <number>` (required)
**Content-Type:** `multipart/form-data`, field name `file`

**Response 201:**
```json
{
  "id": 501,
  "ticketId": 101,
  "fileName": "battery_report.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 843211,
  "uploadedAt": "2026-08-20T09:16:00.000Z",
  "removedAt": null
}
```

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 400 unsupported type — `{ "error": "Only JPG, PNG, WEBP, and PDF files are allowed" }`
- 413 or 400 oversized — `{ "error": "File exceeds the 5 MB limit" }`
- 400 count limit reached — `{ "error": "A ticket may have at most 5 active attachments" }`
- 404 ticket not found / not owned — `{ "error": "Ticket not found" }`

---

## 8. GET /api/tickets/:id/attachments

**Purpose:** List Attachment metadata (active and removed) for an owned Ticket.

**Headers:** `X-Requester-Id: <number>` (required)

**Response 200:**
```json
[
  {
    "id": 501,
    "fileName": "battery_report.pdf",
    "sizeBytes": 843211,
    "uploadedAt": "2026-08-20T09:16:00.000Z",
    "removedAt": null,
    "removedReason": null
  },
  {
    "id": 499,
    "fileName": "old_screenshot.png",
    "sizeBytes": 102400,
    "uploadedAt": "2026-08-19T14:00:00.000Z",
    "removedAt": "2026-08-20T09:00:00.000Z",
    "removedReason": "Uploaded wrong file"
  }
]
```

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 404 if the Ticket is not owned by the current Requester or does not exist (BR-10)

---

## 9. GET /api/attachments/:id/download

**Purpose:** Download an active Attachment belonging to an owned Ticket (BR-25).

**Headers:** `X-Requester-Id: <number>` (required)

**Response 200:** binary file stream with correct `Content-Type` and
`Content-Disposition: attachment; filename="<fileName>"`

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 404 — Attachment does not exist, is not owned by the current Requester, or
  has been soft-removed:
  ```json
  { "error": "Attachment not found" }
  ```
  (Removed attachments intentionally return the same not-found response as
  non-existent ones — BR-25.)

---

## 10. DELETE /api/attachments/:id

**Purpose:** Soft-remove an owned Attachment (BR-24, BR-26).

**Headers:** `X-Requester-Id: <number>` (required)

**Request body:**
```json
{ "reason": "Uploaded wrong file" }
```

**Response 200:**
```json
{
  "id": 501,
  "fileName": "battery_report.pdf",
  "removedAt": "2026-08-20T09:20:00.000Z",
  "removedReason": "Uploaded wrong file"
}
```

**Errors:**
- 401 if `X-Requester-Id` header is missing; 400 if `X-Requester-Id` format is invalid or ID is inactive (see Section 12)
- 400 missing reason — `{ "error": "A removal reason is required" }`
- 404 not found / not owned — `{ "error": "Attachment not found" }`
- 409 already removed — `{ "error": "Attachment has already been removed" }`

---

## 11. Pagination Envelope (reference)

All list endpoints (currently only `GET /api/tickets`) use:
```json
{
  "data": [ /* array of items */ ],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "totalItems": 42,
    "totalPages": 5
  }
}
```

## 12. Requester ID Header Validation Rules & HTTP Status Summary

### Requester ID Header Validation Rules
All requester-scoped endpoints (`POST /api/tickets`, `GET /api/tickets`, `GET /api/tickets/:id`, `POST /api/tickets/:id/attachments`, `GET /api/tickets/:id/attachments`, `GET /api/attachments/:id/download`, `DELETE /api/attachments/:id`) validate the `X-Requester-Id` header according to the following canonical rules:

| Condition | HTTP Status | Response Error Message | Reason |
|---|---|---|---|
| No `X-Requester-Id` header supplied | 401 Unauthorized | `{ "error": "Missing X-Requester-Id header" }` | No requester context supplied to verify |
| Format invalid (non-numeric) | 400 Bad Request | `{ "error": "Invalid X-Requester-Id header format" }` | Context supplied but malformed |
| Requester ID does not exist or is inactive (BR-28) | 400 Bad Request | `{ "error": "Requester ID does not exist or is inactive" }` | Context supplied but identity invalid |

### HTTP Status Code Summary

| Status | Meaning | Example Use |
|---|---|---|
| 200 | Success | Successful GET, DELETE (soft-remove) |
| 201 | Created | Ticket created, Attachment uploaded |
| 400 | Bad Request / Invalid input | Field validation failure, missing removal reason, malformed/invalid `X-Requester-Id` header |
| 401 | Unauthorized / Missing context | No `X-Requester-Id` header supplied |
| 404 | Resource not found or not owned | Ticket/Attachment not found or belongs to another Requester |
| 409 | Conflict | Attachment already removed |
| 413 | Payload too large | Attachment exceeds 5 MB (if enforced at transport layer) |
| 500 | Unexpected server error | Database or unhandled exception |

## 13. Ownership Enforcement Note

Every endpoint above that accepts a Ticket or Attachment ID re-verifies
ownership server-side against `X-Requester-Id` on every request — the
frontend never determines access; the backend is the single source of truth
per BR-10 and AC-03.
