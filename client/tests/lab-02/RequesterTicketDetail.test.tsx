import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TicketDetailPage from "../../src/pages/TicketDetailPage.js";
import { RequesterProvider } from "../../src/context/RequesterContext.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";
import type { Attachment, TicketDetail } from "../../src/api.js";

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

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 1,
    originalFileName: "battery-report.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 182004,
    uploadedAt: "2026-08-24T09:33:00.000Z",
    removedAt: null,
    removalReason: null,
    active: true,
    ...overrides,
  };
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
    // Every *ticket* field is read-only — the only enabled input on the page is the Attachment
    // section's file-add control, which is legitimately interactive (Issue 2-7).
    const enabledInputs = document.querySelectorAll("input:not([disabled])");
    expect(enabledInputs).toHaveLength(1);
    expect(enabledInputs[0]).toHaveAttribute("type", "file");
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

  // UI-17 (AC-23)
  it("shows a removed attachment as Unavailable, with no download link", async () => {
    vi.spyOn(api, "getTicket").mockResolvedValue(
      makeTicketDetail({
        attachments: [
          makeAttachment({
            id: 2,
            originalFileName: "old-screenshot.png",
            active: false,
            removedAt: "2026-08-25T10:00:00.000Z",
            removalReason: "Wrong file",
          }),
        ],
      })
    );
    renderPage();

    expect(await screen.findByText("old-screenshot.png")).toBeInTheDocument();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /old-screenshot\.png/i })).not.toBeInTheDocument();
  });

  // UI-18 (AC-26)
  it("soft-removes an active attachment with a typed reason and reflects the removed state", async () => {
    const activeAttachment = makeAttachment({ id: 3, originalFileName: "receipt.jpg" });
    vi.spyOn(api, "getTicket")
      .mockResolvedValueOnce(makeTicketDetail({ attachments: [activeAttachment] }))
      .mockResolvedValueOnce(
        makeTicketDetail({
          attachments: [
            { ...activeAttachment, active: false, removedAt: "2026-08-26T00:00:00.000Z", removalReason: "Blurry" },
          ],
        })
      );
    const removeSpy = vi.spyOn(api, "removeAttachment").mockResolvedValue({
      ...activeAttachment,
      active: false,
      removedAt: "2026-08-26T00:00:00.000Z",
      removalReason: "Blurry",
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("receipt.jpg");
    await user.click(screen.getByRole("button", { name: /remove/i }));
    await user.type(screen.getByPlaceholderText(/reason/i), "Blurry");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledWith(3, 1, "Blurry");
    });
    expect(await screen.findByText("Unavailable")).toBeInTheDocument();
  });
});
