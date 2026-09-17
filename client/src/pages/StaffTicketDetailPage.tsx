import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
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
import { PriorityBadge, StatusBadge, RoleBadge } from "../components/Badges.js";
import CommentsSection from "../components/CommentsSection.js";
import NotesSection from "../components/NotesSection.js";
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
  REOPENED: ["IN_PROGRESS"],
};
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

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);

  const [ownerBusy, setOwnerBusy] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState("");

  const [priorityBusy, setPriorityBusy] = useState(false);
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState("");

  async function load() {
    if (!id) return;
    setState("loading");
    try {
      const [detail, users] = await Promise.all([getStaffTicket(Number(id)), getStaffUsers()]);
      setTicket(detail);
      setStaffUsers(users);
      setState("ready");
    } catch {
      setState("failure");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleCommentPosted(comment: Comment) {
    setTicket((prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev));
  }

  function handleNotePosted(note: Note) {
    setTicket((prev) => (prev ? { ...prev, notes: [...prev.notes, note] } : prev));
  }

  async function handleClaim() {
    if (!ticket || !user) return;
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const result = await setTicketOwner(ticket.id, user.id);
      setTicket((prev) => (prev ? { ...prev, owner: result.owner } : prev));
    } catch (err) {
      setOwnerError(err instanceof ApiError ? err.message : "Unable to claim this ticket.");
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleReassign() {
    if (!ticket || !reassignTarget) return;
    setOwnerBusy(true);
    setOwnerError(null);
    try {
      const result = await setTicketOwner(ticket.id, Number(reassignTarget));
      setTicket((prev) => (prev ? { ...prev, owner: result.owner } : prev));
      setReassignTarget("");
    } catch (err) {
      setOwnerError(err instanceof ApiError ? err.message : "Unable to reassign this ticket.");
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handlePriorityChange(itPriority: Priority) {
    if (!ticket) return;
    setPriorityBusy(true);
    setPriorityError(null);
    try {
      await setItPriorityApi(ticket.id, itPriority);
      setTicket((prev) => (prev ? { ...prev, itPriority } : prev));
    } catch (err) {
      setPriorityError(err instanceof ApiError ? err.message : "Unable to update IT Priority.");
    } finally {
      setPriorityBusy(false);
    }
  }

  async function submitStatus(status: string) {
    if (!ticket) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const result = await changeTicketStatus(ticket.id, status);
      setTicket((prev) => (prev ? { ...prev, currentStatus: result.currentStatus, updatedAt: result.updatedAt } : prev));
      setPendingStatus("");
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : "Unable to update the ticket's status.");
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

          {!ticket.owner ? (
            <button type="button" className={`btn btn-zg-primary btn-sm${ownerBusy ? " btn-busy" : ""}`} disabled={ownerBusy} onClick={handleClaim}>
              {ownerBusy ? "Claiming…" : "Claim"}
            </button>
          ) : (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <select
                className="form-select form-select-sm w-auto"
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
        </div>
      </div>

      {/* Status — ui-spec.md §7.3. Options are populated from the current status's own permitted
          transitions, never a static full list, so the UI can never offer one the API would 409 on. */}
      <div className="card mt-3">
        <div className="card-body">
          <h2 className="h6 card-title">Status</h2>
          <div className="mb-2">
            <StatusBadge status={ticket.currentStatus} />
          </div>

          {statusError && (
            <div className="text-danger small mb-2" role="alert">
              {statusError}
            </div>
          )}

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
            <select
              className="form-select form-select-sm w-auto"
              aria-label="Change status"
              value=""
              disabled={statusBusy}
              onChange={(e) => handleStatusSelect(e.target.value)}
            >
              <option value="">Change status to…</option>
              {availableTransitions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Public Comments — identical component to Requester Ticket Detail, reused verbatim
          (ui-spec.md §7.4). */}
      <CommentsSection ticketId={ticket.id} comments={ticket.comments} onPosted={handleCommentPosted} />

      {/* Internal Notes — visually distinct card, IT Staff/Administrator only. */}
      <NotesSection ticketId={ticket.id} notes={ticket.notes} onPosted={handleNotePosted} />
    </div>
  );
}
