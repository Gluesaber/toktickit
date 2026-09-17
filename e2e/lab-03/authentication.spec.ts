import { test, expect } from "@playwright/test";
import { bootstrapAdminContext, createUser } from "./helpers.js";

// Issue 3-7 (Lab 3) — E2E-01/E2E-02. docs/lab-03/tests.md §2.
// Prerequisite: dev DB migrated+seeded, backend running (`cd server && npm run dev`) — same as
// every e2e/lab-02 spec (playwright.config.ts only auto-starts the Vite client).

test.describe("Authentication", () => {
  // E2E-01 (AC-01, AC-02, AC-06, AC-09, AC-10)
  test("login -> mandatory Change Password -> logout -> direct access blocked after logout", async ({ page }) => {
    const adminContext = await bootstrapAdminContext();
    const fixture = await createUser(adminContext, {
      name: "E2E Auth Flow Requester",
      role: "REQUESTER",
      emailPrefix: "e2e-auth-flow",
    });
    await adminContext.dispose();

    // 1. Login with the initial password.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.initialPassword);
    await page.getByRole("button", { name: "Log In" }).click();

    // 2. AC-02/AC-06: mustChangePassword=true routes straight to Change Password, not the app —
    // and a direct navigation attempt to another screen doesn't escape it either.
    await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
    await expect(page.getByText(/initial password/i)).toBeVisible();
    await page.goto("/tickets");
    await expect(page.getByText(/initial password/i)).toBeVisible(); // still gated, not My Tickets

    // 3. Complete Change Password.
    const newPassword = "BrandNewPassword123!";
    await page.getByLabel("New Password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm New Password").fill(newPassword);
    await page.getByRole("button", { name: "Set Password" }).click();

    // BR-15: continues straight into the app, no second login prompt.
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();

    // 4. AC-09: Logout invalidates the session server-side.
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();

    // 5. AC-10: direct navigation to a protected URL after logout redirects to Login, no data shown.
    await page.goto("/tickets");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Tickets" })).not.toBeVisible();
  });

  // E2E-02 (AC-05)
  test("a seeded inactive account gets a distinct message, not the generic invalid-credentials one", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("sam.whitfield@example.edu");
    await page.getByLabel("Password").fill("ChangeMe123!");
    await page.getByRole("button", { name: "Log In" }).click();

    await expect(page.getByRole("alert")).toContainText(/inactive/i);
    // Still on Login — no session was created for an inactive account.
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
