# Lab 4 REST API Contract

Base path: `/api`. This document extends `docs/lab-02/api-spec.md` and
`docs/lab-03/api-spec.md`. Every Lab 1-3 endpoint keeps its path, method, and request
shape. Lab 4 only adds endpoints and adds fields to responses (additive changes), so
Lab 1-3 clients and tests keep working.

## 0. Conventions

- Authentication: the `tk_session` httpOnly cookie from Lab 3. Middleware order on every
  protected route: authenticate, enforce "password change required", check role, check
  ownership, then run the handler.
- Identifiers are integers. Timestamps are ISO-8601 strings in UTC (for example
  `2026-10-12T09:14:00.000Z`). The client formats them in the browser's time zone.
- The acting user always comes from the session. The client can never choose who is
  acting, and a `performedBy`, `requesterId`, or user id in a body or query is ignored.
- Error body (all errors, additive to Lab 3, whose `error` texts are unchanged):

```json
{ "error": "Human-readable safe message", "code": "MACHINE_CODE", "fields": { "fieldName": "message" } }
```

`code` and `fields` are present where noted. A 5xx never contains a stack trace, SQL, or a file path. The `code` field is added by the Lab 4 endpoints. Existing Lab 1-3 endpoints keep their error bodies exactly as they are (existing tests assert them with `toEqual`), so a Lab 1-3 error has no `code` and the existing `error` texts and the 401, 403, 404, and 400 shapes of those endpoints do not change.

- Check order (so results are predictable and testable):
  1. 401 not authenticated
  2. 403 `PASSWORD_CHANGE_REQUIRED`
  3. 403 role not allowed
    4. 404 resource missing or not owned
  4a. Create Action only: replay. If `clientRequestId` is a valid UUID and the pair (current user, `clientRequestId`) already exists, answer now: 200 with the original Action when it belongs to the Ticket in the path, or 400 `VALIDATION_FAILED` on `clientRequestId` when it belongs to another Ticket. A replay is answered before body validation and before every state check (steps 5 and 6), even if this request's body would be invalid or the Ticket has since been resolved, because a retry must receive the answer the first request got. The lookup uses only the current user's own pairs, so another user's id never matches and nothing leaks.
  5. 400 request-shape and field validation that does not need the stored Ticket or Action state (looking up the assignee user is part of this step, so an invalid assignee is a 400 even if the Ticket no longer accepts Actions)
  6. 409 `ACTION_TERMINAL`, `TICKET_NOT_ACCEPTING_ACTIONS`, `STALE_VERSION`,
     `OPEN_ACTIONS_BLOCK_RESOLUTION`
  7. 400 validation that depends on the stored state (for example a Result required to
     complete an Action that has none yet)

  Exception for `PATCH /api/staff/tickets/:id/status`: after `STALE_VERSION`, a pair that is not in
  the matrix (400 `INVALID_TRANSITION`, decided from the stored status) is answered before the
  resolution gate (409 `OPEN_ACTIONS_BLOCK_RESOLUTION`), because the gate only has a meaning for a
  permitted transition (AC-13 and AC-14 speak of "a permitted status"). So the order for that
  endpoint is: `STALE_VERSION`, `INVALID_TRANSITION`, `OPEN_ACTIONS_BLOCK_RESOLUTION`. A Ticket in a
  terminal status (Cancelled) has no permitted pair, so it answers 400, not 409.

### Status and error codes

| Status | Code | Meaning |
|---|---|---|
| 200 | | Success, or an idempotent replay of a create |
| 201 | | Created |
| 400 | `VALIDATION_FAILED` | Invalid input; `fields` names each problem |
| 400 | `INVALID_TRANSITION` | Status pair not allowed; body adds `from` and `to` |
| 401 | `UNAUTHENTICATED` | No valid session |
| 403 | `PASSWORD_CHANGE_REQUIRED` | The user must change the initial password first |
| 403 | `FORBIDDEN` | Role not allowed |
| 404 | `NOT_FOUND` | Missing, or not owned (the same response for both, so existence is not revealed) |
| 409 | `STALE_VERSION` | `expectedVersion` differs from the stored version |
| 409 | `OPEN_ACTIONS_BLOCK_RESOLUTION` | Unfinished Actions prevent Resolved |
| 409 | `TICKET_NOT_ACCEPTING_ACTIONS` | The Ticket is Resolved, Closed, or Cancelled |
| 409 | `ACTION_TERMINAL` | The Action is Completed or Cancelled and cannot change |
| 500 | `INTERNAL_ERROR` | Unexpected failure, safe message only |
| 503 | `NOT_READY` | Database not reachable (readiness endpoint only) |

