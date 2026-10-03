# Lab 3 Sprint Engineering Specification

## 1. Sprint Goal

Replace the temporary Development Requester selector with real, secure
authentication and role-based authorization for three roles — Requester,
IT Staff, and Administrator — while preserving every Lab 2 Ticket and
Attachment behavior. Deliver an operational IT Staff Ticket Queue and
Ticket Detail workflow (ownership, IT Priority, status, Public Comments,
Internal Notes) and a minimalist Administrator User Management screen,
with every protected operation enforced server-side rather than by hiding
UI controls.

## 2. Stakeholder Request Interpretation

The system now needs real users instead of a testing selector. Users log
in with an email and password; anyone given a temporary initial password
must set a new one before using the app. Requesters keep doing what they
did in Lab 2, but their identity now comes from their authenticated
session, not a client-supplied ID. IT Staff need a shared queue to find
and work tickets: claim ownership, set IT Priority, move status forward,
and communicate via Public Comments (visible to the Requester) and
Internal Notes (staff-only). Requesters can say a problem "appears
resolved," but only IT Staff formally resolve or close a ticket.
Administrators get a simple screen to manage accounts — create, edit,
activate/deactivate, assign one role, and reset a password — nothing more.

## 3. Scope

### Included
- Session-based authentication (login, logout, current-user retrieval)
- Mandatory first-login password change for accounts with an initial password
- Migration of Lab 2 `RequesterUser` records into a real `User` model
- Continued Requester ownership protection for all Lab 2 Ticket/Attachment functions, now driven by the authenticated session
- IT Staff Ticket Queue (search/filter/sort/paginate) and Ticket Detail (claim/reassign, IT Priority, status transitions)
- Public Comments (Requester + IT Staff + Admin) and Internal Notes (IT Staff + Admin only), append-only
- Requester "Problem Appears Resolved" indication
- Minimalist Administrator User Management (list, create, edit, activate/deactivate, role assignment, password reset)
- Server-side authorization on every protected endpoint

### Excluded
- Email invitations, password-reset email, MFA, social login, SSO
- Self-registration
- Actions Taken (deferred to Lab 4)
- SLA calculation, escalation, notification services
- Dashboards/KPI analytics beyond simple queue counts
- Multi-tenant orgs/departments
- Multiple roles per user, user deletion, bulk operations, import/export, account-history screens
- Mandatory pagination, multi-column sort, or multiple simultaneous filters on the user list

## 4. Functional Requirements

- FR-01: The system shall authenticate a user via email and password and establish a server-side session.
- FR-02: The system shall reject authentication for inactive accounts with a generic, non-revealing error.
- FR-03: The system shall force a mandatory password-change flow for any account flagged as requiring one, blocking access to normal screens until completed.
- FR-04: The system shall provide a current-authenticated-user endpoint returning identity and role.
- FR-05: The system shall provide a logout operation that invalidates the session server-side.
- FR-06: The system shall derive the acting Requester's identity from the authenticated session for every Lab 2 Ticket/Attachment operation, ignoring any requesterId supplied by the client.
- FR-07: The system shall provide an IT Staff Ticket Queue listing all Tickets with search, filter, sort, and pagination.
- FR-08: The system shall allow IT Staff/Administrator to claim an unassigned Ticket or reassign an already-owned Ticket to another active IT Staff/Administrator.
- FR-09: The system shall allow IT Staff/Administrator to set IT Priority independently of Requested Priority.
- FR-10: The system shall allow IT Staff/Administrator to change Ticket status according to the approved transition matrix.
- FR-11: The system shall allow Requester, IT Staff, and Administrator to post Public Comments on a Ticket they can access.
- FR-12: The system shall allow only IT Staff/Administrator to post Internal Notes, and shall never expose Internal Note content to a Requester.
- FR-13: The system shall allow a Requester to mark a Ticket as "problem appears resolved" without changing its formal status.
- FR-14: The system shall provide an Administrator User Management screen: list (search by name/email, optional role filter), create, edit (name/email/role/activation), and initial-password reset.
- FR-15: The system shall prevent an Administrator from deactivating their own account.
- FR-16: The system shall prevent deactivation or role change that would leave zero active Administrators.
- FR-17: The system shall reject duplicate email addresses on user creation and edit.

## 5. Business Rules

