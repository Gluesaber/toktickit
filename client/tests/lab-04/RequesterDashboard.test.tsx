import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RequesterDashboardPage from "../../src/pages/RequesterDashboardPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type RequesterDashboard } from "../../src/api.js";

// docs/lab-04/tests.md §2.9 — client/tests/lab-04/RequesterDashboard.test.tsx (UI-07..10).

function makeDashboard(values: [number, number, number, number] = [3, 1, 1, 4]): RequesterDashboard {
  const [open, waiting, resolved, recent] = values;
  return {
    generatedAt: "2026-10-05T05:00:00.000Z",
    timeZone: "Asia/Bangkok",
    windowStart: "2026-09-28T17:00:00.000Z",
    metrics: [
      { key: "openTickets", label: "Open tickets", value: open, drillDown: "/tickets?statusGroup=open" },
      { key: "waitingForMe", label: "Waiting for you", value: waiting, drillDown: "/tickets?currentStatus=WAITING_FOR_REQUESTER" },
      { key: "resolvedAwaitingClose", label: "Resolved", value: resolved, drillDown: "/tickets?currentStatus=RESOLVED" },
      { key: "updatedRecently", label: "Updated in the last 7 days", value: recent, drillDown: "/tickets?sortBy=updatedAt&sortDir=desc" },
    ],
    lists: {
      recentlyUpdated:
        recent === 0
          ? []
          : [{ id: 42, ticketNumber: "TK-2026-000042", summary: "Laptop crashes on wake", currentStatus: "IN_PROGRESS", updatedAt: "2026-10-05T03:12:00.000Z" }],
      recentlyResolved:
        resolved === 0
          ? []
          : [{ id: 40, ticketNumber: "TK-2026-000040", summary: "VPN disconnects hourly", currentStatus: "RESOLVED", resolvedAt: "2026-10-03T09:00:00.000Z" }],
    },
  };
}

function renderPage() {
  vi.spyOn(api, "getMe").mockResolvedValue({
    id: 1,
    name: "Alex Rivera",
    email: "alex.rivera@example.edu",
    role: "REQUESTER",
    isActive: true,
    mustChangePassword: false,
  });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequesterDashboardPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("UI-07: cards, lists and drill-downs (FR-12, AC-27)", () => {
  it("shows the 4 cards with links to My Tickets, the 2 lists, and Quick Actions", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(makeDashboard());
    renderPage();
    const open = await screen.findByRole("region", { name: "Open tickets" });
    expect(within(open).getByRole("link", { name: "View Open tickets (3)" })).toHaveAttribute("href", "/tickets?statusGroup=open");
    expect(within(screen.getByRole("region", { name: "Resolved" })).getByRole("link")).toHaveAttribute("href", "/tickets?currentStatus=RESOLVED");
    expect(within(screen.getByRole("region", { name: "Updated in the last 7 days" })).getByRole("link")).toHaveAttribute(
      "href",
      "/tickets?sortBy=updatedAt&sortDir=desc"
    );

    expect(screen.getByRole("link", { name: "TK-2026-000042" })).toHaveAttribute("href", "/tickets/42");
    expect(screen.getByRole("link", { name: "TK-2026-000040" })).toHaveAttribute("href", "/tickets/40");
    expect(screen.getByRole("link", { name: /view all tickets, most recently updated first/i })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Quick Actions" })).getByRole("link", { name: /create ticket/i })).toHaveAttribute("href", "/tickets/new");
    expect(screen.getByText(/welcome back, alex rivera/i)).toBeInTheDocument();
  });

  it("marks 'Waiting for you' with text, not color alone, only when it isn't zero", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(makeDashboard());
    renderPage();
    const waiting = await screen.findByRole("region", { name: "Waiting for you" });
    expect(within(waiting).getByText("Needs your reply")).toBeInTheDocument();
    expect(waiting).toHaveClass("zg-metric-card-attention");
  });
});

describe("UI-08: zero and empty states (AC-28)", () => {
  it("shows zeros, no attention cue, and the empty-list sentences", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockResolvedValue(makeDashboard([0, 0, 0, 0]));
    renderPage();
    const waiting = await screen.findByRole("region", { name: "Waiting for you" });
    expect(within(waiting).getByText("0")).toBeInTheDocument();
    expect(within(waiting).queryByText("Needs your reply")).not.toBeInTheDocument();
    expect(screen.getByText("No tickets updated in the last 7 days.")).toBeInTheDocument();
    expect(screen.getByText("Nothing resolved in the last 7 days.")).toBeInTheDocument();
  });
});

describe("UI-09: safe failure (AC-32)", () => {
  it("shows the failure message with Retry and no numbers", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByText("We couldn't load your dashboard. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Open tickets" })).not.toBeInTheDocument();
  });
});

describe("UI-10: forbidden (AC-29)", () => {
  it("shows the access panel on a 403", async () => {
    vi.spyOn(api, "getRequesterDashboard").mockRejectedValue(new ApiError({ error: { code: "FORBIDDEN", message: "No." } }));
    renderPage();
    expect(await screen.findByText("You don't have access to this page.")).toBeInTheDocument();
  });
});