### Time

All timestamps are ISO-8601 in UTC. Dashboard calculations use one server-captured `generatedAt`
instant bound as a parameter (BR-28); the process or database time zone never affects a result.

### Concurrency

`version` is an integer starting at 1 and increased by every successful update through an
atomic compare-and-set (`UPDATE ... WHERE id = ? AND version = ?`). A stale write changes
nothing. Operations that depend on the Ticket's state (creating an Action, changing the
Ticket status) lock the Ticket row for the duration of their transaction, so two racing
requests are applied one after the other and the second sees the first one's result.
A `STALE_VERSION` response is safe to retry after reloading the resource.

## 1. The Action Taken resource

```json
{
  "id": 31,
  "ticketId": 101,
  "actionAt": "2026-10-12T08:30:00.000Z",
  "description": "Replaced the faulty laptop battery.",
  "result": "Battery now holds charge for a full shift.",
  "status": "COMPLETED",
  "performedBy": { "id": 7, "name": "Michael Brown" },
  "assignee": { "id": 7, "name": "Michael Brown", "isActive": true },
  "followUpRequired": true,
  "followUpNote": "Check battery health again after one week.",
  "attachmentNotes": "See the battery report PDF under Attachments.",
  "version": 3,
  "createdAt": "2026-10-12T08:31:10.000Z",
  "updatedAt": "2026-10-12T09:02:44.000Z"
}
```

`status` is one of `PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`. `result`,
`followUpNote`, and `attachmentNotes` are `null` when empty. A Requester sees exactly this
shape for their own Ticket's Actions (labsheet 8.3); no email addresses are included.

Field rules (BR-05 to BR-10): `description` 5-1000 characters, `result` 5-1000, `followUpNote`
5-500, `attachmentNotes` up to 500, all trimmed. `followUpNote` is required when
`followUpRequired` is true and is stored as `null` when it is false. `result` is required to create an Action as `COMPLETED` and to move an Action to `COMPLETED` or `CANCELLED` (for `CANCELLED` it is the reason). `actionAt` for `IN_PROGRESS` or `COMPLETED` may not be more than 5
minutes in the future; for `PLANNED` it may be at most 30 days in the future.

## 2. GET /api/tickets/:id/actions

List a Ticket's Actions Taken, oldest created first with `id` ascending as the tiebreaker.

Roles: Requester (own Ticket only), IT Staff, Administrator.

Response 200: an array of Action resources (empty array when none).

Errors: 401; 403 `PASSWORD_CHANGE_REQUIRED`; 404 when the Ticket does not exist or a
Requester does not own it (identical response).

## 3. POST /api/staff/tickets/:id/actions

Create an Action Taken. Roles: IT Staff, Administrator (a Requester gets 403 `FORBIDDEN`).

Request:

```json
{
  "actionAt": "2026-10-12T08:30:00.000Z",
  "description": "Replaced the faulty laptop battery.",
  "status": "COMPLETED",
  "assigneeId": 7,
  "result": "Battery now holds charge for a full shift.",
  "followUpRequired": true,
  "followUpNote": "Check battery health again after one week.",
  "attachmentNotes": "See the battery report PDF under Attachments.",
  "clientRequestId": "0b0c4a2e-6f1d-4c1c-9a53-6d2f3f6f6f21"
}
```

Required: `description`, and `result` (5-1000 characters, trimmed) when `status` is `COMPLETED`. `result` is optional for `PLANNED` and `IN_PROGRESS`. Because this depends only on the request body, a missing `result` on a `COMPLETED` create is a 400 `VALIDATION_FAILED` with `fields.result` at check-order step 5, before any state check. Optional with defaults: `actionAt` (now), `status` (`PLANNED`; only
`PLANNED`, `IN_PROGRESS`, or `COMPLETED` are allowed at creation, never `CANCELLED`),
`assigneeId` (the current user), `followUpRequired` (false). `clientRequestId` is an optional
UUID; the UI always sends one. Ignored: `performedBy`, `version`, `createdAt`, `updatedAt`.

