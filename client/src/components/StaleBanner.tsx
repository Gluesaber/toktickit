import { useEffect, useRef } from "react";

// Issue 4-4 (Lab 4) — docs/lab-04/ui-spec.md §5.2. Shown when a write comes back 409 STALE_UPDATE:
// someone else changed the Ticket (or Action) since this screen loaded it. Never clears what the
// user selected or typed — the parent keeps that state; Reload only refreshes the record. Takes
// focus as an alert so keyboard and screen-reader users notice it.
interface Props {
  message?: string;
  onReload: () => void;
  reloading?: boolean;
}

export default function StaleBanner({
  message = "This ticket was changed by someone else since you opened it.",
  onReload,
  reloading = false,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <div ref={ref} tabIndex={-1} className="alert alert-warning py-2 small d-flex flex-wrap gap-2 align-items-center" role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={reloading} onClick={onReload}>
        {reloading ? "Reloading…" : "Reload ticket"}
      </button>
    </div>
  );
}
