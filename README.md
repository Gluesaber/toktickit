# TokTickIT

TokTickIT is an IT service desk application (Account & Access, Hardware, Software, and Network requests), built incrementally across the CPE 334 individual sprints.

**Stack:** React (Vite + TypeScript + Bootstrap) → Express (TypeScript) REST API → Prisma ORM → PostgreSQL. Sprint 2 adds Multer for file-upload handling and the full Requester ticketing workflow (Create Ticket, My Tickets, Ticket Detail, Attachment lifecycle). Sprint 3 adds session-cookie authentication, three roles (Requester, IT Staff, Administrator), the IT Staff Ticket Queue and ticket operations, and Administrator User Management.

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

- `client/.env` → leave `VITE_API_URL` empty. The Vite dev server proxies `/api` to the backend on the same origin, which the session cookie needs.
- `server/.env` → `DATABASE_URL` should point at your PostgreSQL instance, `PORT` is the port the API listens on (default `3000`), and `SESSION_SECRET` signs the session cookie. Any long random dev-only string works, and the server refuses to start without it.

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

The seed is safe to run again at any time: it skips anything already present and never overwrites a
row you've changed through the app. It also creates 14 demo tickets (`SEED-T01`–`SEED-T14`, all
requested by `alex.rivera@example.edu`) covering every status and priority, with Actions Taken,
comments, internal notes and status history. `morgan.chen@example.edu` and `riley.osei@example.edu`
are deliberately left with no tickets, to show the empty dashboard states.

**Upgrading an existing Lab 3 database to Lab 4.** Back up first, then apply the new migration (it
only adds tables and columns; existing data is untouched). `migrate deploy` doesn't regenerate the
Prisma Client, so run `prisma generate` before seeding, or the seed fails on the new Lab 4 fields:

```bash
docker exec toktickit-db-maii pg_dump -U toktickit -d toktickit -Fc -f /tmp/pre-lab4.dump
cd server
npx prisma migrate deploy
npx prisma generate
npx prisma db seed
```

To undo the Lab 4 migration, run its rollback script, which removes only the Lab 4 tables and columns
(`server/prisma/migrations/20261003120000_lab4_actions_taken/rollback.sql` explains what is lost).
Run these from the repository root:

```bash
docker cp server/prisma/migrations/20261003120000_lab4_actions_taken/rollback.sql toktickit-db-maii:/tmp/rollback.sql
docker exec toktickit-db-maii psql -U toktickit -d toktickit -v ON_ERROR_STOP=1 -f /tmp/rollback.sql
```

## 4a. Seeded accounts (local dev only)

Every seeded account shares one initial password — `ChangeMe123!` — and must change it at first
login (`mustChangePassword: true`). This is a documented, local-development-only credential; it is
never a real password and must never be reused for anything real.

| Email | Role | Active |
|---|---|---|
| alex.rivera@example.edu | Requester | yes |
| priya.nair@example.edu | Requester | yes |
| jordan.lee@example.edu | Requester | yes |
| morgan.chen@example.edu | Requester | yes |
| sam.whitfield@example.edu | Requester | no |
| taylor.brooks@example.edu | IT Staff | yes |
| casey.nguyen@example.edu | IT Staff | yes |
| riley.osei@example.edu | IT Staff | yes |
| drew.kowalski@example.edu | IT Staff | no |
| jamie.whitfield@example.edu | Administrator | yes |

If you've manually logged into one of these accounts to click through the app (rather than using a
disposable `@example.test` account), its password/`mustChangePassword` state has changed and
`migration.api.test.ts` will fail. Restore every seeded account to the table above with:

```bash
cd server
npm run reset-dev-accounts
```

One additional seeded account, `e2e-bootstrap-admin@example.edu` (Administrator), isn't listed above
on purpose — `e2e/lab-03/helpers.ts` uses it to create other test fixtures via the API and nothing
else should ever log into it manually. Its whole point is that `npm run reset-dev-accounts` and
`npx playwright test` can touch it freely without ever resetting an account a person is using for
demos.

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

Open `http://localhost:5173` in a browser. You will land on the **Login** screen — sign in with any
seeded account above (§4a) and its shared initial password. On first login you'll be required to set a
new password before continuing (mandatory first-login password change). After that, every role lands on
its **Dashboard**: live counts that each open the list they count. What you can do depends on the role:

- **Requester** — a dashboard of your own tickets (open, waiting for your reply, resolved, recently
  updated); create tickets; browse your own ticket list with search/filter/sort/pagination; view ticket
  detail including the **Actions Taken** by IT and the **status history** (read-only); manage attachments
  (upload, download, soft-remove); post Public Comments; indicate a problem appears resolved; and cancel a
  ticket that is still New or Open.
- **IT Staff** — a dashboard (unassigned tickets, my open tickets and actions, follow-ups, counts by
  status and IT Priority, urgent and recent tickets); the shared Ticket Queue; claim or reassign
  ownership; set IT Priority; record **Actions Taken** (plan, start, complete or cancel a piece of work,
  assign it, note follow-ups); change status along the permitted transitions — a ticket can only be
  **Resolved once at least one Action is Completed**; post Public Comments and Internal Notes (never
  visible to Requesters). If someone else changed a ticket since you opened it, your change is refused
  with a "changed by someone else — Reload" message instead of overwriting theirs.
