import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, Comment, TicketDetail, changeTicketStatus, getTicket, markProblemResolved } from "../api.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import ActionsTakenSection from "../components/ActionsTakenSection.js";
import AttachmentSection from "../components/AttachmentSection.js";
import CommentsSection from "../components/CommentsSection.js";
import StaleBanner from "../components/StaleBanner.js";
import StatusHistorySection from "../components/StatusHistorySection.js";

// Issue 2-6 (Lab 2) — Requester Ticket Detail: read-only ticket fields + attachments.
// docs/lab-02/ui-spec.md §6, specification.md FR-12/FR-13, BR-12/BR-40, AC-20/AC-21.
// Issue 2-7 (Lab 2) — the Attachment section is now the real add/download/remove UI.
// Issue 3-3 (Lab 3) — identity comes from the session now, not a selected Requester (BR-03/BR-17);
// adds Public Comments and "Problem Appears Resolved" (BR-04/BR-25, ui-spec.md §5).
// Issue 3-7 (Lab 3) — adds the Requester's own Cancel action. This was a genuine gap: Issue 3-5
// built the backend side of a Requester's self-Cancel (PATCH /api/tickets/:id/status, BR-24,
// tested at server/tests/lab-03/requester-regression.api.test.ts's API-56/57) and api.ts's
// changeTicketStatus already existed for the Staff detail page to reuse, but no Requester-facing
// control was ever wired up — ui-spec.md §5 never mentions one either. Found while writing this
// issue's E2E-07 spec, which needs exactly this action.
// Issue 4-4 (Lab 4) — adds a read-only Actions Taken card and the Status History timeline
// (docs/lab-04/ui-spec.md §6, BR-15). Internal Notes still never appear on this screen.
type LoadState = "loading" | "ready" | "not-found" | "failure";
const TERMINAL_STATUSES = ["RESOLVED", "CLOSED", "CANCELLED"];
const CANCELLABLE_STATUSES = ["NEW", "OPEN"]; // BR-24

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  // Issue 4-4 (Lab 4) — a Ticket fetch that started before a local change must never overwrite it.
  // React StrictMode (main.tsx) runs the load effect twice in development, and either fetch can
  // finish after the user has already acted (found by E2E-03: "Mark Problem as Resolved" was undone
  // by the slower of the two initial loads). Every fetch takes a sequence number; local changes go
  // through updateTicket, which bumps it, so any fetch still in flight is ignored when it lands.
  const loadSeq = useRef(0);
  function updateTicket(updater: (prev: TicketDetail | null) => TicketDetail | null) {
    loadSeq.current++;
    setTicket(updater);
  }
  const [resolvedBusy, setResolvedBusy] = useState(false);
  const [resolvedError, setResolvedError] = useState<string | null>(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelStale, setCancelStale] = useState(false);
  const [reloading, setReloading] = useState(false);

  async function load() {
    if (!id) return;
    const seq = ++loadSeq.current;
    setState("loading");
    try {
      const result = await getTicket(Number(id));
      if (seq !== loadSeq.current) return; // superseded by a newer fetch or a local change
      setTicket(result);
      setState("ready");
    } catch (err) {
      if (seq !== loadSeq.current) return;
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        setState("not-found");
      } else {
        setState("failure");
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Issue 4-4 (Lab 4) — re-fetch in place after a stale-update conflict, keeping the open confirm step.
  async function refresh() {
    if (!id) return;
    setReloading(true);
    const seq = ++loadSeq.current;
    try {
      const result = await getTicket(Number(id));
      if (seq === loadSeq.current) setTicket(result);
      setCancelStale(false);
    } catch {
      setCancelError("Unable to reload this ticket. Try again.");
    } finally {
      setReloading(false);
    }
  }

  function handleCommentPosted(comment: Comment) {
    updateTicket((prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev));
  }

  async function handleMarkResolved() {
    if (!ticket) return;
    setResolvedBusy(true);
    setResolvedError(null);
    try {
      const result = await markProblemResolved(ticket.id);
      updateTicket((prev) => (prev ? { ...prev, requesterConfirmedResolvedAt: result.requesterConfirmedResolvedAt } : prev));
    } catch (err) {
      setResolvedError(err instanceof ApiError ? err.message : "Unable to update this ticket.");
    } finally {
      setResolvedBusy(false);
    }
  }

  async function handleCancelTicket() {
    if (!ticket) return;
    setCancelBusy(true);
    setCancelError(null);
    setCancelStale(false);
    try {
      const result = await changeTicketStatus(ticket.id, "CANCELLED", ticket.version);
      updateTicket((prev) => (prev ? { ...prev, currentStatus: result.currentStatus, version: result.version } : prev));
      setCancelPending(false);
    } catch (err) {
      // Issue 4-4 (Lab 4) — BR-22: IT changed the ticket after this screen loaded it.
      if (err instanceof ApiError && err.code === "STALE_UPDATE") setCancelStale(true);
      else setCancelError(err instanceof ApiError ? err.message : "Unable to cancel this ticket.");
    } finally {
      setCancelBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-muted">Loading ticket…</p>;
  }

  // BR-40/AC-21: identical presentation whether the ticket doesn't exist or just isn't owned by
  // the current Requester — never a fragment of the requested ticket's data.
  if (state === "not-found") {
    return (
      <div className="text-center py-5">
        <p className="mb-3">Ticket not found.</p>
        <Link to="/tickets" className="btn btn-zg-primary">
          Back to My Tickets
        </Link>
      </div>
    );
  }

  if (state === "failure") {
    return (
      <div className="alert alert-danger" role="alert">
        <p className="mb-2">Unable to load this ticket. Try again.</p>
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  if (!ticket) return null;

  const readOnlyFieldStyle = {
    backgroundColor: "var(--zg-field-readonly-bg)",
    color: "var(--zg-field-readonly-text)",
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-start mb-4">
        <h1 className="h4 mb-0">{ticket.ticketNumber}</h1>
        <Link to="/tickets" className="btn btn-outline-secondary btn-sm">
          Back to My Tickets
        </Link>
      </div>

      {/* Header block */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <label className="form-label fw-semibold">Current Status</label>
          <div className="mb-1">
            <StatusBadge status={ticket.currentStatus} />
          </div>
          {/* BR-24: Requester's only status power — Cancel, and only from New/Open. */}
          {CANCELLABLE_STATUSES.includes(ticket.currentStatus) && (
            <>
              {cancelError && (
                <div className="text-danger small mb-1" role="alert">
                  {cancelError}
                </div>
              )}
              {cancelStale && (
                <StaleBanner message="This ticket was just updated by IT. Reload to see the latest." onReload={refresh} reloading={reloading} />
              )}
              {cancelPending ? (
                <div className="d-flex gap-2 align-items-center">
                  <span className="small">Cancel this ticket?</span>
                  <button
                    type="button"
                    className={`btn btn-outline-danger btn-sm${cancelBusy ? " btn-busy" : ""}`}
                    disabled={cancelBusy}
                    onClick={handleCancelTicket}
                  >
                    {cancelBusy ? "Saving…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    disabled={cancelBusy}
                    onClick={() => setCancelPending(false)}
                  >
                    Keep Ticket
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => setCancelPending(true)}>
                  Cancel Ticket
                </button>
              )}
            </>
          )}
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Requested Priority</label>
          <div>
            <PriorityBadge priority={ticket.requestedPriority} />
          </div>
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Ticket Date</label>
          <input
            type="text"
            className="form-control"
            value={formatDateTime(ticket.createdAt)}
            readOnly
            disabled
            style={readOnlyFieldStyle}
          />
        </div>
        <div className="col-md-3">
          <label className="form-label fw-semibold">Requester</label>
          <input
            type="text"
            className="form-control"
            value={ticket.requester.name}
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
          <input
            type="text"
            className="form-control"
            value={ticket.category.name}
            readOnly
            disabled
            style={readOnlyFieldStyle}
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fw-semibold">Related System</label>
          <input
            type="text"
            className="form-control"
            value={ticket.relatedSystem.name}
            readOnly
            disabled
            style={readOnlyFieldStyle}
          />
        </div>
      </div>

      {/* Description block */}
      <div className="mb-4">
        <h2 className="h6">{ticket.summary}</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
      </div>

      {/* Attachment section — visually separated from the read-only fields above */}
      <AttachmentSection ticketId={ticket.id} attachments={ticket.attachments} onRefresh={load} />

      {/* Issue 3-3 — "Problem Appears Resolved": informational only, never changes Current Status
          (BR-25). Hidden once the ticket is already Resolved/Closed/Cancelled. */}
      <div className="card mt-3">
        <div className="card-body">
          <h2 className="h6 card-title">Problem Status</h2>
          {ticket.requesterConfirmedResolvedAt ? (
            <p className="mb-0 text-muted small">
              You indicated this problem appears resolved on {formatDateTime(ticket.requesterConfirmedResolvedAt)}.
            </p>
          ) : TERMINAL_STATUSES.includes(ticket.currentStatus) ? null : (
            <>
              {resolvedError && (
                <div className="text-danger small mb-2" role="alert">
                  {resolvedError}
                </div>
              )}
              <button
                type="button"
                className={`btn btn-outline-secondary btn-sm${resolvedBusy ? " btn-busy" : ""}`}
                disabled={resolvedBusy}
                onClick={handleMarkResolved}
              >
                {resolvedBusy ? "Saving…" : "Mark Problem as Resolved"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Issue 4-4 (Lab 4) — read-only Actions Taken (BR-15) and the Status History timeline. */}
      <ActionsTakenSection
        ticketId={ticket.id}
        ticketCreatedAt={ticket.createdAt}
        ticketStatus={ticket.currentStatus}
        actions={ticket.actions}
        mode="requester"
      />
      <StatusHistorySection history={ticket.statusHistory} />

      {/* Issue 3-3 — Public Comments */}
      <CommentsSection ticketId={ticket.id} comments={ticket.comments} onPosted={handleCommentPosted} />
    </div>
  );
}
