# TokTickIT — IT Service Desk Application

TokTickIT is a full-stack IT service desk application developed for CPE334 (Software Engineering),
Labs 1 to 4: Requesters raise Tickets with attachments and comments, IT Staff work them in a queue
with internal notes, Actions Taken, and a controlled status workflow, Administrators manage users,
and every role has a dashboard.

## 🚀 Tech Stack

### Frontend
- **Framework**: React 18 (with TypeScript)
- **Routing**: `react-router-dom` (v6/v7)
- **Build Tool**: Vite
- **Styling**: Bootstrap 5 + Custom CSS (Zen Green tokens in `index.css` and component CSS files)
- **Testing**: Vitest + React Testing Library + Playwright E2E

### Backend
- **Runtime**: Node.js
- **Framework**: Express 4 (with TypeScript)
- **Database & ORM**: PostgreSQL 16 via Docker Desktop + Prisma ORM
- **Testing**: Vitest + Supertest

---

## 📁 Repository Structure

```
toktickit/
├── client/
│   ├── src/
│   │   ├── components/        # screens; actions/ (Actions Taken), dashboard/, tickets/ (status control)
│   │   ├── context/           # AuthContext (session user)
│   │   ├── dashboard/         # dashboard API calls, data hook, time formatting
│   │   ├── api.ts             # Lab 1-3 API calls
│   │   ├── actionsApi.ts      # Lab 4 Actions Taken API calls
│   │   ├── roles.ts           # roles and route paths in one place
│   │   ├── ticketWorkflow.ts  # status matrix and confirmations for the UI
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── tests/                 # lab-01/ lab-02/ lab-03/ lab-04/
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.ts
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── rollback/          # lab4_down.sql
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── seed-lab4.ts
│   ├── scripts/               # db:reset, Lab 4 backup, snapshot, verify, backfill, rollback, upgrade test
│   ├── src/
│   │   ├── actions/           # Actions Taken rules and validation
│   │   ├── dashboard/         # dashboard queries, helpers, clock
│   │   ├── http/              # Lab 4 errors, guards, app-level error handler, server log
│   │   ├── middleware/        # session authentication (Lab 3)
│   │   ├── routes/            # actions, ticket-workflow, dashboard, health
│   │   ├── tickets/           # status transitions, workflow, Ticket header, list filter
│   │   ├── utils/
│   │   ├── app.ts             # Express app (Lab 1-3 routes, Lab 4 routers mounted)
│   │   ├── index.ts           # app.listen
│   │   └── prisma.ts
│   ├── tests/                 # lab-01/ lab-02/ lab-03/ lab-04/
│   ├── .env.example
│   ├── package.json
│   └── vitest.config.ts
├── e2e/                       # Playwright specs: lab-02/ lab-03/ lab-04/, global-setup.ts
├── artifacts/                 # committed screenshots written by the Lab 2, Lab 3, and Lab 4 E2E specs
├── docs/                      # lab-01/ to lab-04/ (specification, api-spec, ui-spec, tests, evidence/)
├── scripts/                   # e2e-restore.mjs (npm run test:e2e:clean)
├── .github/workflows/ci.yml
├── docker-compose.yml
├── playwright.config.ts
├── package.json               # Playwright, db:reset, test:e2e, test:e2e:clean
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Setup & Installation Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended; the evidence in `docs/lab-04/evidence/` was produced with v24)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (installed and running for PostgreSQL container)

---

### 1. Environment Configuration

Copy the example environment files for Docker Compose, frontend client, and backend server, then
fill in your own local values. The real `.env` files are git-ignored and must never be committed.

#### Root Environment (for Docker Compose)
```bash
cp .env.example .env
```

#### Frontend Client
```bash
cp client/.env.example client/.env
```
Ensure `VITE_API_URL` points to your backend server (default: `http://localhost:3000`).

#### Backend Server
```bash
cp server/.env.example server/.env
```
Ensure `DATABASE_URL` connects to the PostgreSQL container with the user, password, and database
you put in the root `.env` (port 5432, `?schema=public`).

---

### 2. Dependency Installation

Install dependencies for the repository root (Playwright), the frontend, and the backend:

