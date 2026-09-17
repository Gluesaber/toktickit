import type { Role } from "@prisma/client";

// Pure data, no side effects — split out of seed.ts so resetDevAccounts.ts (Issue 3-6) can import
// DEV_SEED_PASSWORD/USERS without also triggering seed.ts's module-level `main()` call (importing
// seed.ts directly re-runs the full category/related-system/user seed as an import side effect,
// which is harmless but unintended noise for a script that only wants these two constants).

// Issue 3-2 (Lab 3) — every seeded account shares one documented, local-development-only initial
// password (BR-38). `mustChangePassword: true` means logging in with it only ever gets you as far
// as the Change Password screen — sharing one password across every seed account is safe under that
// constraint and keeps the credentials easy to document/demo (docs/lab-03/specification.md §5.3,
// README "Seeded accounts"). Never a real password, never used outside local dev.
export const DEV_SEED_PASSWORD = "ChangeMe123!";

export interface SeedUser {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

// Issue 2-2 (Lab 2) — the original 4 active + 1 inactive Development Requesters, migrated in place
// (BR-37: same rows, same ids — this migration renamed the table, it did not recreate these rows).
// Issue 3-2 (Lab 3) — role: "REQUESTER" added; 3 active + 1 inactive IT Staff and 1 active
// Administrator added per specification.md §7 "Seed data minimums" / labsheet §5.3.
export const USERS: SeedUser[] = [
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
