import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetailPage from "../../src/pages/StaffTicketDetailPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type StaffTicketDetail, type StaffUser, type User } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/StaffTicketDetail.test.tsx (UI-18..21, STYLE-02).

const STAFF_USER: User = {
  id: 10,
  name: "Jordan Lee",
  email: "jordan.lee@example.test",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: false,
};

const OTHER_STAFF: StaffUser = { id: 11, name: "Riley Osei", role: "IT_STAFF" };

function makeDetail(overrides: Partial<StaffTicketDetail> = {}): StaffTicketDetail {
  return {
    id: 42,
    ticketNumber: "TK-2026-000042",
    requester: { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
    owner: null,
    category: { id: 1, name: "Hardware" },
    relatedSystem: { id: 1, name: "Corporate Laptop" },
    summary: "Laptop battery drains quickly",
    description: "The battery drains within two hours of unplugging.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "NEW",
    requesterConfirmedResolvedAt: null,
    createdAt: "2026-08-24T09:00:00.000Z",
    updatedAt: "2026-08-24T09:00:00.000Z",
    attachments: [],
    comments: [],
    notes: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/queue/42"]}>
      <AuthProvider>
        <Routes>
          <Route path="/queue/:id" element={<StaffTicketDetailPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("StaffTicketDetailPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "getMe").mockResolvedValue(STAFF_USER);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: STAFF_USER.id, name: STAFF_USER.name, role: "IT_STAFF" }, OTHER_STAFF]);
  });

  // UI-18 (AC-20)
  it("claiming an unassigned ticket calls PATCH .../owner and updates the Ownership section", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ owner: null }));
    const setOwnerSpy = vi
      .spyOn(api, "setTicketOwner")
      .mockResolvedValue({ id: 42, owner: { id: STAFF_USER.id, name: STAFF_USER.name, role: "IT_STAFF" } });
    const user = userEvent.setup();
    renderPage();

    const claimButton = await screen.findByRole("button", { name: /claim/i });
    await user.click(claimButton);

    await waitFor(() => expect(setOwnerSpy).toHaveBeenCalledWith(42, STAFF_USER.id));
    expect(await screen.findByText(STAFF_USER.name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^claim$/i })).not.toBeInTheDocument();
  });

  // UI-19 (AC-22)
  it("the status control only offers transitions valid from the ticket's current status", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ currentStatus: "NEW" }));
    renderPage();

    const select = await screen.findByLabelText(/change status/i);
    const optionValues = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));

    // NEW's only permitted staff transitions are OPEN and CANCELLED (specification.md §5.2) — no
    // RESOLVED, CLOSED, IN_PROGRESS, etc. should ever appear here.
    expect(optionValues).toEqual(expect.arrayContaining(["OPEN", "CANCELLED"]));
    expect(optionValues).not.toContain("RESOLVED");
    expect(optionValues).not.toContain("CLOSED");
    expect(optionValues).not.toContain("IN_PROGRESS");
  });

  it("offers a different set of transitions once the ticket is In Progress", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ currentStatus: "IN_PROGRESS" }));
    renderPage();

    const select = await screen.findByLabelText(/change status/i);
    const optionValues = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(optionValues).toEqual(expect.arrayContaining(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]));
    expect(optionValues).not.toContain("OPEN");
  });

  // ui-spec.md §11: "verified against specification.md §5.2, not just spot-checked". The matrix below
  // is transcribed from §5.2's staff rows independently of the component's own STAFF_TRANSITIONS
  // table, so a wrong or missing row in the component is caught rather than mirrored.
  const SPEC_STAFF_TRANSITIONS: Record<string, string[]> = {
    NEW: ["OPEN", "CANCELLED"],
    OPEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    RESOLVED: ["CLOSED", "REOPENED"],
    CLOSED: ["REOPENED"],
    CANCELLED: [],
    REOPENED: ["IN_PROGRESS"],
  };

  it.each(Object.entries(SPEC_STAFF_TRANSITIONS))(
    "offers exactly the §5.2 transitions from %s",
    async (from, expected) => {
      vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ currentStatus: from }));
      renderPage();

      if (expected.length === 0) {
        // Cancelled is terminal: no control at all, just the explanatory line.
        expect(await screen.findByText(/no further status changes are available/i)).toBeInTheDocument();
        expect(screen.queryByLabelText(/change status/i)).not.toBeInTheDocument();
        return;
      }

      const select = await screen.findByLabelText(/change status/i);
      const offered = Array.from(select.querySelectorAll("option"))
        .map((o) => o.getAttribute("value"))
        .filter((v): v is string => !!v);
      expect(offered.sort()).toEqual([...expected].sort());
    }
  );

  // UI-20 (AC-22)
  it("shows a safe failure message and leaves the status unchanged on a 409 TRANSITION_NOT_PERMITTED", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ currentStatus: "NEW" }));
    vi.spyOn(api, "changeTicketStatus").mockRejectedValue(
      new ApiError({ error: { code: "TRANSITION_NOT_PERMITTED", message: "That status change isn't permitted right now." } })
    );
    const user = userEvent.setup();
    renderPage();

    const select = await screen.findByLabelText(/change status/i);
    // OPEN doesn't require the inline confirmation step (only Cancelled/Closed/Resolved do), so it
    // submits immediately and the rejection surfaces right away.
    await user.selectOptions(select, "OPEN");

    expect(await screen.findByText(/that status change isn't permitted right now/i)).toBeInTheDocument();
    // Still New — the badge in the Status card wasn't optimistically updated.
    const statusCards = screen.getAllByText("New", { selector: ".zg-badge-status-new" });
    expect(statusCards.length).toBeGreaterThan(0);
  });

  // UI-21
  it("renders Internal Notes in a visually distinct card from Public Comments", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(
      makeDetail({
        comments: [{ id: 1, author: { id: 1, name: "Alex Rivera", role: "REQUESTER" }, content: "Still happening.", createdAt: "2026-08-24T10:00:00.000Z" }],
        notes: [{ id: 1, author: { id: STAFF_USER.id, name: STAFF_USER.name, role: "IT_STAFF" }, content: "Vendor ticket opened.", createdAt: "2026-08-24T10:05:00.000Z" }],
      })
    );
    renderPage();

    const commentsHeading = await screen.findByRole("heading", { name: /^comments$/i });
    const notesHeading = await screen.findByRole("heading", { name: /internal notes/i });

    const commentsCard = commentsHeading.closest(".card");
    const notesCard = notesHeading.closest(".card");
    expect(commentsCard).not.toBeNull();
    expect(notesCard).not.toBeNull();
    expect(notesCard).toHaveClass("internal-notes-card");
    expect(commentsCard).not.toHaveClass("internal-notes-card");
    expect(screen.getByText(/internal — it staff\/administrator only/i)).toBeInTheDocument();
  });

  // STYLE-02
  it("renders Requested Priority as a read-only badge and IT Priority as an editable control, with distinguishable classes", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ requestedPriority: "LOW", itPriority: "HIGH" }));
    renderPage();

    // Requested Priority: the same read-only badge class used everywhere else in the app (shown in
    // both the header block and the Priority card, so multiple matches are expected here).
    expect((await screen.findAllByText("Low", { selector: ".zg-badge-priority-low" })).length).toBeGreaterThan(0);
    // IT Priority: an actual form control, not a badge — the editable/read-only contrast rule.
    const itPrioritySelect = screen.getByLabelText(/it priority/i);
    expect(itPrioritySelect.tagName).toBe("SELECT");
    expect((itPrioritySelect as HTMLSelectElement).value).toBe("HIGH");
  });
});