### Authentication and Sessions
- BR-01: Only an active user with valid credentials may authenticate.
- BR-02: A user marked as requiring a password change cannot enter the normal application until a new valid password is saved.
- BR-03: The authenticated user identity, not a requesterId/userId supplied by the client, determines ownership of Requester operations and the acting identity for all writes.
- BR-04: Session cookies are httpOnly, use SameSite=Lax, and are marked Secure in production; sessions are invalidated server-side on logout.
- BR-05: Failed login attempts return an identical generic error ("Invalid email or password") whether the email does not exist, the password is wrong, or the account is inactive, to avoid account enumeration.
- BR-06: Passwords are hashed with bcrypt (cost factor 10+) and are never logged, returned in API responses, or stored in plaintext anywhere.
- BR-07: New passwords must be at least 8 characters and include upper case, lower case, a number, and a special character (per the login UI mock).

### Ticket Ownership, Priority, Status
- BR-08: A Ticket may have zero or one primary Ticket Owner, who must be an active IT Staff or Administrator.
- BR-09: Any active IT Staff/Administrator may claim an unassigned Ticket, or reassign an already-owned Ticket to any other active IT Staff/Administrator, per the stakeholder request in Section 3.
- BR-10: IT Priority initially copies Requested Priority at ticket creation and may thereafter be changed only by IT Staff/Administrator.
- BR-11: Ticket statuses are New, Open, In Progress, Waiting for Requester,
  Resolved, Closed, Reopened, Cancelled. Only IT Staff/Administrator may
  perform formal transitions, per the transition matrix below. Any
  transition not listed is rejected with a validation error naming the
  current and requested status.

#### Status Transition Matrix

| From | To | Permitted Roles | Confirmation Required |
|---|---|---|---|
| New | Open | IT Staff, Administrator | No |
| New | Cancelled | IT Staff, Administrator | Yes |
| Open | In Progress | IT Staff, Administrator | No |
| Open | Cancelled | IT Staff, Administrator | Yes |
| In Progress | Waiting for Requester | IT Staff, Administrator | No |
| In Progress | Resolved | IT Staff, Administrator | Yes |
| In Progress | Cancelled | IT Staff, Administrator | Yes |
| Waiting for Requester | In Progress | IT Staff, Administrator | No |
| Waiting for Requester | Resolved | IT Staff, Administrator | Yes |
| Waiting for Requester | Cancelled | IT Staff, Administrator | Yes |
| Resolved | Closed | IT Staff, Administrator | No |
| Resolved | Reopened | IT Staff, Administrator | No |
| Closed | Reopened | IT Staff, Administrator | Yes |
| Reopened | Open | IT Staff, Administrator | No |

Notes:
- Cancelled and Closed are terminal unless explicitly moved to Reopened.
- A "confirmation required" transition must show a confirm dialog in the
  UI before the API call is made, but the backend validation itself does
  not depend on any confirmation flag — the backend only validates that
  the From→To pair is in this table and that the actor holds a permitted
  role.
- The Requester's "problem appears resolved" flag (BR-12) is independent
  of this matrix and never triggers an automatic status transition.
- BR-12: A Requester may set a "problem appears resolved" flag on their own Ticket at any time it is not already Closed or Cancelled; this does not change Current Status.

### Comments and Notes
- BR-13: Public Comments are visible to the Requester who owns the Ticket, all IT Staff, and Administrators.
- BR-14: Internal Notes are visible only to IT Staff and Administrators; a Requester requesting Internal Note data receives a Forbidden response with no note content (AC-04).
- BR-15: Public Comments and Internal Notes are append-only in Lab 3 — no edit or delete.
- BR-16: Empty or whitespace-only Comment/Note content is rejected; content is capped at 2000 characters and rendered safely (no raw HTML injection).

### Administrator Rules
- BR-17: An Administrator creates a user with exactly one role (Requester, IT Staff, or Administrator) and a required initial password that must be changed at next login.
- BR-18: An Administrator can update a user's name, email, role, and activation state, but not their password directly except via the explicit "set new initial password" action.
- BR-19: Duplicate email addresses are rejected on both create and edit.
- BR-20: An Administrator cannot deactivate their own account (BR-15/FR-15).
- BR-21: The system rejects any operation that would leave zero active Administrators (BR-16/FR-16).
- BR-22: Deactivation is used instead of deletion; a deactivated user cannot authenticate (BR-01) but their historical Tickets/Comments/Notes remain intact and attributed.

