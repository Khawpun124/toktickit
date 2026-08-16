# TokTickIT — IT Service Desk Application

TokTickIT is a full-stack IT service desk application developed for CPE334 Lab 1 (Individual Sprint 1).

## 🚀 Tech Stack

### Frontend
- **Framework**: React 18 (with TypeScript)
- **Build Tool**: Vite
- **Styling**: Bootstrap 5
- **Testing**: Vitest + React Testing Library

### Backend
- **Runtime**: Node.js
- **Framework**: Express (with TypeScript)
- **Database & ORM**: PostgreSQL + Prisma ORM
- **Testing**: Vitest + Supertest

---

## 📁 Repository Structure

```
toktickit/
├── client/
│   ├── src/
│   ├── tests/
│   │   └── lab-01/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   └── prisma.ts
│   ├── tests/
│   │   └── lab-01/
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── docs/
│   └── lab-01/
│       ├── ai_use.md
│       ├── reviewer.md
│       └── tests.md
├── .gitignore
└── README.md
```

---

## ⚙️ Setup & Installation Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [PostgreSQL](https://www.postgresql.org/) (installed and running locally or via Docker)

---

### 1. Environment Configuration

Copy the example environment files to create local `.env` files:

#### Frontend Client
```bash
cp client/.env.example client/.env
```
Ensure `VITE_API_URL` points to your backend server (default: `http://localhost:3000`).

#### Backend Server
```bash
cp server/.env.example server/.env
```
Update `DATABASE_URL` with your PostgreSQL credentials (default: `postgresql://toktickit:toktickit@localhost:5432/toktickit?schema=public`).

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

### 3. Database Initialization (Prisma)

Generate the Prisma client and apply database migrations:

```bash
cd server
npx prisma generate
npx prisma migrate dev
npm run prisma:seed
```

---

## 🏃 Running the Application

### Start Backend Development Server
Ensure the PostgreSQL database container is running before starting the backend server:
```bash
docker compose up -d
```
Then start the backend server:
```bash
cd server
npm run dev
```
The Express server will run at `http://localhost:3000`.

### Start Frontend Development Server
```bash
cd client
npm run dev
```
The Vite development server will start (typically at `http://localhost:5173`).

---

## 🧪 Running Tests

### Frontend Unit Tests
```bash
cd client
npm test
```

### Backend API Tests
```bash
cd server
npm test
```