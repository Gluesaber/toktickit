import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

// Issue 4-6 (Lab 4) — runs once, in the main Vitest process, before any test file starts.
//
// The app's session store (connect-pg-simple, src/auth.ts) creates its "session" table lazily, the
// first time a session is used. On a database that has never had it (a fresh clone, or after
// `prisma migrate reset`), Vitest's parallel workers would all hit "table missing" at once, all try
// to create it, and every worker but one would fail its logins with a 500 (12–43 failures were seen,
// docs/lab-04/tests.md §7). Creating it here, before the workers exist, removes the race.
//
// The table is still not in schema.prisma on purpose (it belongs to connect-pg-simple, and every
// `prisma migrate diff` would otherwise try to drop or own it), and the SQL comes from the library's
// own table.sql so it can never drift from what the store expects.
export default async function setup() {
  const prisma = new PrismaClient();
  try {
    const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT to_regclass('public.session') IS NOT NULL AS exists`;
    if (exists) return;

    const require = createRequire(import.meta.url);
    const sqlPath = require.resolve("connect-pg-simple/table.sql");
    const statements = readFileSync(sqlPath, "utf8")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  } finally {
    await prisma.$disconnect();
  }
}
