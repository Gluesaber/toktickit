import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StaffTicketDetailPage from "../../src/pages/StaffTicketDetailPage.js";
import TicketDetailPage from "../../src/pages/TicketDetailPage.js";
import StatusHistorySection from "../../src/components/StatusHistorySection.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type ActionTaken, type StaffTicketDetail, type TicketDetail, type User } from "../../src/api.js";

// docs/lab-04/tests.md §2.9 — client/tests/lab-04/TicketWorkflow.test.tsx (UI-20..26). Drives the
// real Ticket Detail pages with the API mocked, so the status control, gate, indication pill,
// stale-update banner and timeline are checked as the user sees them.

const STAFF_USER: User = {
  id: 10,
  name: "Taylor Brooks",
  email: "taylor.brooks@example.test",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: false,
};

const COMPLETED_ACTION: ActionTaken = {
  id: 1,
  ticketId: 42,
  actionAt: "2026-01-06T09:00:00.000Z",
  description: "Replaced the RAM.",
  result: "Boots normally.",
  status: "COMPLETED",
  performedBy: { id: 10, name: "Taylor Brooks", role: "IT_STAFF" },
  assignee: { id: 10, name: "Taylor Brooks", role: "IT_STAFF", isActive: true },
  followUpRequired: false,
  followUpNote: null,
  attachmentNotes: null,
  version: 1,
  updatedBy: null,
  createdAt: "2026-01-06T09:00:00.000Z",
  updatedAt: "2026-01-06T09:00:00.000Z",
};

function makeDetail(overrides: Partial<StaffTicketDetail> = {}): StaffTicketDetail {
  return {
    id: 42,
    ticketNumber: "TK-2026-000042",
    requester: { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
    owner: null,
    category: { id: 1, name: "Hardware" },
    relatedSystem: { id: 1, name: "Corporate Laptop" },
    summary: "Laptop crashes on wake",
    description: "Blue screen after sleep.",
    requestedPriority: "MEDIUM",
    itPriority: "MEDIUM",
    currentStatus: "IN_PROGRESS",
    requesterConfirmedResolvedAt: null,
    version: 5,
    createdAt: "2026-01-05T08:00:00.000Z",
    updatedAt: "2026-01-06T09:00:00.000Z",
    attachments: [],
    comments: [],
    notes: [],
    actions: [],
    statusHistory: [
      { id: 1, fromStatus: null, toStatus: "NEW", changedBy: { id: 1, name: "Alex Rivera", role: "REQUESTER" }, changedAt: "2026-01-05T08:00:00.000Z" },
      { id: 2, fromStatus: "NEW", toStatus: "OPEN", changedBy: { id: 10, name: "Taylor Brooks", role: "IT_STAFF" }, changedAt: "2026-01-05T09:00:00.000Z" },
      { id: 3, fromStatus: "OPEN", toStatus: "IN_PROGRESS", changedBy: { id: 10, name: "Taylor Brooks", role: "IT_STAFF" }, changedAt: "2026-01-05T10:00:00.000Z" },
    ],
    ...overrides,
  };
}

function renderStaffPage() {
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

function statusSelect() {
  return screen.findByLabelText(/change status/i) as Promise<HTMLSelectElement>;
}

function historyCard() {
  return screen.getByRole("heading", { name: "Status History" }).closest(".card") as HTMLElement;
}

beforeEach(() => {
  vi.spyOn(api, "getMe").mockResolvedValue(STAFF_USER);
  vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 10, name: "Taylor Brooks", role: "IT_STAFF" }]);
});
afterEach(() => vi.restoreAllMocks());

describe("UI-20: the resolution gate in the status control (AC-17, FR-07)", () => {
  it("lists Resolved but disabled, with the reason as visible text, until a Completed Action exists", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(
      makeDetail({ actions: [{ ...COMPLETED_ACTION, status: "PLANNED", result: null }] })
    );
    renderStaffPage();
    const select = await statusSelect();
    const resolved = within(select).getByRole("option", { name: /resolved/i }) as HTMLOptionElement;
    expect(resolved.disabled).toBe(true);
    const reason = screen.getByText("Record at least one completed action before resolving.");
    expect(select).toHaveAttribute("aria-describedby", reason.id);
  });

  it("enables Resolved once the Ticket has a Completed Action", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ actions: [COMPLETED_ACTION] }));
    renderStaffPage();
    const select = await statusSelect();
    expect((within(select).getByRole("option", { name: "Resolved" }) as HTMLOptionElement).disabled).toBe(false);
    expect(screen.queryByText("Record at least one completed action before resolving.")).not.toBeInTheDocument();
  });
});

