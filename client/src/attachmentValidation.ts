// Issue 2-7 (Lab 2) — client-side pre-check mirroring server/src/upload.ts's rules (BR-27/28/29).
// This is a UX convenience only; the backend re-validates everything and is the real enforcement.
export const ALLOWED_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
export const ALLOWED_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

export function validateAttachmentFile(file: File, currentActiveCount: number): string | null {
  const ext = `.${(file.name.split(".").pop() ?? "").toLowerCase()}`;
  const extensionOk = ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext);
  // Some browsers leave file.type empty for certain files — don't let that alone cause a false
  // rejection; the backend's extension+MIME check is the real gate (BR-27).
  const typeOk = file.type === "" || ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type);
  if (!extensionOk || !typeOk) {
    return "Unsupported file type. Use JPG, PNG, WEBP, or PDF.";
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return "File exceeds the 5 MB limit.";
  }
  if (currentActiveCount >= MAX_ACTIVE_ATTACHMENTS) {
    // Neutral wording since this validator runs both before a Ticket exists (Create Ticket,
    // staged files) and after (Ticket Detail's Attachment section, already-active attachments).
    return `Only ${MAX_ACTIVE_ATTACHMENTS} attachments are allowed.`;
  }
  return null;
}
