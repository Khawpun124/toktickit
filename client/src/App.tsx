import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { AppHeader } from "./components/AppHeader.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { ChangePasswordScreen } from "./components/ChangePasswordScreen.js";
import { CreateTicketScreen } from "./components/CreateTicketScreen.js";
import { MyTicketsScreen } from "./components/MyTicketsScreen.js";
import { RequesterTicketDetailScreen } from "./components/RequesterTicketDetailScreen.js";
import { StaffTicketQueueScreen } from "./components/StaffTicketQueueScreen.js";
import { StaffTicketDetailScreen } from "./components/StaffTicketDetailScreen.js";
import { UserManagementScreen } from "./components/UserManagementScreen.js";
import "./index.css";

export function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const renderMainContent = () => {
    if (!user) {
      return <LoginScreen />;
    }

    if (user.mustChangePassword) {
      return <ChangePasswordScreen />;
    }

    const defaultPath =
      user.role === "ADMINISTRATOR"
        ? "/admin/users"
        : user.role === "IT_STAFF"
        ? "/staff/tickets"
        : "/tickets";

    return (
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/tickets" element={<MyTicketsScreen />} />
        <Route path="/tickets/new" element={<CreateTicketScreen />} />
        <Route path="/tickets/:id" element={<RequesterTicketDetailScreen />} />
        <Route path="/staff/tickets" element={<StaffTicketQueueScreen />} />
        <Route path="/staff/tickets/:id" element={<StaffTicketDetailScreen />} />
        <Route path="/admin/users" element={<UserManagementScreen />} />
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
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
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </AuthProvider>
  );
}