describe("UI-21: offered transitions match the final matrix (AC-18)", () => {
  // docs/lab-04/specification.md §5.2 staff rows, transcribed independently of the component.
  const SPEC: Record<string, string[]> = {
    NEW: ["OPEN", "CANCELLED"],
    OPEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
    RESOLVED: ["CLOSED", "REOPENED"],
    CLOSED: ["REOPENED"],
    CANCELLED: [],
    REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  };

  it.each(Object.entries(SPEC))("from %s", async (from, expected) => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ currentStatus: from, actions: [COMPLETED_ACTION] }));
    renderStaffPage();
    if (expected.length === 0) {
      expect(await screen.findByText(/no further status changes are available/i)).toBeInTheDocument();
      return;
    }
    const select = await statusSelect();
    const offered = Array.from(select.querySelectorAll("option"))
      .map((o) => o.value)
      .filter(Boolean);
    expect(offered.sort()).toEqual([...expected].sort());
  });
});

describe("UI-22: a successful change refreshes the summary in place (FR-08, AC-20)", () => {
  it("updates the badge, clears the Requester indication and appends a history entry, without reloading", async () => {
    const getSpy = vi
      .spyOn(api, "getStaffTicket")
      .mockResolvedValue(makeDetail({ currentStatus: "OPEN", requesterConfirmedResolvedAt: "2026-01-06T12:00:00.000Z", statusHistory: makeDetail().statusHistory.slice(0, 2) }));
    const changeSpy = vi.spyOn(api, "changeTicketStatus").mockResolvedValue({
      id: 42,
      currentStatus: "IN_PROGRESS",
      version: 6,
      updatedAt: "2026-01-07T10:00:00.000Z",
      requesterConfirmedResolvedAt: null,
    });
    const user = userEvent.setup();
    renderStaffPage();

    expect(await screen.findByText(/requester says resolved/i)).toBeInTheDocument();
    await user.selectOptions(await statusSelect(), "IN_PROGRESS");

    await waitFor(() => expect(changeSpy).toHaveBeenCalledWith(42, "IN_PROGRESS", 5));
    await waitFor(() => expect(screen.queryByText(/requester says resolved/i)).not.toBeInTheDocument());
    const entries = within(historyCard()).getAllByRole("listitem");
    expect(entries).toHaveLength(3);
    expect(within(entries[2]).getByText("Taylor Brooks", { exact: false })).toBeInTheDocument();
    expect(within(entries[2]).getByText("In Progress")).toBeInTheDocument();
    expect(getSpy).toHaveBeenCalledTimes(1); // no re-fetch needed
  });
});

describe("UI-23: stale status change (AC-22)", () => {
  it("shows the conflict banner, keeps the pending choice, and Reload re-fetches", async () => {
    const getSpy = vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail());
    vi.spyOn(api, "changeTicketStatus").mockRejectedValue(
      new ApiError({ error: { code: "STALE_UPDATE", message: "This ticket was changed by someone else.", current: {} } })
    );
    const user = userEvent.setup();
    renderStaffPage();

    await user.selectOptions(await statusSelect(), "CANCELLED");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText(/changed by someone else since you opened it/i)).toBeInTheDocument();
    expect(screen.getByText(/set status to/i)).toBeInTheDocument(); // the choice is kept
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload ticket" }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/changed by someone else since you opened it/i)).not.toBeInTheDocument());
    expect(screen.getByText(/set status to/i)).toBeInTheDocument();
  });

  it("shows the gate's reason if the server refuses Resolved", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ actions: [COMPLETED_ACTION] }));
    vi.spyOn(api, "changeTicketStatus").mockRejectedValue(
      new ApiError({ error: { code: "RESOLUTION_REQUIRES_COMPLETED_ACTION", message: "Record at least one completed action before resolving this ticket." } })
    );
    const user = userEvent.setup();
    renderStaffPage();
    await user.selectOptions(await statusSelect(), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("Record at least one completed action before resolving this ticket.")).toBeInTheDocument();
  });
});

describe("UI-24: staff see the Requester's indication (FR-10, AC-20)", () => {
  it("shows the pill with its date next to the status", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail({ requesterConfirmedResolvedAt: "2026-01-06T12:00:00.000Z" }));
    renderStaffPage();
    const pill = await screen.findByText(/requester says resolved/i);
    expect(pill).toHaveClass("zg-requester-indication");
    expect(pill.textContent).toContain(new Date("2026-01-06T12:00:00.000Z").toLocaleString());
  });

  it("shows nothing when the indication isn't set", async () => {
    vi.spyOn(api, "getStaffTicket").mockResolvedValue(makeDetail());
    renderStaffPage();
    await screen.findByText("TK-2026-000042");
    expect(screen.queryByText(/requester says resolved/i)).not.toBeInTheDocument();
  });
});

