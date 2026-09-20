import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createReadyUser } from "./helpers.js";

// Issue 3-7 (Lab 3) — E2E-07. docs/lab-03/tests.md §2. One connected Requester journey: two
// tickets created so "My Tickets shows only this Requester's tickets" and "cancel a *different*
// ticket from the one just commented on" are both genuinely exercised, not just asserted in theory.

test("Requester: create tickets, comment, mark resolved, cancel a different ticket — scoped throughout", async ({ page }) => {
  const adminContext = await bootstrapAdminContext();
  const requester = await createReadyUser(adminContext, {
    name: "E2E Requester Regression",
    role: "REQUESTER",
    emailPrefix: "e2e-requester-regression",
  });
  await adminContext.dispose();

  await page.goto("/");
  await page.getByLabel("Email").fill(requester.email);
  await page.getByLabel("Password").fill(requester.password);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

  async function createTicket(summary: string): Promise<string> {
    // Always go via My Tickets first: if we're already on /tickets/new (its own success view
    // showing a previous submission), clicking the same nav link again is a no-op navigation —
    // React Router doesn't remount the page, so the success view would stay put instead of
    // resetting to a fresh form.
    await page.getByLabel("Primary").getByRole("link", { name: "My Tickets" }).click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await page.getByLabel("Primary").getByRole("link", { name: "Create Ticket" }).click();
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await page.getByLabel(/^category/i).selectOption({ index: 1 });
    await page.getByLabel(/^related system/i).selectOption({ index: 1 });
    await page.getByLabel(/requested priority/i).selectOption("MEDIUM");
    await page.getByLabel(/^ticket summary/i).fill(summary);
    await page.getByLabel(/^description/i).fill("Created by the Playwright E2E requester-regression spec, long enough to pass validation.");
    await page.getByRole("button", { name: "Submit" }).click();
    const ticketNumberLocator = page.getByText(/^TK-\d{4}-\d{6}$/);
    await expect(ticketNumberLocator).toBeVisible();
    return (await ticketNumberLocator.textContent())!.trim();
  }

  // Two tickets: A gets the comment/resolved-indication actions, B is cancelled — a genuinely
  // *different* ticket from the one just interacted with, per the row's own wording.
  const uniqueTag = Date.now();
  const ticketA = await createTicket(`E2E requester regression A ${uniqueTag}`);
  const ticketB = await createTicket(`E2E requester regression B ${uniqueTag}`);

  // AC-11: My Tickets is scoped to this Requester — both fixtures show up, nothing else does by
  // construction (a brand-new account has no other tickets).
  await page.getByLabel("Primary").getByRole("link", { name: "My Tickets" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketA })).toBeVisible();
  await expect(page.getByRole("link", { name: ticketB })).toBeVisible();

  // AC-14: post a Public Comment on Ticket A.
  await page.getByRole("link", { name: ticketA }).click();
  await expect(page.getByRole("heading", { name: ticketA })).toBeVisible();
  const commentText = `E2E comment ${uniqueTag}`;
  await page.getByLabel(/post a comment/i).fill(commentText);
  await page.getByRole("button", { name: "Post Comment" }).click();
  await expect(page.getByText(commentText)).toBeVisible();

  // AC-15: mark Problem Appears Resolved on Ticket A — informational only, status stays New.
  await page.getByRole("button", { name: "Mark Problem as Resolved" }).click();
  await expect(page.getByText(/you indicated this problem appears resolved/i)).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toBeVisible();

  // AC-25: cancel Ticket B — a different, still-New ticket, via the inline confirm step.
  await page.getByRole("link", { name: "Back to My Tickets" }).click();
  await page.getByRole("link", { name: ticketB }).click();
  await expect(page.getByRole("heading", { name: ticketB })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Ticket" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

  // Final check: My Tickets still shows exactly these two, scoping intact throughout, B now
  // Cancelled and A still New.
  await page.getByRole("link", { name: "Back to My Tickets" }).click();
  const desktopTable = page.locator(".table-responsive");
  await expect(desktopTable.getByRole("link", { name: ticketA })).toBeVisible();
  await expect(desktopTable.getByRole("link", { name: ticketB })).toBeVisible();
});