- **Administrator** — everything IT Staff can do, plus user counts on the dashboard and User Management:
  list/search/filter users, create a user, edit name/email/role/active state, and set a new initial
  password for a user.

There is no self-service "forgot password": an Administrator resets it from User Management. The Development
Requester Selector from Lab 2 no longer exists — ticket ownership now comes entirely from the
authenticated session.

## 6. Run tests

```bash
cd server
npm test   # Vitest + Supertest (unit + API tests)
cd ../client
npm test   # Vitest (UI tests)
```

The server tests create their own disposable `@example.test` users and tickets every run, so the database
they run against slowly fills up with test data. To keep the database you click around in clean, point
the server tests at a separate one (PowerShell, from `server/`; one-time setup first):

```bash
docker exec toktickit-db-maii psql -U toktickit -d toktickit -c "CREATE DATABASE toktickit_test;"
```
```bash
$env:DATABASE_URL="postgresql://toktickit:toktickit@localhost:5433/toktickit_test?schema=public"; npx prisma migrate deploy; npx prisma db seed; npm test
```

Afterwards, close that terminal (or clear `$env:DATABASE_URL`) before running the app normally, or the
app will use the test database too. If `toktickit_test` grows very large, drop and recreate it the same
way.

### End-to-end tests (Playwright)

One-time setup, from the repo root:

```bash
npm install
npx playwright install chromium
```

To run the suite, the dev Postgres container must be running/seeded (steps 3–4 above) and the backend
must already be started (`cd server && npm run dev`) — Playwright only auto-starts the Vite client:

```bash
npx playwright test e2e/lab-03 e2e/lab-04
```

This runs 43 tests:
- `e2e/lab-03/` — authentication (login, mandatory password change, logout, inactive account), staff
  ticket operations, user administration, a Requester regression journey, and desktop/tablet/mobile
  layout plus keyboard checks.
- `e2e/lab-04/` — Actions Taken (two staff on one ticket, validation, closed tickets), the resolution gate
  and status history, stale-update conflicts, dashboards (every card's number matches the list it opens),
  Lab 4 layout and keyboard-only checks, a full Requester → IT Staff → Administrator journey, and
  double-click / network-failure protection.

The specs create their own disposable `@example.test` users through the Administrator API, using the
`e2e-bootstrap-admin@example.edu` account described above, so they never log into or change any of the
demo accounts in §4a. They do add test users and tickets to whichever database the backend is using, so
for a clean demo database start the backend against `toktickit_test` while running them.

**Screenshots.** The layout specs only *check* layouts by default. To also save baseline screenshots
(to `artifacts/lab-03/screenshots/` and `artifacts/lab-04/screenshots/`), run with
`CAPTURE_SCREENSHOTS=1` (PowerShell: `$env:CAPTURE_SCREENSHOTS="1"; npx playwright test e2e/lab-04`).
This is off by default so an everyday regression run never overwrites committed evidence.

(The Lab 2 Playwright specs were removed in Lab 4: they drove the Development Requester Selector, which
Lab 3 replaced with real login.)

## Project structure

```
toktickit/
├── client/                    # React + TypeScript + Vite + Bootstrap frontend
│   └── tests/
│       ├── lab-01/            # Vitest UI tests (Lab 1)
│       ├── lab-02/            # Vitest UI tests (Lab 2)
│       ├── lab-03/            # Vitest UI tests (Lab 3)
│       └── lab-04/            # Vitest UI tests (Lab 4)
├── server/                    # Node.js + Express + TypeScript backend
│   ├── prisma/                # Prisma schema, migrations, seed + reset-dev-accounts scripts
│   └── tests/
│       ├── lab-01/            # Supertest API tests (Lab 1)
│       ├── lab-02/            # Supertest API tests (Lab 2)
│       ├── lab-03/            # Supertest API + unit tests (Lab 3)
│       ├── lab-04/            # Supertest API, unit, migration/seed and performance-smoke tests (Lab 4)
│       └── globalSetup.ts     # creates the session table once before the parallel test workers start
├── e2e/
│   ├── lab-03/                # Playwright end-to-end tests (Lab 3)
│   └── lab-04/                # Playwright end-to-end tests (Lab 4)
├── docs/
│   ├── lab-01/                # Lab 1 documentation
│   ├── lab-02/                # Lab 2 documentation
│   ├── lab-03/                # Lab 3 documentation
│   └── lab-04/                # Lab 4 documentation
├── artifacts/
│   ├── lab-02/screenshots/    # Playwright-captured viewport screenshots (desktop/tablet/mobile)
│   │   ├── create-ticket/
│   │   ├── my-tickets/
│   │   └── ticket-detail/
│   ├── lab-03/screenshots/    # Playwright-captured baseline screenshots (desktop/tablet/mobile)
│   │   ├── staff-queue/
│   │   ├── staff-ticket-detail/
│   │   └── user-management/
│   └── lab-04/screenshots/    # Lab 4 baselines (CAPTURE_SCREENSHOTS=1, see §6)
│       ├── staff-dashboard/
│       ├── requester-dashboard/
│       └── actions-taken/
├── .gitignore
└── README.md
```

## Git workflow

Development happens on `feature/*` branches, merged into a per-lab staging branch (e.g. `lab2-staging`) via peer-reviewed Pull Requests. After integration testing on staging, one release PR merges staging into `main`. Do not develop directly on `main` or any staging branch.
