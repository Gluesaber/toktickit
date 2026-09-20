import { describe, it, expect } from "vitest";
import { getPrisma } from "../../src/prisma.js";

// docs/lab-03/tests.md — server/tests/lab-03/migration.api.test.ts (API-53, API-54).
// Verifies the Requester -> User migration (prisma/migrations/*_lab3_user_auth) preserved existing
// Lab 2 data rather than dropping and recreating it — see that migration's own SQL comments.

describe("Requester -> User migration (BR-37, BR-38)", () => {
  it("API-53: an existing Lab 2 seeded Ticket still resolves to its migrated User row", async () => {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findFirst({
      where: { requester: { email: "alex.rivera@example.edu" } },
      include: { requester: true },
    });
    expect(ticket).not.toBeNull();
    expect(ticket!.requester.email).toBe("alex.rivera@example.edu");
    expect(ticket!.requester.role).toBe("REQUESTER");
  });

  it("API-54: every migrated Lab 2 seed Requester has a real password hash and mustChangePassword=true", async () => {
    const prisma = getPrisma();
    const seededEmails = [
      "alex.rivera@example.edu",
      "priya.nair@example.edu",
      "jordan.lee@example.edu",
      "morgan.chen@example.edu",
      "sam.whitfield@example.edu",
    ];
    const users = await prisma.user.findMany({ where: { email: { in: seededEmails } } });
    expect(users).toHaveLength(seededEmails.length);
    for (const user of users) {
      expect(user.passwordHash.length).toBeGreaterThan(0);
      expect(user.passwordHash.startsWith("$2")).toBe(true); // real bcrypt hash, not the '' migration placeholder
      expect(user.mustChangePassword).toBe(true);
      expect(user.role).toBe("REQUESTER");
    }
  });
});
