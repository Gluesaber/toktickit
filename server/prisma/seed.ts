import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";
import type { Role } from "@prisma/client";

// Issue 3 (Lab 1) — seed the four supported categories.
// The four names are: Account and Access, Hardware, Software, Network.
// Requirement: running the seed twice must NOT create duplicates.
const CATEGORY_NAMES = ["Account and Access", "Hardware", "Software", "Network"];

// Issue 2-2 (Lab 2) — required Related Systems (specification.md §11: >=6 required, 7 seeded).
const RELATED_SYSTEM_NAMES = [
  "Email",
  "Campus Wi-Fi",
  "VPN",
  "LEB2 App",
  "Grade Submission App",
  "Printer",
  "Corporate Laptop",
];

// Issue 3-2 (Lab 3) — every seeded account shares one documented, local-development-only initial
// password (BR-38). `mustChangePassword: true` means logging in with it only ever gets you as far
// as the Change Password screen — sharing one password across every seed account is safe under that
// constraint and keeps the credentials easy to document/demo (docs/lab-03/specification.md §5.3,
// README "Seeded accounts"). Never a real password, never used outside local dev.
export const DEV_SEED_PASSWORD = "ChangeMe123!";

interface SeedUser {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

// Issue 2-2 (Lab 2) — the original 4 active + 1 inactive Development Requesters, migrated in place
// (BR-37: same rows, same ids — this migration renamed the table, it did not recreate these rows).
// Issue 3-2 (Lab 3) — role: "REQUESTER" added; 3 active + 1 inactive IT Staff and 1 active
// Administrator added per specification.md §7 "Seed data minimums" / labsheet §5.3.
const USERS: SeedUser[] = [
  { name: "Alex Rivera", email: "alex.rivera@example.edu", role: "REQUESTER", isActive: true },
  { name: "Priya Nair", email: "priya.nair@example.edu", role: "REQUESTER", isActive: true },
  { name: "Jordan Lee", email: "jordan.lee@example.edu", role: "REQUESTER", isActive: true },
  { name: "Morgan Chen", email: "morgan.chen@example.edu", role: "REQUESTER", isActive: true },
  { name: "Sam Whitfield", email: "sam.whitfield@example.edu", role: "REQUESTER", isActive: false },
  { name: "Taylor Brooks", email: "taylor.brooks@example.edu", role: "IT_STAFF", isActive: true },
  { name: "Casey Nguyen", email: "casey.nguyen@example.edu", role: "IT_STAFF", isActive: true },
  { name: "Riley Osei", email: "riley.osei@example.edu", role: "IT_STAFF", isActive: true },
  { name: "Drew Kowalski", email: "drew.kowalski@example.edu", role: "IT_STAFF", isActive: false },
  { name: "Jamie Whitfield", email: "jamie.whitfield@example.edu", role: "ADMINISTRATOR", isActive: true },
];

async function main() {
  const prisma = getPrisma();

  for (const name of CATEGORY_NAMES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${CATEGORY_NAMES.length} categories.`);

  for (const name of RELATED_SYSTEM_NAMES) {
    await prisma.relatedSystem.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${RELATED_SYSTEM_NAMES.length} related systems.`);

  // Hashed once and reused for every row — hashing is deliberately the slow part of this script;
  // no need to pay that cost once per user when they all share the same dev password.
  const passwordHash = await hashPassword(DEV_SEED_PASSWORD);

  let created = 0;
  let backfilled = 0;
  for (const user of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (!existing) {
      await prisma.user.create({ data: { ...user, passwordHash, mustChangePassword: true } });
      created++;
    } else if (existing.passwordHash === "") {
      // BR-37/BR-38: this row survived the Requester -> User migration carrying the migration's
      // temporary '' placeholder (see migration.sql) instead of a real hash — backfilled here, the
      // one time it's needed. A later re-run never reaches this branch again for the same row since
      // passwordHash is no longer empty, so a real password a local dev has since set for
      // themselves through the app is never silently overwritten by a re-run of this script.
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
      backfilled++;
    }
    // else: row already fully seeded with a real hash — idempotent re-run leaves it untouched.
  }
  console.log(`Seeded ${USERS.length} users: ${created} created, ${backfilled} migrated-password backfilled.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
