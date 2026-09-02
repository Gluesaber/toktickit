import { ChangeEvent, useState } from "react";
import { Attachment, ApiError, uploadAttachment, removeAttachment, getAttachmentDownloadUrl } from "../api.js";
import { validateAttachmentFile } from "../attachmentValidation.js";

// Issue 2-7 (Lab 2) — Ticket Detail's Attachment section: list (active + removed), add, download,
// soft-remove with an optional reason. docs/lab-02/ui-spec.md §6.2.
interface Props {
  ticketId: number;
  requesterId: number;
  attachments: Attachment[];
  onRefresh: () => Promise<void>;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function AttachmentSection({ ticketId, requesterId, attachments, onRefresh }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [removeError, setRemoveError] = useState<string | null>(null);

  const activeCount = attachments.filter((a) => a.active).length;

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a failure
    if (!file) return;

    const validationError = validateAttachmentFile(file, activeCount);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      await uploadAttachment(ticketId, requesterId, file);
      await onRefresh();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Unable to upload the attachment.");
    } finally {
      setUploading(false);
    }
  }

  function startRemove(id: number) {
    setRemovingId(id);
    setReasonDraft("");
    setRemoveError(null);
  }

  async function confirmRemove(id: number) {
    try {
      await removeAttachment(id, requesterId, reasonDraft.trim() || undefined);
      setRemovingId(null);
      await onRefresh();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : "Unable to remove the attachment.");
    }
  }

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h6 card-title">Attachments</h2>

        {attachments.length === 0 && <p className="text-muted small">No attachments yet.</p>}

        {attachments.length > 0 && (
          <ul className="list-unstyled mb-3">
            {attachments.map((a) => (
              <li key={a.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                  {a.active ? (
                    <a href={getAttachmentDownloadUrl(a.id, requesterId)}>{a.originalFileName}</a>
                  ) : (
                    <span className="text-muted text-decoration-line-through">{a.originalFileName}</span>
                  )}
                  <div className="small text-muted">
                    {formatSize(a.fileSizeBytes)} · uploaded {new Date(a.uploadedAt).toLocaleDateString()}
                    {!a.active && a.removedAt && (
                      <>
                        {" "}
                        · removed {new Date(a.removedAt).toLocaleDateString()}
                        {a.removalReason ? ` — ${a.removalReason}` : ""}
                      </>
                    )}
                  </div>
                </div>

                <div>
                  {a.active ? (
                    removingId === a.id ? (
                      <div className="d-flex gap-1 align-items-center">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Reason (optional)"
                          aria-label={`Removal reason for ${a.originalFileName}`}
                          value={reasonDraft}
                          onChange={(e) => setReasonDraft(e.target.value)}
                          style={{ width: 160 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => confirmRemove(a.id)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setRemovingId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => startRemove(a.id)}
                      >
                        Remove
                      </button>
                    )
                  ) : (
                    <span
                      className="badge text-bg-secondary"
                      title="This attachment has been removed and is no longer available."
                    >
                      Unavailable
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {removeError && (
          <div className="text-danger small mb-2" role="alert">
            {removeError}
          </div>
        )}
        {uploadError && (
          <div className="text-danger small mb-2" role="alert">
            {uploadError}
          </div>
        )}

        <label className="btn btn-outline-secondary btn-sm mb-0">
          {uploading ? "Uploading…" : "Add Attachment"}
          <input
            type="file"
            className="d-none"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            disabled={uploading}
            onChange={handleFileChange}
          />
        </label>
      </div>
    </div>
  );
}