```bash
# Root: Playwright and the E2E scripts
npm install
npx playwright install chromium

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

The Playwright projects (desktop, tablet, mobile) all use Chromium. CI installs browsers with
`npx playwright install --with-deps`.

---

### 3. Database Initialization & Migration (Docker & Prisma)

Start the PostgreSQL database container via Docker Compose:

```bash
docker compose up -d
```

#### Option A: Fresh Database Installation
Generate the Prisma client, apply database migrations, and seed initial data:

```bash
cd server
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
```

#### Option B: Upgrading Existing Lab 2 Database
If upgrading an existing database that contains pre-existing Lab 2 data (`RequesterUser` and `Ticket` records):

```bash
cd server
npx prisma generate
npx prisma migrate deploy
npm run migrate:users
npx prisma migrate deploy
npx prisma db seed
```
*(Note: `make_ticket_requester_fk_deferrable` drops foreign key constraints temporarily, `npm run migrate:users` copies `RequesterUser` data to `User` and updates `Ticket.requesterId` mapping by email/id, and `restore_ticket_requester_fk` restores foreign key constraints safely).*

#### Seed Data Content & Development Credentials
The seed is idempotent: running `npx prisma db seed` again upserts the users and creates only the
Tickets that do not exist yet (BR-38).

> **Development credentials only.** Every seeded user starts with the development password
> `ChangeMe123!` (`MIGRATED_USER_INITIAL_PASSWORD` in `server/src/constants.ts`) and must change it
> at first login. It is not a secret and must never be used outside a local or CI database.

- **Categories (4)**: Account and Access, Hardware, Software, Network.
- **Related Systems (7)**: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop.
- **Lab 1-3 users**:
  - **Requester User**: `jennifer.anderson@example.com`
  - **Requester User**: `michael.brown@example.com`
  - **IT Staff User**: `alex.staff@tiktockit.com`
  - **Administrator User**: `admin@tiktockit.com`

#### Lab 4 Seed Data (Actions Taken and dashboards)
The Lab 4 data lives in `server/prisma/seed-lab4.ts`. The `l4-*` accounts and `TKT-L4-*` Tickets
below exist only in a database that has been seeded (`npx prisma db seed`, which `npm run db:reset`
also runs); a database upgraded from Lab 3 without the seed does not have them. The `l4-*` users are
not used by any Lab 2 or Lab 3 test, so a demonstration never disturbs those tests.

| Account | Role | Use it to demonstrate |
|---|---|---|
| `l4-dash-staff@tiktockit.com` | IT Staff | Staff dashboard with work: owns 7 of the seeded Tickets and has open Actions; Actions Taken and the resolution gate on `TKT-L4-0003` |
| `l4-dash-staff-idle@tiktockit.com` | IT Staff | Staff dashboard for someone with nothing assigned: the "My" cards and lists are empty |
| `l4-dash-requester-many@example.com` | Requester | Owns all ten `TKT-L4-*` Tickets: Requester dashboard cards, "Needs your attention" order, read-only Actions Taken |
| `l4-dash-requester-empty@example.com` | Requester | Requester dashboard with no Tickets: every card 0 and the empty messages |
| `l4-flow-staff-a@tiktockit.com`, `l4-flow-staff-b@tiktockit.com` | IT Staff | Two staff members editing the same Action in two windows (the stale-version conflict) |
| `l4-flow-requester@example.com` | Requester | Raises the Ticket the two flow staff members work on |
| `l4-resolve-staff@tiktockit.com` | IT Staff | Working a fresh Ticket to Resolved through the resolution gate |
| `l4-resolve-requester@example.com` | Requester | The Requester side of that Ticket, including "Mark problem as resolved" |
| `l4-a11y-staff@tiktockit.com`, `l4-a11y-requester@example.com` | IT Staff, Requester | Keyboard-only and screen-reader walk-throughs |
| `l4-sweep-staff@tiktockit.com`, `l4-sweep-requester@example.com` | IT Staff, Requester | A regression sweep through the Lab 1-3 screens |
| `l4-sweep-administrator@tiktockit.com` | Administrator | Staff dashboard plus the Users card, User Management |

- **Tickets `TKT-L4-0001` to `TKT-L4-0010`** with 13 Actions Taken: every Ticket status, every
  priority, owned and unowned Tickets, Tickets with 0, 1, and several Actions (every Action status,
  one with a follow-up), and three Waiting for Requester Tickets with different wait times.

---

## 🗄️ Lab 4 Database Upgrade and Rollback

All commands run from the repository root unless they start with `cd server`. The Lab 4 migration
(`20261030045000_add_actions_taken_and_workflow_fields`) is additive and runs in one transaction.
Backups, snapshots, and Action exports are written to `server/backups/`, which is in `.gitignore`.

| npm script | Purpose |
|---|---|
| `db:backup` | `pg_dump` through Docker into `backups/lab3-before-lab4-<UTC>.sql`. Stops if the container's `POSTGRES_DB` is not the database in `DATABASE_URL`. |
| `db:snapshot` | Row counts and per-row checksums of every Lab 1-3 table into `backups/snapshot-<UTC>.json` |
| `db:verify:lab4` | Post-migration and post-rollback checks; exits non-zero on any failure |
| `db:backfill:lab4` | Runs only the idempotent backfill and prints how many rows changed |
| `db:rollback:lab4` | Exports Actions Taken, then runs `prisma/rollback/lab4_down.sql` (needs `--confirm`) |

### Upgrade an existing Lab 3 database
1. Stop the backend and any test runs.
2. `npm run db:backup --prefix server`
3. `npm run db:snapshot --prefix server` and keep the printed file name.
4. `cd server && npx prisma migrate deploy`
5. `npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --at-upgrade`
   `--at-upgrade` is valid only immediately after migrating a Lab 3 database, before it holds any
   Lab 4 data. On a database that already has Actions Taken or changed Ticket statuses it fails by
   design (ActionTaken is not 0, and resolvedAt/statusChangedAt differ from updatedAt); use
   `--after-rollback`, or the snapshot comparison without `--at-upgrade`, in the step that applies instead.
6. Optionally run the seed, then start the application. Run step 5 before the seed: its checks
   expect no Actions Taken yet, so on an already seeded database they report `ActionTaken has 0 rows` as failed.

### If the migration fails midway
1. Confirm nothing partial remains:
   `npm run db:verify:lab4 --prefix server -- --expect-absent`
   (ActionTaken, the enum, and the new Ticket columns must not exist).
2. **Find the real error with psql, not from Prisma's output.** Because `migration.sql` opens its
   own transaction (`BEGIN; ... COMMIT;`), a failed `prisma migrate deploy` shows only
   `ERROR: current transaction is aborted, commands ignored until end of transaction block`
   (SQLSTATE 25P02), never the statement that failed, and the `logs` column of its
   `_prisma_migrations` row stays empty. This was proven on a test database: the first error was
   `42P01`, Prisma printed only 25P02. To see the first error, run the migration file against a
   **copy** of the database (never the real one), for example a database restored from the backup
   of step 2:

   ```bash
   docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -v VERBOSITY=verbose -U "$POSTGRES_USER" -d <copy_of_the_database>' < server/prisma/migrations/20261030045000_add_actions_taken_and_workflow_fields/migration.sql
   ```

   Run it from the repository root. Replace `<copy_of_the_database>` with the copy's name; never
   use `"$POSTGRES_DB"` here, because that is the real database.

   psql stops at the first failing statement and prints its SQLSTATE and message. The transaction
   is rolled back, so the copy is left unchanged.
3. Fix the cause, then mark the failed attempt as rolled back:
   `cd server && npx prisma migrate resolve --rolled-back 20261030045000_add_actions_taken_and_workflow_fields`
4. Run `npx prisma migrate deploy` again (the same file applies safely), then verify as in step 5
   of the upgrade.
5. If verification still shows a partial state (it should not), stop and restore the backup
   (Rollback, option B).

If the migration is already applied and only the backfill must be repeated, run
`npm run db:backfill:lab4 --prefix server`. A second run changes 0 rows.

### Rollback
**Option A, reverse SQL** (removes only Lab 4 objects; keeps all Lab 1-3 data, including data
written after the migration):
1. Stop the application.
2. `npm run db:rollback:lab4 --prefix server -- --confirm`
   The script refuses to run without `--confirm`, prints the target database and how many Actions
   Taken rows will be lost, and first writes them to `backups/actions-taken-export-<UTC>.json`.
3. Verify: `npm run db:verify:lab4 --prefix server -- --snapshot backups/snapshot-<UTC>.json --after-rollback`

**Option B, restore the backup** (the whole database returns to the moment of the backup and
everything written after it is lost). Run from the repository root:

```bash
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
docker compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -X -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < server/backups/lab3-before-lab4-<UTC>.sql
```

- The single quotes keep the host shell from expanding `$POSTGRES_USER` and `$POSTGRES_DB`; the
  shell inside the container expands them from the container's own environment, which is the
  same database `db:backup` dumped.
- `-v ON_ERROR_STOP=1` makes psql stop at the first error and exit non-zero instead of carrying on
  with a partial restore; `-X` ignores any `~/.psqlrc` in the container.
- The backup file is passed on stdin from the host, so its path is relative to the repository root
  (`server/backups/`). The npm scripts above run inside `server/`, which is why their paths start
  with `backups/`.

Then run the same `--after-rollback` verification.

### Automated proof of the whole procedure
```bash
cd server
npx tsx scripts/test-upgrade-path-lab4.ts
```
It works only on a separate database, `toktickit_upgrade_test`, which it creates and drops. It
never connects to the database in `DATABASE_URL`. While it runs it temporarily moves the Lab 4
migration folder and, for the failure test, replaces its `migration.sql` with a broken copy; it
restores both on every exit path. Do not run `prisma migrate` commands at the same time.
---

## 🔐 Authentication & Session Identity Flow

TokTickIT uses session-based authentication via HTTP-only session cookies (`tk_session`):
- Users log in via `POST /api/auth/login` using their email and password.
- Session cookie is attached automatically to API requests (`credentials: 'include'`).
- The authenticated session identity (`req.user.id`), not any client-supplied header, determines ownership and access rights (BR-03).
- Users with `mustChangePassword = true` must change their password before accessing non-authentication API resources.

---

## 📡 API Endpoints Summary

Every protected endpoint needs the `tk_session` cookie. Lab 4 endpoints answer errors as
`{ "error", "code" }`; Lab 1-3 endpoints keep their original error bodies. Full contracts:
`docs/lab-02/api-spec.md`, `docs/lab-03/api-spec.md`, and `docs/lab-04/api-spec.md`.

| Method | Endpoint Path | Purpose | Roles |
|---|---|---|---|
| `GET` | `/api/health` | Liveness: `{ "status": "ok", "service": "TokTickIT API" }` | Public |
| `GET` | `/api/health/ready` | Readiness: 200 `{ "status": "ready" }` when the database answers, otherwise 503 `{ "status": "unavailable", "code": "NOT_READY" }` | Public |
| `GET` | `/api/categories` | Active categories for dropdowns | Public |
| `GET` | `/api/related-systems` | Active related systems for dropdowns | Public |
| `GET` | `/api/requesters` | Lab 1-2 list of requesters (no longer used by the UI) | Public |
| `POST` | `/api/auth/login` | Log in and receive the session cookie | Public |
| `POST` | `/api/auth/logout` | Log out and end the session | Signed in |
| `GET` | `/api/auth/me` | The signed-in user | Signed in |
| `POST` | `/api/auth/change-password` | Change the password (clears `mustChangePassword`) | Signed in |
| `POST` | `/api/tickets` | Create a Ticket | Requester |
| `GET` | `/api/tickets` | My Tickets with search, filters (`currentStatus` accepts a comma list), sort, and pages | Requester |
| `GET` | `/api/tickets/:id` | Ticket detail (own Tickets only) | Requester |
| `POST` | `/api/tickets/:id/attachments` | Upload an attachment (5 MB, JPG/PNG/WEBP/PDF, at most 5 active) | Requester |
| `GET` | `/api/tickets/:id/attachments` | Attachment list | Requester (own), IT Staff, Administrator |
| `GET` | `/api/attachments/:id/download` | Download an active attachment | Requester (own), IT Staff, Administrator |
| `DELETE` | `/api/attachments/:id` | Soft-remove an attachment with a reason | Requester (own) |
| `PATCH` | `/api/tickets/:id/resolution-flag` | "Problem appears resolved" flag | Requester (own) |
| `GET`, `POST` | `/api/tickets/:id/comments` | Public comments | Requester (own), IT Staff, Administrator |
| `GET`, `POST` | `/api/tickets/:id/notes` | Internal notes | IT Staff, Administrator |
| `GET` | `/api/staff/tickets` | Queue with search, filters (`ticketOwnerId=unassigned` or a user id, comma `currentStatus`), sort, and pages | IT Staff, Administrator |
| `GET` | `/api/staff/tickets/:id` | Staff Ticket detail | IT Staff, Administrator |
| `GET` | `/api/staff/users` | Active IT Staff and Administrators (owner and assignee choices) | IT Staff, Administrator |
| `PATCH` | `/api/staff/tickets/:id/owner` | Set the Ticket Owner (optional `expectedVersion`) | IT Staff, Administrator |
| `PATCH` | `/api/staff/tickets/:id/priority` | Set the IT Priority (optional `expectedVersion`) | IT Staff, Administrator |
| `PATCH` | `/api/staff/tickets/:id/status` | Change the status through the transition matrix and the resolution gate | IT Staff, Administrator |
| `GET` | `/api/tickets/:id/actions` | Actions Taken of a Ticket | Requester (own), IT Staff, Administrator |
| `POST` | `/api/staff/tickets/:id/actions` | Record an Action (idempotent with `clientRequestId`) | IT Staff, Administrator |
| `PATCH` | `/api/staff/actions/:actionId` | Edit an Action (`expectedVersion` required) | IT Staff, Administrator |
| `PATCH` | `/api/staff/actions/:actionId/status` | Change an Action's status | IT Staff, Administrator |
| `GET` | `/api/dashboard/requester` | Requester dashboard (own Tickets only) | Requester |
| `GET` | `/api/dashboard/staff` | Staff dashboard (plus user counts for Administrators) | IT Staff, Administrator |
| `GET`, `POST` | `/api/admin/users` | List and create users | Administrator |
| `PATCH` | `/api/admin/users/:id` | Edit a user (self-deactivation and last-administrator protection) | Administrator |
| `POST` | `/api/admin/users/:id/reset-password` | Reset a user's password | Administrator |

Any other `/api/...` path answers 404 `{ "error": "Not found", "code": "NOT_FOUND" }`; a body that
is not valid JSON answers 400 `VALIDATION_FAILED`; an unexpected failure answers 500
`INTERNAL_ERROR` with a safe message, and the real cause is logged on the server without request
bodies or cookies.

---

## 🏃 Running the Application

### 1. Ensure Database Container is Running
```bash
docker compose up -d
```

### 2. Start Backend Development Server
```bash
cd server
npm run dev
```
Express API will listen at `http://localhost:3000`. Check it with:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health/ready
```

### 3. Start Frontend Development Server
```bash
cd client
npm run dev
```
Vite dev server will run at `http://localhost:5173`. After login, a Requester lands on My Tickets,
IT Staff and Administrators land on the IT Staff Dashboard.

