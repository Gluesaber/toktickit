import { test, expect, Page, APIRequestContext } from "@playwright/test";

// Issue 2-8 (Lab 2) — the baseline responsive screenshot set required by the labsheet's §8.8
// ("Playwright screenshots at desktop, tablet, and mobile viewport sizes") and Part 9's evidence
// requirement. Scope is deliberately the baseline set only (one clean shot per screen per
// viewport, RESP-01–RESP-04) — the full per-state screenshot matrix in ui-spec.md §10 is
// documentation evidence assembled in Issue 2-9, not a test of behavior.
//
// Prerequisite: same as requester-ticket-flow.spec.ts (dev DB up + seeded, backend running).

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 820, height: 1180 },
  mobile: { width: 375, height: 812 },
} as const;

const API_BASE_URL = "http://localhost:3000";

async function selectRequester(page: Page, requester: { id: number; name: string; email: string }) {
  await page.addInitScript((r) => {
    window.localStorage.setItem("toktickit.selectedRequester", JSON.stringify(r));
  }, requester);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(overflow, "page has horizontal overflow").toBe(false);
}

// Fixture data created once via direct API calls (not through the UI — this file is testing
// layout, not the create flow, which requester-ticket-flow.spec.ts already covers).
let requester: { id: number; name: string; email: string };
let ticketId: number;

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  const requesters = await (await request.get(`${API_BASE_URL}/api/requesters`)).json();
  requester = requesters[0];

  const categories = await (await request.get(`${API_BASE_URL}/api/categories`)).json();
  const relatedSystems = await (await request.get(`${API_BASE_URL}/api/related-systems`)).json();

  const createRes = await request.post(`${API_BASE_URL}/api/tickets`, {
    data: {
      requesterId: requester.id,
      categoryId: categories[0].id,
      relatedSystemId: relatedSystems[0].id,
      summary: "Responsive layout fixture ticket",
      description: "Fixture ticket for Playwright responsive/visual screenshots, long enough to pass validation.",
      requestedPriority: "MEDIUM",
    },
  });
  const ticket = await createRes.json();
  ticketId = ticket.id;
});

for (const [viewportName, viewportSize] of Object.entries(VIEWPORTS)) {
  test.describe(`${viewportName} (${viewportSize.width}x${viewportSize.height})`, () => {
    test.use({ viewport: viewportSize });

    test(`Create Ticket — initial state`, async ({ page }) => {
      await selectRequester(page, requester);
      await page.goto("/tickets/new");
      await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await page.screenshot({
        path: `artifacts/lab-02/screenshots/responsive/create-ticket/initial-${viewportName}.png`,
        fullPage: true,
      });
    });

    test(`My Tickets — base list view`, async ({ page }) => {
      await selectRequester(page, requester);
      await page.goto("/tickets");
      await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      // RESP-02: mobile renders the card list, not the desktop table.
      if (viewportName === "mobile") {
        await expect(page.locator(".table-responsive")).toBeHidden();
        await expect(page.locator(".ticket-card").first()).toBeVisible();
      } else {
        await expect(page.locator(".table-responsive")).toBeVisible();
      }

      await page.screenshot({
        path: `artifacts/lab-02/screenshots/responsive/my-tickets/requester-a-list-${viewportName}.png`,
        fullPage: true,
      });
    });

    test(`Ticket Detail — owned view`, async ({ page }) => {
      await selectRequester(page, requester);
      await page.goto(`/tickets/${ticketId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await assertNoHorizontalOverflow(page);

      // RESP-03: tablet keeps Category/Related System as a two-column row (same top offset);
      // mobile stacks them (Category strictly above Related System).
      if (viewportName === "tablet") {
        const categoryBox = await page.getByText("Category", { exact: true }).boundingBox();
        const relatedSystemBox = await page.getByText("Related System", { exact: true }).boundingBox();
        expect(categoryBox?.y).toBeCloseTo(relatedSystemBox!.y, 0);
      }
      if (viewportName === "mobile") {
        const categoryBox = await page.getByText("Category", { exact: true }).boundingBox();
        const relatedSystemBox = await page.getByText("Related System", { exact: true }).boundingBox();
        expect(relatedSystemBox!.y).toBeGreaterThan(categoryBox!.y + 10);
      }

      await page.screenshot({
        path: `artifacts/lab-02/screenshots/responsive/ticket-detail/owned-view-${viewportName}.png`,
        fullPage: true,
      });
    });
  });
}