### Migration
- BR-23: Every existing `RequesterUser` record from Lab 2 is migrated into the `User` model with role `REQUESTER`, `mustChangePassword = true`, and a system-generated initial password (documented in seed/migration notes, never a real secret).
- BR-24: Existing Ticket ownership (`requesterId` foreign key) is preserved unchanged after migration — no Ticket changes owner as a side effect of migration.

## 6. UI Specification Summary

See `docs/lab-03/ui-spec.md` for the full specification. Summary:
- Login screen: email/password fields, validation, busy state, generic
  safe failure message (BR-05); "Forgot password" link shown but disabled/
  informational only (out of scope per Section 4.2).
- Mandatory Change Password screen: current (temporary) password, new
  password, confirm, live rule checklist (length, case, number, special
  character), blocks navigation until completed.
- Application shell: replaces "Change Requester" with authenticated user
  name + role badge + Logout; navigation items shown only for the current
  role (Requester sees My Tickets/Create Ticket; IT Staff sees My Queue/
  Create Ticket; Administrator sees Admin/User Management). Hidden nav
  items are also blocked server-side (never rely on hiding alone).
- IT Staff Ticket Queue: search bar, filters, sortable desktop table /
  mobile cards, pagination, badges for Requested Priority/IT Priority/
  Status/Owner, empty/no-results/forbidden/failure states.
- IT Staff Ticket Detail: extends Lab 2 Ticket Detail — read-only base
  fields, editable Ticket Owner (claim/reassign dropdown), editable IT
  Priority, editable Status (per transition matrix), tabbed Public
  Comments / Internal Notes (visually distinct — Internal Notes on an
  amber/warning-tinted panel to prevent accidental public posting),
  existing Attachments section unchanged from Lab 2.
- Requester Ticket Detail: adds a Public Comments panel and a "Problem
  Appears Resolved" action; Internal Notes tab never rendered for this role.
- Administrator User Management: single screen, list (Name/Email/Role/
  Status/Edit) + search + optional role filter + slide-over or modal form
  for create/edit, matching the provided mockup.

## 7. Data Changes

- `User` (replaces `RequesterUser` conceptually, broader scope): id,
  name, email (unique), passwordHash, role (enum: REQUESTER, IT_STAFF,
  ADMINISTRATOR), isActive (default true), mustChangePassword (default
  true for admin-created accounts), createdAt, updatedAt.
- `Session`: id, userId (FK -> User), expiresAt, createdAt (if using a
  DB-backed session store rather than an in-memory store — see
  Assumptions).
- `Ticket` (extended): add `ticketOwnerId` (nullable FK -> User, must be
  IT_STAFF/ADMINISTRATOR), `itPriority` already nullable from Lab 2 now
  actively used, `problemAppearsResolved` (boolean, default false).
  `requesterId` FK now points to `User` instead of the old
  `RequesterUser` table (migrated in place).
- `PublicComment`: id, ticketId (FK -> Ticket), authorId (FK -> User),
  content, createdAt.
- `InternalNote`: id, ticketId (FK -> Ticket), authorId (FK -> User),
  content, createdAt.

Indexes: unique on `User.email`; index on `Ticket.ticketOwnerId`; index
on `PublicComment.ticketId` and `InternalNote.ticketId`; index on
`Session.userId` and `Session.expiresAt` (for cleanup).

## 8. API Contract

See `docs/lab-03/api-spec.md` for full request/response shapes. Endpoint summary:

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/login | Authenticate, establish session |
| POST | /api/auth/logout | Invalidate session |
| GET | /api/auth/me | Current authenticated user + role |
| POST | /api/auth/change-password | Mandatory/voluntary password change |
| GET | /api/tickets | Requester: own tickets (unchanged from Lab 2, now session-scoped) |
| POST | /api/tickets | Requester: create ticket (session-scoped) |
| GET/POST | /api/tickets/:id/... | Lab 2 detail/attachment endpoints, now session-scoped |
| GET | /api/staff/tickets | IT Staff Queue: search/filter/sort/paginate |
| GET | /api/staff/tickets/:id | IT Staff Ticket Detail |
| PATCH | /api/staff/tickets/:id/owner | Claim/reassign |
| PATCH | /api/staff/tickets/:id/priority | Set IT Priority |
| PATCH | /api/staff/tickets/:id/status | Status transition |
| POST/GET | /api/tickets/:id/comments | Public Comments (Requester/Staff/Admin) |
| POST/GET | /api/tickets/:id/notes | Internal Notes (Staff/Admin only) |
| PATCH | /api/tickets/:id/resolution-flag | Requester "appears resolved" |
| GET | /api/admin/users | User list (search/role filter) |
| POST | /api/admin/users | Create user |
| PATCH | /api/admin/users/:id | Edit user |
| POST | /api/admin/users/:id/reset-password | Set new initial password |

