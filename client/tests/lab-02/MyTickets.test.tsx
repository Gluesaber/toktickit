import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MyTicketsPage from "../../src/pages/MyTicketsPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import type { TicketListItem, TicketListResponse } from "../../src/api.js";

const CATEGORIES = [{ id: 1, name: "Hardware" }];
const RELATED_SYSTEMS = [{ id: 1, name: "Corporate Laptop" }];

// Issue 3-3 (Lab 3) — identity now comes from the authenticated session (BR-03/BR-17); getMe() is
// mocked instead of seeding a selected Requester into localStorage. The former "My Tickets access
// without a selected Requester" describe block (this file, pre-3-3) tested the now-removed
// Development Requester Selector directly — that entire mechanism is gone (BR-39). The equivalent
// "no session -> blocked" behavior is App.tsx's outer AuthGate now, exercised at the API level
// (AC-10, server/tests/lab-03/*) rather than re-tested here.
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
        <MyTicketsPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

function emptyResponse(overrides: Partial<TicketListResponse["pagination"]> = {}): TicketListResponse {
  return {
    data: [],
    pagination: {
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
      ...overrides,
    },
  };
}

function makeTicket(overrides: Partial<TicketListItem> = {}): TicketListItem {
  return {
    id: 1,
    ticketNumber: "TK-2026-000001",
    summary: "Laptop battery drains quickly",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    requestedPriority: "MEDIUM",
    currentStatus: "NEW",
    createdAt: "2026-08-24T09:00:00.000Z",
    updatedAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

describe("MyTicketsPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCategories").mockResolvedValue(CATEGORIES);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue(RELATED_SYSTEMS);
  });

  // UI-09 (AC-15, BR-36)
  it("shows the empty state when there are no tickets and no filters are active", async () => {
    vi.spyOn(api, "getTickets").mockResolvedValue(emptyResponse());
    renderPage();

    expect(await screen.findByText(/haven't created any tickets yet/i)).toBeInTheDocument();
  });

  // UI-10 (AC-16, BR-37)
  it("shows the no-results state when a filter is active and nothing matches", async () => {
    const getTicketsSpy = vi.spyOn(api, "getTickets").mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText(/search/i);
    await user.type(screen.getByLabelText(/search/i), "no such ticket");

    await waitFor(() => {
      expect(getTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "no such ticket" }));
    });
    expect(await screen.findByText(/no tickets match your filters/i)).toBeInTheDocument();
  });

  // UI-11 (AC-13, BR-14)
  it("re-fetches with the search query param when the user types in search", async () => {
    const getTicketsSpy = vi
      .spyOn(api, "getTickets")
      .mockResolvedValue({ ...emptyResponse(), data: [makeTicket()], pagination: { ...emptyResponse().pagination, totalItems: 1 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("TK-2026-000001");

    await user.type(screen.getByLabelText(/search/i), "laptop");
    await waitFor(() => {
      expect(getTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "laptop" }));
    });
  });

  // UI-13 (AC-17, BR-17)
  it("requests the next page when Next is clicked", async () => {
    const getTicketsSpy = vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [makeTicket()],
      pagination: { page: 1, pageSize: 10, totalItems: 15, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("TK-2026-000001");

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      expect(getTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  // STYLE-03
  it("renders priority and status badges with both a color class and a visible text label", async () => {
    vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [makeTicket({ requestedPriority: "URGENT", currentStatus: "NEW" })],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    renderPage();

    // "Urgent"/"New" also appear as plain <option> text in the filter dropdowns, so scope the
    // query to the badge element itself rather than matching the first occurrence of the text.
    const urgentBadges = await screen.findAllByText("Urgent", { selector: ".zg-badge-priority-urgent" });
    expect(urgentBadges.length).toBeGreaterThan(0);
    const newBadges = screen.getAllByText("New", { selector: ".zg-badge-status-new" });
    expect(newBadges.length).toBeGreaterThan(0);
  });

  // STYLE-05
  it("renders the empty state and the no-results state with visibly distinct markup", async () => {
    vi.spyOn(api, "getTickets").mockResolvedValue(emptyResponse());
    const { unmount } = renderPage();
    const emptyMessage = await screen.findByText(/haven't created any tickets yet/i);
    expect(emptyMessage.closest(".alert-info")).toBeInTheDocument();
    unmount();

    const getTicketsSpy = vi.spyOn(api, "getTickets").mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText(/search/i);
    await user.type(screen.getByLabelText(/search/i), "xyz");
    await waitFor(() => expect(getTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "xyz" })));
    const noResultsMessage = await screen.findByText(/no tickets match your filters/i);
    expect(noResultsMessage.closest(".alert-warning")).toBeInTheDocument();
  });
});
