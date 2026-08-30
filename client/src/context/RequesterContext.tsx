import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";
import type { Requester } from "../api.js";

// Issue 2-3 (Lab 2) — BR-08: the selected Requester's id (here, the full Requester so the shell
// can show a name/email without refetching) is stored client-side and is the current testing
// context for every Requester-scoped screen and API call. BR-40/BR-41: this is a Lab 2 testing
// mechanism, not authentication, and is replaced by real session identity in Lab 3.
const STORAGE_KEY = "toktickit.selectedRequester";

function readStoredRequester(): Requester | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === "number" &&
      typeof parsed.name === "string" &&
      typeof parsed.email === "string"
    ) {
      return parsed as Requester;
    }
    return null;
  } catch {
    // localStorage unavailable (private browsing, disabled storage, or corrupt value) —
    // fail safe into "no Requester selected" rather than crash the app.
    return null;
  }
}

function writeStoredRequester(requester: Requester | null) {
  try {
    if (requester) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(requester));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Same fallback as above: the in-memory React state still works for this session even if
    // persistence fails, it just won't survive a reload.
  }
}

interface RequesterContextValue {
  requester: Requester | null;
  selectRequester: (requester: Requester) => void;
  changeRequester: () => void;
}

const RequesterContext = createContext<RequesterContextValue | null>(null);

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(() => readStoredRequester());

  const selectRequester = useCallback((next: Requester) => {
    writeStoredRequester(next);
    setRequester(next);
  }, []);

  // "Change Requester" (BR-09, BR-10): clears the current selection and every Requester-scoped
  // screen redirects back to the Selection screen since `requester` becomes null.
  const changeRequester = useCallback(() => {
    writeStoredRequester(null);
    setRequester(null);
  }, []);

  const value = useMemo(
    () => ({ requester, selectRequester, changeRequester }),
    [requester, selectRequester, changeRequester]
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequester(): RequesterContextValue {
  const ctx = useContext(RequesterContext);
  if (!ctx) {
    throw new Error("useRequester must be used within a RequesterProvider");
  }
  return ctx;
}
