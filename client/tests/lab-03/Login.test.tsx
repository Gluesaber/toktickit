import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "../../src/pages/LoginPage.js";
import App from "../../src/App.js";
import { AuthProvider, useAuth } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type User } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/Login.test.tsx (UI-01..06).

function renderLogin() {
  return render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}

beforeEach(() => {
  // AuthProvider always calls getMe() on mount to restore any existing session; unmocked in most
  // of these tests since Login itself doesn't depend on the outcome.
  vi.spyOn(api, "getMe").mockResolvedValue(null);
});

describe("LoginPage", () => {
  it("blocks submission with blank email/password and makes no API call", async () => {
    const loginSpy = vi.spyOn(api, "login");
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
    expect(loginSpy).not.toHaveBeenCalled();
  });

  // UI-03 — generic invalid-credentials message, not attached to a specific field.
  it("shows the generic invalid-credentials message on a mocked INVALID_CREDENTIALS response", async () => {
    vi.spyOn(api, "login").mockRejectedValue(
      new ApiError({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } })
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "someone@example.test");
    await user.type(screen.getByLabelText(/password/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    const banner = await screen.findByText("Invalid email or password.");
    expect(banner.closest(".alert-danger")).toBeInTheDocument();
    // Not rendered as a field-level error next to either input.
    expect(screen.queryByText("Invalid email or password.", { selector: ".invalid-feedback" })).not.toBeInTheDocument();
  });

  // UI-01 (AC-05) — distinct message for an inactive account.
  it("shows a distinct message on a mocked ACCOUNT_INACTIVE response", async () => {
    vi.spyOn(api, "login").mockRejectedValue(
      new ApiError({ error: { code: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact an administrator." } })
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "inactive@example.test");
    await user.type(screen.getByLabelText(/password/i), "correct-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/this account is inactive/i)).toBeInTheDocument();
  });

  // UI-04 (AC-11-equivalent busy state)
  it("shows a busy state on submit and disables the button while the request is in flight", async () => {
    let resolveLogin!: (value: User) => void;
    vi.spyOn(api, "login").mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/email/i), "someone@example.test");
    await user.type(screen.getByLabelText(/password/i), "a-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    const button = screen.getByRole("button", { name: /logging in/i });
    expect(button).toBeDisabled();

    // Resolve and wait for the resulting state updates (LoginPage's setBusy(false), AuthContext's
    // setUser) to flush before the test ends — otherwise React warns that an update happened outside
    // act() once the mock promise settles after this test function has already returned.
    resolveLogin({ id: 1, name: "Someone", email: "someone@example.test", role: "REQUESTER", isActive: true, mustChangePassword: false });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^log in$/i })).toBeInTheDocument();
    });
  });

  // UI-05 (AC-06) — successful login with mustChangePassword: true routes past Login (verified via
  // the exposed status/user from useAuth, since the redirect itself lives in App.tsx's gate).
  it("updates auth state to authenticated on a successful login, even when mustChangePassword is true", async () => {
    vi.spyOn(api, "login").mockResolvedValue({
      id: 1,
      name: "Needs Change",
      email: "needs-change@example.test",
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: true,
    });

    function Probe() {
      const { status, user } = useAuth();
      return <div data-testid="probe">{status}:{user?.mustChangePassword ? "must-change" : "ok"}</div>;
    }

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LoginPage />
        <Probe />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/email/i), "needs-change@example.test");
    await user.type(screen.getByLabelText(/password/i), "initial-password");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent("authenticated:must-change");
    });
  });

});

// UI-06 (Issue 3-4) — role-scoped nav. Was deferred back in Issue 3-2 ("no Queue/User Management
// screens exist yet to scope"); testable now that StaffTicketQueuePage/App.tsx's role-conditional
// routing exist. Rendered against the full App (not LoginPage alone) since the nav lives in
// AppShell, reached through App.tsx's role-conditional routes.
describe("Role-scoped navigation (UI-06)", () => {
  it("shows only My Tickets/Create Ticket for a Requester, never Ticket Queue", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({
      id: 1,
      name: "Alex Rivera",
      email: "alex.rivera@example.edu",
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: false,
    });
    vi.spyOn(api, "getTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    vi.spyOn(api, "getCategories").mockResolvedValue([]);
    vi.spyOn(api, "getRelatedSystems").mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole("link", { name: /my tickets/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create ticket/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ticket queue/i })).not.toBeInTheDocument();
  });

  it("shows only Ticket Queue for IT Staff, never My Tickets/Create Ticket", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({
      id: 2,
      name: "Jordan Lee",
      email: "jordan.lee@example.test",
      role: "IT_STAFF",
      isActive: true,
      mustChangePassword: false,
    });
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    vi.spyOn(api, "getCategories").mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole("link", { name: /ticket queue/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /my tickets/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create ticket/i })).not.toBeInTheDocument();
  });

  it("routes an Administrator to the Ticket Queue too (full IT Staff parity)", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({
      id: 3,
      name: "Jamie Whitfield",
      email: "jamie.whitfield@example.edu",
      role: "ADMINISTRATOR",
      isActive: true,
      mustChangePassword: false,
    });
    vi.spyOn(api, "getStaffTickets").mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    vi.spyOn(api, "getCategories").mockResolvedValue([]);

    render(<App />);

    expect(await screen.findByRole("link", { name: /ticket queue/i })).toBeInTheDocument();
  });
});
