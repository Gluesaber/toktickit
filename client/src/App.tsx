import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import DevRequesterSelector from "./components/DevRequesterSelector.js";
import AppShell from "./components/AppShell.js";
import MyTicketsPage from "./pages/MyTicketsPage.js";
import CreateTicketPage from "./pages/CreateTicketPage.js";
import TicketDetailPage from "./pages/TicketDetailPage.js";

// Issue 2-3 (Lab 2) — BR-10: every screen in this app is Requester-scoped, so with no Requester
// selected we always show the Selection screen instead of the routed app, regardless of path
// (AC-02 covers this for My Tickets specifically; this generalizes it to every route).
function Gate() {
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

export default function App() {
  return (
    <BrowserRouter>
      <RequesterProvider>
        <Gate />
      </RequesterProvider>
    </BrowserRouter>
  );
}