---

## 🎬 Lab 4 Demonstration

Run the seed first (`cd server && npx prisma db seed`). Each `l4-*` account asks for a new password
at its first login; choose any password that meets the rules.

1. **Staff dashboard.** Sign in as `l4-dash-staff@tiktockit.com`. You land on the IT Staff
   Dashboard: six cards, My recent Tickets, My open Actions, and Urgent Tickets. Open the
   **Unassigned** card: the Queue opens with the same filter, and its total equals the card.
   Press **Refresh** after changing a Ticket in another tab: the numbers update without a reload.
2. **Actions Taken.** Open `TKT-L4-0003` (In Progress, owned by this account). The Actions Taken
   card lists its four Actions. Add an Action, then open it, edit it, and move it through
   Planned, In Progress, and Completed (Completed asks for a Result).
3. **Resolution gate.** On `TKT-L4-0003`, the status control offers Resolved only as a disabled
   option, with a callout that counts the unfinished Actions and a link to the Actions Taken card.
   Complete or cancel the remaining Actions; Resolved becomes available, asks for confirmation,
   and the summary updates. The API enforces the same gate (409 `OPEN_ACTIONS_BLOCK_RESOLUTION`).
4. **Cancel cascade.** On `TKT-L4-0002` (Open, one Planned Action), choose Cancelled. The
   confirmation says how many unfinished Actions will be cancelled, and after it the Planned Action
   is Cancelled automatically with a Result that says so.
