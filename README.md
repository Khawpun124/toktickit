# TokTickIT — IT Service Desk Application

TokTickIT is a full-stack IT service desk application developed for CPE334 (Software Engineering) Lab 1 and Lab 2.

## 🚀 Tech Stack

### Frontend
- **Framework**: React 18 (with TypeScript)
- **Routing**: `react-router-dom` (v6/v7)
- **Build Tool**: Vite
- **Styling**: Bootstrap 5 + Custom CSS (`index.css`)
- **Testing**: Vitest + React Testing Library + Playwright E2E

### Backend
- **Runtime**: Node.js
- **Framework**: Express (with TypeScript)
- **Database & ORM**: PostgreSQL via Docker Desktop + Prisma ORM
- **Testing**: Vitest + Supertest

---

## 📁 Repository Structure

```
toktickit/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── api.ts
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── tests/
│   │   ├── lab-01/
│   │   └── lab-02/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── server/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   └── prisma.ts
│   ├── tests/
│   │   ├── lab-01/
│   │   └── lab-02/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── docs/
│   ├── lab-01/
│   └── lab-02/
│       ├── ai-use.md
│       ├── api-spec.md
│       ├── reviewer.md
│       ├── specification.md
│       ├── tests.md
│       └── ui-spec.md
├── e2e/
│   └── lab-02/
├── artifacts/
│   └── lab-02/
│       └── screenshots/
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## ⚙️ Setup & Installation Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (installed and running for PostgreSQL container)

---

### 1. Environment Configuration

Copy the example environment files for Docker Compose, frontend client, and backend server:

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
Ensure `DATABASE_URL` connects to PostgreSQL (default: `postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public`).

---

### 2. Dependency Installation

Install dependencies for both frontend and backend:

```bash
# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

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


#### Seed Data Content & Initial Credentials:
- **Categories (4)**: Account and Access, Hardware, Software, Network.
- **Related Systems (7)**: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop.
- **Default Users & Credentials**:
  - **Requester User**: `jennifer.anderson@example.com` / `ChangeMe123!`
  - **Requester User**: `michael.brown@example.com` / `ChangeMe123!`
  - **IT Staff User**: `alex.staff@tiktockit.com` / `ChangeMe123!`
  - **Administrator User**: `admin@tiktockit.com` / `ChangeMe123!`
  - *Note: All initial users created via migration or seed script are initialized with `mustChangePassword = true` and initial password `ChangeMe123!`.*

#### Lab 4 Seed Data (Actions Taken and dashboards)
The seed is idempotent: running `npx prisma db seed` again upserts the users and creates only the
Tickets that do not exist yet. The Lab 4 data lives in `server/prisma/seed-lab4.ts`.

- **Dedicated Lab 4 users** (not used by any Lab 2 or Lab 3 test). Every one starts with the
  development password `ChangeMe123!` (the `INITIAL_MIGRATED_PASSWORD` default in
  `server/src/constants.ts`, development only) and must change it at first login.

  | End-to-end spec | Users |
  |---|---|
  | `e2e/lab-04/dashboards.spec.ts` | `l4-dash-staff@tiktockit.com` (IT Staff with work), `l4-dash-staff-idle@tiktockit.com` (IT Staff with none), `l4-dash-requester-many@example.com` (owns every seeded Ticket), `l4-dash-requester-empty@example.com` (no Tickets) |
  | `e2e/lab-04/actions-taken-flow.spec.ts` | `l4-flow-staff-a@tiktockit.com`, `l4-flow-staff-b@tiktockit.com`, `l4-flow-requester@example.com` |
  | `e2e/lab-04/ticket-resolution.spec.ts` | `l4-resolve-staff@tiktockit.com`, `l4-resolve-requester@example.com` |
  | `e2e/lab-04/accessibility.spec.ts` | `l4-a11y-staff@tiktockit.com`, `l4-a11y-requester@example.com` |
  | `e2e/lab-04/regression-sweep.spec.ts` | `l4-sweep-staff@tiktockit.com`, `l4-sweep-requester@example.com`, `l4-sweep-administrator@tiktockit.com` (Administrator) |

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
6. Optionally run the seed, then start the application.

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

| Method | Endpoint Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | System health check & status |
| `GET` | `/api/categories` | Fetch active category list for dropdowns |
| `GET` | `/api/related-systems` | Fetch active related system list for dropdowns |
| `POST` | `/api/auth/login` | Log in user & issue session cookie |
| `POST` | `/api/auth/logout` | Log out user & destroy session |
| `GET` | `/api/auth/me` | Fetch currently authenticated user session info |
| `POST` | `/api/auth/change-password` | Change user password & set `mustChangePassword = false` |
| `POST` | `/api/tickets` | Create a new support ticket (requires session auth) |
| `GET` | `/api/tickets` | List & search authenticated user's tickets (with filters, sorting, pagination) |
| `GET` | `/api/tickets/:id` | Fetch single ticket details (enforces session ownership) |
| `POST` | `/api/tickets/:id/attachments` | Upload attachment file to a ticket (max 5MB, JPG/PNG/WEBP/PDF) |
| `GET` | `/api/attachments/:id/download` | Download active attachment file (enforces session ownership) |
| `DELETE` | `/api/attachments/:id` | Soft-remove attachment with a reason |

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
Express API will listen at `http://localhost:3000`.

### 3. Start Frontend Development Server
```bash
cd client
npm run dev
```
Vite dev server will run at `http://localhost:5173`.

---

## 🧪 Running Tests

> **Note**: Ensure the Docker database container is running (`docker compose up -d`) before running backend tests.

### Frontend Unit & Component Tests
```bash
cd client
npm test
```

### Backend API Tests
```bash
cd server
npm test
```

### Playwright End-to-End (E2E) Tests
```bash
npx playwright test
```
*Executes full user flow and visual/responsive inspection across Desktop, Tablet, and Mobile viewports.*

---

## 🔀 Branching & Workflow

- `main`: Production-ready code.
- `lab1-staging`: Staging branch for Lab 1 deliverables.
- `lab2-staging`: Staging branch for Lab 2 deliverables.
- `feature/*`: Feature development branches (e.g. `feature/7-post-mvp-fixes`, `feature/8-routing-and-download-fix`).