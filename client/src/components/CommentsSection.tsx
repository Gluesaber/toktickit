import { FormEvent, useState } from "react";
import { Comment, ApiError, postComment } from "../api.js";
import { RoleBadge } from "./Badges.js";

// Issue 3-3 (Lab 3) — Public Comments section on Ticket Detail. docs/lab-03/ui-spec.md §5.1.
// Same visual-separation principle as AttachmentSection: its own card below the read-only fields.
interface Props {
  ticketId: number;
  comments: Comment[];
  onPosted: (comment: Comment) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function CommentsSection({ ticketId, comments, onPosted }: Props) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return; // BR-26: empty/whitespace-only blocked client-side too, not just server-side.

    setBusy(true);
    setError(null);
    try {
      const comment = await postComment(ticketId, content);
      onPosted(comment);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to post the comment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-3">
      <div className="card-body">
        <h2 className="h6 card-title">Comments</h2>

        {comments.length === 0 && <p className="text-muted small">No comments yet.</p>}

        {comments.length > 0 && (
          <ul className="list-unstyled mb-3">
            {comments.map((c) => (
              <li key={c.id} className="py-2 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="fw-semibold">{c.author.name}</span>
                  <RoleBadge role={c.author.role} />
                  <span className="small text-muted">{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {c.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="text-danger small mb-2" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label htmlFor="new-comment" className="form-label small fw-semibold">
            Post a comment
          </label>
          <textarea
            id="new-comment"
            className="form-control mb-2"
            rows={2}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className={`btn btn-outline-secondary btn-sm${busy ? " btn-busy" : ""}`} disabled={busy || !draft.trim()}>
            {busy ? "Posting…" : "Post Comment"}
          </button>
        </form>
      </div>
    </div>
  );
}
