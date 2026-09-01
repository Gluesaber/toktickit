import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import MyTicketsPage from "../../src/pages/MyTicketsPage.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import App from "../../src/App.js";
import * as api from "../../src/api.js";
import type { TicketListItem, TicketListResponse } from "../../src/api.js";

const CATEGORIES = [{ id: 1, name: "Hardware" }];
const RELATED_SYSTEMS = [{ id: 1, name: "Corporate Laptop" }];

function selectRequester() {
  window.localStorage.setItem(
    "toktickit.selectedRequester",
    JSON.stringify({ id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" })
  );
}

function renderPage() {
  selectRequester();
  return render(
    <MemoryRouter>
      <RequesterProvider>
        <MyTicketsPage />
      </RequesterProvider>
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
    window.localStorage.clear();
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

    window.localStorage.clear();
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

// UI-14 (AC-02, BR-10) — tested against the full App: the redirect gate lives in App.tsx's Gate
// component, not MyTicketsPage itself, since MyTicketsPage is only ever rendered once a Requester
// is already selected.
describe("My Tickets access without a selected Requester", () => {
  it("shows the Development Requester Selection screen instead of My Tickets", async () => {
    window.localStorage.clear();
    vi.spyOn(api, "getRequesters").mockResolvedValue([
      { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
    ]);
    render(<App />);

    expect(await screen.findByText(/select a development requester/i)).toBeInTheDocument();
    expect(screen.queryByText("My Tickets")).not.toBeInTheDocument();
  });
});
