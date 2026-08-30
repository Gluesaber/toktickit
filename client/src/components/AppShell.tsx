import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";

// Issue 2-3 (Lab 2) — application shell: identity + nav + Change Requester. docs/lab-02/ui-spec.md §2.
// Only rendered once a Requester is selected (see App.tsx) — BR-10.
export default function AppShell() {
  const { requester, changeRequester } = useRequester();
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

          {requester && (
            <div className="d-flex align-items-center gap-2">
              <span className="requester-chip">{requester.name}</span>
              <button type="button" className="btn btn-sm btn-outline-light" onClick={changeRequester}>
                Change Requester
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