The assignee must be an active IT Staff or Administrator. Performed by is set from the
session and cannot be overridden.

Idempotency (BR-24): the pair (current user, `clientRequestId`) is unique. A repeat with the
same pair returns the original Action with 200 and creates nothing. If the same pair was used
for a different Ticket, the response is 400 `VALIDATION_FAILED` on `clientRequestId`.

Responses:
- 201 with the Action resource (first request).
- 200 with the original Action resource (replay).
- 400 `VALIDATION_FAILED`, for example:

```json
{
  "error": "Validation failed",
  "code": "VALIDATION_FAILED",
  "fields": {
    "result": "A result is required when the action is created as completed.",
    "followUpNote": "A follow-up note is required when follow-up is needed.",
    "assigneeId": "The assignee must be an active IT Staff or Administrator."
  }
}
```

- 404 Ticket not found.
- 409 `TICKET_NOT_ACCEPTING_ACTIONS` when the Ticket is Resolved, Closed, or Cancelled:

```json
{
  "error": "This ticket no longer accepts actions. Reopen it first.",
  "code": "TICKET_NOT_ACCEPTING_ACTIONS",
  "ticketStatus": "RESOLVED"
}
```

## 4. PATCH /api/staff/actions/:actionId

Edit fields of a non-terminal Action. Roles: IT Staff, Administrator.

Request (all fields except `expectedVersion` optional):

```json
{
  "expectedVersion": 2,
  "description": "Replaced the faulty laptop battery and cleaned the vents.",
  "assigneeId": 9,
  "actionAt": "2026-10-12T08:30:00.000Z",
  "result": "In progress, awaiting a charge test.",
  "followUpRequired": false,
  "attachmentNotes": null
}
```

- `expectedVersion` is required; if it is missing the response is 400 `VALIDATION_FAILED`.
- Status and Ticket cannot change here. A `status` or `ticketId` field returns 400
  `VALIDATION_FAILED` with a message that points to the status endpoint. The Lab 4 UI changes an
  Action's status only through that endpoint, with separate buttons (Start, Mark completed,
  Cancel action), never through Save in the edit dialog.
- Turning `followUpRequired` off clears `followUpNote`.
- A request with no changes returns 400 `VALIDATION_FAILED` ("No changes supplied"). A body with no editable field at all (only `expectedVersion`) is answered at step 5; a body whose values all equal the stored values needs the stored state, so it is answered at step 7, after the 409 checks.
- `result` may be cleared with `null` or an empty string while the Action is not terminal; otherwise it must be 5-1000 characters.
- If `followUpNote` is sent alone while the stored `followUpRequired` is false (and the body does not turn it on), the response is 400 `VALIDATION_FAILED` on `followUpNote` at step 7; if the body itself says `followUpRequired` is false, the note is dropped.

Responses:
- 200 with the updated Action (`version` increased by one).
- 400 `VALIDATION_FAILED` (field problems, inactive assignee).
- 404 Action not found.
- 409 `ACTION_TERMINAL` when the Action is Completed or Cancelled.
- 409 `STALE_VERSION`:

```json
{
  "error": "This action was changed by someone else. Reload it to see the latest version.",
  "code": "STALE_VERSION",
  "currentVersion": 3,
  "current": { "id": 31, "status": "IN_PROGRESS", "version": 3, "updatedAt": "2026-10-12T09:05:00.000Z" }
}
```

`current` is the full Action resource; it is abbreviated above.

## 5. PATCH /api/staff/actions/:actionId/status

Change an Action's status. Roles: IT Staff, Administrator.

Request:

```json
{ "expectedVersion": 3, "status": "COMPLETED", "result": "Battery replaced and tested." }
```

