// Issue 2-4 (Lab 2) — BR-05: Ticket Number = TK-<creation year>-<6-digit zero-padded id>.
// Pure formatting only; the caller obtains a real, unique `id` first (see app.ts's use of
// `SELECT nextval(pg_get_serial_sequence(...))`) before calling this — Postgres's own sequence
// guarantees uniqueness (BR-01) under concurrent inserts, so no locking/retry logic is needed here.
export function formatTicketNumber(id: number, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const paddedId = String(id).padStart(6, "0");
  return `TK-${year}-${paddedId}`;
}
