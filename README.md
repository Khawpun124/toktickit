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

### 3. Database Initialization (Docker & Prisma)

Start the PostgreSQL database container via Docker Compose:

```bash
docker compose up -d
```

Generate the Prisma client, apply database migrations, and seed initial data:

```bash
cd server
npx prisma generate
npx prisma migrate dev
npx prisma db seed
```

#### Seed Data Content:
- **Categories (4)**: Account and Access, Hardware, Software, Network.
- **Related Systems (7)**: Email, Campus Wi-Fi, VPN, LEB2 App, Grade Submission App, Printer, Corporate Laptop.
- **Development Requesters (4 active, 1 inactive)**:
  - Active: Jennifer Anderson, Michael Brown, Sarah Jenkins, David Wilson
  - Inactive: Inactive Tester (excluded from selection UI per BR-06)

---

## 👤 Development Requester Identity Flow

In Lab 2, user management uses a **temporary Development Requester Selection mechanism** (BR-05) to simulate logging in as different requesters without real password authentication:
- Users select an active requester profile on `/select-requester` (or `/`).
- The selected requester identity is stored in `sessionStorage` and attached as `X-Requester-Id: <id>` on all API calls.
- Access to tickets and attachments enforces requester ownership (BR-10, BR-26).
- *Note: This temporary development mechanism will be replaced with real authentication in Lab 3.*

---

## 📡 API Endpoints Summary

All requester-scoped endpoints require header `X-Requester-Id: <id>`.

| Method | Endpoint Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | System health check & status |
| `GET` | `/api/categories` | Fetch active category list for dropdowns |
| `GET` | `/api/related-systems` | Fetch active related system list for dropdowns |
| `GET` | `/api/requesters` | Fetch active Development Requesters for selection UI |
| `POST` | `/api/tickets` | Create a new support ticket |
| `GET` | `/api/tickets` | List & search requester's tickets (with filters, sorting, pagination) |
| `GET` | `/api/tickets/:id` | Fetch single ticket details (enforces requester ownership) |
| `POST` | `/api/tickets/:id/attachments` | Upload attachment file to a ticket (max 5MB, JPG/PNG/WEBP/PDF) |
| `GET` | `/api/attachments/:id/download` | Download active attachment file (requires `X-Requester-Id`) |
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