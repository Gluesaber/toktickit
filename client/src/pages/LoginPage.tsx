import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext.js";
import { ApiError } from "../api.js";

// Issue 3-2 (Lab 3) — Login screen. docs/lab-03/ui-spec.md §3. Replaces the Development Requester
// Selection screen (docs/lab-02/ui-spec.md §3) as the app's entry point.
export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function validate(): boolean {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) errors.email = "Email is required.";
    if (!password) errors.password = "Password is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      await login(email.trim(), password);
      // No further action needed on success: App.tsx's gate re-renders once AuthContext's `user`
      // updates, routing to Change Password or the main app as appropriate.
    } catch (err) {
      // BR-07/BR-08: the backend already distinguishes INVALID_CREDENTIALS from ACCOUNT_INACTIVE
      // with different message text — this screen just surfaces whichever one came back, rather
      // than re-deciding the wording itself.
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Unable to log in. Please try again.");
      }
      setPassword(""); // never retain a password across a failed submission
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center py-5" style={{ minHeight: "100vh" }}>
      <div className="card shadow-sm border" style={{ maxWidth: 420, width: "100%" }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-3">TokTickIT</h1>

          {formError && (
            <div className="alert alert-danger" role="alert">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-3">
              <label htmlFor="login-email" className="form-label fw-semibold">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                className={`form-control${fieldErrors.email ? " is-invalid" : ""}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                autoComplete="username"
              />
              {fieldErrors.email && <div className="invalid-feedback">{fieldErrors.email}</div>}
            </div>

            <div className="mb-4">
              <label htmlFor="login-password" className="form-label fw-semibold">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                className={`form-control${fieldErrors.password ? " is-invalid" : ""}`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                autoComplete="current-password"
              />
              {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
            </div>

            <button type="submit" className={`btn btn-zg-primary w-100${busy ? " btn-busy" : ""}`} disabled={busy}>
              {busy ? "Logging in…" : "Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
