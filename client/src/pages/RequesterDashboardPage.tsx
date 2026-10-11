import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, RequesterDashboard, getRequesterDashboard } from "../api.js";
import { StatusBadge } from "../components/Badges.js";
import MetricCard from "../components/MetricCard.js";
import { useAuth } from "../context/AuthContext.js";

// Issue 4-5 (Lab 4) — Requester Dashboard, docs/lab-04/ui-spec.md §3.1/§3.2, FR-12, BR-30. Only the
// Requester's own Tickets: the API scopes it from the session, and this page does no filtering of
// its own. Layout follows the labsheet wireframe (welcome line, cards with "View", recent list with
// "View all", Quick Actions) using the metrics defined in specification.md §5.5.
type LoadState = "loading" | "ready" | "failure" | "forbidden";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function RequesterDashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<RequesterDashboard | null>(null);

  async function load() {
    setState("loading");
    setData(null); // AC-32: never show earlier numbers as if they were current
    try {
      setData(await getRequesterDashboard());
      setState("ready");
    } catch (err) {
      setState(err instanceof ApiError && err.code === "FORBIDDEN" ? "forbidden" : "failure");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (state === "forbidden") {
    return (
      <div className="alert alert-warning" role="alert">
        You don't have access to this page.
      </div>
    );
  }

  const metric = (key: string) => data?.metrics.find((m) => m.key === key) ?? null;
  const waiting = metric("waitingForMe");

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Dashboard</h1>
          <p className="mb-0">Welcome back, {user?.name}! Here's the latest on your requests.</p>
          {data && <p className="small text-muted mb-0">Counts since {formatDate(data.windowStart)} for "recent".</p>}
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load} disabled={state === "loading"}>
            Refresh
          </button>
          <Link to="/tickets/new" className="btn btn-zg-primary btn-sm">
            Create Ticket
          </Link>
        </div>
      </div>

      {state === "failure" ? (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">We couldn't load your dashboard. Please try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div aria-busy={state === "loading"}>
            {state === "loading" && <span className="visually-hidden">Loading dashboard</span>}
            <div className="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-3 mb-4">
              {["openTickets", "waitingForMe", "resolvedAwaitingClose", "updatedRecently"].map((key) => {
                const m = metric(key);
                const placeholderLabel: Record<string, string> = {
                  openTickets: "Open tickets",
                  waitingForMe: "Waiting for you",
                  resolvedAwaitingClose: "Resolved",
                  updatedRecently: "Updated in the last 7 days",
                };
                return (
                  <div className="col" key={key}>
                    <MetricCard
                      label={m?.label ?? placeholderLabel[key]}
                      value={m?.value ?? null}
                      drillDown={m?.drillDown}
                      attention={key === "waitingForMe" && waiting && waiting.value > 0 ? "Needs your reply" : null}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {data && (
            <div className="row g-3">
              <div className="col-lg-8">
                <section className="card h-100" aria-labelledby="recent-heading">
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <h2 id="recent-heading" className="h6 mb-0">
                        Recently updated
                      </h2>
                      <Link to="/tickets?sortBy=updatedAt&sortDir=desc" className="small" aria-label="View all tickets, most recently updated first">
                        View all
                      </Link>
                    </div>
                    {data.lists.recentlyUpdated.length === 0 ? (
                      <p className="small text-muted mb-0">No tickets updated in the last 7 days.</p>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {data.lists.recentlyUpdated.map((t) => (
                          <li key={t.id} className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom">
                            <div className="text-break">
                              <Link to={`/tickets/${t.id}`} className="fw-semibold">
                                {t.ticketNumber}
                              </Link>
                              <div className="small">{t.summary}</div>
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              <StatusBadge status={t.currentStatus} />
                              <span className="small text-muted">{formatDateTime(t.updatedAt)}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="d-flex justify-content-between align-items-center mt-3 mb-2">
                      <h2 className="h6 mb-0">Recently resolved</h2>
                      <Link to="/tickets?currentStatus=RESOLVED" className="small" aria-label="View all resolved tickets">
                        View all
                      </Link>
                    </div>
                    {data.lists.recentlyResolved.length === 0 ? (
                      <p className="small text-muted mb-0">Nothing resolved in the last 7 days.</p>
                    ) : (
                      <ul className="list-unstyled mb-0">
                        {data.lists.recentlyResolved.map((t) => (
                          <li key={t.id} className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom">
                            <div className="text-break">
                              <Link to={`/tickets/${t.id}`} className="fw-semibold">
                                {t.ticketNumber}
                              </Link>
                              <div className="small">{t.summary}</div>
                            </div>
                            <span className="small text-muted">Resolved {formatDate(t.resolvedAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              </div>

              <div className="col-lg-4">
                <section className="card h-100" aria-labelledby="quick-actions-heading">
                  <div className="card-body">
                    <h2 id="quick-actions-heading" className="h6">
                      Quick Actions
                    </h2>
                    <div className="d-grid gap-2">
                      <Link to="/tickets/new" className="btn btn-outline-secondary text-start">
                        <span className="fw-semibold d-block">Create Ticket</span>
                        <span className="small text-muted">Submit a new request</span>
                      </Link>
                      <Link to="/tickets" className="btn btn-outline-secondary text-start">
                        <span className="fw-semibold d-block">View My Tickets</span>
                        <span className="small text-muted">Track existing requests</span>
                      </Link>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
