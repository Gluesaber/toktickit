import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import LoginPage from "./pages/LoginPage.js";
import ChangePasswordPage from "./pages/ChangePasswordPage.js";
import DevRequesterSelector from "./components/DevRequesterSelector.js";
import AppShell from "./components/AppShell.js";
import MyTicketsPage from "./pages/MyTicketsPage.js";
import CreateTicketPage from "./pages/CreateTicketPage.js";
import TicketDetailPage from "./pages/TicketDetailPage.js";

// Issue 2-3 (Lab 2) — BR-10: every screen in this app is Requester-scoped, so with no Requester
// selected we always show the Selection screen instead of the routed app, regardless of path
// (AC-02 covers this for My Tickets specifically; this generalizes it to every route).
// Issue 3-3 (Lab 3) removes this inner gate/selector entirely once the Lab 2 screens are migrated
// onto the session identity — deliberately left untouched by Issue 3-2 (specification.md's
// accepted intermediate state: a real Login screen wraps the still-present Dev Selector for one
// issue's worth of PRs).
function RequesterGate() {
  const { requester } = useRequester();

  if (!requester) {
    return <DevRequesterSelector />;
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<MyTicketsPage />} />
        <Route path="/tickets/new" element={<CreateTicketPage />} />
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Route>
    </Routes>
  );
}

// Issue 3-2 (Lab 3) — outer authentication gate (BR-11, BR-13, AC-10):
//   no session      -> Login
//   mustChangePassword -> Change Password only, nothing else reachable
//   otherwise       -> the existing app, unchanged (RequesterGate above)
function AuthGate() {
  const { status, user } = useAuth();

  if (status === "loading") {
    return null; // brief, no flash-of-login-screen while GET /api/auth/me is in flight
  }
  if (status === "unauthenticated" || !user) {
    return <LoginPage />;
  }
  if (user.mustChangePassword) {
    return <ChangePasswordPage />;
  }

  return (
    <RequesterProvider>
      <RequesterGate />
    </RequesterProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
