import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffDashboardPage from "../../src/pages/StaffDashboardPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type StaffDashboard, type User } from "../../src/api.js";

// docs/lab-04/tests.md §2.9 — client/tests/lab-04/StaffDashboard.test.tsx (UI-01..06, STYLE-01).

const STAFF: User = { id: 6, name: "Taylor Brooks", email: "taylor@example.test", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const ADMIN: User = { ...STAFF, id: 9, name: "Jamie Whitfield", role: "ADMINISTRATOR" };

function makeDashboard(overrides: Partial<StaffDashboard> = {}): StaffDashboard {
  return {
    generatedAt: "2026-10-05T05:00:00.000Z",
    timeZone: "Asia/Bangkok",
    windowStart: "2026-09-28T17:00:00.000Z",
    metrics: [
      { key: "unassignedOpen", label: "Unassigned", value: 3, drillDown: "/queue?ownerId=unassigned&statusGroup=open" },
      { key: "myOpenTickets", label: "My open tickets", value: 2, drillDown: "/queue?ownerId=6&statusGroup=open" },
      { key: "waitingForRequester", label: "Waiting for Requester", value: 1, drillDown: "/queue?currentStatus=WAITING_FOR_REQUESTER" },
      { key: "resolvedAwaitingClose", label: "Resolved, awaiting close", value: 4, drillDown: "/queue?currentStatus=RESOLVED" },
      { key: "requesterSaysResolved", label: "Requester says resolved", value: 1, drillDown: "/queue?requesterResolved=true&statusGroup=open" },
      { key: "myOpenActions", label: "My open actions", value: 2, drillDown: null },
      { key: "myFollowUps", label: "My follow-ups", value: 1, drillDown: null },
    ],
    byStatus: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "CANCELLED", "REOPENED"].map((status, i) => ({
      status,
      value: i,
      drillDown: `/queue?currentStatus=${status}`,
    })),
    openByItPriority: (["URGENT", "HIGH", "MEDIUM", "LOW"] as const).map((itPriority, i) => ({
      itPriority,
      value: i + 1,
      drillDown: `/queue?itPriority=${itPriority}&statusGroup=open`,
    })),
    lists: {
      myActions: [
        { actionId: 17, ticketId: 42, ticketNumber: "TK-2026-000042", description: "Re-check crash after RAM swap", status: "PLANNED", followUpRequired: true, actionAt: "2026-10-06T03:00:00.000Z" },
      ],
      urgentAndRecent: [
        { id: 42, ticketNumber: "TK-2026-000042", summary: "Laptop crashes on wake", currentStatus: "IN_PROGRESS", itPriority: "URGENT", updatedAt: "2026-10-05T03:00:00.000Z", owner: null },
      ],
    },
    ...overrides,
  };
}

function renderPage(user: User = STAFF) {
  vi.spyOn(api, "getMe").mockResolvedValue(user);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <StaffDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("UI-01: cards and drill-down links (FR-13, AC-26)", () => {
  beforeEach(() => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(makeDashboard());
  });

  it("shows every operational card with its value and a link to exactly the API's drillDown", async () => {
    renderPage();
    const cards: [string, string, string][] = [
      ["Unassigned", "3", "/queue?ownerId=unassigned&statusGroup=open"],
      ["My open tickets", "2", "/queue?ownerId=6&statusGroup=open"],
      ["Waiting for Requester", "1", "/queue?currentStatus=WAITING_FOR_REQUESTER"],
      ["Resolved, awaiting close", "4", "/queue?currentStatus=RESOLVED"],
      ["Requester says resolved", "1", "/queue?requesterResolved=true&statusGroup=open"],
    ];
    for (const [label, value, href] of cards) {
      const card = await screen.findByRole("region", { name: label });
      expect(within(card).getByText(value)).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: `View ${label} (${value})` })).toHaveAttribute("href", href);
    }
  });

  it("links every status and priority count to its filtered Queue", async () => {
    renderPage();
    const byStatus = await screen.findByRole("region", { name: "Tickets by status" });
    expect(within(byStatus).getAllByRole("link")).toHaveLength(8);
    expect(within(byStatus).getByRole("link", { name: /view 2 in progress tickets/i })).toHaveAttribute("href", "/queue?currentStatus=IN_PROGRESS");
    const byPriority = screen.getByRole("region", { name: "Open tickets by IT Priority" });
    expect(within(byPriority).getByRole("link", { name: /view 1 open urgent priority tickets/i })).toHaveAttribute("href", "/queue?itPriority=URGENT&statusGroup=open");
  });

  it("shows the welcome line and the window boundary", async () => {
    renderPage();
    expect(await screen.findByText(/welcome back, taylor brooks/i)).toBeInTheDocument();
    expect(screen.getByText(/counts since/i)).toBeInTheDocument();
  });
});

