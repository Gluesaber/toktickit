import { getPrisma } from "../src/prisma.js";
import { hashPassword } from "../src/auth.js";
import { DEV_SEED_PASSWORD, USERS } from "./seedData.js";

// Issue 3-6 (Lab 3) — the seed-account password-pollution incident this project has hit five times
// now (docs/lab-03/tests.md §7): manually logging into a seeded demo account through the real UI to
// verify a login/role flow legitimately flips its mustChangePassword/passwordHash away from the
// fresh-seed state, which then breaks migration.api.test.ts's API-54 assertion. Each time it was
// fixed by hand with a disposable one-off script. This is that fix, made a reusable, idempotent
// command instead of a fresh script every time.
//
// Resets every account in seed.ts's USERS list back to DEV_SEED_PASSWORD + mustChangePassword: true,
// and touches nothing else — never creates a row (that's `npm run prisma:seed`'s job), and never
// touches an `@example.test` fixture account created by a test file, since none of those are in
// USERS.
async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(DEV_SEED_PASSWORD);

  let resetCount = 0;
  for (const user of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (!existing) continue;
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, mustChangePassword: true },
    });
    resetCount++;
  }
  console.log(`Reset ${resetCount}/${USERS.length} seeded accounts to the documented dev password.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
