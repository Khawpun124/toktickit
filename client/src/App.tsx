import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import { MyTicketsScreen } from "./components/MyTicketsScreen.js";
import { RequesterTicketDetailScreen } from "./components/RequesterTicketDetailScreen.js";
import "./index.css";

function RequireRequester({ children }: { children: JSX.Element }) {
  const { selectedRequester } = useRequester();
  if (!selectedRequester) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function SelectionRoute() {
  const { selectedRequester } = useRequester();
  if (selectedRequester) {
    return <Navigate to="/tickets" replace />;
  }
  return <RequesterSelectionScreen />;
}

export function AppContent() {
  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppHeader />
      <main className="flex-grow-1">
        <Routes>
          <Route path="/" element={<SelectionRoute />} />
          <Route path="/select-requester" element={<Navigate to="/" replace />} />
          <Route
            path="/tickets"
            element={
              <RequireRequester>
                <MyTicketsScreen />
              </RequireRequester>
            }
          />
          <Route
            path="/tickets/new"
            element={
              <RequireRequester>
                <CreateTicketScreen />
              </RequireRequester>
            }
          />
          <Route
            path="/tickets/:id"
            element={
              <RequireRequester>
                <RequesterTicketDetailScreen />
              </RequireRequester>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <RequesterProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </RequesterProvider>
  );
}





