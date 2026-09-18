import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TicketDetailPage from "../../src/pages/TicketDetailPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import type { TicketDetail } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/RequesterTicketDetailExtensions.test.tsx (UI-10..13).

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
    <MemoryRouter initialEntries={["/tickets/1"]}>
      <AuthProvider>
        <Routes>
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
        </Routes>
      </AuthProvider>
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
    requesterConfirmedResolvedAt: null,
    createdAt: "2026-08-24T09:00:00.000Z",
    updatedAt: "2026-08-24T09:00:00.000Z",
    attachments: [],
    comments: [],
    ...overrides,
  };
}

describe("TicketDetailPage — Public Comments (Issue 3-3)", () => {
  // UI-10 (AC-14)
  it("posts a comment and shows it at the bottom of the list immediately", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail());
    vi.spyOn(api, "postComment").mockResolvedValue({
      id: 5,
      author: { id: 1, name: "Alex Rivera", role: "REQUESTER" },
      content: "Still happening today.",
      createdAt: "2026-09-16T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("TK-2026-000001");
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/post a comment/i), "Still happening today.");
    await user.click(screen.getByRole("button", { name: /post comment/i }));

    expect(await screen.findByText("Still happening today.")).toBeInTheDocument();
    expect(screen.queryByText(/no comments yet/i)).not.toBeInTheDocument();
  });

  it("does not submit blank/whitespace-only comments", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail());
    const postSpy = vi.spyOn(api, "postComment");
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("TK-2026-000001");
    await user.type(screen.getByLabelText(/post a comment/i), "   ");
    expect(screen.getByRole("button", { name: /post comment/i })).toBeDisabled();
    expect(postSpy).not.toHaveBeenCalled();
  });
});

describe("TicketDetailPage — Problem Appears Resolved (Issue 3-3, BR-25)", () => {
  // UI-11 (AC-15)
  it('shows a confirmation line after "Mark Problem as Resolved", without changing the status badge', async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail());
    vi.spyOn(api, "markProblemResolved").mockResolvedValue({
      id: 1,
      requesterConfirmedResolvedAt: "2026-09-16T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("TK-2026-000001");
    await user.click(screen.getByRole("button", { name: /mark problem as resolved/i }));

    expect(await screen.findByText(/you indicated this problem appears resolved/i)).toBeInTheDocument();
    // Status badge is unaffected — still "New".
    expect(screen.getByText("New", { selector: ".zg-badge-status-new" })).toBeInTheDocument();
  });

  // UI-12 (BR-25)
  it("does not render the action once the ticket is already Resolved", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail({ currentStatus: "RESOLVED" }));
    renderPage();

    await screen.findByText("TK-2026-000001");
    expect(screen.queryByRole("button", { name: /mark problem as resolved/i })).not.toBeInTheDocument();
  });

  it("shows the already-confirmed message instead of the button once set", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(
      makeTicketDetail({ requesterConfirmedResolvedAt: "2026-09-15T00:00:00.000Z" })
    );
    renderPage();

    await screen.findByText("TK-2026-000001");
    expect(screen.getByText(/you indicated this problem appears resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark problem as resolved/i })).not.toBeInTheDocument();
  });
});

// Not a labsheet-planned test ID — Issue 3-7 found that the Requester's own Cancel action
// (BR-24, backed by PATCH /api/tickets/:id/status since Issue 3-5) never had a frontend control at
// all. Added here alongside the fix, same as this project's convention for other spec-gap additions.
describe("TicketDetailPage — Requester self-Cancel (Issue 3-7, BR-24)", () => {
  it("cancels a New ticket after the inline confirm step, updating the status badge", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail({ currentStatus: "NEW" }));
    vi.spyOn(api, "changeTicketStatus").mockResolvedValue({ id: 1, currentStatus: "CANCELLED", updatedAt: "2026-09-17T00:00:00.000Z" });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("TK-2026-000001");
    await user.click(screen.getByRole("button", { name: /^cancel ticket$/i }));
    expect(screen.getByText(/cancel this ticket\?/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^confirm$/i }));
    expect(await screen.findByText("Cancelled", { selector: ".zg-badge-status-cancelled" })).toBeInTheDocument();
  });

  it("backing out of the confirm step makes no API call", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail({ currentStatus: "OPEN" }));
    const changeSpy = vi.spyOn(api, "changeTicketStatus");
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("TK-2026-000001");
    await user.click(screen.getByRole("button", { name: /^cancel ticket$/i }));
    await user.click(screen.getByRole("button", { name: /keep ticket/i }));

    expect(screen.queryByText(/cancel this ticket\?/i)).not.toBeInTheDocument();
    expect(changeSpy).not.toHaveBeenCalled();
  });

  it("does not render the Cancel action once the ticket is past New/Open", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(makeTicketDetail({ currentStatus: "IN_PROGRESS" }));
    renderPage();

    await screen.findByText("TK-2026-000001");
    expect(screen.queryByRole("button", { name: /^cancel ticket$/i })).not.toBeInTheDocument();
  });
});

// UI-13 (AC-04) — static check: no component or request on this screen can render Note data.
// TicketDetailPage never imports anything Note-related, and its only data source is
// getTicket()'s response shape, which (per api-spec.md §2) never includes a `notes` field for the
// Requester-facing endpoint — that field only exists on the staff endpoint (api-spec.md §6.2).
describe("TicketDetailPage — Internal Notes are never reachable here (Issue 3-3, AC-04)", () => {
  it("renders nothing related to Internal Notes even if the mocked response smuggled a notes field", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue({
      ...makeTicketDetail(),
      // Simulates a hypothetical backend bug leaking notes into this response — the UI must still
      // never render it, since it has no code path that reads a `notes` field at all.
      notes: [{ id: 99, author: { id: 2, name: "Some IT Staffer" }, content: "Internal only!" }],
    } as TicketDetail);
    renderPage();

    await screen.findByText("TK-2026-000001");
    await waitFor(() => {
      expect(screen.queryByText(/internal only/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/some it staffer/i)).not.toBeInTheDocument();
    });
  });
});
