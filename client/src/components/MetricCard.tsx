import { Link } from "react-router-dom";

// Issue 4-5 (Lab 4) — one dashboard number, docs/lab-04/ui-spec.md §1.2/§3.1. A <section> with a
// heading so screen readers can jump between cards; the value is plain text; the drill-down is a real
// link whose accessible name says what it opens ("View Unassigned (3)"), not just "View".
// `value === null` is the loading placeholder — never a number that might be stale (AC-32).
interface Props {
  label: string;
  value: number | null;
  drillDown?: string | null;
  // ui-spec.md §3.2 — e.g. "Waiting for you": a warning border *and* a text cue, never color alone.
  attention?: string | null;
}

export default function MetricCard({ label, value, drillDown, attention }: Props) {
  return (
    <section className={`card h-100 zg-metric-card${attention ? " zg-metric-card-attention" : ""}`} aria-label={label}>
      <div className="card-body d-flex flex-column">
        <h2 className="zg-metric-label mb-1">{label}</h2>
        <p className="zg-metric-value mb-1">{value === null ? "—" : value}</p>
        {attention && <p className="small fw-semibold zg-metric-attention-text mb-1">{attention}</p>}
        {drillDown && value !== null && (
          <Link to={drillDown} className="mt-auto small fw-semibold" aria-label={`View ${label} (${value})`}>
            View
          </Link>
        )}
      </div>
    </section>
  );
}
