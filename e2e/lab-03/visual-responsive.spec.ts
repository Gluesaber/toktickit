import { test, expect, Page } from "@playwright/test";
import { bootstrapAdminContext, createReadyUser, createReadyRequesterWithTicket, createUser } from "./helpers.js";

// Issue 3-7 (Lab 3) — RESP-01..05. docs/lab-03/tests.md §2/§4, ui-spec.md §9/§11/§12.
//
// Scope note, mirroring Lab 2's own Issue 2-8/2-9 split (e2e/lab-02/visual-responsive.spec.ts's own
// top comment): this file covers the *baseline* screenshot set (one clean shot per screen per
// viewport) plus the automated RESP-01..04 assertions. ui-spec.md §12's full per-interaction-state
// screenshot matrix (duplicate-email-error.png, self-deactivation-blocked.png, etc.) is
// documentation evidence assembled for the Part 9 submission, not a test of behavior — that's
// Issue 3-8's job, same as Lab 2's full matrix was Issue 2-9's.

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 375, height: 812 },
} as const;

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow, "page has horizontal overflow").toBe(false);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log In" }).click();
  // Logout lives in the header, outside the collapsible nav, so it's a reliable "login finished
  // and the app shell has rendered" signal regardless of role or viewport — without this,
  // openNavIfCollapsed's visibility check can race the post-login navigation and see neither the
  // toggle button nor the nav (still mid-transition from the Login screen).
  await page.getByRole("button", { name: "Logout" }).waitFor();
}

// AppShell's nav is collapsed behind a "Toggle navigation" button below the lg breakpoint
// (~992px) — tablet (820px) and mobile (375px) both need it opened before a nav link is clickable.
async function openNavIfCollapsed(page: Page) {
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  if (await toggle.isVisible()) {
    await toggle.click();
  }
}

let admin: Awaited<ReturnType<typeof createReadyUser>>;
let ticketNumber: string;
// Still on its initial password (mustChangePassword: true), so logging in lands on Change Password.
// Only ever logged into, never submitted, so it stays in that state for all three viewport tests.
let gatedUser: Awaited<ReturnType<typeof createUser>>;

test.beforeAll(async () => {
  const adminContext = await bootstrapAdminContext();
  const [readyAdmin, requesterFixture, gated] = await Promise.all([
    createReadyUser(adminContext, { name: "E2E Responsive Admin", role: "ADMINISTRATOR", emailPrefix: "e2e-responsive-admin" }),
    createReadyRequesterWithTicket(adminContext, "e2e-responsive-requester"),
    createUser(adminContext, { name: "E2E Responsive Gated", role: "REQUESTER", emailPrefix: "e2e-responsive-gated" }),
  ]);
  admin = readyAdmin;
  ticketNumber = requesterFixture.ticketNumber;
  gatedUser = gated;
  await adminContext.dispose();
});

// RESP-04 (AC-35) — keyboard-only navigation on Login, independent of viewport.
test("Login is fully keyboard-operable with a visible focus indicator (RESP-04)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();

  await page.keyboard.press("Tab"); // -> Email
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab"); // -> Password
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab"); // -> Log In button
  await expect(page.getByRole("button", { name: "Log In" })).toBeFocused();

  // A visible focus ring — Bootstrap buttons render this via box-shadow, not outline, so check
  // whichever mechanism is actually in play rather than assuming one. Not testing the exact color,
  // just confirming focus-visible styling isn't suppressed with nothing replacing it.
  const { outline, boxShadow } = await page
    .getByRole("button", { name: "Log In" })
    .evaluate((el) => ({ outline: getComputedStyle(el).outlineStyle, boxShadow: getComputedStyle(el).boxShadow }));
  expect(outline !== "none" || boxShadow !== "none").toBe(true);
});

for (const [viewportName, viewportSize] of Object.entries(VIEWPORTS)) {
  test.describe(`${viewportName} (${viewportSize.width}x${viewportSize.height})`, () => {
    test.use({ viewport: viewportSize });

    // ui-spec.md §11 / §9: no horizontal scroll on any of the five new/changed screens. RESP-01/02/03
    // cover Queue, User Management and Staff Ticket Detail; these two cover Login and Change Password.
    test("Login — no horizontal scroll", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    test("Change Password — no horizontal scroll", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Email").fill(gatedUser.email);
      await page.getByLabel("Password").fill(gatedUser.initialPassword);
      await page.getByRole("button", { name: "Log In" }).click();
      await expect(page.getByRole("button", { name: "Set Password" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
    });

    // RESP-01 (AC-34)
    test("Ticket Queue — no horizontal scroll, card layout on mobile", async ({ page }) => {
      await loginAs(page, admin.email, admin.password);
      await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      if (viewportName === "mobile") {
        await expect(page.locator(".table-responsive")).toBeHidden();
        await expect(page.locator(".ticket-card").first()).toBeVisible();
      } else {
        await expect(page.locator(".table-responsive")).toBeVisible();
      }

      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-queue/queue-loaded-${viewportName}.png`, fullPage: true });
    });

    // RESP-02 (AC-34)
    test("User Management — no horizontal scroll, card layout on mobile", async ({ page }) => {
      await loginAs(page, admin.email, admin.password);
      await openNavIfCollapsed(page);
      await page.getByRole("link", { name: "User Management" }).click();
      await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      if (viewportName === "mobile") {
        await expect(page.locator(".table-responsive")).toBeHidden();
        await expect(page.locator(".ticket-card").first()).toBeVisible();
      } else {
        await expect(page.locator(".table-responsive")).toBeVisible();
      }

      await page.screenshot({ path: `artifacts/lab-03/screenshots/user-management/user-list-${viewportName}.png`, fullPage: true });
    });

    // RESP-03 — tablet two-column layout, no clipping/overlap (checked at every viewport for the
    // baseline shot; the specific column-alignment assertion only applies at tablet width).
    test("Staff Ticket Detail — no horizontal scroll, tablet keeps the two-column classification row", async ({ page }) => {
      await loginAs(page, admin.email, admin.password);
      await page.getByLabel(/^search/i).fill(ticketNumber);
      await page.getByRole("link", { name: ticketNumber }).first().click();
      await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      if (viewportName === "tablet") {
        const categoryBox = await page.getByText("Category", { exact: true }).boundingBox();
        const relatedSystemBox = await page.getByText("Related System", { exact: true }).boundingBox();
        expect(categoryBox?.y).toBeCloseTo(relatedSystemBox!.y, 0);
      }

      await page.screenshot({ path: `artifacts/lab-03/screenshots/staff-ticket-detail/detail-view-${viewportName}.png`, fullPage: true });
    });
  });
}
