import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { RequesterProvider, useRequester } from "./context/RequesterContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { ChangePasswordScreen } from "./components/ChangePasswordScreen.js";
import { RequesterSelectionScreen } from "./components/RequesterSelectionScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import { MyTicketsScreen } from "./components/MyTicketsScreen.js";
import { RequesterTicketDetailScreen } from "./components/RequesterTicketDetailScreen.js";
import "./index.css";

export function AppContent() {
  const { user, loading } = useAuth();
  const { selectedRequester } = useRequester();
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const effectiveUser = selectedRequester
    ? {
        id: selectedRequester.id,
        name: selectedRequester.name,
        email: selectedRequester.email,
        role: "REQUESTER" as const,
        mustChangePassword: false,
      }
    : user;

  const renderMainContent = () => {
    if (!effectiveUser) {
      if (showLogin) {
        return (
          <div>
            <LoginScreen />
            <div className="text-center pb-4">
              <button className="btn btn-link text-success text-decoration-none" onClick={() => setShowLogin(false)}>
                Back to Requester Selector
              </button>
            </div>
          </div>
        );
      }
      return (
        <div>
          <RequesterSelectionScreen />
          <div className="text-center pb-4">
            <button className="btn btn-link text-success text-decoration-none" onClick={() => setShowLogin(true)}>
              Sign In with Email & Password
            </button>
          </div>
        </div>
      );
    }

    if (effectiveUser.mustChangePassword) {
      return <ChangePasswordScreen />;
    }

    return (
      <Routes>
        <Route path="/" element={<Navigate to="/tickets" replace />} />
        <Route path="/tickets" element={<MyTicketsScreen />} />
        <Route path="/tickets/new" element={<CreateTicketScreen />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetailScreen />} />
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>
    );
  };

  return (
    <div className="min-vh-100 d-flex flex-column">
      <AppHeader />
      <main className="flex-grow-1">{renderMainContent()}</main>
    </div>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <RequesterProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </RequesterProvider>
    </AuthProvider>
  );
}








