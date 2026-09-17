import { FormEvent, useState } from "react";
import { Note, ApiError, postNote } from "../api.js";
import { RoleBadge } from "./Badges.js";

// Issue 3-5 (Lab 3) — Internal Notes on Staff Ticket Detail. docs/lab-03/ui-spec.md §7.4.
// Same list/post shape as CommentsSection, but the card header uses --zg-warning-bg plus a caption
// (the "internal-notes-card" class below) so it can never be visually mistaken for the Public
// Comments card next to it — the labsheet's explicit requirement, not just a text label at post time.
interface Props {
  ticketId: number;
  notes: Note[];
  onPosted: (note: Note) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function NotesSection({ ticketId, notes, onPosted }: Props) {
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
      const note = await postNote(ticketId, content);
      onPosted(note);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to post the note.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card mt-3 internal-notes-card">
      <div className="card-header internal-notes-card-header">
        <h2 className="h6 mb-0">Internal Notes</h2>
        <span className="small ms-2">Internal — IT Staff/Administrator only</span>
      </div>
      <div className="card-body">
        {notes.length === 0 && <p className="text-muted small">No internal notes yet.</p>}

        {notes.length > 0 && (
          <ul className="list-unstyled mb-3">
            {notes.map((n) => (
              <li key={n.id} className="py-2 border-bottom">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="fw-semibold">{n.author.name}</span>
                  <RoleBadge role={n.author.role} />
                  <span className="small text-muted">{formatDateTime(n.createdAt)}</span>
                </div>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                  {n.content}
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
          <label htmlFor="new-note" className="form-label small fw-semibold">
            Add an internal note
          </label>
          <textarea
            id="new-note"
            className="form-control mb-2"
            rows={2}
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" className={`btn btn-outline-secondary btn-sm${busy ? " btn-busy" : ""}`} disabled={busy || !draft.trim()}>
            {busy ? "Posting…" : "Post Note"}
          </button>
        </form>
      </div>
    </div>
  );
}