5. **Requester view.** Sign in as `l4-dash-requester-many@example.com`. You land on My Tickets;
   open **Dashboard** in the header. "Needs your attention" lists `TKT-L4-0004`, `TKT-L4-0005`,
   and `TKT-L4-0006`, longest waiting first. A Ticket's detail shows its Actions Taken read-only.
   Sign in as `l4-dash-requester-empty@example.com` for the zero state.
6. **Administrator.** Sign in as `l4-sweep-administrator@tiktockit.com`: the Staff dashboard adds
   the Users card, which opens User Management.
7. **Access control.** As a Requester, type `/staff/dashboard` in the address bar: you are sent to
   your own dashboard with "You do not have access to that page."

---

## 🧪 Running Tests

> **Note**: Ensure the Docker database container is running (`docker compose up -d`) before running backend or E2E tests.

### Frontend Unit & Component Tests
```bash
cd client
npm test
```

### Backend API Tests
Run the server suite on a freshly reset database. The tests create their own users and Tickets
and remove them afterwards, but they are verified against the seeded data, and some Lab 3 tests
leave inactive users behind, so repeated runs on an old database drift:

```bash
npm run db:reset
cd server
npm test
```

`npm run db:reset` (repository root) **deletes all data** in the development database, then
re-applies the migrations and the seed. Never point `DATABASE_URL` at a database you need.

