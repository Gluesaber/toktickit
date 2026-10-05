import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import StaffTicketQueuePage from "../../src/pages/StaffTicketQueuePage.js";
import MyTicketsPage from "../../src/pages/MyTicketsPage.js";
import UserManagementPage from "../../src/pages/UserManagementPage.js";
import App from "../../src/App.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import type { User } from "../../src/api.js";

// docs/lab-04/tests.md §2.9 — client/tests/lab-04/DrillDownFilters.test.tsx (UI-27..30), an
// additional file (tests.md §1): the URL-driven filters (FR-16) change three existing screens.

const STAFF: User = { id: 6, name: "Taylor Brooks", email: "taylor@example.test", role: "IT_STAFF", isActive: true, mustChangePassword: false };
const EMPTY_PAGE = { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false };

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname + location.search}</span>;
}

function renderAt(path: string, element: JSX.Element, user: User = STAFF) {
  vi.spyOn(api, "getMe").mockResolvedValue(user);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => vi.restoreAllMocks());

describe("UI-27: the Ticket Queue opens pre-filtered from a link (FR-16, AC-26)", () => {
  it("sends the link's filters on the first request and shows them in the controls", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([{ id: 1, name: "Hardware" }]);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 6, name: "Taylor Brooks", role: "IT_STAFF" }]);
    const listSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });

    renderAt("/queue?ownerId=unassigned&statusGroup=open&requesterResolved=true", <StaffTicketQueuePage />);

    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0][0]).toMatchObject({ ownerId: "unassigned", statusGroup: "open", requesterResolved: true, page: 1 });
    expect(screen.getByLabelText("Status")).toHaveValue("group:open");
    expect(screen.getByLabelText("Ticket Owner")).toHaveValue("unassigned");
    expect(screen.getByLabelText("Requester says resolved")).toBeChecked();
    expect(screen.getByText("Showing: All open · Unassigned · Requester says resolved")).toBeInTheDocument();
  });

  it("opens 'My open tickets' with the owner shown as me, and writes later changes back to the URL", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([{ id: 6, name: "Taylor Brooks", role: "IT_STAFF" }]);
    const listSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    const user = userEvent.setup();

    renderAt("/queue?ownerId=6&statusGroup=open", <StaffTicketQueuePage />);
    await waitFor(() => expect(listSpy.mock.calls[0][0]).toMatchObject({ ownerId: 6, statusGroup: "open" }));
    expect(await screen.findByRole("option", { name: "Taylor Brooks (me)" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("IT Priority"), "URGENT");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/queue?statusGroup=open&itPriority=URGENT&ownerId=6"));
  });

  it("keeps a page number that came from the link", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getStaffUsers").mockResolvedValue([]);
    const listSpy = vi.spyOn(api, "getStaffTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/queue?currentStatus=RESOLVED&page=3", <StaffTicketQueuePage />);
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0][0]).toMatchObject({ currentStatus: "RESOLVED", page: 3 });
  });
});

describe("UI-28: My Tickets from a link, and bad links (FR-16, AC-27)", () => {
  it("applies the link's filters on the first request", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    const listSpy = vi.spyOn(api, "getTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?statusGroup=open", <MyTicketsPage />, { ...STAFF, role: "REQUESTER" });
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    expect(listSpy.mock.calls[0][0]).toMatchObject({ statusGroup: "open" });
    expect(screen.getByLabelText("Status")).toHaveValue("group:open");
  });

  it("supports the 'last updated' sort the dashboard links to", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    const listSpy = vi.spyOn(api, "getTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?sortBy=updatedAt&sortDir=desc", <MyTicketsPage />, { ...STAFF, role: "REQUESTER" });
    await waitFor(() => expect(listSpy.mock.calls[0][0]).toMatchObject({ sortBy: "updatedAt", sortDir: "desc" }));
    expect(screen.getByLabelText("Sort by")).toHaveValue("updatedAt");
  });

  it("drops unrecognised values with a notice instead of an error, keeping the valid ones", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    const listSpy = vi.spyOn(api, "getTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets?currentStatus=NOT_A_STATUS&sortBy=colour&search=vpn", <MyTicketsPage />, { ...STAFF, role: "REQUESTER" });
    expect(await screen.findByText("Some filters in the link were not recognized and were cleared.")).toBeInTheDocument();
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    const query = listSpy.mock.calls[0][0];
    expect(query.currentStatus).toBeUndefined();
    expect(query.sortBy).toBe("createdAt");
    expect(query.search).toBe("vpn");
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/tickets?search=vpn"));
  });

  // The app runs under React StrictMode, which runs effects twice on first load — the URL sync must
  // still keep the notice (an earlier version of src/urlFilters.ts lost it exactly this way).
  it("keeps the notice under StrictMode too", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    vi.spyOn(api, "getTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    vi.spyOn(api, "getMe").mockResolvedValue({ ...STAFF, role: "REQUESTER" });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/tickets?currentStatus=NOT_A_STATUS&search=vpn"]}>
          <AuthProvider>
            <Routes>
              <Route path="*" element={<MyTicketsPage />} />
            </Routes>
            <LocationProbe />
          </AuthProvider>
        </MemoryRouter>
      </StrictMode>
    );
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/tickets?search=vpn"));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Some filters in the link were not recognized and were cleared.")).toBeInTheDocument();
  });

  it("offers every status, plus All open (the Lab 2 filter only had New)", async () => {
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);
    vi.spyOn(api, "getTickets").mockResolvedValue({ data: [], pagination: EMPTY_PAGE });
    renderAt("/tickets", <MyTicketsPage />, { ...STAFF, role: "REQUESTER" });
    const options = within(await screen.findByLabelText("Status")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["All", "All open", "New", "Open", "In Progress", "Waiting for Requester", "Resolved", "Closed", "Cancelled", "Reopened"]);
  });
});

describe("UI-29: Dashboard navigation and landing (FR-15, AC-41)", () => {
  it.each([
    ["REQUESTER", ["Dashboard", "My Tickets", "Create Ticket"]],
    ["IT_STAFF", ["Dashboard", "Ticket Queue"]],
    ["ADMINISTRATOR", ["Dashboard", "Ticket Queue", "User Management"]],
  ] as const)("%s lands on /dashboard with Dashboard first and marked current", async (role, links) => {
    vi.spyOn(api, "getMe").mockResolvedValue({ ...STAFF, role });
    vi.spyOn(api, "getRequesterDashboard").mockRejectedValue(new Error("not under test"));
    vi.spyOn(api, "getStaffDashboard").mockRejectedValue(new Error("not under test"));
    window.history.pushState({}, "", "/");
    render(<App />);

    const nav = await screen.findByRole("navigation", { name: "Primary" });
    const names = within(nav).getAllByRole("link").map((l) => l.textContent);
    expect(names).toEqual(links);
    await waitFor(() => expect(window.location.pathname).toBe("/dashboard"));
    expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Dashboard", level: 1 })).toBeInTheDocument();
  });
});

describe("UI-30: User Management from a link (FR-16)", () => {
  it("fetches with the link's role filter and shows it selected", async () => {
    const listSpy = vi.spyOn(api, "getAdminUsers").mockResolvedValue([]);
    renderAt("/admin/users?role=IT_STAFF", <UserManagementPage />, { ...STAFF, role: "ADMINISTRATOR" });
    await waitFor(() => expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ role: "IT_STAFF" })));
    expect(screen.getByLabelText("Role")).toHaveValue("IT_STAFF");
  });
});
