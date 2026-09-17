import { request as pwRequest, APIRequestContext } from "@playwright/test";

// Issue 3-7 (Lab 3) — shared E2E fixture helpers. Every flow spec needs its own users (login,
// Administrator actions, ticket ownership) but must never drive a *documented seed account* through
// a real browser login+Change-Password cycle — that's exactly the manual-testing pollution pattern
// docs/lab-03/tests.md §7 has hit five times on this shared, never-reset dev DB. These helpers create
// disposable `@example.test` users through the real Administrator API instead, the same technique
// server/tests/lab-03/*.api.test.ts already uses for its own fixtures.

export const DEV_SEED_PASSWORD = "ChangeMe123!";
const SEED_ADMIN_EMAIL = "jamie.whitfield@example.edu";

export type Role = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface CreatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

// A pure API session (never the browser) logged in as the one seeded Administrator, used only to
// bootstrap disposable fixture users via POST /api/admin/users — never to test anything itself.
// If jamie's `mustChangePassword` happens to be true (fresh seed, or a prior E2E run didn't get to
// clean up), this clears it by resetting the password to the *same* documented value via a plain API
// call — never the browser UI, so jamie's documented credentials are unchanged either way.
export async function bootstrapAdminContext(): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: "http://localhost:5173" });
  const loginRes = await ctx.post("/api/auth/login", {
    data: { email: SEED_ADMIN_EMAIL, password: DEV_SEED_PASSWORD },
  });
  if (!loginRes.ok()) {
    throw new Error(
      `Seed Administrator bootstrap login failed (${loginRes.status()}). Run 'npm run reset-dev-accounts' in server/ first.`
    );
  }
  const body = await loginRes.json();
  if (body.mustChangePassword) {
    const res = await ctx.post("/api/auth/change-password", {
      data: { newPassword: DEV_SEED_PASSWORD, confirmPassword: DEV_SEED_PASSWORD },
    });
    if (!res.ok()) throw new Error(`Seed Administrator bootstrap change-password failed (${res.status()}).`);
  }
  return ctx;
}

// Creates a disposable user, left in its natural post-creation state (mustChangePassword: true,
// untouched) — for specs that need to drive the *actual* first-login/Change-Password flow through
// the browser (E2E-01).
export async function createUser(
  adminContext: APIRequestContext,
  input: { name: string; role: Role; isActive?: boolean; emailPrefix: string }
): Promise<CreatedUser & { initialPassword: string }> {
  const initialPassword = "InitialPass123!";
  const email = `${input.emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const res = await adminContext.post("/api/admin/users", {
    data: { name: input.name, email, role: input.role, isActive: input.isActive ?? true, initialPassword },
  });
  if (!res.ok()) throw new Error(`createUser failed (${res.status()}): ${await res.text()}`);
  const created = (await res.json()) as CreatedUser;
  return { ...created, initialPassword };
}

// Creates a disposable user AND completes its mandatory first Change Password via a throwaway API
// context (never the seeded admin's session, never the real browser) — ready for a spec to log
// straight into via the browser without needing to exercise the Change Password screen itself.
export async function createReadyUser(
  adminContext: APIRequestContext,
  input: { name: string; role: Role; isActive?: boolean; emailPrefix: string }
): Promise<CreatedUser & { password: string }> {
  const created = await createUser(adminContext, input);
  const finalPassword = "ReadyPass123!";

  const userCtx = await pwRequest.newContext({ baseURL: "http://localhost:5173" });
  const loginRes = await userCtx.post("/api/auth/login", {
    data: { email: created.email, password: created.initialPassword },
  });
  if (!loginRes.ok()) throw new Error(`createReadyUser login failed (${loginRes.status()}).`);
  const changeRes = await userCtx.post("/api/auth/change-password", {
    data: { newPassword: finalPassword, confirmPassword: finalPassword },
  });
  if (!changeRes.ok()) throw new Error(`createReadyUser change-password failed (${changeRes.status()}).`);
  await userCtx.dispose();

  return { id: created.id, name: created.name, email: created.email, role: created.role, password: finalPassword };
}

// A ready Requester with one Ticket already created (via that Requester's own API session), for
// specs that need an existing ticket to act on rather than testing ticket creation itself.
export async function createReadyRequesterWithTicket(
  adminContext: APIRequestContext,
  emailPrefix: string
): Promise<{ requester: CreatedUser & { password: string }; ticketId: number; ticketNumber: string }> {
  const requester = await createReadyUser(adminContext, { name: "E2E Fixture Requester", role: "REQUESTER", emailPrefix });

  const reqCtx = await pwRequest.newContext({ baseURL: "http://localhost:5173" });
  await reqCtx.post("/api/auth/login", { data: { email: requester.email, password: requester.password } });
  const categories = await (await reqCtx.get("/api/categories")).json();
  const relatedSystems = await (await reqCtx.get("/api/related-systems")).json();
  const createRes = await reqCtx.post("/api/tickets", {
    data: {
      categoryId: categories[0].id,
      relatedSystemId: relatedSystems[0].id,
      summary: "E2E fixture ticket",
      description: "Fixture ticket created for Playwright E2E verification, long enough to pass validation.",
      requestedPriority: "MEDIUM",
    },
  });
  if (!createRes.ok()) throw new Error(`Fixture ticket creation failed (${createRes.status()}).`);
  const ticket = await createRes.json();
  await reqCtx.dispose();

  return { requester, ticketId: ticket.id, ticketNumber: ticket.ticketNumber };
}
