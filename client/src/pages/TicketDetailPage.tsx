import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, TicketDetail, getTicket } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";
import { PriorityBadge, StatusBadge } from "../components/Badges.js";
import AttachmentSection from "../components/AttachmentSection.js";

// Issue 2-6 (Lab 2) — Requester Ticket Detail: read-only ticket fields + attachments.
// docs/lab-02/ui-spec.md §6, specification.md FR-12/FR-13, BR-12/BR-40, AC-20/AC-21.
// Issue 2-7 (Lab 2) — the Attachment section is now the real add/download/remove UI.
type LoadState = "loading" | "ready" | "not-found" | "failure";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { requester } = useRequester();

  const [state, setState] = useState<LoadState>("loading");
  const [ticket, setTicket] = useState<TicketDetail | null>(null);

  async function load() {
    if (!requester || !id) return;
    setState("loading");
    try {
      const result = await getTicket(Number(id), requester.id);
      setTicket(result);
      setState("ready");
    } catch (err) {
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
  }, [id, requester?.id]);

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
      <AttachmentSection
        ticketId={ticket.id}
        requesterId={requester!.id}
        attachments={ticket.attachments}
        onRefresh={load}
      />
    </div>
  );
}
