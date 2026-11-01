import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { dashboardPathFor, type DashboardPath } from "../../roles.js";

// Role routing for the dashboards (ui-spec section 3). Requesters use /dashboard; IT Staff and
// Administrators use /staff/dashboard (src/roles.ts). Opening another role's dashboard redirects to
// your own with a notification, never a raw error.

export const NO_ACCESS_MESSAGE = "You do not have access to that page.";

export const DashboardRoute: React.FC<{ path: DashboardPath; children: React.ReactNode }> = ({ path, children }) => {
  const { user } = useAuth();
  const own = dashboardPathFor(user?.role);
  if (own !== path) {
    return <Navigate to={own} replace state={{ notification: NO_ACCESS_MESSAGE }} />;
  }
  return <>{children}</>;
};