describe("UI-02: loading state", () => {
  it("shows placeholders, never numbers, while the request is pending", async () => {
    vi.spyOn(api, "getStaffDashboard").mockImplementation(() => new Promise(() => undefined));
    renderPage();
    const card = await screen.findByRole("region", { name: "Unassigned" });
    expect(within(card).getByText("—")).toBeInTheDocument();
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Loading dashboard")).toBeInTheDocument();
  });
});

describe("UI-03: zero and empty states (AC-28)", () => {
  it("shows real zeros and the empty sentences, no error", async () => {
    const zero = makeDashboard();
    zero.metrics = zero.metrics.map((m) => ({ ...m, value: 0 }));
    zero.lists = { myActions: [], urgentAndRecent: [] };
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(zero);
    renderPage();
    const card = await screen.findByRole("region", { name: "Unassigned" });
    expect(within(card).getByText("0")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "View Unassigned (0)" })).toBeInTheDocument();
    expect(screen.getByText("No open actions or follow-ups assigned to you.")).toBeInTheDocument();
    expect(screen.getByText("No urgent or recently updated open tickets.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("UI-04: safe failure and retry (AC-32)", () => {
  it("replaces the numbers with a failure message, and Retry loads them", async () => {
    const spy = vi.spyOn(api, "getStaffDashboard").mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(makeDashboard());
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("We couldn't load your dashboard. Please try again.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unassigned" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(within(await screen.findByRole("region", { name: "Unassigned" })).getByText("3")).toBeInTheDocument();
  });
});

// Issue 4-7 (Lab 4) — the staff side of AC-29, found missing in the ui-spec §11 sign-off: UI-10 only
// covered the Requester dashboard's 403 panel.
describe("UI-04b: forbidden (AC-29)", () => {
  it("shows the access panel on a 403, with no numbers", async () => {
    vi.spyOn(api, "getStaffDashboard").mockRejectedValue(new ApiError({ error: { code: "FORBIDDEN", message: "No." } }));
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unassigned" })).not.toBeInTheDocument();
  });
});

describe("UI-05: user counts only for Administrators (AC-30)", () => {
  it("renders the Users group when the response has it", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(
      makeDashboard({
        users: {
          activeByRole: [
            { role: "REQUESTER", value: 4, drillDown: "/admin/users?role=REQUESTER" },
            { role: "IT_STAFF", value: 3, drillDown: "/admin/users?role=IT_STAFF" },
            { role: "ADMINISTRATOR", value: 1, drillDown: "/admin/users?role=ADMINISTRATOR" },
          ],
          inactive: { value: 2, drillDown: "/admin/users" },
        },
      })
    );
    renderPage(ADMIN);
    const it = await screen.findByRole("region", { name: "Active IT Staff" });
    expect(within(it).getByRole("link", { name: "View Active IT Staff (3)" })).toHaveAttribute("href", "/admin/users?role=IT_STAFF");
    expect(screen.getByRole("region", { name: "Inactive users" })).toBeInTheDocument();
  });

  it("renders no Users group without it", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(makeDashboard());
    renderPage();
    await screen.findByRole("region", { name: "Unassigned" });
    expect(screen.queryByRole("heading", { name: "Users" })).not.toBeInTheDocument();
  });
});

describe("UI-06: My work rows (AC-31)", () => {
  it("links each row to the Ticket's Actions card and shows its status and follow-up cues", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(makeDashboard());
    renderPage();
    const myWork = await screen.findByRole("region", { name: "My work" });
    expect(within(myWork).getByRole("link", { name: "TK-2026-000042" })).toHaveAttribute("href", "/queue/42#actions");
    expect(within(myWork).getByText("Planned")).toBeInTheDocument();
    expect(within(myWork).getByText("Follow-up")).toBeInTheDocument();
    expect(within(myWork).getByText("Re-check crash after RAM swap")).toHaveAttribute("title", "Re-check crash after RAM swap");
  });
});

describe("STYLE-01: metric cards are accessible (ui-spec.md §1.2, §9)", () => {
  it("each card is a labelled region whose value is text and whose link names the metric", async () => {
    vi.spyOn(api, "getStaffDashboard").mockResolvedValue(makeDashboard());
    renderPage();
    const card = await screen.findByRole("region", { name: "Requester says resolved" });
    expect(card).toHaveClass("zg-metric-card");
    expect(within(card).getByRole("heading", { name: "Requester says resolved" })).toBeInTheDocument();
    expect(within(card).getByText("1")).toHaveClass("zg-metric-value");
    expect(within(card).getByRole("link").getAttribute("aria-label")).toContain("Requester says resolved");
  });
});
