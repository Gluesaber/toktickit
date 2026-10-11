import { test, expect, Page } from "@playwright/test";
import { bootstrapAdminContext, createReadyRequesterWithTicket, createReadyUser } from "../lab-03/helpers.js";
import { apiAs, login, setStatus } from "./helpers.js";

// Issue 4-5 (Lab 4) — docs/lab-04/tests.md §2.13, E2E-06, E2E-07, E2E-08. Real browser, real backend.

// The list's own total: "N total" under the table, or 0 when the no-results message shows instead.
async function listTotal(page: Page): Promise<number> {
  const total = page.getByText(/^\d+ total$/);
  const none = page.getByText(/No tickets match your filters\.|You haven't created any tickets yet\.|No tickets in the queue yet\./);
  await expect(total.or(none).first()).toBeVisible();
  if (await none.first().isVisible()) return 0;
  return Number((await total.textContent())!.replace(" total", ""));
}

async function cardValue(page: Page, label: string): Promise<number> {
  const card = page.getByRole("region", { name: label, exact: true });
  await expect(card.locator(".zg-metric-value")).not.toHaveText("—");
  return Number(await card.locator(".zg-metric-value").textContent());
}

test.describe("Dashboards", () => {
  // E2E-06 (AC-25, AC-26)
  test("every IT Staff card opens a Queue showing the same number", async ({ page }) => {
    const admin = await bootstrapAdminContext();
    const staff = await createReadyUser(admin, { name: "E2E Dashboard Staff", role: "IT_STAFF", emailPrefix: "e2e-dash-staff" });
    const fixture = await createReadyRequesterWithTicket(admin, "e2e-dash-req");
    await admin.dispose();
    const api = await apiAs(staff.email, staff.password);
    await api.patch(`/api/staff/tickets/${fixture.ticketId}/owner`, { data: { ownerId: staff.id, version: 1 } });
    await api.dispose();

    await login(page, staff.email, staff.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

    const cards = ["Unassigned", "My open tickets", "Waiting for Requester", "Resolved, awaiting close", "Requester says resolved"];
    for (const label of cards) {
      // Other specs may create Tickets while this runs (shared database), so the card value and the
      // Queue total are compared as a pair and the pair is retried if they drifted apart.
      await expect(async () => {
        await page.goto("/dashboard");
        const value = await cardValue(page, label);
        await page.getByRole("link", { name: `View ${label} (${value})` }).click();
        await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();
        expect(await listTotal(page)).toBe(value);
      }).toPass({ timeout: 20_000 });
    }

    // "My open tickets" is the one exact number: this new staff member owns exactly one open Ticket.
    await page.goto("/dashboard");
    expect(await cardValue(page, "My open tickets")).toBe(1);
    await page.getByRole("link", { name: "View My open tickets (1)" }).click();
    await expect(page.getByText(/Showing: All open · Owned by me/)).toBeVisible();
    await expect(page.getByRole("link", { name: fixture.ticketNumber }).first()).toBeVisible();
  });

  // E2E-07 (AC-02, AC-27, AC-28)
  test("a Requester's dashboard counts only their Tickets, drills down to My Tickets, and shows zeros when empty", async ({ page, browser }) => {
    const admin = await bootstrapAdminContext();
    const staff = await createReadyUser(admin, { name: "E2E Dashboard Staff 2", role: "IT_STAFF", emailPrefix: "e2e-dash-staff2" });
    const first = await createReadyRequesterWithTicket(admin, "e2e-dash-req2");
    const empty = await createReadyUser(admin, { name: "E2E Empty Requester", role: "REQUESTER", emailPrefix: "e2e-dash-empty" });
    await admin.dispose();

    // A second Ticket for the same Requester, moved to Waiting for Requester by staff.
    const reqApi = await apiAs(first.requester.email, first.requester.password);
    const categories = await (await reqApi.get("/api/categories")).json();
    const systems = await (await reqApi.get("/api/related-systems")).json();
    const second = await (
      await reqApi.post("/api/tickets", {
        data: {
          categoryId: categories[0].id,
          relatedSystemId: systems[0].id,
          summary: "E2E dashboard waiting ticket",
          description: "A second fixture ticket that IT is waiting on the Requester for.",
          requestedPriority: "LOW",
        },
      })
    ).json();
    await reqApi.dispose();
    const staffApi = await apiAs(staff.email, staff.password);
    await setStatus(staffApi, second.id, "OPEN");
    await setStatus(staffApi, second.id, "IN_PROGRESS");
    await setStatus(staffApi, second.id, "WAITING_FOR_REQUESTER");
    await staffApi.dispose();

    await login(page, first.requester.email, first.requester.password);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    expect(await cardValue(page, "Open tickets")).toBe(2);
    expect(await cardValue(page, "Waiting for you")).toBe(1);
    await expect(page.getByRole("region", { name: "Waiting for you" }).getByText("Needs your reply")).toBeVisible();

    await page.getByRole("link", { name: "View Open tickets (2)" }).click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await expect(page).toHaveURL(/statusGroup=open/);
    expect(await listTotal(page)).toBe(2);

    await page.goto("/dashboard");
    await page.getByRole("link", { name: "View Waiting for you (1)" }).click();
    expect(await listTotal(page)).toBe(1);
    await expect(page.getByRole("link", { name: /TK-\d{4}-\d{6}/ }).first()).toBeVisible();

    // A Requester with no Tickets: zeros and empty sentences, no error.
    const emptyContext = await browser.newContext();
    const emptyPage = await emptyContext.newPage();
    await login(emptyPage, empty.email, empty.password);
    for (const label of ["Open tickets", "Waiting for you", "Resolved", "Updated in the last 7 days"]) {
      expect(await cardValue(emptyPage, label)).toBe(0);
    }
    await expect(emptyPage.getByText("No tickets updated in the last 7 days.")).toBeVisible();
    await expect(emptyPage.getByText("Nothing resolved in the last 7 days.")).toBeVisible();
    await expect(emptyPage.getByRole("alert")).toHaveCount(0);
    await emptyContext.close();
  });

  // E2E-08 (AC-30, AC-41, FR-20)
  test("each role lands on its Dashboard, the nav marks it, Admins see user counts, and screens log no errors", async ({ browser }) => {
    const admin = await bootstrapAdminContext();
    const users = {
      REQUESTER: await createReadyRequesterWithTicket(admin, "e2e-dash-land-req"),
      IT_STAFF: await createReadyUser(admin, { name: "E2E Landing Staff", role: "IT_STAFF", emailPrefix: "e2e-dash-land-staff" }),
      ADMINISTRATOR: await createReadyUser(admin, { name: "E2E Landing Admin", role: "ADMINISTRATOR", emailPrefix: "e2e-dash-land-admin" }),
    };
    await admin.dispose();

    const journeys: [string, { email: string; password: string }, string[], string[]][] = [
      ["REQUESTER", users.REQUESTER.requester, ["Dashboard", "My Tickets", "Create Ticket"], ["/tickets", "/tickets/new", `/tickets/${users.REQUESTER.ticketId}`]],
      ["IT_STAFF", users.IT_STAFF, ["Dashboard", "Ticket Queue"], ["/queue", `/queue/${users.REQUESTER.ticketId}`]],
      ["ADMINISTRATOR", users.ADMINISTRATOR, ["Dashboard", "Ticket Queue", "User Management"], ["/queue", `/queue/${users.REQUESTER.ticketId}`, "/admin/users"]],
    ];

    for (const [role, creds, navLinks, screens] of journeys) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, creds.email, creds.password);

      // Console errors are collected from here on. The two 401s from GET /api/auth/me on the Login
      // screen (the "am I logged in?" check, before anyone is) are expected and happen before this.
      const errors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
      });
      page.on("pageerror", (err) => errors.push(err.message));

      await expect(page).toHaveURL(/\/dashboard$/);
      const nav = page.getByLabel("Primary");
      await expect(nav.getByRole("link")).toHaveText(navLinks);
      await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
      await expect(page.locator(".zg-metric-value").first()).not.toHaveText("—");

      if (role === "ADMINISTRATOR") {
        await expect(page.getByRole("heading", { name: "Users", exact: true })).toBeVisible();
        await expect(page.getByRole("region", { name: "Active Administrators" })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "Users", exact: true })).toHaveCount(0);
      }

      for (const path of screens) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      }
      expect(errors, `console errors for ${role}`).toEqual([]);
      await context.close();
    }
  });
});
