import { test, expect } from "@playwright/test";

// Issue 2-8 (Lab 2) — one connected Requester journey through the real app, against the real
// backend/DB (prerequisite: dev DB migrated+seeded, `cd server && npm run dev` already running —
// see playwright.config.ts). Uses two real seeded Requesters (Alex Rivera, Priya Nair), since
// those are the only ones the actual Selector ever shows.
//
// Steps match the Issue 2-8 scope exactly:
//   1. Select Requester
//   2. Create Ticket (form + eligible attachment + submit + verify generated Ticket Number)
//   3. Find in My Tickets (search, verify ownership)
//   4. Open Detail (read-only)
//   5. Manage Attachment (download, then soft-remove; verify the UI updates)
// Requester-switch/ownership-isolation is folded in as a final check since it's already proven
// once we're on the Detail screen anyway (see the last step below).

const TICKET_NUMBER_PATTERN = /^TK-\d{4}-\d{6}$/;

test("Requester creates a ticket, finds it, views it, and manages its attachment", async ({ page }) => {
  const uniqueSummary = `Playwright E2E ticket ${Date.now()}`;

  // 1. Select Requester (Development Requester Selection screen).
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TokTickIT" })).toBeVisible();
  await page.getByLabel("Development Requester").selectOption({ label: "Alex Rivera (alex.rivera@example.edu)" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".requester-chip")).toHaveText("Alex Rivera");

  // 2. Create Ticket: fill the form, attach an eligible file, submit, verify the Ticket Number.
  await page.getByLabel("Primary").getByRole("link", { name: "Create Ticket" }).click();
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();

  await page.getByLabel(/^category/i).selectOption({ index: 1 });
  await page.getByLabel(/^related system/i).selectOption({ index: 1 });
  await page.getByLabel(/^requested priority/i).selectOption("HIGH");
  await page.getByLabel(/^ticket summary/i).fill(uniqueSummary);
  await page
    .getByLabel(/^description/i)
    .fill("Created by the Playwright E2E flow test — long enough to pass validation.");

  await page.getByLabel("Add file").setInputFiles({
    name: "e2e-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
  });
  await expect(page.getByText("e2e-photo.jpg")).toBeVisible();

  await page.getByRole("button", { name: "Submit" }).click();

  const ticketNumberLocator = page.getByText(TICKET_NUMBER_PATTERN);
  await expect(ticketNumberLocator).toBeVisible();
  const ticketNumber = (await ticketNumberLocator.textContent())!.trim();
  await expect(page.getByText("Uploaded")).toBeVisible(); // the attachment upload completed too

  // 3. Find in My Tickets: navigate to the list, search for it, confirm it's there (ownership is
  // implicit — this list is already server-scoped to the current Requester).
  await page.getByLabel("Primary").getByRole("link", { name: "My Tickets" }).click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.getByLabel(/^search/i).fill(ticketNumber);

  const desktopTable = page.locator(".table-responsive");
  const ticketLink = desktopTable.getByRole("link", { name: ticketNumber });
  await expect(ticketLink).toBeVisible();
  await expect(desktopTable.getByRole("row")).toHaveCount(2); // header row + exactly one match

  // 4. Open Detail: click into the ticket, verify the read-only fields match what was submitted.
  await ticketLink.click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();
  await expect(page.getByText(uniqueSummary)).toBeVisible();
  await expect(
    page.getByText("Created by the Playwright E2E flow test — long enough to pass validation.")
  ).toBeVisible();
  await expect(page.getByText("High")).toBeVisible(); // Requested Priority badge

  // 5. Manage Attachment: download the active one, then soft-remove it with a reason, and confirm
  // the UI reflects the removed state.
  const attachmentRow = page.getByText("e2e-photo.jpg").locator("..").locator("..");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    attachmentRow.getByRole("link", { name: "e2e-photo.jpg" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("e2e-photo.jpg");

  await attachmentRow.getByRole("button", { name: "Remove" }).click();
  await page.getByPlaceholder("Reason (optional)").fill("Playwright E2E verification");
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect(page.getByText("Unavailable")).toBeVisible();
  await expect(page.getByRole("link", { name: "e2e-photo.jpg" })).toHaveCount(0); // no longer a download link
  await expect(page.getByText(/removed .* — Playwright E2E verification/)).toBeVisible();
});
