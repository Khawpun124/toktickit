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