import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, StaffDashboard, getStaffDashboard } from "../api.js";
import { ActionStatusBadge, FollowUpBadge, PriorityBadge, RoleBadge, StatusBadge } from "../components/Badges.js";
import MetricCard from "../components/MetricCard.js";
import { useAuth } from "../context/AuthContext.js";

// Issue 4-5 (Lab 4) — IT Staff / Administrator Dashboard, docs/lab-04/ui-spec.md §3.1/§3.3/§3.4,
// FR-13/FR-14. Every number comes from the API (BR-28) and links to the list it counts. The status
// and IT Priority breakdowns are clickable lists rather than charts, so every value stays readable,
// keyboard-reachable and tappable on a phone without a charting library (ui-spec.md §3.3).
type LoadState = "loading" | "ready" | "failure" | "forbidden";

const OPERATIONAL_KEYS = ["unassignedOpen", "myOpenTickets", "waitingForRequester", "resolvedAwaitingClose", "requesterSaysResolved"];
const PLACEHOLDER_LABELS: Record<string, string> = {
  unassignedOpen: "Unassigned",
  myOpenTickets: "My open tickets",
  waitingForRequester: "Waiting for Requester",
  resolvedAwaitingClose: "Resolved, awaiting close",
  requesterSaysResolved: "Requester says resolved",
};
const ROLE_LABELS: Record<string, string> = {
  REQUESTER: "Active Requesters",
  IT_STAFF: "Active IT Staff",
  ADMINISTRATOR: "Active Administrators",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function StaffDashboardPage() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<StaffDashboard | null>(null);

  async function load() {
    setState("loading");
    setData(null); // AC-32: never show earlier numbers as if they were current
    try {
      setData(await getStaffDashboard());
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
  const isAdministrator = user?.role === "ADMINISTRATOR";

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Dashboard</h1>
          <p className="mb-0">Welcome back, {user?.name}! Here's what's happening with the queue.</p>
          {data && <p className="small text-muted mb-0">Counts since {formatDate(data.windowStart)} for "recent".</p>}
        </div>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load} disabled={state === "loading"}>
          Refresh
        </button>
      </div>

      {state === "failure" ? (
        <div className="alert alert-danger" role="alert">
          <p className="mb-2">We couldn't load your dashboard. Please try again.</p>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
            Retry
          </button>
        </div>
      ) : (
        <div aria-busy={state === "loading"}>
          {state === "loading" && <span className="visually-hidden">Loading dashboard</span>}

          {/* Row 1 — operational cards */}
          <div className="row row-cols-1 row-cols-md-2 row-cols-lg-5 g-3 mb-4">
            {OPERATIONAL_KEYS.map((key) => {
              const m = metric(key);
              return (
                <div className="col" key={key}>
                  <MetricCard label={m?.label ?? PLACEHOLDER_LABELS[key]} value={m?.value ?? null} drillDown={m?.drillDown} />
                </div>
              );
            })}
          </div>

          {data && (
            <>
              <div className="row g-3 mb-4">
                {/* Row 2 — My work */}
                <div className="col-lg-8">
                  <section className="card h-100" aria-labelledby="my-work-heading">
                    <div className="card-body">
                      <h2 id="my-work-heading" className="h6">
                        My work
                      </h2>
                      <div className="d-flex flex-wrap gap-4 mb-2">
                        <div>
                          <span className="small text-muted d-block">My open actions</span>
                          <span className="zg-metric-value">{metric("myOpenActions")?.value}</span>
                        </div>
                        <div>
                          <span className="small text-muted d-block">My follow-ups</span>
                          <span className="zg-metric-value">{metric("myFollowUps")?.value}</span>
                        </div>
                      </div>
                      {data.lists.myActions.length === 0 ? (
                        <p className="small text-muted mb-0">No open actions or follow-ups assigned to you.</p>
                      ) : (
                        <ul className="list-unstyled mb-0">
                          {data.lists.myActions.map((a) => (
                            <li key={a.actionId} className="py-2 border-bottom">
                              <div className="d-flex flex-wrap align-items-center gap-2">
                                <Link to={`/queue/${a.ticketId}#actions`} className="fw-semibold">
                                  {a.ticketNumber}
                                </Link>
                                <ActionStatusBadge status={a.status} />
                                {a.followUpRequired && <FollowUpBadge />}
                                <span className="small text-muted ms-auto">{formatDateTime(a.actionAt)}</span>
                              </div>
                              <div className="small text-truncate" title={a.description}>
                                {a.description}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                </div>

                {/* Quick Actions (labsheet wireframe) */}
                <div className="col-lg-4">
                  <section className="card h-100" aria-labelledby="staff-quick-actions-heading">
                    <div className="card-body">
                      <h2 id="staff-quick-actions-heading" className="h6">
                        Quick Actions
                      </h2>
                      <div className="d-grid gap-2">
                        <Link to="/queue" className="btn btn-outline-secondary text-start">
                          <span className="fw-semibold d-block">Search Tickets</span>
                          <span className="small text-muted">Open the full Ticket Queue</span>
                        </Link>
                        <Link to={`/queue?ownerId=${user?.id}&statusGroup=open`} className="btn btn-outline-secondary text-start">
                          <span className="fw-semibold d-block">My Queue</span>
                          <span className="small text-muted">Open tickets you own</span>
                        </Link>
                        {isAdministrator && (
                          <Link to="/admin/users" className="btn btn-outline-secondary text-start">
                            <span className="fw-semibold d-block">User Management</span>
                            <span className="small text-muted">Accounts and roles</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Row 3 — breakdowns */}
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <section className="card h-100" aria-labelledby="by-status-heading">
                    <div className="card-body">
                      <h2 id="by-status-heading" className="h6">
                        Tickets by status
                      </h2>
                      <ul className="list-unstyled mb-0">
                        {data.byStatus.map((s) => (
                          <li key={s.status} className="d-flex justify-content-between align-items-center py-1">
                            <StatusBadge status={s.status} />
                            <Link to={s.drillDown} aria-label={`View ${s.value} ${s.status.toLowerCase().replace(/_/g, " ")} tickets`}>
                              {s.value}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                </div>
                <div className="col-md-6">
                  <section className="card h-100" aria-labelledby="by-priority-heading">
                    <div className="card-body">
                      <h2 id="by-priority-heading" className="h6">
                        Open tickets by IT Priority
                      </h2>
                      <ul className="list-unstyled mb-0">
                        {data.openByItPriority.map((p) => (
                          <li key={p.itPriority} className="d-flex justify-content-between align-items-center py-1">
                            <PriorityBadge priority={p.itPriority} />
                            <Link to={p.drillDown} aria-label={`View ${p.value} open ${p.itPriority.toLowerCase()} priority tickets`}>
                              {p.value}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>
                </div>
              </div>

              {/* Row 4 — urgent and recent */}
              <section className="card mb-4" aria-labelledby="urgent-heading">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <h2 id="urgent-heading" className="h6 mb-0">
                      Urgent and recent
                    </h2>
                    <Link to="/queue?statusGroup=open" className="small" aria-label="View all open tickets">
                      View all
                    </Link>
                  </div>
                  {data.lists.urgentAndRecent.length === 0 ? (
                    <p className="small text-muted mb-0">No urgent or recently updated open tickets.</p>
                  ) : (
                    <ul className="list-unstyled mb-0">
                      {data.lists.urgentAndRecent.map((t) => (
                        <li key={t.id} className="d-flex flex-wrap justify-content-between align-items-center gap-2 py-2 border-bottom">
                          <div className="text-break">
                            <Link to={`/queue/${t.id}`} className="fw-semibold">
                              {t.ticketNumber}
                            </Link>
                            <div className="small">{t.summary}</div>
                          </div>
                          <div className="d-flex flex-wrap align-items-center gap-2">
                            <PriorityBadge priority={t.itPriority} />
                            <StatusBadge status={t.currentStatus} />
                            {t.owner ? (
                              <span className="small d-flex align-items-center gap-1">
                                {t.owner.name} <RoleBadge role={t.owner.role} />
                              </span>
                            ) : (
                              <span className="small text-muted">Unassigned</span>
                            )}
                            <span className="small text-muted">{formatDateTime(t.updatedAt)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/* Administrator only — user-account counts (BR-34) */}
              {data.users && (
                <section aria-labelledby="users-heading">
                  <h2 id="users-heading" className="h6">
                    Users
                  </h2>
                  <div className="row row-cols-1 row-cols-md-2 row-cols-lg-4 g-3">
                    {data.users.activeByRole.map((r) => (
                      <div className="col" key={r.role}>
                        <MetricCard label={ROLE_LABELS[r.role]} value={r.value} drillDown={r.drillDown} />
                      </div>
                    ))}
                    <div className="col">
                      <MetricCard label="Inactive users" value={data.users.inactive.value} drillDown={data.users.inactive.drillDown} />
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
