import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ActionTaken,
  ApiError,
  Comment,
  Note,
  Priority,
  StaffTicketDetail,
  StaffUser,
  getStaffTicket,
  getStaffUsers,
  setTicketOwner,
  setItPriority as setItPriorityApi,
  changeTicketStatus,
} from "../api.js";
import { PriorityBadge, StatusBadge, RoleBadge, statusLabel } from "../components/Badges.js";
import ActionsTakenSection from "../components/ActionsTakenSection.js";
import CommentsSection from "../components/CommentsSection.js";
import NotesSection from "../components/NotesSection.js";
import StaleBanner from "../components/StaleBanner.js";
import StatusHistorySection from "../components/StatusHistorySection.js";
import { useAuth } from "../context/AuthContext.js";

// Issue 3-5 (Lab 3) — IT Staff Ticket Detail. docs/lab-03/ui-spec.md §7, specification.md
// FR-12/FR-13/FR-14/FR-15/FR-16. Extends the same read-only header/classification/description
// layout Requester Ticket Detail uses (docs/lab-02/ui-spec.md §6.1) with four new operational
// cards, each visually separated so controls are never confused with the read-only ticket record.
// Attachments are shown read-only here (view/download only, no add/remove) — the authorization
// matrix (specification.md §5.1) gives Add/soft-remove Attachments to the Requester only.
type LoadState = "loading" | "ready" | "failure";

// Client-side mirror of specification.md §5.2's staff-only rows (server/src/statusTransitions.ts is
// the source of truth the backend actually enforces) — this page only ever renders for IT Staff/
// Administrator, so the Requester-only Cancel-from-New/Open rows aren't part of this table at all.
const STAFF_TRANSITIONS: Record<string, string[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  CANCELLED: [],
  // Issue 4-4 (Lab 4) — docs/lab-04/specification.md §5.2 adds Reopened -> Resolved/Cancelled.
  REOPENED: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
};
// Issue 4-4 (Lab 4) — BR-17's resolution gate, mirrored for the UI only: "Resolved" stays listed but
// disabled, with the reason as visible text, until a Completed Action exists. The backend still
// refuses it on its own (409 RESOLUTION_REQUIRES_COMPLETED_ACTION) if this screen is stale.
const RESOLUTION_GATE_REASON = "Record at least one completed action before resolving.";

