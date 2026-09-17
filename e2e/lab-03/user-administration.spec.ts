import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createReadyUser } from "./helpers.js";

// Issue 3-7 (Lab 3) — E2E-05/E2E-06. docs/lab-03/tests.md §2. Uses a disposable Administrator
// created through the API (never the seeded jamie.whitfield account) to drive the actual browser
// session — see helpers.ts's top comment for why.

test.describe("Administrator User Management", () => {
  // E2E-05 (AC-27, AC-28)
  test("Administrator creates a user, resets their password, and that user is routed to Change Password", async ({ page, browser }) => {
    const adminContext = await bootstrapAdminContext();
    const admin = await createReadyUser(adminContext, {
      name: "E2E Admin Flow Admin",
      role: "ADMINISTRATOR",
      emailPrefix: "e2e-admin-flow-actor",
    });
    await adminContext.dispose();

    await page.goto("/");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

    await page.getByRole("link", { name: "User Management" }).click();
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();

    // Create a user through the UI.
    const newUserEmail = `e2e-created-${Date.now()}@example.test`;
    await page.getByRole("button", { name: "Create User" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.getByLabel("Name").fill("E2E Created User");
    await createDialog.getByLabel("Email").fill(newUserEmail);
    await createDialog.getByLabel("Role").selectOption("REQUESTER");
    await createDialog.getByLabel("Initial Password").fill("FirstPass123!");
    await createDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Find it, reset its password (AC-28, BR-33: a distinct action from the main Save). The search
    // is debounced (300ms) — wait for the filtered row to actually appear before clicking Edit, or
    // a click can land on whatever stale row was still showing from the unfiltered list.
    await page.getByLabel(/^search/i).fill(newUserEmail);
    await expect(page.getByRole("cell", { name: newUserEmail })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByRole("button", { name: "Set New Initial Password" }).click();
    await page.getByLabel(/new initial password/i).fill("ResetPass123!");
    await page.getByRole("button", { name: "Set Password" }).click();
    await expect(page.getByText(/password has been reset/i)).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();

    // The new user, in a fresh browser context, logs in with the reset password and lands on
    // Change Password — not the main app.
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto("/");
    await freshPage.getByLabel("Email").fill(newUserEmail);
    await freshPage.getByLabel("Password").fill("ResetPass123!");
    await freshPage.getByRole("button", { name: "Log In" }).click();
    await expect(freshPage.getByText(/initial password/i)).toBeVisible();
    await expect(freshPage.getByRole("heading", { name: "My Tickets" })).not.toBeVisible();
    await freshContext.close();
  });

  // E2E-06 (AC-29, AC-30) — see tests.md §7's "LAST_ADMINISTRATOR_PROTECTED is unreachable through
  // any real authenticated request" finding: a *different* caller can never actually be the reason
  // the target becomes the last active Administrator, since the caller must itself be an active
  // Administrator. The only state this rule is ever visibly reachable from, live, is a caller
  // viewing/editing their own row — which is exactly what BR-34's self-deactivation check already
  // covers. This test verifies that live-reachable case, which stands in for both AC-29 and AC-30.
  test("self-deactivation (and, in practice, last-Administrator) is blocked with a visible message", async ({ page }) => {
    const adminContext = await bootstrapAdminContext();
    const admin = await createReadyUser(adminContext, {
      name: "E2E Self Protect Admin",
      role: "ADMINISTRATOR",
      emailPrefix: "e2e-self-protect",
    });
    await adminContext.dispose();

    await page.goto("/");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Log In" }).click();
    await page.getByRole("link", { name: "User Management" }).click();

    await page.getByLabel(/^search/i).fill(admin.email);
    await expect(page.getByRole("cell", { name: admin.email })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).first().click();

    const activeToggle = page.getByLabel(/^active$/i);
    await expect(activeToggle).toBeDisabled();
    await expect(activeToggle).toHaveAttribute("title", /cannot deactivate your own account/i);
    await expect(page.getByText(/cannot deactivate your own account/i)).toBeVisible();
  });
});
