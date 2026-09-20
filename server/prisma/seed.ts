import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";
import { DEV_SEED_PASSWORD, USERS } from "./seedData.js";

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
