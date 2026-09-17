import { test, expect, Page } from "@playwright/test";
import { bootstrapAdminContext, createReadyUser, createReadyRequesterWithTicket, Role } from "./helpers.js";

// Issue 3-7 (Lab 3) — E2E-03/E2E-04. docs/lab-03/tests.md §2. One connected IT Staff/Administrator
// journey against the real app: claim -> IT Priority -> Internal Note -> status change, each step
// reloaded and re-verified so this isn't just checking in-memory React state.

async function runStaffFlow(page: Page, staffName: string, staffEmail: string, staffPassword: string, ticketNumber: string) {
  // Login.
  await page.goto("/");
  await page.getByLabel("Email").fill(staffEmail);
  await page.getByLabel("Password").fill(staffPassword);
  await page.getByRole("button", { name: "Log In" }).click();
  await expect(page.getByRole("heading", { name: "Ticket Queue" })).toBeVisible();

  // Open the Queue, find the fixture ticket, open its detail.
  await page.getByLabel(/^search/i).fill(ticketNumber);
  await expect(page.getByRole("link", { name: ticketNumber }).first()).toBeVisible();
  await page.getByRole("link", { name: ticketNumber }).first().click();
  await expect(page.getByRole("heading", { name: ticketNumber })).toBeVisible();

  // AC-20: Claim an unassigned ticket.
  await page.getByRole("button", { name: "Claim" }).click();
  await expect(page.getByText(staffName)).toBeVisible();
  await page.reload();
  await expect(page.getByText(staffName)).toBeVisible(); // persisted, not just in-memory state

  // AC-23: set IT Priority, independent of Requested Priority.
  await page.getByLabel(/it priority/i).selectOption("URGENT");
  await page.reload();
  await expect(page.getByLabel(/it priority/i)).toHaveValue("URGENT");

  // AC-24: post an Internal Note.
  const noteText = `E2E internal note ${Date.now()}`;
  await page.getByLabel(/add an internal note/i).fill(noteText);
  await page.getByRole("button", { name: "Post Note" }).click();
  await expect(page.getByText(noteText)).toBeVisible();
  await page.reload();
  await expect(page.getByText(noteText)).toBeVisible();

  // Status change: New -> Open is a permitted transition with no inline-confirm step. "Open"
  // appears twice (header block + Status card), same badge both places — .first() is enough.
  await page.getByLabel(/change status/i).selectOption("OPEN");
  await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Open", { exact: true }).first()).toBeVisible();
}

async function setupFixture(role: Role, emailPrefix: string) {
  const adminContext = await bootstrapAdminContext();
  const [staff, requesterFixture] = await Promise.all([
    createReadyUser(adminContext, { name: `E2E ${role} Staffer`, role, emailPrefix }),
    createReadyRequesterWithTicket(adminContext, `${emailPrefix}-requester`),
  ]);
  await adminContext.dispose();
  return { staff, ticketNumber: requesterFixture.ticketNumber };
}

test.describe("Staff Ticket Operations", () => {
  // E2E-03 (AC-16, AC-20, AC-23, AC-24)
  test("IT Staff: claim, set IT Priority, post an Internal Note, change status", async ({ page }) => {
    const { staff, ticketNumber } = await setupFixture("IT_STAFF", "e2e-staff-flow");
    await runStaffFlow(page, staff.name, staff.email, staff.password, ticketNumber);
  });

  // E2E-04 (AC-26) — full parity: the exact same flow, succeeding identically for an Administrator.
  test("Administrator: the same flow succeeds identically to IT Staff (full parity)", async ({ page }) => {
    const { staff: admin, ticketNumber } = await setupFixture("ADMINISTRATOR", "e2e-admin-flow");
    await runStaffFlow(page, admin.name, admin.email, admin.password, ticketNumber);
  });
});