Allowed pairs: PLANNED to IN_PROGRESS, PLANNED to COMPLETED, PLANNED to CANCELLED,
IN_PROGRESS to COMPLETED, IN_PROGRESS to CANCELLED. `result` may be supplied here or may
already be stored; it must exist (5-1000 characters) for `COMPLETED` and `CANCELLED` (for
`CANCELLED` it is the reason). The `actionAt` rule is re-checked when moving to
`IN_PROGRESS` or `COMPLETED`.

Responses:
- 200 with the updated Action.
- 400 `VALIDATION_FAILED` (missing `expectedVersion`, missing Result, `actionAt` in the future).
- 400 `INVALID_TRANSITION` for a pair that is not allowed from a non-terminal status (including
  the same status again): `{ "error": "Invalid status transition", "code": "INVALID_TRANSITION", "from": "IN_PROGRESS", "to": "PLANNED" }`.
- 404 Action not found.
- 409 `ACTION_TERMINAL` when the Action is already Completed or Cancelled.
- 409 `STALE_VERSION` (same body as section 4).

## 6. Ticket endpoints changed in Lab 4

### PATCH /api/staff/tickets/:id/status (existing)

Request keeps the Lab 3 shape and gains an optional field:

```json
{ "newStatus": "RESOLVED", "expectedVersion": 4 }
```

Lab 4 behavior:
- The pair is validated against the stored status inside a transaction holding the Ticket
  row lock. A "from" status claimed by the client is never used.
- Resolution gate (BR-17): `RESOLVED` is refused while any Action of the Ticket is `PLANNED`
  or `IN_PROGRESS`:

```json
{
  "error": "2 unfinished action(s) must be completed or cancelled before this ticket can be resolved.",
  "code": "OPEN_ACTIONS_BLOCK_RESOLUTION",
  "openActionsCount": 2
}
```

- A Ticket with zero Actions can be resolved. A COMPLETED Action marked as needing follow-up
  does not block.
- Every successful status transition sets `statusChangedAt` to the current time (BR-39); owner, priority, comment, and Action changes never do.
- `RESOLVED` sets `resolvedAt`. `REOPENED` clears `resolvedAt` and resets
  `problemAppearsResolved` to false.
- `CANCELLED` cancels every `PLANNED` or `IN_PROGRESS` Action in the same transaction (Result
  "Cancelled automatically because the Ticket was cancelled.", `version` increased) and the
  response adds `cancelledActionsCount`.
- If `expectedVersion` is supplied and differs, the response is 409 `STALE_VERSION`. If it is
  omitted the change still applies (Lab 3 compatibility) but the pair is validated and the
  gate runs.
- The Lab 3 invalid-transition body is kept and gains a code:
  `{ "error": "Invalid status transition", "code": "INVALID_TRANSITION", "from": "NEW", "to": "CLOSED" }`.

Response 200 is the updated Ticket header: the fields this endpoint returned in Lab 3 are kept, and the
response gains `version`, `resolvedAt`, `statusChangedAt`, `currentStatus`, `itPriority`, `ticketOwnerId`,
`ticketOwnerName`, `problemAppearsResolved`, and `openActionsCount` (and `cancelledActionsCount` after a
cancel). The owner and priority endpoints return the same header. It never contains comments, notes, or
attachments. A 409 `STALE_VERSION` from these endpoints has the body
`{ "error", "code", "currentVersion", "current": <that header> }`.

For the three Ticket endpoints the 404 check comes before the 400 checks (check order step 4 before step 5);
the Lab 3 error texts are unchanged. A 401, 403, or 404 from these endpoints keeps its Lab 3 body without a
`code`; only the errors named in this section (and `VALIDATION_FAILED` for a malformed `expectedVersion`) carry a `code`.

### PATCH /api/staff/tickets/:id/owner and /priority (existing)

Unchanged except for an optional `expectedVersion` in the body and `version` in the
response. A supplied stale value returns 409 `STALE_VERSION`; an omitted value keeps the Lab 3
behavior.

### Additive response fields

`GET /api/tickets/:id` and `GET /api/staff/tickets/:id`, and the Ticket returned by the
status, owner, and priority endpoints, gain:

```json
{ "version": 4, "resolvedAt": "2026-10-12T10:00:00.000Z", "statusChangedAt": "2026-10-12T10:00:00.000Z" }
```

