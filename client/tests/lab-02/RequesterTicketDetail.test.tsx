import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TicketDetailPage from "../../src/pages/TicketDetailPage.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import type { TicketDetail } from "../../src/api.js";

function renderPage(id = "1") {
  window.localStorage.setItem(
    "toktickit.selectedRequester",
    JSON.stringify({ id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" })
  );
  return render(
    <MemoryRouter initialEntries={[`/tickets/${id}`]}>
      <RequesterProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </RequesterProvider>
    </MemoryRouter>
  );
}

function makeTicketDetail(overrides: Partial<TicketDetail> = {}): TicketDetail {
  return {
    id: 1,
    ticketNumber: "TK-2026-000001",
    requester: { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
    category: { id: 1, name: "Hardware" },
    relatedSystem: { id: 1, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "Battery drops from 100% to 20% within an hour of unplugging, started this week.",
    requestedPriority: "MEDIUM",
    currentStatus: "NEW",
    createdAt: "2026-08-24T09:00:00.000Z",
    updatedAt: "2026-08-24T09:00:00.000Z",
    attachments: [],
    ...overrides,
  };
}

describe("TicketDetailPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // UI-15 (AC-20)
  it("renders all ticket fields as read-only with the returned values", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail());
    renderPage();

    expect(await screen.findByText("TK-2026-000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hardware")).toBeDisabled();
    expect(screen.getByDisplayValue("Corporate Laptop")).toBeDisabled();
    expect(screen.getByDisplayValue("Alex Rivera")).toBeDisabled();
    expect(screen.getByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(
      screen.getByText(/battery drops from 100% to 20% within an hour/i)
    ).toBeInTheDocument();
    // No editable inputs anywhere on this screen — every field is read-only.
    expect(document.querySelectorAll("input:not([disabled])")).toHaveLength(0);
  });

  // UI-16 (AC-21)
  it('shows a "Ticket not found" state on a 404 response, with no partial ticket data', async () => {
    vi.spyOn(api, "getTicket").mockRejectedValue(
      new ApiError({ error: { code: "NOT_FOUND", message: "Ticket not found." } })
    );
    renderPage("999");

    expect(await screen.findByText(/ticket not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to my tickets/i })).toBeInTheDocument();
    expect(screen.queryByText("TK-2026-000001")).not.toBeInTheDocument();
  });

  it("shows a safe failure state (distinct from not-found) on an unexpected error", async () => {
    vi.spyOn(api, "getTicket").mockRejectedValue(
      new ApiError({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } })
    );
    renderPage();

    expect(await screen.findByText(/unable to load this ticket/i)).toBeInTheDocument();
    expect(screen.queryByText(/ticket not found/i)).not.toBeInTheDocument();
  });

  it("shows the Attachments section as a non-functional placeholder pending Issue 2-7", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail());
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/attachments will be available once issue 2-7/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /add attachment/i })).not.toBeInTheDocument();
  });
});
