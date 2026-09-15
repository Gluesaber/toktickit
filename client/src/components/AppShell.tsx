import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { RoleBadge } from "./Badges.js";

// Issue 2-3 (Lab 2) — application shell: identity + nav. docs/lab-02/ui-spec.md §2.
// Issue 3-2 (Lab 3) — FR-05/FR-06: authenticated user's name/role + Logout.
// Issue 3-3 (Lab 3) — the Dev Requester chip/"Change Requester" action (the accepted intermediate
// duplication from Issue 3-2) is removed: the authenticated identity above is now the only one,
// since RequesterContext/DevRequesterSelector no longer exist (BR-39).
export default function AppShell() {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `app-nav-link${isActive ? " active" : ""}`;

  return (
    <div>
      <header className="app-header text-white">
        <div className="container d-flex flex-wrap align-items-center justify-content-between py-2 gap-2">
          <div className="d-flex align-items-center gap-3">
            <span className="fw-bold fs-5">TokTickIT</span>
            <button
              type="button"
              className="btn btn-sm btn-outline-light d-lg-none"
              aria-expanded={navOpen}
              aria-controls="app-nav-collapse"
              aria-label="Toggle navigation"
              onClick={() => setNavOpen((open) => !open)}
            >
              Menu
            </button>
          </div>

          <nav
            id="app-nav-collapse"
            className={`d-lg-flex gap-1 ${navOpen ? "d-flex flex-column w-100" : "d-none"}`}
            aria-label="Primary"
          >
            <NavLink to="/tickets" className={navLinkClass} end>
              My Tickets
            </NavLink>
            <NavLink to="/tickets/new" className={navLinkClass}>
              Create Ticket
            </NavLink>
          </nav>

          {user && (
            <div className="d-flex align-items-center gap-2">
              <span className="requester-chip">{user.name}</span>
              <RoleBadge role={user.role} />
              <button type="button" className="btn btn-sm btn-outline-light" onClick={() => logout()}>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container py-4">
        <Outlet />
      </main>
    </div>
  );
}
