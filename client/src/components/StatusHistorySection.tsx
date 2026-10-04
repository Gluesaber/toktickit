import { StatusHistoryEntry } from "../api.js";
import { RoleBadge, StatusBadge } from "./Badges.js";

// Issue 4-4 (Lab 4) — Status History timeline, docs/lab-04/ui-spec.md §5.4 (FR-09, BR-20, BR-21).
// Shared by the Requester and staff Ticket Detail screens. Read-only: nothing on any screen can edit
// or remove an entry (the API has no route for it either). Tickets created before Lab 4 have no
// "Created as New" entry, so the timeline says earlier history wasn't recorded instead of implying
// the ticket started at its first recorded change.
interface Props {
  history: StatusHistoryEntry[];
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function StatusHistorySection({ history }: Props) {
  const hasCreationEntry = history.length > 0 && history[0].fromStatus === null;

  return (
    <div className="card mt-3">
      <div className="card-body">
        <h2 className="h6 card-title">Status History</h2>
        {!hasCreationEntry && (
          <p className="small text-muted mb-2">
            History before {history.length > 0 ? formatDateTime(history[0].changedAt) : "this upgrade"} was not recorded.
          </p>
        )}
        {history.length > 0 && (
          <ol className="zg-timeline" aria-label="Status changes, oldest first">
            {history.map((h) => (
              <li key={h.id}>
                <div className="d-flex flex-wrap align-items-center gap-1">
                  {h.fromStatus === null ? (
                    <span>
                      Created as <StatusBadge status={h.toStatus} />
                    </span>
                  ) : (
                    <span>
                      <StatusBadge status={h.fromStatus} /> <span aria-hidden="true">→</span>
                      <span className="visually-hidden"> to </span> <StatusBadge status={h.toStatus} />
                    </span>
                  )}
                </div>
                <div className="small text-muted d-flex flex-wrap align-items-center gap-1 mt-1">
                  <span>by {h.changedBy.name}</span>
                  <RoleBadge role={h.changedBy.role} />
                  <span>· {formatDateTime(h.changedAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
