import { useEffect, useState } from "react";
import { getRequesters, Requester } from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

// Issue 2-3 (Lab 2) — Development Requester Selection screen. docs/lab-02/ui-spec.md §3.
// Loading -> Empty (BR-39, AC-27) / Failure (AC-28) / Ready -> Continue selects (AC-01 depends
// on a Requester having been chosen first; AC-30 keyboard operability: native <select> + <button>
// are both natively tab-reachable with a visible focus ring, no custom widget needed).
type LoadState = "loading" | "empty" | "failure" | "ready";

export default function DevRequesterSelector() {
  const { selectRequester } = useRequester();
  const [state, setState] = useState<LoadState>("loading");
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  async function load() {
    setState("loading");
    try {
      const result = await getRequesters();
      setRequesters(result);
      setState(result.length === 0 ? "empty" : "ready");
    } catch {
      setState("failure");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleContinue() {
    const requester = requesters.find((r) => String(r.id) === selectedId);
    if (requester) {
      selectRequester(requester);
    }
  }

  return (
    <div className="d-flex justify-content-center align-items-center py-5" style={{ minHeight: "100vh" }}>
      <div className="card shadow-sm border" style={{ maxWidth: 480, width: "100%" }}>
        <div className="card-body p-4">
          <h1 className="h4 mb-3">TokTickIT</h1>
          <p className="text-muted small mb-4">
            Select a Development Requester to test requester-specific ticket behavior. This is not
            a login screen. Authentication and role-based access will be introduced in Lab 3.
          </p>

          {state === "loading" && (
            <div className="placeholder-glow" aria-live="polite">
              <span className="placeholder col-12 mb-3" style={{ height: 40, display: "block" }} />
              <span className="placeholder col-6" style={{ height: 40, display: "block" }} />
            </div>
          )}

          {state === "empty" && (
            <div className="alert alert-warning mb-0" role="alert">
              No active Development Requesters are available. Contact an administrator.
            </div>
          )}

          {state === "failure" && (
            <div className="alert alert-danger mb-0" role="alert">
              <p className="mb-3">Unable to load Development Requesters. Try again.</p>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={load}>
                Retry
              </button>
            </div>
          )}

          {state === "ready" && (
            <>
              <label htmlFor="requester-select" className="form-label fw-semibold">
                Development Requester
              </label>
              <select
                id="requester-select"
                className="form-select mb-3"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="" disabled>
                  Choose a requester…
                </option>
                {requesters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-success w-100"
                disabled={selectedId === ""}
                onClick={handleContinue}
              >
                Continue
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