// Keeps the Action list in BR-13's order (actionAt, then id) after a local create/edit.
function sortActions(actions: ActionTaken[]): ActionTaken[] {
  return [...actions].sort((a, b) => a.actionAt.localeCompare(b.actionAt) || a.id - b.id);
}
// ui-spec.md §7.3: these three targets get a brief inline confirmation before submitting — harder
// to walk back within Lab 3's scope than the others.
const CONFIRM_TARGETS = new Set(["CANCELLED", "CLOSED", "RESOLVED"]);
const PRIORITY_OPTIONS: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function StaffTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const location = useLocation();

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  // Issue 4-4 (Lab 4) — a Ticket fetch that started before a local change must never overwrite it.
  // React StrictMode (main.tsx) runs the load effect twice in development, and either fetch can
  // finish after the user has already acted (found by E2E-03: "Mark Problem as Resolved" was undone
  // by the slower of the two initial loads). Every fetch takes a sequence number; local changes go
  // through updateTicket, which bumps it, so any fetch still in flight is ignored when it lands.
  const loadSeq = useRef(0);
  function updateTicket(updater: (prev: StaffTicketDetail | null) => StaffTicketDetail | null) {
    loadSeq.current++;
    setTicket(updater);
  }
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");

  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState("");

  // Issue 4-4 (Lab 4) — 409 STALE_UPDATE per card (ui-spec.md §5.2). The user's pending choice is
  // kept; "Reload ticket" refreshes the record without throwing that choice away.
  const [stale, setStale] = useState<null | "owner" | "priority" | "status">(null);
  const [reloading, setReloading] = useState(false);

  async function load() {
    if (!id) return;
    const seq = ++loadSeq.current;
    setState("loading");
    try {
      const [detail, users] = await Promise.all([getStaffTicket(Number(id)), getStaffUsers()]);
      if (seq !== loadSeq.current) return; // superseded by a newer fetch or a local change
      setTicket(detail);
      setStaffUsers(users);
      setState("ready");
    } catch {
      if (seq !== loadSeq.current) return;
      setState("failure");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Issue 4-5 (Lab 4) — the dashboard's "My work" rows link to /queue/:id#actions. The card only
  // exists once the Ticket has loaded, so the browser's own hash scroll can't find it; do it here.
  useEffect(() => {
    if (state === "ready" && location.hash === "#actions") {
      document.getElementById("actions")?.scrollIntoView({ block: "start" });
    }
  }, [state, location.hash]);

  // Issue 4-4 (Lab 4) — re-fetch in place (no "Loading…" swap), so open forms and pending choices
  // on the page survive a Reload after a stale-update conflict.
  async function refresh() {
    if (!id) return;
    setReloading(true);
    const seq = ++loadSeq.current;
    try {
      const result = await getStaffTicket(Number(id));
      if (seq === loadSeq.current) setTicket(result);
      setStale(null);
    } catch {
      setStatusError("Unable to reload this ticket. Try again.");
    } finally {
      setReloading(false);
    }
  }

  function handleActionSaved(action: ActionTaken) {
    updateTicket((prev) =>
      prev ? { ...prev, actions: sortActions([...prev.actions.filter((a) => a.id !== action.id), action]) } : prev
    );
  }

  function isStale(err: unknown) {
    return err instanceof ApiError && err.code === "STALE_UPDATE";
  }

  function handleCommentPosted(comment: Comment) {
    updateTicket((prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev));
  }

  function handleNotePosted(note: Note) {
    updateTicket((prev) => (prev ? { ...prev, notes: [...prev.notes, note] } : prev));
  }

  async function handleClaim() {
    if (!ticket || !user) return;
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const result = await setTicketOwner(ticket.id, user.id, ticket.version);
      updateTicket((prev) => (prev ? { ...prev, owner: result.owner, version: result.version, updatedAt: result.updatedAt } : prev));
    } catch (err) {
      if (isStale(err)) setStale("owner");
      else setOwnerError(err instanceof ApiError ? err.message : "Unable to claim this ticket.");
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleReassign() {
    if (!ticket || !reassignTarget) return;
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const result = await setTicketOwner(ticket.id, Number(reassignTarget), ticket.version);
      updateTicket((prev) => (prev ? { ...prev, owner: result.owner, version: result.version, updatedAt: result.updatedAt } : prev));
      setReassignTarget("");
    } catch (err) {
      if (isStale(err)) setStale("owner"); // reassignTarget is kept for a retry after Reload
      else setOwnerError(err instanceof ApiError ? err.message : "Unable to reassign this ticket.");
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handlePriorityChange(itPriority: Priority) {
    if (!ticket) return;
    setPriorityBusy(true);
    setPriorityError(null);
    try {
      const result = await setItPriorityApi(ticket.id, itPriority, ticket.version);
      updateTicket((prev) => (prev ? { ...prev, itPriority, version: result.version, updatedAt: result.updatedAt } : prev));
    } catch (err) {
      if (isStale(err)) setStale("priority");
      else setPriorityError(err instanceof ApiError ? err.message : "Unable to update IT Priority.");
    } finally {
      setPriorityBusy(false);
    }
  }

  async function submitStatus(status: string) {
    if (!ticket) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const result = await changeTicketStatus(ticket.id, status, ticket.version);
      // Issue 4-3 (Lab 4) — keep the new version for the next write, and pick up the server's
      // clearing of the Requester indication (BR-18) without a reload.
      // Issue 4-4 (Lab 4) — FR-08: the Status History card gets the new entry straight away. It is
      // exactly the row the server just wrote (from, to, this user, the update time), so no
      // re-fetch is needed; a later reload returns the same entry with its real id.
      updateTicket((prev) =>
        prev
          ? {
              ...prev,
              currentStatus: result.currentStatus,
              version: result.version,
              updatedAt: result.updatedAt,
              requesterConfirmedResolvedAt: result.requesterConfirmedResolvedAt,
              statusHistory: user
                ? [
                    ...prev.statusHistory,
                    {
                      id: -Date.now(),
                      fromStatus: prev.currentStatus,
                      toStatus: result.currentStatus,
                      changedBy: { id: user.id, name: user.name, role: user.role },
                      changedAt: result.updatedAt,
                    },
                  ]
                : prev.statusHistory,
            }
          : prev
      );
      setPendingStatus("");
    } catch (err) {
      if (isStale(err)) {
        // Keep the choice: after Reload the confirm step is still there to submit again.
        setStale("status");
        setPendingStatus(status);
      } else {
        setStatusError(err instanceof ApiError ? err.message : "Unable to update the ticket's status.");
      }
    } finally {
      setStatusBusy(false);
    }
  }

  function handleStatusSelect(target: string) {
    if (!target) return;
    if (CONFIRM_TARGETS.has(target)) {
      setPendingStatus(target);
    } else {
      submitStatus(target);
    }
  }

  if (state === "loading") {
    return <p className="text-muted">Loading ticket…</p>;
  }

  if (state === "failure" || !ticket) {
    return (
      <div className="alert alert-danger" role="alert">
        <p className="mb-2">Unable to load this ticket. Try again.</p>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  const readOnlyFieldStyle = {
    backgroundColor: "var(--zg-field-readonly-bg)",
    color: "var(--zg-field-readonly-text)",
  };
  const reassignCandidates = staffUsers.filter((u) => u.id !== ticket.owner?.id);
  const availableTransitions = STAFF_TRANSITIONS[ticket.currentStatus] ?? [];
  const resolutionGateMet = ticket.actions.some((a) => a.status === "COMPLETED");
  const lastHistory = ticket.statusHistory[ticket.statusHistory.length - 1];

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <h1 className="h4 mb-0">{ticket.ticketNumber}</h1>
        <Link to="/queue" className="btn btn-outline-secondary btn-sm">
          Back to Queue
        </Link>
      </div>

      {/* Header block */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <label className="form-label fw-semibold">Current Status</label>
          <div>
            <StatusBadge status={ticket.currentStatus} />
          </div>
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Requested Priority</label>
          <div>
            <PriorityBadge priority={ticket.requestedPriority} />
          </div>
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Ticket Date</label>
          <input type="text" className="form-control" value={formatDateTime(ticket.createdAt)} readOnly disabled style={readOnlyFieldStyle} />
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Requester</label>
          <input
            type="text"
            className="form-control"
            value={`${ticket.requester.name} (${ticket.requester.email})`}
            readOnly
            disabled
            style={readOnlyFieldStyle}
          />
        </div>
      </div>

      {/* Classification block */}
      <div className="row g-3 mb-4">
        <div className="col-md-6">
          <label className="form-label fw-semibold">Category</label>
          <input type="text" className="form-control" value={ticket.category.name} readOnly disabled style={readOnlyFieldStyle} />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-semibold">Related System</label>
          <input type="text" className="form-control" value={ticket.relatedSystem.name} readOnly disabled style={readOnlyFieldStyle} />
        </div>
      </div>

      {/* Description block */}
      <div className="mb-4">
        <h2 className="h6">{ticket.summary}</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
      </div>

      {/* Attachments — read-only for IT Staff/Administrator (specification.md §5.1: only the
          Requester may add/remove Attachments). */}
      <div className="card">
        <div className="card-body">
          <h2 className="h6 card-title">Attachments</h2>
          {ticket.attachments.length === 0 && <p className="text-muted small mb-0">No attachments.</p>}
          {ticket.attachments.length > 0 && (
            <ul className="list-unstyled mb-0">
              {ticket.attachments.map((a) => (
                <li key={a.id} className="py-1">
                  {a.active ? (
                    <span>{a.originalFileName}</span>
                  ) : (
                    <span className="text-muted text-decoration-line-through">{a.originalFileName}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Ownership — ui-spec.md §7.1 */}
      <div className="card mt-3">
        <div className="card-body">
          <h2 className="h6 card-title">Ownership</h2>
          <p className="mb-2">
            {ticket.owner ? (
              <span className="d-flex align-items-center gap-2">
                {ticket.owner.name} <RoleBadge role={ticket.owner.role} />
              </span>
            ) : (
              <span className="text-muted">Unassigned</span>
            )}
          </p>

          {ownerError && (
            <div className="text-danger small mb-2" role="alert">
              {ownerError}
            </div>
          )}
          {stale === "owner" && <StaleBanner onReload={refresh} reloading={reloading} />}

          {!ticket.owner ? (
            <button type="button" className={`btn btn-zg-primary btn-sm${ownerBusy ? " btn-busy" : ""}`} disabled={ownerBusy} onClick={handleClaim}>
              {ownerBusy ? "Claiming…" : "Claim"}
            </button>
          ) : (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              {/* Issue 4-4 (Lab 4) — mw-100: w-auto sizes the select to its longest option, so one long
                  staff name pushed the whole page sideways at phone width (found at 375px). */}
              <select
                className="form-select form-select-sm w-auto mw-100"
                aria-label="Reassign to"
                value={reassignTarget}
                disabled={ownerBusy}
                onChange={(e) => setReassignTarget(e.target.value)}
              >
                <option value="">Reassign to…</option>
                {reassignCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role === "ADMINISTRATOR" ? "Administrator" : "IT Staff"})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`btn btn-outline-secondary btn-sm${ownerBusy ? " btn-busy" : ""}`}
                disabled={ownerBusy || !reassignTarget}
                onClick={handleReassign}
              >
                {ownerBusy ? "Reassigning…" : "Reassign"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* IT Priority — ui-spec.md §7.2. Requested Priority stays a read-only badge; IT Priority is
          the editable control, matching Lab 2's editable/read-only field styling rule. */}
      <div className="card mt-3">
        <div className="card-body">
          <h2 className="h6 card-title">Priority</h2>
          <div className="d-flex gap-4 align-items-center flex-wrap">
            <div>
              <span className="small fw-semibold d-block mb-1">Requested Priority</span>
              <PriorityBadge priority={ticket.requestedPriority} />
            </div>
            <div>
              <label htmlFor="it-priority-select" className="small fw-semibold d-block mb-1">
                IT Priority
              </label>
              <select
                id="it-priority-select"
                className="form-select form-select-sm"
                value={ticket.itPriority}
                disabled={priorityBusy}
                onChange={(e) => handlePriorityChange(e.target.value as Priority)}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {priorityError && (
            <div className="text-danger small mt-2" role="alert">
              {priorityError}
            </div>
          )}
          {stale === "priority" && (
            <div className="mt-2">
              <StaleBanner onReload={refresh} reloading={reloading} />
            </div>
          )}
        </div>
      </div>

      {/* Status — ui-spec.md §7.3. Options are populated from the current status's own permitted
          transitions, never a static full list, so the UI can never offer one the API would 409 on. */}
      <div className="card mt-3">
        <div className="card-body">
          <h2 className="h6 card-title">Status</h2>
          <div className="mb-2 d-flex flex-wrap align-items-center gap-2">
            <StatusBadge status={ticket.currentStatus} />
            {/* Issue 4-4 (Lab 4) — FR-10: the Requester's advisory indication, finally visible to staff. */}
            {ticket.requesterConfirmedResolvedAt && (
              <span className="zg-requester-indication">
                Requester says resolved · {formatDateTime(ticket.requesterConfirmedResolvedAt)}
              </span>
            )}
          </div>

          {statusError && (
            <div className="text-danger small mb-2" role="alert">
              {statusError}
            </div>
          )}
          {stale === "status" && <StaleBanner onReload={refresh} reloading={reloading} />}

          {pendingStatus ? (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <span>Set status to <StatusBadge status={pendingStatus} />?</span>
              <button
                type="button"
                className={`btn btn-zg-primary btn-sm${statusBusy ? " btn-busy" : ""}`}
                disabled={statusBusy}
                onClick={() => submitStatus(pendingStatus)}
              >
                {statusBusy ? "Saving…" : "Confirm"}
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={statusBusy} onClick={() => setPendingStatus("")}>
                Cancel
              </button>
            </div>
          ) : availableTransitions.length === 0 ? (
            <p className="text-muted small mb-0">No further status changes are available.</p>
          ) : (
            <>
              <select
                className="form-select form-select-sm w-auto mw-100"
                aria-label="Change status"
                aria-describedby={availableTransitions.includes("RESOLVED") && !resolutionGateMet ? "status-gate-reason" : undefined}
                value=""
                disabled={statusBusy}
                onChange={(e) => handleStatusSelect(e.target.value)}
              >
                <option value="">Change status to…</option>
                {availableTransitions.map((s) => (
                  <option key={s} value={s} disabled={s === "RESOLVED" && !resolutionGateMet}>
                    {statusLabel(s)}
                    {s === "RESOLVED" && !resolutionGateMet ? " (needs a completed action)" : ""}
                  </option>
                ))}
              </select>
              {availableTransitions.includes("RESOLVED") && !resolutionGateMet && (
                <div id="status-gate-reason" className="form-text">
                  {RESOLUTION_GATE_REASON}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Issue 4-4 (Lab 4) — Actions Taken (ui-spec.md §5.3) and Status History (§5.4). */}
      <ActionsTakenSection
        ticketId={ticket.id}
        ticketCreatedAt={ticket.createdAt}
        ticketStatus={ticket.currentStatus}
        actions={ticket.actions}
        mode="staff"
        staffUsers={staffUsers}
        currentUser={user}
        reopened={lastHistory?.toStatus === "REOPENED" && ticket.currentStatus === "REOPENED"}
        onSaved={handleActionSaved}
        onReload={refresh}
      />
      <StatusHistorySection history={ticket.statusHistory} />

      {/* Public Comments — identical component to Requester Ticket Detail, reused verbatim
          (ui-spec.md §7.4). */}
      <CommentsSection ticketId={ticket.id} comments={ticket.comments} onPosted={handleCommentPosted} />

      {/* Internal Notes — visually distinct card, IT Staff/Administrator only. */}
      <NotesSection ticketId={ticket.id} notes={ticket.notes} onPosted={handleNotePosted} />
    </div>
  );
}