### Playwright End-to-End (E2E) Tests
```bash
npm run test:e2e:clean
```
*Executes full user flow and visual/responsive inspection across Desktop, Tablet, and Mobile viewports.*

- The global setup (`e2e/global-setup.ts`) runs `npm run db:reset` first, so E2E also resets the
  development database. Playwright starts the backend and frontend dev servers itself, or reuses
  ones already running on ports 3000 and 5173.
- The Lab 2, Lab 3, and Lab 4 specs rewrite the committed screenshots in `artifacts/` on every run.
  `npm run test:e2e:clean` runs `npx playwright test` and then always runs
  `git restore artifacts/`, even when tests fail, and exits with Playwright's own exit code.
  Extra arguments go to Playwright, for example `npm run test:e2e:clean -- --project=desktop`.
- `npm run test:e2e` (plain `playwright test`, used by CI) leaves the rewritten screenshots in
  place; run `git restore artifacts/` afterwards unless you mean to update them.

**Lab 4 specs (`e2e/lab-04/`)**, each run on desktop (1280×800), tablet (834×1194), and mobile (375×667):

| Spec | Tests |
|---|---|
| `actions-taken-flow.spec.ts` | E2E-01, E2E-02, RESP-03, RESP-04: create, edit, start, and complete an Action; the Requester's read-only view; follow-up validation; the edit conflict |
| `ticket-resolution.spec.ts` | E2E-03, E2E-04: Resolved blocked by an unfinished Action (UI and direct API); cancelling a Ticket cancels its Actions |
| `dashboards.spec.ts` | E2E-05, RESP-01, RESP-02, RESP-04: card counts equal the lists they open; Urgent Tickets; empty and failure states; card reflow |
| `accessibility.spec.ts` | A11Y-02, A11Y-03: keyboard-only use with visible focus; axe on both dashboards and both Ticket Detail screens (no serious or critical violation) |
| `regression-sweep.spec.ts` | E2E-06, E2E-07: every role's links with no console error or failed request; the Lab 1-3 flow |

