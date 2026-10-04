import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createReadyRequesterWithTicket, createReadyUser } from "../lab-03/helpers.js";
import { actionsCard, addCompletedAction, apiAs, historyCard, login, setStatus } from "./helpers.js";

// Issue 4-4 (Lab 4) — docs/lab-04/tests.md §2.13, E2E-02, E2E-03, E2E-04. Real browser, real backend.

async function fixture(prefix: string) {
  const admin = await bootstrapAdminContext();
  const [staff, otherStaff, req] = await Promise.all([
    createReadyUser(admin, { name: `E2E ${prefix} Staff`, role: "IT_STAFF", emailPrefix: `e2e-${prefix}-staff` }),
    createReadyUser(admin, { name: `E2E ${prefix} Other`, role: "IT_STAFF", emailPrefix: `e2e-${prefix}-other` }),
    createReadyRequesterWithTicket(admin, `e2e-${prefix}-req`),
  ]);
  await admin.dispose();
  return { staff, otherStaff, requester: req.requester, ticketId: req.ticketId };
}

test.describe("Ticket workflow and resolution", () => {
  // E2E-02 (AC-03, AC-17, AC-19)
  test("Resolved needs a completed Action; the Requester then sees the work and the history", async ({ page, browser }) => {
    const f = await fixture("resolve");

    await login(page, f.staff.email, f.staff.password);
    await page.goto(`/queue/${f.ticketId}`);
    const status = page.getByLabel(/change status/i);
    await status.selectOption("OPEN");
    await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
    await status.selectOption("IN_PROGRESS");

    // AC-17: Resolved is listed but disabled, with the reason visible.
    await expect(status.getByRole("option", { name: /resolved/i })).toBeDisabled();
    await expect(page.getByText("Record at least one completed action before resolving.")).toBeVisible();

    // Record the work, then resolve.
    const card = actionsCard(page);
    await card.getByRole("button", { name: "Add Action" }).click();
    const form = card.getByRole("form", { name: "Add action" });
    await form.getByLabel("Action Description").fill("Reinstalled the graphics driver.");
    await form.getByLabel("Status").selectOption("COMPLETED");
    await form.getByLabel("Result (required)").fill("No more crashes after three restarts.");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(card.getByRole("row", { name: /Reinstalled the graphics driver/ })).toBeVisible();

    await expect(status.getByRole("option", { name: "Resolved" })).toBeEnabled();
    await status.selectOption("RESOLVED");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();

    const history = historyCard(page);
    await expect(history.getByRole("listitem")).toHaveCount(4); // created, open, in progress, resolved
    await page.reload();
    await expect(history.getByRole("listitem")).toHaveCount(4); // persisted
    await expect(history.getByRole("listitem").last()).toContainText(f.staff.name);

    // The Requester sees the Actions (read-only) and the same timeline.
    const reqContext = await browser.newContext();
    const reqPage = await reqContext.newPage();
    await login(reqPage, f.requester.email, f.requester.password);
    await reqPage.goto(`/tickets/${f.ticketId}`);
    const reqCard = actionsCard(reqPage);
    await expect(reqCard.getByRole("columnheader", { name: "What was done" })).toBeVisible();
    await expect(reqCard.getByRole("cell", { name: "Reinstalled the graphics driver." })).toBeVisible();
    await expect(reqCard.getByRole("button")).toHaveCount(0);
    await expect(historyCard(reqPage).getByRole("listitem")).toHaveCount(4);
    await expect(reqPage.getByText("Internal Notes")).toHaveCount(0);
    await reqContext.close();
  });

  // E2E-03 (AC-20, AC-21)
  test("the Requester's 'appears resolved' reaches staff and clears on Reopen; the Requester can't reopen", async ({ page, browser }) => {
    const f = await fixture("indication");
    const api = await apiAs(f.staff.email, f.staff.password);
    await setStatus(api, f.ticketId, "OPEN");

    // Requester marks it resolved.
    const reqContext = await browser.newContext();
    const reqPage = await reqContext.newPage();
    await login(reqPage, f.requester.email, f.requester.password);
    await reqPage.goto(`/tickets/${f.ticketId}`);
    await reqPage.getByRole("button", { name: "Mark Problem as Resolved" }).click();
    await expect(reqPage.getByText(/you indicated this problem appears resolved/i)).toBeVisible();

    // Staff sees it, resolves, closes, then reopens — the indication clears.
    await login(page, f.staff.email, f.staff.password);
    await page.goto(`/queue/${f.ticketId}`);
    await expect(page.getByText(/requester says resolved/i)).toBeVisible();

    await addCompletedAction(api, f.ticketId, "Verified the fix with the Requester.");
    await setStatus(api, f.ticketId, "RESOLVED");
    await setStatus(api, f.ticketId, "CLOSED");
    await page.reload();
    await expect(page.getByText(/requester says resolved/i)).toBeVisible(); // still advisory, kept
    await page.getByLabel(/change status/i).selectOption("REOPENED");
    await expect(page.getByText("Reopened", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/requester says resolved/i)).toHaveCount(0);
    await expect(actionsCard(page).getByText("Reopened — record what is done to fix the recurrence.")).toBeVisible();

    // The Requester has no Reopen / Resolve / Close control anywhere.
    await setStatus(api, f.ticketId, "RESOLVED");
    await reqPage.reload();
    await expect(reqPage.getByText("Resolved", { exact: true }).first()).toBeVisible();
    await expect(reqPage.getByRole("button", { name: /reopen|resolve|close/i })).toHaveCount(0);
    await expect(reqPage.getByLabel(/change status/i)).toHaveCount(0);
    await reqContext.close();
    await api.dispose();
  });

  // E2E-04 (AC-22, AC-24)
  test("a stale screen can't overwrite another staff member's change", async ({ page, browser }) => {
    const f = await fixture("stale");
    const api = await apiAs(f.staff.email, f.staff.password);
    await setStatus(api, f.ticketId, "OPEN");
    const action = await (
      await api.post(`/api/staff/tickets/${f.ticketId}/actions`, {
        data: { clientRequestId: `e2e-stale-${Date.now()}`, actionAt: new Date().toISOString(), description: "Order a new docking station.", status: "PLANNED" },
      })
    ).json();
    await api.dispose();

    // Both staff open the same Ticket.
    await login(page, f.staff.email, f.staff.password);
    await page.goto(`/queue/${f.ticketId}`);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, f.otherStaff.email, f.otherStaff.password);
    await otherPage.goto(`/queue/${f.ticketId}`);

    // The other staff member changes the status and edits the Action first.
    await otherPage.getByLabel(/change status/i).selectOption("IN_PROGRESS");
    await expect(otherPage.getByText("In Progress", { exact: true }).first()).toBeVisible();
    const otherCard = actionsCard(otherPage);
    await otherCard.getByRole("button", { name: /edit action: order a new docking/i }).click();
    const otherForm = otherCard.getByRole("form", { name: "Edit action" });
    await otherForm.getByLabel("Action Description").fill("Order a new docking station (model DS-2).");
    await otherForm.getByRole("button", { name: "Save Action" }).click();
    await expect(otherCard.getByRole("row", { name: /model DS-2/ })).toBeVisible();
    await other.close();

    // This screen is now stale: its status change is refused, not applied.
    await page.getByLabel(/change status/i).selectOption("CANCELLED");
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("This ticket was changed by someone else since you opened it.")).toBeVisible();
    await expect(page.getByText(/set status to/i)).toBeVisible(); // choice kept

    // Its Action edit is refused too, keeping what was typed.
    const card = actionsCard(page);
    await card.getByRole("button", { name: /edit action: order a new docking/i }).click();
    const form = card.getByRole("form", { name: "Edit action" });
    await form.getByLabel("Action Description").fill("Order a refurbished docking station.");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(form.getByText(/changed by someone else since you opened it/i)).toBeVisible();
    await expect(form.getByText(/model DS-2/)).toBeVisible(); // shows the latest saved version
    await expect(form.getByLabel("Action Description")).toHaveValue("Order a refurbished docking station.");

    // Nothing was overwritten on the server.
    const check = await apiAs(f.staff.email, f.staff.password);
    const ticket = await (await check.get(`/api/staff/tickets/${f.ticketId}`)).json();
    expect(ticket.currentStatus).toBe("IN_PROGRESS");
    expect(ticket.actions.find((a: { id: number }) => a.id === action.id).description).toBe("Order a new docking station (model DS-2).");
    await check.dispose();

    // Reload clears the conflict and shows the latest state.
    await page.getByRole("button", { name: "Reload ticket" }).first().click();
    await expect(page.getByText("In Progress", { exact: true }).first()).toBeVisible();
  });
});