`resolvedAt` is `null` unless the Ticket is Resolved or Closed. `statusChangedAt` is when the Ticket's status last changed (its creation time if it never changed). `GET /api/staff/tickets/:id`
also gains `"openActionsCount": 2`. All earlier fields are unchanged.

## 7. List filter change (additive)

`GET /api/tickets` and `GET /api/staff/tickets` accept a comma-separated list in
`currentStatus`, for example `currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED`.

- Values are trimmed and de-duplicated; at most 8 values; matching is OR within the list and
  AND with every other filter.
- Every value is checked against the whitelist (`NEW`, `OPEN`, `IN_PROGRESS`,
  `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, `CANCELLED`). Any invalid value
  returns 400 `VALIDATION_FAILED` with `fields.currentStatus` listing the allowed values.
- An empty `currentStatus=` is treated as not supplied. A single value behaves exactly as in
  Labs 2 and 3.

## 8. GET /api/dashboard/requester

Roles: Requester only (IT Staff and Administrator get 403 `FORBIDDEN`). Always scoped to the
session user; any user id sent is ignored (BR-30).

Response 200:

```json
{
  "generatedAt": "2026-10-12T10:20:00.000Z",
  "recentlyResolvedSince": "2026-09-12T10:20:00.000Z",
  "metrics": {
    "open": { "count": 3, "query": "currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED" },
    "waitingForYou": { "count": 1, "query": "currentStatus=WAITING_FOR_REQUESTER" },
    "resolved": { "count": 5, "query": "currentStatus=RESOLVED" },
    "closed": { "count": 12, "query": "currentStatus=CLOSED" }
  },
  "needsAttention": [
    { "id": 88, "ticketNumber": "TKT-2026-000088", "summary": "VPN disconnects randomly", "currentStatus": "WAITING_FOR_REQUESTER", "waitingSince": "2026-10-08T07:00:00.000Z", "updatedAt": "2026-10-09T07:00:00.000Z" }
  ],
  "recentlyUpdated": [
    { "id": 101, "ticketNumber": "TKT-2026-000101", "summary": "Laptop battery drains quickly", "currentStatus": "IN_PROGRESS", "updatedAt": "2026-10-12T09:02:44.000Z" }
  ],
  "recentlyResolved": [
    { "id": 95, "ticketNumber": "TKT-2026-000095", "summary": "Printer offline", "currentStatus": "RESOLVED", "updatedAt": "2026-10-11T15:00:00.000Z", "resolvedAt": "2026-10-11T15:00:00.000Z" }
  ]
}
```

- Counts come from the database at request time with the single `generatedAt` instant; nothing is cached (BR-26).
- Each list holds at most 5 items, and ties break by `id` in the same direction as the primary order (BR-29).
  - `needsAttention`: status WAITING_FOR_REQUESTER, longest waiting first, meaning `statusChangedAt` ascending, then `id` ascending. Each item carries `waitingSince` (the Ticket's `statusChangedAt`), which is when it entered Waiting for Requester, not when it was last edited. A later comment or edit does not reorder it, and a Ticket that leaves and re-enters Waiting is counted from the new entry (BR-39).
  - `recentlyUpdated`: any status, `updatedAt` descending, then `id` descending.
  - `recentlyResolved`: status RESOLVED or CLOSED with `recentlyResolvedSince <= resolvedAt <= generatedAt`, `resolvedAt` descending, then `id` descending.
- Time rules (BR-28): `generatedAt` is captured once per request and used for every calculation,
  passed to the database as a bound parameter (never SQL `NOW()` or `CURRENT_DATE`).
  `recentlyResolvedSince` is `generatedAt` minus exactly 30 x 24 hours (2,592,000,000 ms), both
  ends inclusive: a Ticket resolved exactly 30 days earlier is included, one millisecond older is
  excluded. Both values are ISO-8601 UTC. The UI never recomputes the window; the server or
  browser time zone cannot change which items appear.
- `query` is the exact query string for the drill-down on `GET /api/tickets`; the card number
  must equal that query's `totalItems` (BR-31).
- A user with no Tickets gets all counts 0 and empty arrays.

## 9. GET /api/dashboard/staff

Roles: IT Staff and Administrator (a Requester gets 403 `FORBIDDEN`).

Response 200:

```json
{
  "generatedAt": "2026-10-12T10:20:00.000Z",
  "metrics": {
    "unassigned": { "count": 7, "query": "ticketOwnerId=unassigned&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "myAssigned": { "count": 4, "query": "ticketOwnerId=7&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" },
    "new": { "count": 14, "query": "currentStatus=NEW" },
    "inProgress": { "count": 18, "query": "currentStatus=IN_PROGRESS" },
    "waitingForRequester": { "count": 7, "query": "currentStatus=WAITING_FOR_REQUESTER" },
    "highPriority": { "count": 3, "query": "itPriority=HIGH&currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED" }
  },
  "myRecentTickets": [
    { "id": 101, "ticketNumber": "TKT-2026-000101", "summary": "Laptop battery drains quickly", "currentStatus": "IN_PROGRESS", "itPriority": "MEDIUM", "updatedAt": "2026-10-12T09:02:44.000Z" }
  ],
  "myOpenActions": [
    { "id": 33, "ticketId": 101, "ticketNumber": "TKT-2026-000101", "description": "Run the battery diagnostic.", "status": "PLANNED", "actionAt": "2026-10-13T03:00:00.000Z" }
  ],
  "urgentTickets": [
    { "id": 77, "ticketNumber": "TKT-2026-000077", "summary": "Cannot connect to VPN", "currentStatus": "OPEN", "itPriority": "HIGH", "updatedAt": "2026-10-08T05:00:00.000Z" }
  ],
  "users": { "active": 11, "inactive": 3 }
}
```

- `users` is present only for an Administrator and is omitted for IT Staff (BR-30).
- "Active" statuses are NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED.
- Lists hold at most 5 items, and ties break by `id` in the same direction as the primary order (BR-29): `myRecentTickets` (owned by me, `updatedAt` descending, `id` descending), `myOpenActions` (assigned to me, PLANNED or IN_PROGRESS, `actionAt` ascending, `id` ascending), `urgentTickets` (active with IT Priority HIGH, least recently updated first: `updatedAt` ascending, `id` ascending).
- `query` is the drill-down for `GET /api/staff/tickets`; each card number equals that
  query's `totalItems`.
- A user with nothing to show gets counts 0 and empty arrays.

## 10. GET /api/health/ready

No authentication. Checks that the database answers a trivial query.

- 200: `{ "status": "ready" }`
- 503: `{ "status": "unavailable", "code": "NOT_READY" }` (no internal detail)

`GET /api/health` is unchanged: `{ "status": "ok", "service": "TokTickIT API" }`.

## 11. Authorization Summary

| Endpoint | Requester | IT Staff | Administrator |
|---|---|---|---|
| GET /api/tickets/:id/actions | Own Ticket; otherwise 404 | Any Ticket | Any Ticket |
| POST /api/staff/tickets/:id/actions | 403 | Yes | Yes |
| PATCH /api/staff/actions/:actionId | 403 | Yes | Yes |
| PATCH /api/staff/actions/:actionId/status | 403 | Yes | Yes |
| PATCH /api/staff/tickets/:id/status, owner, priority | 403 | Yes | Yes |
| GET /api/dashboard/requester | Yes | 403 | 403 |
| GET /api/dashboard/staff | 403 | Yes | Yes (plus `users`) |
| GET /api/health/ready | Public | Public | Public |

There is no delete endpoint for Actions Taken. A DELETE to an Action path returns 404 or 405.
Every row is enforced on the backend; a hidden or disabled control in the UI is never relied on.
A user who must change the initial password gets 403 `PASSWORD_CHANGE_REQUIRED` from every
endpoint above except the Lab 3 authentication endpoints.

## 12. Backward Compatibility Notes

- No Lab 1-3 path, method, or request shape changes. New request fields (`expectedVersion`,
  `currentStatus` lists) are optional.
- Responses only gain fields (`version`, `resolvedAt`, `openActionsCount`, `code`).
- Existing `error` texts are unchanged so existing assertions still match. Only the new Lab 4 endpoints add `code`; the error bodies of Lab 1-3 endpoints are not changed.
- The earlier `X-Requester-Id` header stays removed, as decided in Lab 3.