- The global setup also runs `e2e/lab-04/support/prepare.ts`. It changes the first password of the
  seeded Lab 4 users once per run, to random values, and keeps their sessions in
  `playwright/.auth/` (git-ignored). Every Lab 4 test creates its own users and Tickets through
  the API.
- The Lab 4 specs write 48 screenshots to `artifacts/lab-04/screenshots/`. There are four folders:
  - `staff-dashboard/`: populated, empty, failure
  - `requester-dashboard/`: populated, empty
  - `actions-taken/`: list, create, edit, validation, conflict, terminal, requester-readonly
  - `ticket-workflow/`: permitted-transitions, confirmation, gate-block, success

  Each file is named `<state>-<desktop|tablet|mobile>.png`. Most states are captured as the
  full page. States with an open dialog, and the success toast, are captured as the viewport
  shows them: actions-taken create, edit, validation, conflict, terminal and requester-readonly,
  and ticket-workflow success.

  Just before each screenshot, the text that changes between runs is replaced in the page with
  fixed text (`e2e/lab-04/support/standins.ts`):
  - the users a test creates appear as readable stand-ins, such as "Jordan Staff" and
    `casey.requester@example.test`;
  - Ticket numbers become `TKT-0000-000000`;
  - dates and times show midnight on 1 Jan 2026;
  - date-time fields get the value `2026-01-01T00:00`.

  The real text is put back right after the screenshot. The Lab 4 browser also uses software
  rasterisation. Together, these make the images byte-identical from run to run on the same
  machine. `npm run test:e2e:clean` restores the committed images afterwards.
- Results, the axe report, and the known limits: `docs/lab-04/evidence/issue-7-verification.md`.

---

## 🔀 Branching & Workflow

- `main`: Production-ready code.
- `lab1-staging` to `lab4-staging`: Staging branches for each lab's deliverables.
- `feature/*`: Feature development branches (for example `feature/6-lab4-final-hardening`), merged into the staging branch through a reviewed Pull Request.
