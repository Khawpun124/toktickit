import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";

// Role routing for the dashboards (ui-spec section 3). Requesters use /dashboard; IT Staff and
// Administrators use /staff/dashboard. Opening another role's dashboard redirects to your own with
// a notification, never a raw error.

export const NO_ACCESS_MESSAGE = "You do not have access to that page.";

export function dashboardPathFor(role: string | undefined): string {
  return role === "REQUESTER" ? "/dashboard" : "/staff/dashboard";
}

/**
 * Where each role starts (FR-16 as clarified): IT Staff and Administrators land on the IT Staff
 * Dashboard; a Requester keeps landing on My Tickets, as in Labs 2 and 3.
 */
export function landingPathFor(role: string | undefined): string {
  return role === "REQUESTER" ? "/tickets" : "/staff/dashboard";
}

export const DashboardRoute: React.FC<{ path: "/dashboard" | "/staff/dashboard"; children: React.ReactNode }> = ({ path, children }) => {
  const { user } = useAuth();
  const own = dashboardPathFor(user?.role);
  if (own !== path) {
    return <Navigate to={own} replace state={{ notification: NO_ACCESS_MESSAGE }} />;
  }
  return <>{children}</>;
};
