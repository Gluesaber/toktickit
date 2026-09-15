import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChangePasswordPage from "../../src/pages/ChangePasswordPage.js";
import { AuthProvider, useAuth } from "../../src/context/AuthContext.js";
import * as api from "../../src/api.js";
import { ApiError } from "../../src/api.js";

// docs/lab-03/tests.md — client/tests/lab-03/ChangePassword.test.tsx (UI-07..09).

function renderChangePassword() {
  vi.spyOn(api, "getMe").mockResolvedValue(null);
  return render(
    <AuthProvider>
      <ChangePasswordPage />
    </AuthProvider>
  );
}

describe("ChangePasswordPage", () => {
  it("UI-07: blocks a new password under 8 characters and makes no API call", async () => {
    const spy = vi.spyOn(api, "changePassword");
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(screen.getByLabelText(/^new password$/i), "short1");
    await user.type(screen.getByLabelText(/confirm new password/i), "short1");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("UI-08: blocks a mismatched confirmation and makes no API call", async () => {
    const spy = vi.spyOn(api, "changePassword");
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(screen.getByLabelText(/^new password$/i), "a-long-enough-password");
    await user.type(screen.getByLabelText(/confirm new password/i), "does-not-match-at-all");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it("UI-09: on a mocked success, updates auth state to mustChangePassword=false without a second login", async () => {
    vi.spyOn(api, "changePassword").mockResolvedValue({
      id: 1,
      name: "Someone",
      email: "someone@example.test",
      role: "REQUESTER",
      isActive: true,
      mustChangePassword: false,
    });

    function Probe() {
      const { user } = useAuth();
      return <div data-testid="probe">{user?.mustChangePassword ? "must-change" : "ok"}</div>;
    }

    vi.spyOn(api, "getMe").mockResolvedValue(null);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ChangePasswordPage />
        <Probe />
      </AuthProvider>
    );

    await user.type(screen.getByLabelText(/^new password$/i), "a-brand-new-password");
    await user.type(screen.getByLabelText(/confirm new password/i), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    await waitFor(() => {
      expect(screen.getByTestId("probe")).toHaveTextContent("ok");
    });
  });

  it("shows a safe failure message on a mocked API error", async () => {
    vi.spyOn(api, "changePassword").mockRejectedValue(
      new ApiError({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } })
    );
    const user = userEvent.setup();
    renderChangePassword();

    await user.type(screen.getByLabelText(/^new password$/i), "a-brand-new-password");
    await user.type(screen.getByLabelText(/confirm new password/i), "a-brand-new-password");
    await user.click(screen.getByRole("button", { name: /set password/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
  });
});
