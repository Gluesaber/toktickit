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
cd client && npm install
cd ../server && npm install
```

## 2. Set up environment variables

Copy the example env files and fill in your own local values.

```bash
cp client/.env.example client/.env
cp server/.env.example server/.env
```

- `client/.env` → `VITE_API_URL` should point at the backend (default `http://localhost:3000`).
- `server/.env` → `DATABASE_URL` should point at your PostgreSQL instance, and `PORT` is the port the API listens on (default `3000`).

Never commit your real `.env` files — only `.env.example` is tracked in git.

## 3. Start PostgreSQL (Docker option)

```bash
docker run -d --name toktickit-db \
  -e POSTGRES_USER=toktickit \
  -e POSTGRES_PASSWORD=toktickit \
  -e POSTGRES_DB=toktickit \
  -p 5433:5432 \
  postgres:16-alpine
```

If you use this, set `server/.env` to:

```
DATABASE_URL="postgresql://toktickit:toktickit@localhost:5433/toktickit?schema=public"
```

(Port `5433` is used instead of the default `5432` to avoid clashing with any other local Postgres containers.)

## 4. Run database migrations and seed data

Once the `Category` model has been added to `server/prisma/schema.prisma` (Issue 3):

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
cd server && npm test   # Vitest + Supertest (API tests)
cd client && npm test   # Vitest (UI tests)
```

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