describe("UI-25: Status History timeline (FR-09, BR-21)", () => {
  it("lists entries oldest first with who and when", () => {
    render(<StatusHistorySection history={makeDetail().statusHistory} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText(/created as/i)).toBeInTheDocument();
    expect(within(items[0]).getByText(/alex rivera/i)).toBeInTheDocument();
    expect(within(items[2]).getByText("In Progress")).toBeInTheDocument();
    expect(screen.queryByText(/was not recorded/i)).not.toBeInTheDocument();
  });

  it("says earlier history wasn't recorded for a legacy Ticket", () => {
    render(<StatusHistorySection history={[]} />);
    expect(screen.getByText(/history before this upgrade was not recorded/i)).toBeInTheDocument();
  });

  it("says so too when the first recorded entry isn't the creation entry", () => {
    render(<StatusHistorySection history={makeDetail().statusHistory.slice(2)} />);
    expect(screen.getByText(/was not recorded/i)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("UI-26: Requester cancel sends the version and handles a stale screen (AC-22, BR-22)", () => {
  function makeRequesterDetail(): TicketDetail {
    const d = makeDetail({ currentStatus: "NEW" });
    return {
      id: d.id,
      ticketNumber: d.ticketNumber,
      requester: d.requester,
      category: d.category,
      relatedSystem: d.relatedSystem,
      summary: d.summary,
      description: d.description,
      requestedPriority: d.requestedPriority,
      currentStatus: "NEW",
      requesterConfirmedResolvedAt: null,
      version: 2,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      attachments: [],
      comments: [],
      actions: [],
      statusHistory: d.statusHistory.slice(0, 1),
    };
  }

  it("shows IT's update message with Reload when the ticket changed underneath", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({ ...STAFF_USER, id: 1, role: "REQUESTER", name: "Alex Rivera" });
    const getSpy = vi.spyOn(api, "getTicket").mockResolvedValue(makeRequesterDetail());
    const changeSpy = vi.spyOn(api, "changeTicketStatus").mockRejectedValue(
      new ApiError({ error: { code: "STALE_UPDATE", message: "This ticket was changed by someone else.", current: {} } })
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tickets/42"]}>
        <AuthProvider>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await user.click(await screen.findByRole("button", { name: /^cancel ticket$/i }));
    await user.click(screen.getByRole("button", { name: /^confirm$/i }));

    expect(changeSpy).toHaveBeenCalledWith(42, "CANCELLED", 2);
    expect(await screen.findByText("This ticket was just updated by IT. Reload to see the latest.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload ticket" }));
    await waitFor(() => expect(getSpy).toHaveBeenCalledTimes(2));
  });
});

// Not a separately planned ID — found by E2E-03 during Issue 4-4 (docs/lab-04/tests.md §7). Under
// React StrictMode the page loads its Ticket twice; a load that finishes *after* the user acted must
// not undo that action.
describe("A late Ticket fetch never overwrites a newer local change (FR-11 hardening)", () => {
  it("keeps 'appears resolved' when the slower of two initial loads lands after the click", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({ ...STAFF_USER, id: 1, role: "REQUESTER", name: "Alex Rivera" });
    const base: TicketDetail = {
      id: 42,
      ticketNumber: "TK-2026-000042",
      requester: { id: 1, name: "Alex Rivera", email: "alex.rivera@example.edu" },
      category: { id: 1, name: "Hardware" },
      relatedSystem: { id: 1, name: "Corporate Laptop" },
      summary: "Laptop crashes on wake",
      description: "Blue screen after sleep.",
      requestedPriority: "MEDIUM",
      currentStatus: "OPEN",
      requesterConfirmedResolvedAt: null,
      version: 2,
      createdAt: "2026-01-05T08:00:00.000Z",
      updatedAt: "2026-01-05T08:00:00.000Z",
      attachments: [],
      comments: [],
      actions: [],
      statusHistory: [],
    };
    // StrictMode runs the load effect twice: the first fetch is held back, the second answers.
    let releaseSlowLoad: (t: TicketDetail) => void = () => undefined;
    vi.spyOn(api, "getTicket")
      .mockImplementationOnce(() => new Promise((resolve) => (releaseSlowLoad = resolve)))
      .mockResolvedValueOnce(base);
    vi.spyOn(api, "markProblemResolved").mockResolvedValue({ id: 42, requesterConfirmedResolvedAt: "2026-01-07T10:00:00.000Z" });
    const user = userEvent.setup();
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/tickets/42"]}>
          <AuthProvider>
            <Routes>
              <Route path="/tickets/:id" element={<TicketDetailPage />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>
    );

    await user.click(await screen.findByRole("button", { name: "Mark Problem as Resolved" }));
    expect(await screen.findByText(/you indicated this problem appears resolved/i)).toBeInTheDocument();

    // Now the older fetch finally lands, carrying the pre-click state. It must be ignored.
    releaseSlowLoad(base);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText(/you indicated this problem appears resolved/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Problem as Resolved" })).not.toBeInTheDocument();
  });
});
