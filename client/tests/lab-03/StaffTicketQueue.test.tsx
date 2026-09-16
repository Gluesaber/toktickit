import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffTicketQueuePage from "../../src/pages/StaffTicketQueuePage.js";
import * as api from "../../src/api.js";
import type { StaffTicketListItem, StaffTicketListResponse } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/StaffTicketQueue.test.tsx (UI-14..17, STYLE-01).

const CATEGORIES = [{ id: 1, name: "Hardware" }];

function renderPage() {
  return render(
    <MemoryRouter>
      <StaffTicketQueuePage />
    </MemoryRouter>
  );
}

function emptyResponse(overrides: Partial<StaffTicketListResponse["pagination"]> = {}): StaffTicketListResponse {
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

function makeTicket(overrides: Partial<StaffTicketListItem> = {}): StaffTicketListItem {
  return {
    id: 1,
    ticketNumber: "TK-2026-000001",
    summary: "Laptop battery drains quickly",
    requesterName: "Alex Rivera",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    owner: null,
    createdAt: "2026-08-24T09:00:00.000Z",
    updatedAt: "2026-08-24T09:00:00.000Z",
    ...overrides,
  };
}

describe("StaffTicketQueuePage", () => {
  beforeEach(() => {
    vi.spyOn(api, "getCategories").mockResolvedValue(CATEGORIES);
  });

  // UI-14 (AC-19)
  it("shows the no-results state when a filter is active and nothing matches", async () => {
    const getStaffTicketsSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText(/search/i);
    await user.type(screen.getByLabelText(/search/i), "no such ticket");

    await waitFor(() => {
      expect(getStaffTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "no such ticket" }));
    });
    expect(await screen.findByText(/no tickets match your filters/i)).toBeInTheDocument();
  });

  it("shows the empty state (no CTA) when the queue has no tickets at all", async () => {
    vi.spyOn(api, "getStaffTickets").mockResolvedValue(emptyResponse());
    renderPage();

    expect(await screen.findByText(/no tickets in the queue yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();
  });

  // UI-15
  it("re-fetches with the search query param when the user types in search", async () => {
    const getStaffTicketsSpy = vi
      .spyOn(api, "getStaffTickets")
      .mockResolvedValue({ ...emptyResponse(), data: [makeTicket()], pagination: { ...emptyResponse().pagination, totalItems: 1 } });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("TK-2026-000001");

    await user.type(screen.getByLabelText(/search/i), "laptop");
    await waitFor(() => {
      expect(getStaffTicketsSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "laptop" }));
    });
  });

  // UI-16
  it("re-fetches with sortBy/sortDir params when the sort control changes", async () => {
    const getStaffTicketsSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [makeTicket()],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("TK-2026-000001");

    await user.selectOptions(screen.getByLabelText(/sort by/i), "itPriority");
    await waitFor(() => {
      expect(getStaffTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ sortBy: "itPriority" }));
    });
  });

  // UI-17
  it("requests the next page when Next is clicked", async () => {
    const getStaffTicketsSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [makeTicket()],
      pagination: { page: 1, pageSize: 10, totalItems: 15, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByText("TK-2026-000001");

    await user.click(screen.getByRole("button", { name: /next/i }));
    await waitFor(() => {
      expect(getStaffTicketsSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    });
  });

  // STYLE-01
  it("renders status/priority/role badges with both a color class and a visible text label", async () => {
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [
        makeTicket({
          requestedPriority: "URGENT",
          itPriority: "LOW",
          currentStatus: "NEW",
          owner: { id: 2, name: "Jordan Lee", role: "IT_STAFF" },
        }),
      ],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    renderPage();

    expect(await screen.findAllByText("Urgent", { selector: ".zg-badge-priority-urgent" })).not.toHaveLength(0);
    expect(screen.getAllByText("Low", { selector: ".zg-badge-priority-low" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("New", { selector: ".zg-badge-status-new" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("IT Staff", { selector: ".zg-badge-role-it_staff" }).length).toBeGreaterThan(0);
  });

  it('shows "Unassigned" for a ticket with no owner', async () => {
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [makeTicket({ owner: null })],
      pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    renderPage();

    expect(await screen.findAllByText(/unassigned/i)).not.toHaveLength(0);
  });
});
