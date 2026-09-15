import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { getMe, login as apiLogin, logout as apiLogout, type User } from "../api.js";

// Issue 3-2 (Lab 3) — the authenticated identity, sitting alongside RequesterContext for now (not
// replacing it — that's Issue 3-3's job, which removes the Dev Requester Selector and migrates the
// Lab 2 screens onto the session identity). Unlike RequesterContext's localStorage-persisted
// selection, there is nothing to persist client-side here: the session lives in the HTTP-only
// cookie (BR-09), invisible to JS by design, so identity is restored by asking the backend
// (GET /api/auth/me) on mount rather than reading anything out of storage.
type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // Called after a successful password change so the rest of the app sees mustChangePassword
  // flip to false immediately, without a second round trip to /api/auth/me.
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((result) => {
        if (cancelled) return;
        setUserState(result);
        setStatus(result ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (cancelled) return;
        // A failed /api/auth/me (network/server error, not a 401) is treated the same as "not
        // logged in" — Login is always a safe place to land, never a blank/broken screen.
        setUserState(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiLogin(email, password);
    setUserState(result);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUserState(null);
    setStatus("unauthenticated");
  }, []);

  const setUser = useCallback((next: User) => {
    setUserState(next);
    setStatus("authenticated");
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, setUser }),
    [user, status, login, logout, setUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
