import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { changePassword as apiChangePassword, ApiError } from "../api.js";

const MIN_PASSWORD_LENGTH = 8; // mirrors server/src/auth.ts's MIN_PASSWORD_LENGTH (BR-14).

// Issue 3-2 (Lab 3) — mandatory Change Password screen. docs/lab-03/ui-spec.md §4. Rendered by
// App.tsx's gate instead of any other screen whenever the session's mustChangePassword is true
// (BR-13) — there is no way to dismiss or skip it.
export default function ChangePasswordPage() {
  const { setUser } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    // Both checks run independently (not else-if) so a too-short *and* mismatched pair shows both
    // messages together, matching this codebase's established validation convention (server/src/app.ts's
    // Create Ticket route: "every problem is collected so the client can show all field messages from
    // one response, not one-at-a-time") rather than making the user fix one error before seeing the next.
    const errors: { newPassword?: string; confirmPassword?: string } = {};
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.newPassword = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      const updated = await apiChangePassword(newPassword, confirmPassword);
      // BR-15: continues straight into the application — no second login. Updating AuthContext's
      // user (mustChangePassword now false) is what lets App.tsx's gate move past this screen.
      setUser(updated);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unable to update your password. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center py-5" style={{ minHeight: "100vh" }}>
      <div className="card shadow-sm border" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-3">TokTickIT</h1>
          <p className="text-muted small mb-4">
            Your account has an initial password. Choose a new password to continue.
          </p>

          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="new-password" className="form-label fw-semibold">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                className={`form-control${fieldErrors.newPassword ? " is-invalid" : ""}`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
              {fieldErrors.newPassword ? (
                <div className="invalid-feedback">{fieldErrors.newPassword}</div>
              ) : (
                <div className="form-text">At least {MIN_PASSWORD_LENGTH} characters.</div>
              )}
            </div>

            <div className="mb-4">
              <label htmlFor="confirm-password" className="form-label fw-semibold">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                className={`form-control${fieldErrors.confirmPassword ? " is-invalid" : ""}`}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={busy}
                autoComplete="new-password"
              />
              {fieldErrors.confirmPassword && <div className="invalid-feedback">{fieldErrors.confirmPassword}</div>}
            </div>

            <button type="submit" className={`btn btn-zg-primary w-100${busy ? " btn-busy" : ""}`} disabled={busy}>
              {busy ? "Saving…" : "Set Password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