## 9. Acceptance Criteria

- AC-01: Given an active user with valid credentials, when the user logs in, then the backend establishes authenticated access and returns the permitted user identity and role.
- AC-02: Given a user who must change the initial password, when login succeeds, then normal application screens remain unavailable until a valid new password is saved.
- AC-03: Given an authenticated Requester, when the client supplies another requesterId, then the backend still applies the authenticated identity and does not return another Requester's data.
- AC-04: Given a Requester account, when an Internal Note endpoint is requested, then the operation is rejected without exposing note content.
- AC-05: Given an inactive account, when login is attempted, then a generic invalid-credentials message is returned (no account-status leak).
- AC-06: Given an unassigned Ticket, when IT Staff claims it, then the Ticket Owner is set to that IT Staff member.
- AC-07: Given a Ticket owned by IT Staff member A, when Administrator reassigns it to IT Staff member B, then Ticket Owner becomes B.
- AC-08: Given a Ticket in status New, when IT Staff attempts an invalid transition (e.g., directly to Closed), then the transition is rejected per the transition matrix.
- AC-09: Given a Public Comment posted by a Requester, when IT Staff opens the Ticket, then the comment is visible; when the same Ticket is viewed by a different Requester (not the owner), access is denied entirely.
- AC-10: Given an Internal Note posted by IT Staff, when the Requester who owns the Ticket views Ticket Detail, then the note content is never present in the response.
- AC-11: Given a Requester marks a problem as "appears resolved," when IT Staff views the Ticket, then the resolution flag is visible but Current Status is unchanged.
- AC-12: Given an Administrator creates a user with a duplicate email, when submitted, then the request is rejected with a clear validation error.
- AC-13: Given the only active Administrator, when they attempt to deactivate their own account or another Administrator's last-active account, then the operation is rejected.
- AC-14: Given a non-Administrator, when any /api/admin/* endpoint is requested directly, then the request is rejected regardless of UI state.
- AC-15: Given a logged-out session, when any protected endpoint is requested with the old session cookie, then the request is rejected as unauthenticated.
- AC-16: Given migrated Lab 2 data, when the migration completes, then every pre-existing Ticket's Requester relationship still resolves to the correct migrated User and no Ticket data is lost.

## 10. Definition of Done

**Product Completion:**
- All FR-01–FR-17 implemented and demonstrable.
- All AC-01–AC-16 pass with linked automated test evidence.
- All Lab 1/Lab 2 tests still pass after migration (regression evidence).
- Server-side authorization enforced on every protected endpoint — verified by direct API tests, not just UI inspection.
- Passwords never appear in logs, responses, or the repository.
- README documents the migration, seeded credentials (dev-only), and updated setup/test instructions.

**Course Delivery:**
- GitHub Issues cover the full sprint decomposition and reach Done.
- Every feature branch merged into `lab3-staging` via peer-reviewed PR.
- One release PR from `lab3-staging` to `main`.
- `reviewer.md` and `ai-use.md` completed with real evidence.
- PDF submission follows the Answer Part 1–9 format.

## 11. Assumptions and Decisions

- Session storage: server-side session store (e.g., an in-memory store
  for local dev, backed by a `Session` table or a library-managed store)
  with an httpOnly, SameSite=Lax cookie — chosen over JWT for simplicity
  and easy server-side invalidation on logout, appropriate for this
  course's local-only deployment scope.
- Migrated Requesters receive a documented, non-secret local dev initial
  password (e.g., a fixed value stated in the README) rather than any
  real credential, since email delivery is out of scope.
- Ticket Owner is restricted to IT_STAFF or ADMINISTRATOR roles at the
  database/validation level, not just the UI dropdown.
- The "problem appears resolved" flag is modeled as a boolean on Ticket
  rather than a status value, since Lab 3 explicitly keeps formal status
  changes IT-Staff-only (BR-12).
