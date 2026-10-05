import { test, expect, Page } from "@playwright/test";
import { bootstrapAdminContext, createReadyRequesterWithTicket, createReadyUser } from "../lab-03/helpers.js";
import { apiAs, login } from "./helpers.js";

// Issue 4-6 (Lab 4) — docs/lab-04/tests.md §2.12, RESP-01..05: the Lab 4 screens at desktop, tablet and
// mobile, plus a keyboard-only pass. Screenshots (RESP-05) are written only with CAPTURE_SCREENSHOTS=1,
// so running this as everyday regression never rewrites committed evidence.

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 375, height: 812 },
] as const;

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "page must not scroll sideways").toBeLessThanOrEqual(clientWidth);
}

async function capture(page: Page, area: string, file: string) {
  if (process.env.CAPTURE_SCREENSHOTS === "1") {
    await page.screenshot({ path: `artifacts/lab-04/screenshots/${area}/${file}.png`, fullPage: true });
  }
}

let staff: Awaited<ReturnType<typeof createReadyUser>>;
let admin: Awaited<ReturnType<typeof createReadyUser>>;
let fixture: Awaited<ReturnType<typeof createReadyRequesterWithTicket>>;

test.beforeAll(async () => {
  const adminContext = await bootstrapAdminContext();
  [staff, admin, fixture] = await Promise.all([
    createReadyUser(adminContext, { name: "E2E Responsive Staff", role: "IT_STAFF", emailPrefix: "e2e-resp4-staff" }),
    createReadyUser(adminContext, { name: "E2E Responsive Admin", role: "ADMINISTRATOR", emailPrefix: "e2e-resp4-admin" }),
    createReadyRequesterWithTicket(adminContext, "e2e-resp4-req"),
  ]);
  await adminContext.dispose();

  // Three Actions (one with long text and a follow-up) so the Actions table has real width to fit.
  const api = await apiAs(staff.email, staff.password);
  const actions = [
    { description: "Ran hardware diagnostics and read the crash dumps from the last three days of use.", result: "Memory test failed on slot 2; the crash dumps all point to a faulty RAM module.", status: "COMPLETED" },
    { description: "Replace the RAM module in slot 2 with a spare from stock.", status: "IN_PROGRESS", result: null },
    { description: "Confirm with the Requester that the laptop no longer crashes when it wakes from sleep.", status: "PLANNED", result: null, followUpRequired: true, followUpNote: "If it still crashes, escalate for a full laptop replacement." },
  ];
  for (const [i, a] of actions.entries()) {
    const res = await api.post(`/api/staff/tickets/${fixture.ticketId}/actions`, {
      data: { clientRequestId: `e2e-resp4-${Date.now()}-${i}`, actionAt: new Date().toISOString(), attachmentNotes: "See crash-dump.png on this ticket.", ...a },
    });
    expect(res.ok()).toBe(true);
  }
  await api.dispose();
});

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    // RESP-01 (AC-40)
    test("dashboards — no horizontal scroll; cards stack on mobile", async ({ page, browser }) => {
      for (const [who, user] of [["staff", staff], ["admin", admin]] as const) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const p = await context.newPage();
        await login(p, user.email, user.password);
        await expect(p.locator(".zg-metric-value").first()).not.toHaveText("—");
        await assertNoHorizontalOverflow(p);
        const widths = await p.locator(".zg-metric-card").evaluateAll((cards) => cards.slice(0, 2).map((c) => c.getBoundingClientRect().width));
        const containerWidth = await p.locator("main.container").evaluate((m) => m.clientWidth);
        if (vp.name === "mobile") {
          for (const w of widths) expect(w).toBeGreaterThan(containerWidth * 0.8); // one card per row
        } else {
          for (const w of widths) expect(w).toBeLessThan(containerWidth * 0.6); // several per row
        }
        await capture(p, "staff-dashboard", `${who}-dashboard-${vp.name}`);
        await context.close();
      }

      await login(page, fixture.requester.email, fixture.requester.password);
      await expect(page.locator(".zg-metric-value").first()).not.toHaveText("—");
      await assertNoHorizontalOverflow(page);
      await capture(page, "requester-dashboard", `requester-dashboard-${vp.name}`);
    });

    // RESP-02 (AC-40)
    test("Staff Ticket Detail with Actions — table at ≥992px, cards below, no overflow", async ({ page }) => {
      await login(page, staff.email, staff.password);
      await page.goto(`/queue/${fixture.ticketId}`);
      const card = page.locator("#actions");
      await expect(card.getByRole("heading", { name: "Actions Taken (3)" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      if (vp.name !== "desktop") {
        await expect(card.locator("table")).toBeHidden();
        await expect(card.locator("li.ticket-card")).toHaveCount(3);
        await expect(card.locator("li.ticket-card").first()).toBeVisible();
      } else {
        await expect(card.locator("table")).toBeVisible();
        await expect(card.locator("table tbody tr")).toHaveCount(3);
      }
      await card.scrollIntoViewIfNeeded();
      await capture(page, "actions-taken", `staff-detail-actions-${vp.name}`);
    });

    // RESP-03 (AC-40)
    test("Requester Ticket Detail (read-only Actions, Status History) — no overflow", async ({ page }) => {
      await login(page, fixture.requester.email, fixture.requester.password);
      await page.goto(`/tickets/${fixture.ticketId}`);
      await expect(page.locator("#actions").getByRole("heading", { name: "Actions Taken (3)" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Status History" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await capture(page, "actions-taken", `requester-read-only-${vp.name}`);
    });
  });
}

// RESP-04 (AC-40) — keyboard only: dashboard drill-down, Add Action, Save, status change. Every
// focused control must show a visible focus indicator (outline or box-shadow).
test("keyboard-only: drill down, record an Action, change status — with a visible focus ring", async ({ page }) => {
  const adminContext = await bootstrapAdminContext();
  const kbStaff = await createReadyUser(adminContext, { name: "E2E Keyboard Staff", role: "IT_STAFF", emailPrefix: "e2e-kb-staff" });
  const kbFixture = await createReadyRequesterWithTicket(adminContext, "e2e-kb-req");
  await adminContext.dispose();
  const api = await apiAs(kbStaff.email, kbStaff.password);
  await api.patch(`/api/staff/tickets/${kbFixture.ticketId}/owner`, { data: { ownerId: kbStaff.id, version: 1 } });
  await api.dispose();

  const focusVisible = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return false;
      const s = getComputedStyle(el);
      return (s.outlineStyle !== "none" && s.outlineWidth !== "0px") || s.boxShadow !== "none";
    });
  // The focused control's name: aria-label, else its <label for>, else its own text.
  const activeText = () =>
    page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return "";
      const labelled = el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null;
      return (el.getAttribute("aria-label") ?? labelled ?? el.textContent ?? "").trim();
    });

  async function tabTo(match: RegExp, limit = 80, key: "Tab" | "Shift+Tab" = "Tab") {
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press(key);
      if (match.test(await activeText())) {
        expect(await focusVisible(), `focus ring on "${await activeText()}"`).toBe(true);
        return;
      }
    }
    throw new Error(`Never reached ${match} by Tab`);
  }

  await login(page, kbStaff.email, kbStaff.password);
  await expect(page.locator(".zg-metric-value").first()).not.toHaveText("—");

  // Dashboard → "My open tickets" drill-down, by keyboard.
  await tabTo(/^View My open tickets \(1\)$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
  await tabTo(new RegExp(`^${kbFixture.ticketNumber}$`));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: kbFixture.ticketNumber })).toBeVisible();

  // Add Action → focus lands on the panel heading → fill → Save, all by keyboard.
  await tabTo(/^Add Action$/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Add Action" })).toBeFocused();
  // Action Date/Time keeps its pre-filled "now". In Chromium, Tab first walks through that field's
  // own parts (month, day, year, hour, minute), so each step below tabs until the named field.
  await tabTo(/^Status$/);
  await page.keyboard.press("ArrowDown"); // Planned -> In Progress
  await page.keyboard.press("ArrowDown"); // -> Completed
  await tabTo(/^Action Description$/);
  await page.keyboard.type("Reset the network adapter (keyboard only).");
  await tabTo(/^Result \(required\)$/);
  await page.keyboard.type("Connection is stable again.");
  await tabTo(/^Save Action$/);
  await page.keyboard.press("Enter");
  await expect(page.locator("#actions").getByRole("row", { name: /keyboard only/ })).toBeVisible();

  // Status change by keyboard. After saving, focus is back on "Add Action"; the Status card sits just
  // above the Actions card, so step backwards to its control.
  await expect(page.getByRole("button", { name: "Add Action" })).toBeFocused();
  await tabTo(/^Change status$/, 20, "Shift+Tab");
  await page.keyboard.press("ArrowDown"); // New -> Open (no confirm step)
  await expect(page.locator(".card", { has: page.getByRole("heading", { name: "Status", exact: true }) }).getByText("Open", { exact: true })).toBeVisible();
});
