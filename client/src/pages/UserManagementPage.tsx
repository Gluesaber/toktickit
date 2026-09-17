import { FormEvent, useEffect, useState } from "react";
import {
  AdminUser,
  ApiError,
  Role,
  createAdminUser,
  editAdminUser,
  getAdminUsers,
  resetUserPassword,
} from "../api.js";
import { RoleBadge } from "../components/Badges.js";
import { useAuth } from "../context/AuthContext.js";

// Issue 3-6 (Lab 3) — the minimalist Administrator User Management screen. docs/lab-03/ui-spec.md
// §8, specification.md FR-17..FR-21. No pagination (labsheet §4.2 exclusion) — the full matching
// set is always shown.
type ListState = "loading" | "ready" | "failure";
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "REQUESTER", label: "Requester" },
  { value: "IT_STAFF", label: "IT Staff" },
  { value: "ADMINISTRATOR", label: "Administrator" },
];

interface FormState {
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  initialPassword: string;
}

const EMPTY_FORM: FormState = { name: "", email: "", role: "REQUESTER", isActive: true, initialPassword: "" };

export default function UserManagementPage() {
  const { user: currentUser } = useAuth();

  const [listState, setListState] = useState<ListState>("loading");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");

  // Fetched separately from the (possibly filtered/searched) main list, so "is this the last active
  // Administrator" is always computed against the real system-wide roster — never undercounted just
  // because a search/role filter happens to be hiding some other active Administrator row right now.
  const [activeAdminCount, setActiveAdminCount] = useState<number | null>(null);

  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The on-disk row being edited, captured once when the modal opens — the activation-lock check
  // (BR-34/BR-35) is about the real stored state, not the form's not-yet-saved pending edits.
  const [editingTarget, setEditingTarget] = useState<AdminUser | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formFieldErrors, setFormFieldErrors] = useState<Record<string, string>>({});

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  async function loadRoster() {
    try {
      const admins = await getAdminUsers({ role: "ADMINISTRATOR" });
      setActiveAdminCount(admins.filter((u) => u.isActive).length);
    } catch {
      setActiveAdminCount(null); // fails safe below: unknown count disables no toggle by omission
    }
  }

  async function load() {
    setListState("loading");
    try {
      const result = await getAdminUsers({
        search: debouncedSearch || undefined,
        role: roleFilter || undefined,
      });
      setUsers(result);
      setListState("ready");
    } catch {
      setListState("failure");
    }
  }

  useEffect(() => {
    loadRoster();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, roleFilter]);

  const hasActiveFilters = Boolean(debouncedSearch || roleFilter);

  function clearFilters() {
    setSearchInput("");
    setRoleFilter("");
  }

  // ui-spec.md §8.2: the Activation toggle is disabled, with a tooltip, for the logged-in
  // Administrator's own row (BR-34) and for the last remaining active Administrator's row (BR-35),
  // regardless of who's viewing it.
  function activationLockReason(target: AdminUser): string | null {
    if (currentUser && target.id === currentUser.id) {
      return "You cannot deactivate your own account.";
    }
    if (target.role === "ADMINISTRATOR" && target.isActive && activeAdminCount !== null && activeAdminCount <= 1) {
      return "At least one active Administrator must remain.";
    }
    return null;
  }

  function openCreate() {
    setModalMode("create");
    setEditingId(null);
    setEditingTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormFieldErrors({});
  }

  function openEdit(target: AdminUser) {
    setModalMode("edit");
    setEditingId(target.id);
    setEditingTarget(target);
    setForm({ name: target.name, email: target.email, role: target.role, isActive: target.isActive, initialPassword: "" });
    setFormError(null);
    setFormFieldErrors({});
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
    setEditingTarget(null);
  }

  const editingLockReason = editingTarget ? activationLockReason(editingTarget) : null;

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setFormBusy(true);
    setFormError(null);
    setFormFieldErrors({});
    try {
      if (modalMode === "create") {
        await createAdminUser({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
          initialPassword: form.initialPassword,
        });
      } else if (modalMode === "edit" && editingId !== null) {
        await editAdminUser(editingId, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          isActive: form.isActive,
        });
      }
      closeModal();
      await Promise.all([load(), loadRoster()]);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
        if (err.fields) setFormFieldErrors(err.fields);
        if (err.code === "DUPLICATE_EMAIL") setFormFieldErrors((f) => ({ ...f, email: err.message }));
      } else {
        setFormError("Unable to save this user.");
      }
    } finally {
      setFormBusy(false);
    }
  }

  function openResetPassword(target: AdminUser) {
    setResetTarget(target);
    setResetPassword("");
    setResetError(null);
    setResetDone(false);
  }

  function closeResetPassword() {
    setResetTarget(null);
  }

  async function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    setResetError(null);
    try {
      await resetUserPassword(resetTarget.id, resetPassword);
      setResetDone(true);
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : "Unable to reset this user's password.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div>
      <h1 className="h4 mb-4">User Management</h1>

      <div className="row g-2 mb-3 align-items-end">
        <div className="col-md-4">
          <label htmlFor="user-search" className="form-label small fw-semibold">
            Search
          </label>
          <input
            id="user-search"
            type="text"
            className="form-control"
            placeholder="Name or email"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div className="col-6 col-md-3">
          <label htmlFor="user-role-filter" className="form-label small fw-semibold">
            Role
          </label>
          <select
            id="user-role-filter"
            className="form-select"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as Role | "")}
          >
            <option value="">All</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <button type="button" className="btn btn-zg-primary w-100" onClick={openCreate}>
            Create User
          </button>
        </div>
        {hasActiveFilters && (
          <div className="col-12">
            <button type="button" className="btn btn-link p-0" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {listState === "loading" && <p className="text-muted">Loading users…</p>}

      {listState === "failure" && (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">Unable to load users. Try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
            Retry
          </button>
        </div>
      )}

      {listState === "ready" && users.length === 0 && !hasActiveFilters && (
        <div className="alert alert-info" role="status">
          No users yet.
        </div>
      )}

      {listState === "ready" && users.length === 0 && hasActiveFilters && (
        <div className="alert alert-warning" role="status">
          <p className="mb-2">No users match your filters.</p>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {listState === "ready" && users.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Edit</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <RoleBadge role={u.role} />
                    </td>
                    <td>
                      <span className={`zg-status-pill ${u.isActive ? "zg-status-pill-active" : "zg-status-pill-inactive"}`}>
                        {u.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="d-md-none">
            {users.map((u) => (
              <div className="ticket-card" key={u.id}>
                <div className="d-flex justify-content-between align-items-start mb-1">
                  <span className="fw-semibold">{u.name}</span>
                  <span className={`zg-status-pill ${u.isActive ? "zg-status-pill-active" : "zg-status-pill-inactive"}`}>
                    {u.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="small text-muted mb-2">{u.email}</div>
                <div className="d-flex justify-content-between align-items-center">
                  <RoleBadge role={u.role} />
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => openEdit(u)}>
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit — ui-spec.md §8.1: modal, not a full navigation away from the list. No
          bootstrap.bundle.js in this project (see main.tsx), so shown/hidden purely via React state
          rather than data-bs-* attributes. */}
      {modalMode && (
        <div className="modal d-block" tabIndex={-1} role="dialog" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              <form onSubmit={handleFormSubmit}>
                <div className="modal-header">
                  <h2 className="modal-title h5">{modalMode === "create" ? "Create User" : "Edit User"}</h2>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeModal} disabled={formBusy} />
                </div>
                <div className="modal-body">
                  {formError && (
                    <div className="alert alert-danger py-2" role="alert">
                      {formError}
                    </div>
                  )}
                  <div className="mb-3">
                    <label htmlFor="user-form-name" className="form-label small fw-semibold">
                      Name
                    </label>
                    <input
                      id="user-form-name"
                      type="text"
                      className={`form-control${formFieldErrors.name ? " is-invalid" : ""}`}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      disabled={formBusy}
                    />
                    {formFieldErrors.name && <div className="invalid-feedback">{formFieldErrors.name}</div>}
                  </div>
                  <div className="mb-3">
                    <label htmlFor="user-form-email" className="form-label small fw-semibold">
                      Email
                    </label>
                    <input
                      id="user-form-email"
                      type="email"
                      className={`form-control${formFieldErrors.email ? " is-invalid" : ""}`}
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      disabled={formBusy}
                    />
                    {formFieldErrors.email && <div className="invalid-feedback">{formFieldErrors.email}</div>}
                  </div>
                  <div className="mb-3">
                    <label htmlFor="user-form-role" className="form-label small fw-semibold">
                      Role
                    </label>
                    <select
                      id="user-form-role"
                      className={`form-select${formFieldErrors.role ? " is-invalid" : ""}`}
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                      disabled={formBusy}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    {formFieldErrors.role && <div className="invalid-feedback">{formFieldErrors.role}</div>}
                  </div>
                  <div className="mb-3 form-check">
                    <input
                      id="user-form-active"
                      type="checkbox"
                      className="form-check-input"
                      checked={form.isActive}
                      disabled={formBusy || editingLockReason !== null}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                      title={editingLockReason ?? undefined}
                    />
                    {editingLockReason && <div className="form-text">{editingLockReason}</div>}
                    <label htmlFor="user-form-active" className="form-check-label small fw-semibold">
                      Active
                    </label>
                  </div>
                  {modalMode === "create" && (
                    <div className="mb-3">
                      <label htmlFor="user-form-password" className="form-label small fw-semibold">
                        Initial Password
                      </label>
                      <input
                        id="user-form-password"
                        type="text"
                        className={`form-control${formFieldErrors.initialPassword ? " is-invalid" : ""}`}
                        value={form.initialPassword}
                        onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
                        disabled={formBusy}
                      />
                      {formFieldErrors.initialPassword && <div className="invalid-feedback">{formFieldErrors.initialPassword}</div>}
                      <div className="form-text">The new user must change this password on first login.</div>
                    </div>
                  )}
                  {modalMode === "edit" && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled={formBusy}
                      onClick={() => {
                        const target = users.find((u) => u.id === editingId);
                        if (target) {
                          closeModal();
                          openResetPassword(target);
                        }
                      }}
                    >
                      Set New Initial Password
                    </button>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeModal} disabled={formBusy}>
                    Cancel
                  </button>
                  <button type="submit" className={`btn btn-zg-primary btn-sm${formBusy ? " btn-busy" : ""}`} disabled={formBusy}>
                    {formBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Set New Initial Password — a distinct action from the main Save button (BR-32/ui-spec.md
          §8.1), so an Administrator can't accidentally reset a password while fixing a typo. */}
      {resetTarget && (
        <div className="modal d-block" tabIndex={-1} role="dialog" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog" role="document">
            <div className="modal-content">
              {resetDone ? (
                <>
                  <div className="modal-header">
                    <h2 className="modal-title h5">Password Reset</h2>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeResetPassword} />
                  </div>
                  <div className="modal-body">
                    <p className="mb-0">
                      {resetTarget.name}'s password has been reset. They will be required to change it at next login.
                    </p>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-zg-primary btn-sm" onClick={closeResetPassword}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handleResetSubmit}>
                  <div className="modal-header">
                    <h2 className="modal-title h5">Set New Initial Password — {resetTarget.name}</h2>
                    <button type="button" className="btn-close" aria-label="Close" onClick={closeResetPassword} disabled={resetBusy} />
                  </div>
                  <div className="modal-body">
                    {resetError && (
                      <div className="alert alert-danger py-2" role="alert">
                        {resetError}
                      </div>
                    )}
                    <label htmlFor="reset-password-input" className="form-label small fw-semibold">
                      New Initial Password
                    </label>
                    <input
                      id="reset-password-input"
                      type="text"
                      className="form-control"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      disabled={resetBusy}
                    />
                    <div className="form-text">This user will be required to change it at next login.</div>
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeResetPassword} disabled={resetBusy}>
                      Cancel
                    </button>
                    <button type="submit" className={`btn btn-zg-primary btn-sm${resetBusy ? " btn-busy" : ""}`} disabled={resetBusy || !resetPassword}>
                      {resetBusy ? "Saving…" : "Set Password"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
