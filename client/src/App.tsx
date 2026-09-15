import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import LoginPage from "./pages/LoginPage.js";
import ChangePasswordPage from "./pages/ChangePasswordPage.js";
import AppShell from "./components/AppShell.js";
import MyTicketsPage from "./pages/MyTicketsPage.js";
import CreateTicketPage from "./pages/CreateTicketPage.js";
import TicketDetailPage from "./pages/TicketDetailPage.js";

// Issue 3-2 (Lab 3) — outer authentication gate (BR-11, BR-13, AC-10):
//   no session          -> Login
//   mustChangePassword  -> Change Password only, nothing else reachable
//   otherwise           -> the routed app
// Issue 3-3 (Lab 3) — the inner Requester-selection gate (RequesterProvider/RequesterGate/
// DevRequesterSelector) is removed entirely (BR-39): the Lab 2 screens below now derive their
// identity from the authenticated session server-side, not from a client-selected Requester.
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </BrowserRouter>
  );
}
