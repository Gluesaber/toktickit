import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";

// Issue 2-7 (Lab 2) — local-disk attachment storage. BR-27/BR-28/BR-29/BR-30.
// Resolved relative to this module's own location (not process.cwd()) so it works the same
// whether the server is started from server/ via `npm run dev`, `npm test`, or `npm start`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // BR-28
export const MAX_ACTIVE_ATTACHMENTS = 5; // BR-29

// BR-27: allowed types are enforced by *both* extension and MIME type, not either alone — a
// mismatched pair (e.g. a renamed .exe with a spoofed image/png header) is rejected.
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function isAllowedAttachment(originalName: string, mimeType: string): boolean {
  const ext = path.extname(originalName).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_TYPES.has(mimeType);
}

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  // BR-30: generated safe filename, never the client-supplied one — avoids path traversal and
  // collisions. The original name is kept separately as display metadata (Attachment.originalFileName).
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (isAllowedAttachment(file.originalname, file.mimetype)) {
      callback(null, true);
    } else {
      // A truthy first arg both rejects the file and surfaces as `err` in the upload callback,
      // where the route distinguishes it from a size-limit error (app.ts).
      callback(new Error("UNSUPPORTED_FILE_TYPE"));
    }
  },
});
