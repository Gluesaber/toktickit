import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createReadyRequesterWithTicket, createReadyUser } from "../lab-03/helpers.js";
import { actionsCard, addCompletedAction, apiAs, login, setStatus } from "./helpers.js";

// Issue 4-4 (Lab 4) — docs/lab-04/tests.md §2.13, E2E-01 and E2E-05. Real browser, real backend.

test.describe("Actions Taken", () => {
  // E2E-01 (AC-01, AC-09, AC-11, AC-12)
  test("two staff record and progress Actions on one Ticket", async ({ page, browser }) => {
    const admin = await bootstrapAdminContext();
    const [staffA, staffB, fixture] = await Promise.all([
      createReadyUser(admin, { name: "E2E Staff Alpha", role: "IT_STAFF", emailPrefix: "e2e-actions-a" }),
      createReadyUser(admin, { name: "E2E Staff Bravo", role: "IT_STAFF", emailPrefix: "e2e-actions-b" }),
      createReadyRequesterWithTicket(admin, "e2e-actions-req"),
    ]);
    await admin.dispose();

    // Staff A claims the Ticket and plans an Action for Staff B.
    await login(page, staffA.email, staffA.password);
    await page.goto(`/queue/${fixture.ticketId}`);
    await page.getByRole("button", { name: "Claim" }).click();
    await expect(page.getByText(staffA.name).first()).toBeVisible();

    const card = actionsCard(page);
    await card.getByRole("button", { name: "Add Action" }).click();
    const form = card.getByRole("form", { name: "Add action" });
    await form.getByLabel("Action Description").fill("Replace the RAM module in slot 2.");
    await form.getByLabel("Assignee").selectOption(String(staffB.id));
    await form.getByRole("button", { name: "Save Action" }).click();
    const plannedRow = card.getByRole("row", { name: /Replace the RAM module/ });
    await expect(plannedRow).toContainText("Planned");
    await expect(plannedRow).toContainText(staffA.name); // performed by A
    await expect(plannedRow).toContainText(staffB.name); // assigned to B

    // Staff B (own browser session) moves it to In Progress, then Completed.
    const bContext = await browser.newContext();
    const bPage = await bContext.newPage();
    await login(bPage, staffB.email, staffB.password);
    await bPage.goto(`/queue/${fixture.ticketId}`);
    const bCard = actionsCard(bPage);
    await bCard.getByRole("button", { name: /edit action: replace the ram/i }).click();
    let bForm = bCard.getByRole("form", { name: "Edit action" });
    await bForm.getByLabel("Status").selectOption("IN_PROGRESS");
    await bForm.getByRole("button", { name: "Save Action" }).click();
    await expect(bCard.getByRole("row", { name: /Replace the RAM module/ })).toContainText("In Progress");

    await bCard.getByRole("button", { name: /edit action: replace the ram/i }).click();
    bForm = bCard.getByRole("form", { name: "Edit action" });
    await bForm.getByLabel("Status").selectOption("COMPLETED");
    await bForm.getByLabel("Result (required)").fill("New module installed; memory test passes.");
    await bForm.getByRole("button", { name: "Save Action" }).click();
    const doneRow = bCard.getByRole("row", { name: /Replace the RAM module/ });
    await expect(doneRow).toContainText("Completed");
    await expect(doneRow.getByRole("button", { name: /edit action/i })).toHaveCount(0); // locked (AC-10)
    await bContext.close();

    // Staff A adds a second Action; after a reload both are listed in order, each with its own people.
    await page.reload();
    await card.getByRole("button", { name: "Add Action" }).click();
    const form2 = card.getByRole("form", { name: "Add action" });
    await form2.getByLabel("Action Description").fill("Confirmed with the Requester the crash is gone.");
    await form2.getByLabel("Status").selectOption("COMPLETED");
    await form2.getByLabel("Result (required)").fill("Requester confirmed.");
    await form2.getByRole("button", { name: "Save Action" }).click();

    await page.reload();
    const rows = card.locator("table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Replace the RAM module");
    await expect(rows.nth(0)).toContainText(staffB.name);
    await expect(rows.nth(1)).toContainText("Confirmed with the Requester");
    await expect(card.getByRole("heading", { name: "Actions Taken (2)" })).toBeVisible();
  });

  // E2E-05 (AC-05, AC-06, AC-08, AC-13)
  test("validation, a deactivated assignee, and a closed Ticket", async ({ page }) => {
    const admin = await bootstrapAdminContext();
    const [staff, other, fixture] = await Promise.all([
      createReadyUser(admin, { name: "E2E Staff Charlie", role: "IT_STAFF", emailPrefix: "e2e-actions-c" }),
      createReadyUser(admin, { name: "E2E Staff Delta", role: "IT_STAFF", emailPrefix: "e2e-actions-d" }),
      createReadyRequesterWithTicket(admin, "e2e-actions-req2"),
    ]);

    await login(page, staff.email, staff.password);
    await page.goto(`/queue/${fixture.ticketId}`);
    const card = actionsCard(page);
    await card.getByRole("button", { name: "Add Action" }).click();
    const form = card.getByRole("form", { name: "Add action" });

    // AC-06: Follow-up Note required once follow-up is needed. AC-08: date before the Ticket existed.
    await form.getByLabel("Action Description").fill("Check the docking station.");
    await form.getByLabel("Follow-Up Required?").check();
    await form.getByLabel("Action Date/Time").fill("2020-01-01T09:00");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(form.getByText("Follow-up note is required when follow-up is needed.")).toBeVisible();
    await expect(form.getByText("Action date/time can't be earlier than when the ticket was created.")).toBeVisible();

    // AC-05: the chosen assignee is deactivated by an Administrator while the form is open.
    await form.getByLabel(/follow-up note/i).fill("Re-test on Monday.");
    // "Now" in local wall-clock time, minute precision — the fixture Ticket was created seconds ago,
    // so anything earlier than the current minute would (correctly) be refused as before the Ticket.
    await form.getByLabel("Action Date/Time").fill(new Date().toLocaleString("sv-SE").replace(" ", "T").slice(0, 16));
    await form.getByLabel("Assignee").selectOption(String(other.id));
    const deactivate = await admin.patch(`/api/admin/users/${other.id}`, { data: { isActive: false } });
    expect(deactivate.ok()).toBe(true);
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(form.getByText("Choose an active IT Staff or Administrator user.")).toBeVisible();
    await expect(form.getByLabel("Action Description")).toHaveValue("Check the docking station."); // input kept

    // AC-13: once the Ticket is Closed, the card is read-only.
    const api = await apiAs(staff.email, staff.password);
    await setStatus(api, fixture.ticketId, "OPEN");
    await addCompletedAction(api, fixture.ticketId, "Fixed the docking station firmware.");
    await setStatus(api, fixture.ticketId, "RESOLVED");
    await setStatus(api, fixture.ticketId, "CLOSED");
    await api.dispose();
    await admin.dispose();

    await page.reload();
    await expect(card.getByText("This ticket is closed; actions are read-only.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add Action" })).toHaveCount(0);
    await expect(card.getByRole("button", { name: /edit action/i })).toHaveCount(0);
  });
});
