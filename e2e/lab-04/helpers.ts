import { expect, request as pwRequest, APIRequestContext, Page } from "@playwright/test";

// Issue 4-4 (Lab 4) — small helpers shared by e2e/lab-04 specs, on top of e2e/lab-03/helpers.ts's
// fixture-user creation (same rule: disposable @example.test users only, never a documented seed
// account through the browser).

export async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  // A definite post-login signal before navigating anywhere else (Lab 3 Playwright lesson).
  await expect(page.getByRole("button", { name: /log ?out/i })).toBeVisible();
}

// An API session for a fixture user — for setting up state a test isn't itself about.
export async function apiAs(email: string, password: string): Promise<APIRequestContext> {
  const ctx = await pwRequest.newContext({ baseURL: "http://localhost:5173" });
  const res = await ctx.post("/api/auth/login", { data: { email, password } });
  if (!res.ok()) throw new Error(`apiAs login failed for ${email} (${res.status()}).`);
  return ctx;
}

export async function staffTicket(ctx: APIRequestContext, ticketId: number) {
  const res = await ctx.get(`/api/staff/tickets/${ticketId}`);
  if (!res.ok()) throw new Error(`GET staff ticket failed (${res.status()}).`);
  return res.json();
}

// Moves a Ticket through the workflow API with the version it currently has (BR-22).
export async function setStatus(ctx: APIRequestContext, ticketId: number, status: string) {
  const { version } = await staffTicket(ctx, ticketId);
  const res = await ctx.patch(`/api/tickets/${ticketId}/status`, { data: { status, version } });
  if (!res.ok()) throw new Error(`Status change to ${status} failed (${res.status()}): ${await res.text()}`);
  return res.json();
}

export async function addCompletedAction(ctx: APIRequestContext, ticketId: number, description: string) {
  const res = await ctx.post(`/api/staff/tickets/${ticketId}/actions`, {
    data: {
      clientRequestId: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      actionAt: new Date().toISOString(),
      description,
      result: "Done.",
      status: "COMPLETED",
    },
  });
  if (!res.ok()) throw new Error(`Action create failed (${res.status()}): ${await res.text()}`);
  return res.json();
}

// The Actions Taken card, scoped so table text never collides with other cards on the page.
export function actionsCard(page: Page) {
  return page.locator("#actions");
}

export function historyCard(page: Page) {
  return page.locator(".card", { has: page.getByRole("heading", { name: "Status History" }) });
}
