import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import UserManagementPage from "../../src/pages/UserManagementPage.js";
import { AuthProvider } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError, type AdminUser, type User } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/UserManagement.test.tsx (UI-22..26).

const ADMIN_USER: User = {
  id: 1,
  name: "Jamie Whitfield",
  email: "jamie.whitfield@example.edu",
  role: "ADMINISTRATOR",
  isActive: true,
  mustChangePassword: false,
};

function makeUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 2,
    name: "Alex Rivera",
    email: "alex.rivera@example.edu",
    role: "REQUESTER",
    isActive: true,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <UserManagementPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("UserManagementPage", () => {
  beforeEach(() => {
    vi.spyOn(api, "getMe").mockResolvedValue(ADMIN_USER);
  });

  // UI-22 (AC-27)
  it("shows an inline email-field error on a mocked DUPLICATE_EMAIL response", async () => {
    vi.spyOn(api, "getAdminUsers").mockResolvedValue([makeUser()]);
    vi.spyOn(api, "createAdminUser").mockRejectedValue(
      new ApiError({ error: { code: "DUPLICATE_EMAIL", message: "This email is already in use." } })
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /create user/i }));
    await user.type(screen.getByLabelText(/^name$/i), "New Person");
    await user.type(screen.getByLabelText(/^email$/i), "dup@example.test");
    await user.type(screen.getByLabelText(/initial password/i), "a-real-test-password-1");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect((await screen.findAllByText(/this email is already in use/i)).length).toBeGreaterThan(0);
  });

  // UI-23 (AC-29)
  it("disables the Activation toggle, with a tooltip, on the logged-in Administrator's own row", async () => {
    vi.spyOn(api, "getAdminUsers").mockImplementation(async (query) => {
      if (query?.role === "ADMINISTRATOR") return [makeUser({ id: ADMIN_USER.id, name: ADMIN_USER.name, role: "ADMINISTRATOR", isActive: true })];
      return [makeUser({ id: ADMIN_USER.id, name: ADMIN_USER.name, email: ADMIN_USER.email, role: "ADMINISTRATOR", isActive: true })];
    });
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: /edit/i }))[0]);
    const toggle = await screen.findByLabelText(/^active$/i);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("title", expect.stringMatching(/cannot deactivate your own account/i));
  });

  // UI-24 (AC-30)
  it("disables the Activation toggle, with a tooltip, on the last active Administrator's row", async () => {
    const soleAdmin = makeUser({ id: 99, name: "Sole Admin", role: "ADMINISTRATOR", isActive: true });
    vi.spyOn(api, "getAdminUsers").mockImplementation(async (query) => {
      if (query?.role === "ADMINISTRATOR") return [soleAdmin];
      return [soleAdmin];
    });
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: /edit/i }))[0]);
    const toggle = await screen.findByLabelText(/^active$/i);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("title", expect.stringMatching(/at least one active administrator/i));
  });

  it("does NOT disable the Activation toggle for an ordinary user's row", async () => {
    vi.spyOn(api, "getAdminUsers").mockResolvedValue([makeUser({ id: 2, role: "REQUESTER" })]);
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: /edit/i }))[0]);
    const toggle = await screen.findByLabelText(/^active$/i);
    expect(toggle).not.toBeDisabled();
  });

  // UI-27 (BR-32)
  it("renders 'Set New Initial Password' as a separate control from Save", async () => {
    vi.spyOn(api, "getAdminUsers").mockResolvedValue([makeUser({ id: 2, role: "REQUESTER" })]);
    const user = userEvent.setup();
    renderPage();

    await user.click((await screen.findAllByRole("button", { name: /edit/i }))[0]);
    const resetButton = await screen.findByRole("button", { name: /set new initial password/i });
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(resetButton).toBeInTheDocument();
    expect(saveButton).toBeInTheDocument();
    expect(resetButton).not.toBe(saveButton);
    expect(resetButton.getAttribute("type")).toBe("button"); // never submits the main form
  });

  // UI-25 (AC-32)
  it("re-fetches with the search query param when the user types in search", async () => {
    const getAdminUsersSpy = vi.spyOn(api, "getAdminUsers").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/search/i), "rivera");
    await waitFor(() => {
      expect(getAdminUsersSpy).toHaveBeenCalledWith(expect.objectContaining({ search: "rivera" }));
    });
  });

  // UI-26 (AC-33)
  it("re-fetches with the role query param when a role filter is selected", async () => {
    const getAdminUsersSpy = vi.spyOn(api, "getAdminUsers").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/^role$/i), "IT_STAFF");
    await waitFor(() => {
      expect(getAdminUsersSpy).toHaveBeenLastCalledWith(expect.objectContaining({ role: "IT_STAFF" }));
    });
  });

  it("shows the no-results state when a filter is active and nothing matches", async () => {
    vi.spyOn(api, "getAdminUsers").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/search/i), "nobody-like-this");
    expect(await screen.findByText(/no users match your filters/i)).toBeInTheDocument();
  });
});
