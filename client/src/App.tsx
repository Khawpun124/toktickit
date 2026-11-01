import React, { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import { RequesterDashboardScreen } from "./components/dashboard/RequesterDashboardScreen.js";
import { StaffDashboardScreen } from "./components/dashboard/StaffDashboardScreen.js";
import { DashboardRoute, landingPathFor } from "./components/dashboard/DashboardRoute.js";
import "./index.css";

/**
 * Sends each role to its starting page right after signing in, and right after the mandatory
 * password change (ui-spec section 3): IT Staff and Administrators to /staff/dashboard, a
 * Requester to My Tickets. Only those two transitions redirect: the first settled state after a
 * page load (a session restored by /api/auth/me) keeps the URL that was opened.
 *
 * The decision is made while rendering, so the page behind a deep link is never mounted (and so
 * cannot start its own requests or redirects) before the landing page replaces it.
 */
function useLandingAfterSignIn(): string | null {
  const { user, loading } = useAuth();
  // Subscribing to the location re-renders AppContent once the redirect below has happened.
  useLocation();
  const previous = useRef<{ signedIn: boolean; mustChange: boolean } | null>(null);
  const now = loading ? null : { signedIn: !!user, mustChange: !!user?.mustChangePassword };

  useEffect(() => {
    if (now) previous.current = now;
  });

  const before = previous.current;
  if (!now || !before || !user || now.mustChange) return null;
  const signedIn = !before.signedIn;
  const passwordChanged = before.mustChange;
  return signedIn || passwordChanged ? landingPathFor(user.role) : null;
}

export function AppContent() {
  const { user, loading } = useAuth();
  const landing = useLandingAfterSignIn();

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

    // Requester: /tickets as before; IT Staff and Administrator: /staff/dashboard (FR-16).
    const defaultPath = landingPathFor(user.role);

    if (landing) {
      return <Navigate to={landing} replace />;
    }

    return (
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/dashboard" element={<DashboardRoute path="/dashboard"><RequesterDashboardScreen /></DashboardRoute>} />
        <Route path="/staff/dashboard" element={<DashboardRoute path="/staff/dashboard"><StaffDashboardScreen /></DashboardRoute>} />
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









