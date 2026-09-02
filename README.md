# TokTickIT

TokTickIT is an IT service desk application (Account & Access, Hardware, Software, and Network requests), built incrementally across the CPE 334 individual sprints.

**Sprint 1 stack:** React (Vite + TypeScript + Bootstrap) → Express (TypeScript) REST API → Prisma ORM → PostgreSQL.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ and npm
- A PostgreSQL database, either:
  - **Docker** (recommended) — see below, or
  - a native PostgreSQL install / a cloud instance you already have

## 1. Clone and install dependencies

```bash
git clone https://github.com/Gluesaber/toktickit.git
cd toktickit
cd client
npm install
cd ../server
npm install
cd ..
```

## 2. Set up environment variables

Copy the example env files and fill in your own local values.

macOS / Linux:

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

Windows (PowerShell or cmd):

```bat
copy client\.env.example client\.env
copy server\.env.example server\.env
```

- `client/.env` → `VITE_API_URL` should point at the backend (default `http://localhost:3000`).
- `server/.env` → `DATABASE_URL` should point at your PostgreSQL instance, and `PORT` is the port the API listens on (default `3000`).

Never commit your real `.env` files — only `.env.example` is tracked in git.

## 3. Start PostgreSQL (Docker option)

```
docker run -d --name toktickit-db-maii -e POSTGRES_USER=toktickit -e POSTGRES_PASSWORD=toktickit -e POSTGRES_DB=toktickit -p 5433:5432 postgres:16-alpine
```

(Personalized container name to avoid clashing with another `toktickit-*`
container on your machine — pick a different name/port if these are taken.)

If you use this, set `server/.env` to:

```
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=public"
```

## 4. Run database migrations and seed data

```bash
cd server
npx prisma migrate dev --name init
npx prisma db seed
```

## 5. Run the app

In two separate terminals:

```bash
# Terminal 1 — backend
cd server
npm run dev      # http://localhost:3000

# Terminal 2 — frontend
cd client
npm run dev      # http://localhost:5173
```

Open `http://localhost:5173` in a browser. Click **Check System** to verify the backend health check and the seeded request categories load from PostgreSQL.

## 6. Run tests

```bash
cd server
npm test   # Vitest + Supertest (API tests)
cd ../client
npm test   # Vitest (UI tests)
```

### End-to-end tests (Playwright)

One-time setup, from the repo root:

```bash
npm install
npx playwright install chromium
```

To run the suite, the dev Postgres container must be running/seeded (steps 3–4 above) and the backend
must already be started (`cd server && npm run dev`) — Playwright only auto-starts the Vite client:

```bash
npx playwright test
```

This runs `e2e/lab-02/requester-ticket-flow.spec.ts` (one connected Requester journey: select →
create ticket with an attachment → find it in My Tickets → view its detail → download/soft-remove the
attachment) and `e2e/lab-02/visual-responsive.spec.ts` (desktop/tablet/mobile screenshots + layout
checks for all three screens, saved to `artifacts/lab-02/screenshots/`).

## Project structure

```
toktickit/
├── client/            # React + TypeScript + Vite + Bootstrap frontend
├── server/            # Node.js + Express + TypeScript backend
│   ├── prisma/        # Prisma schema, migrations, seed script
│   └── tests/lab-01/  # Supertest API tests
├── docs/lab-01/       # Lab 1 documentation (AI use, reviewer notes, test list)
├── .gitignore
└── README.md
```

## Git workflow

Development happens on `feature/*` branches, merged into `lab1-staging` via peer-reviewed Pull Requests. `main` only receives completed, reviewed work.
