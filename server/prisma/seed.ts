import { getPrisma } from "../src/prisma.js";

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

// Issue 2-2 (Lab 2) — required Development Requesters (specification.md §11: 4 active + 1 inactive).
// The inactive Requester must never appear in GET /api/requesters or the Selection screen (BR-35).
const REQUESTERS: { name: string; email: string; isActive: boolean }[] = [
  { name: "Alex Rivera", email: "alex.rivera@example.edu", isActive: true },
  { name: "Priya Nair", email: "priya.nair@example.edu", isActive: true },
  { name: "Jordan Lee", email: "jordan.lee@example.edu", isActive: true },
  { name: "Morgan Chen", email: "morgan.chen@example.edu", isActive: true },
  { name: "Sam Whitfield", email: "sam.whitfield@example.edu", isActive: false },
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

  for (const requester of REQUESTERS) {
    await prisma.requester.upsert({
      where: { email: requester.email },
      update: {},
      create: requester,
    });
  }
  console.log(`Seeded ${REQUESTERS.length} development requesters.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
