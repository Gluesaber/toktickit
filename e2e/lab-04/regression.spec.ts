import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createReadyRequesterWithTicket, createReadyUser } from "../lab-03/helpers.js";
import { actionsCard, apiAs, login, staffTicket } from "./helpers.js";

// Issue 4-6 (Lab 4) — docs/lab-04/tests.md §2.13, E2E-09 and E2E-10. Real browser, real backend.

// A tiny valid PNG (1x1 pixel) for the attachment step.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Final regression", () => {
  // E2E-09 (AC-39) — one connected journey across all three roles, through the real UI.
  test("Requester → IT Staff → Administrator: every Lab 2–4 feature still works together", async ({ browser }) => {
    // Three users and ~30 UI steps: ~15 s on its own, so the default 30 s limit is too tight when the
    // whole suite runs in parallel.
    test.setTimeout(90_000);
    const adminContext = await bootstrapAdminContext();
    // Unique names per run: earlier runs' staff fixtures show up in the Reassign picker, so a fixed
    // name would match several elements (the Lab 3 lesson, tests.md §7).
    const run = Date.now();
    const [requester, staff, admin] = await Promise.all([
      createReadyUser(adminContext, { name: `E2E Journey Requester ${run}`, role: "REQUESTER", emailPrefix: "e2e-journey-req" }),
      createReadyUser(adminContext, { name: `E2E Journey Staff ${run}`, role: "IT_STAFF", emailPrefix: "e2e-journey-staff" }),
      createReadyUser(adminContext, { name: `E2E Journey Admin ${run}`, role: "ADMINISTRATOR", emailPrefix: "e2e-journey-admin" }),
    ]);
    await adminContext.dispose();
    const tag = `Journey ${Date.now()}`;

    // --- Requester: create a Ticket, attach a file, comment.
    const reqContext = await browser.newContext();
    const req = await reqContext.newPage();
    await login(req, requester.email, requester.password);
    await req.getByLabel("Primary").getByRole("link", { name: "Create Ticket" }).click();
    await req.getByLabel(/^category/i).selectOption({ index: 1 });
    await req.getByLabel(/^related system/i).selectOption({ index: 1 });
    await req.getByLabel(/requested priority/i).selectOption("HIGH");
    await req.getByLabel(/^ticket summary/i).fill(`${tag}: printer jams on every page`);
    await req.getByLabel(/^description/i).fill("The floor 3 printer jams on every page since this morning; tried two paper trays.");
    await req.getByRole("button", { name: "Submit" }).click();
    await req.getByRole("button", { name: "View Ticket" }).click();
    const ticketNumber = (await req.getByRole("heading", { level: 1 }).textContent())!.trim();
    const ticketId = Number(req.url().split("/").pop());

    await req.getByLabel("Add Attachment").setInputFiles({ name: "jam-photo.png", mimeType: "image/png", buffer: PNG_1X1 });
    await expect(req.getByText("jam-photo.png")).toBeVisible();
    await req.getByLabel(/post a comment/i).fill("It also makes a grinding noise.");
    await req.getByRole("button", { name: "Post Comment" }).click();
    await expect(req.getByText("It also makes a grinding noise.")).toBeVisible();

    // --- IT Staff: find it from the dashboard, claim, prioritise, note, record work, resolve.
    const staffContext = await browser.newContext();
    const st = await staffContext.newPage();
    await login(st, staff.email, staff.password);
    await st.getByRole("link", { name: /^View Unassigned/ }).click();
    await st.getByLabel(/^search/i).fill(tag);
    await st.getByRole("link", { name: ticketNumber }).first().click();
    await st.getByRole("button", { name: "Claim" }).click();
    await expect(st.locator(".card", { has: st.getByRole("heading", { name: "Ownership" }) }).getByText(staff.name)).toBeVisible();
    await st.getByLabel(/it priority/i).selectOption("URGENT");
    await st.getByLabel(/add an internal note/i).fill("Ordered a new feed roller.");
    await st.getByRole("button", { name: "Post Note" }).click();
    await expect(st.getByText("Ordered a new feed roller.")).toBeVisible();
    await st.getByLabel(/change status/i).selectOption("OPEN");
    await expect(st.getByText("Open", { exact: true }).first()).toBeVisible();

    const card = actionsCard(st);
    await card.getByRole("button", { name: "Add Action" }).click();
    const form = card.getByRole("form", { name: "Add action" });
    await form.getByLabel("Action Description").fill("Replaced the feed roller.");
    await form.getByLabel("Status").selectOption("COMPLETED");
    await form.getByLabel("Result (required)").fill("Printed 50 pages without a jam.");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(card.getByRole("row", { name: /Replaced the feed roller/ })).toBeVisible();
    await st.getByLabel(/change status/i).selectOption("RESOLVED");
    await st.getByRole("button", { name: "Confirm" }).click();
    await expect(st.getByText("Resolved", { exact: true }).first()).toBeVisible();

    // --- Requester sees the result: status, work done, staff comment thread, no Internal Notes.
    await req.reload();
    await expect(req.getByText("Resolved", { exact: true }).first()).toBeVisible();
    await expect(actionsCard(req).getByRole("cell", { name: "Replaced the feed roller." })).toBeVisible();
    await expect(req.getByText("Ordered a new feed roller.")).toHaveCount(0);
    await expect(req.getByText("jam-photo.png")).toBeVisible();
    await req.getByLabel("Primary").getByRole("link", { name: "My Tickets" }).click();
    await expect(req.getByRole("link", { name: ticketNumber })).toBeVisible();

    // --- Administrator: create a user, then deactivate them, through User Management.
    const adminCtx = await browser.newContext();
    const ad = await adminCtx.newPage();
    await login(ad, admin.email, admin.password);
    await expect(ad.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
    await ad.getByLabel("Primary").getByRole("link", { name: "User Management" }).click();
    const newEmail = `e2e-journey-new-${Date.now()}@example.test`;
    await ad.getByRole("button", { name: "Create User" }).click();
    const dialog = ad.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Journey New User");
    await dialog.getByLabel("Email").fill(newEmail);
    await dialog.getByLabel("Role").selectOption("REQUESTER");
    await dialog.getByLabel("Initial Password").fill("JourneyPass123!");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(ad.getByRole("dialog")).toHaveCount(0);
    await ad.getByLabel(/^search/i).fill(newEmail);
    const row = ad.getByRole("row").filter({ hasText: newEmail });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();
    await ad.getByLabel(/^active$/i).uncheck();
    await ad.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(ad.getByRole("row").filter({ hasText: newEmail })).toContainText(/inactive/i);

    // The whole journey left a consistent record.
    const check = await apiAs(staff.email, staff.password);
    const final = await staffTicket(check, ticketId);
    expect(final).toMatchObject({ currentStatus: "RESOLVED", itPriority: "URGENT", owner: { id: staff.id } });
    expect(final.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(["NEW", "OPEN", "RESOLVED"]);
    await check.dispose();
    await Promise.all([reqContext.close(), staffContext.close(), adminCtx.close()]);
  });

  // E2E-10 (AC-37, AC-38)
  test("double clicks create one record, and a failed save keeps what was typed", async ({ page }) => {
    const adminContext = await bootstrapAdminContext();
    const staff = await createReadyUser(adminContext, { name: "E2E Double Staff", role: "IT_STAFF", emailPrefix: "e2e-double-staff" });
    const fixture = await createReadyRequesterWithTicket(adminContext, "e2e-double-req");
    await adminContext.dispose();

    await login(page, staff.email, staff.password);
    await page.goto(`/queue/${fixture.ticketId}`);

    // Action: double click Save.
    const card = actionsCard(page);
    await card.getByRole("button", { name: "Add Action" }).click();
    let form = card.getByRole("form", { name: "Add action" });
    await form.getByLabel("Action Description").fill("Double-click test action.");
    await form.getByRole("button", { name: "Save Action" }).dblclick();
    await expect(card.getByRole("row", { name: /Double-click test action/ })).toBeVisible();

    // Comment: double click Post.
    await page.getByLabel(/post a comment/i).fill("Double-click test comment.");
    await page.getByRole("button", { name: "Post Comment" }).dblclick();
    await expect(page.getByText("Double-click test comment.")).toBeVisible();

    const api = await apiAs(staff.email, staff.password);
    const afterDouble = await staffTicket(api, fixture.ticketId);
    expect(afterDouble.actions.filter((a: { description: string }) => a.description === "Double-click test action.")).toHaveLength(1);
    expect(afterDouble.comments.filter((c: { content: string }) => c.content === "Double-click test comment.")).toHaveLength(1);

    // A network failure on save: the form keeps everything that was typed.
    await page.route("**/api/staff/tickets/*/actions", (route) =>
      route.request().method() === "POST" ? route.abort("failed") : route.continue()
    );
    await card.getByRole("button", { name: "Add Action" }).click();
    form = card.getByRole("form", { name: "Add action" });
    await form.getByLabel("Action Description").fill("Typed during an outage.");
    await form.getByLabel("Follow-Up Required?").check();
    await form.getByLabel(/follow-up note/i).fill("Check again tomorrow.");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(form.getByText(/check your connection/i)).toBeVisible();
    await expect(form.getByLabel("Action Description")).toHaveValue("Typed during an outage.");
    await expect(form.getByLabel(/follow-up note/i)).toHaveValue("Check again tomorrow.");

    // Network back: the same form saves once, with the same input.
    await page.unroute("**/api/staff/tickets/*/actions");
    await form.getByRole("button", { name: "Save Action" }).click();
    await expect(card.getByRole("row", { name: /Typed during an outage/ })).toBeVisible();
    const afterRetry = await staffTicket(api, fixture.ticketId);
    expect(afterRetry.actions.filter((a: { description: string }) => a.description === "Typed during an outage.")).toHaveLength(1);
    await api.dispose();
  });
});
