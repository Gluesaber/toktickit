import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

// Issue 4-5 (Lab 4) — URL-driven list filters (docs/lab-04/ui-spec.md §4, FR-16). My Tickets, the
// Ticket Queue and User Management keep their filters in the query string, so:
//   * a dashboard card's drill-down link opens an already-filtered list;
//   * refresh, back/forward and bookmarks keep the filters;
// Each page still owns its filter state; this module only (1) parses and validates the URL into
// initial values and (2) keeps the URL in step with the state afterwards.

export interface ParamRule {
  // Allowed values, or a test the value must pass. Anything else is dropped (with a notice).
  allowed?: readonly string[];
  test?: (value: string) => boolean;
}

export type ParamSpec = Record<string, ParamRule>;

export const isPositiveInt = (v: string) => /^[1-9]\d*$/.test(v);

// Unknown keys are ignored silently; a known key with a bad value is dropped and reported, so the
// page can show "Some filters in the link were not recognized and were cleared." instead of a raw 400.
export function parseFilterParams(params: URLSearchParams, spec: ParamSpec): { values: Record<string, string>; invalid: boolean } {
  const values: Record<string, string> = {};
  let invalid = false;
  for (const [key, rule] of Object.entries(spec)) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    const ok = (rule.allowed ? rule.allowed.includes(raw) : true) && (rule.test ? rule.test(raw) : true);
    if (ok) values[key] = raw;
    else invalid = true;
  }
  return { values, invalid };
}

function toQuery(values: Record<string, string>, spec: ParamSpec): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(spec)) {
    if (values[key]) params.set(key, values[key]);
  }
  return params.toString();
}

// Keeps the URL in step with the page's filter values (replace navigation, so typing in a search box
// doesn't flood the history), and calls `onExternalChange` when the URL changes for any other reason
// — back/forward, or a nav/drill-down link to the same screen — since React Router keeps the
// component mounted in that case and its state would otherwise go stale.
//
// "External" is decided by content, not by tracking our own writes: the URL is cleaned up (unknown
// keys and bad values dropped) and compared with the page's current filters. If they match, the URL
// already shows this page's state — including on first load, where the page has just initialised from
// it, and under React StrictMode, which runs these effects twice in development. Only a URL whose
// cleaned-up filters differ from the page's is applied.
export function useUrlFilterSync(
  values: Record<string, string>,
  spec: ParamSpec,
  onExternalChange: (values: Record<string, string>, invalid: boolean) => void
) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = toQuery(values, spec);

  useEffect(() => {
    if (query !== searchParams.toString()) {
      setSearchParams(new URLSearchParams(query), { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    const parsed = parseFilterParams(searchParams, spec);
    if (toQuery(parsed.values, spec) === query) return; // the URL already reflects this page's state
    onExternalChange(parsed.values, parsed.invalid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}

export const INVALID_LINK_NOTICE = "Some filters in the link were not recognized and were cleared.";
