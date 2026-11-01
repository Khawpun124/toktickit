import type { UserRole } from "./api.js";

// Roles and the application's paths in one place. The router (App.tsx), the header navigation
// (AppHeader.tsx), and the dashboard guard (DashboardRoute.tsx) read them from here.

export type { UserRole };

export const ROUTES = {
  myTickets: "/tickets",
  createTicket: "/tickets/new",
  requesterTicket: "/tickets/:id",
  requesterDashboard: "/dashboard",
  staffDashboard: "/staff/dashboard",
  queue: "/staff/tickets",
  staffTicket: "/staff/tickets/:id",
  userManagement: "/admin/users",
} as const;

export type DashboardPath = typeof ROUTES.requesterDashboard | typeof ROUTES.staffDashboard;

export const ROLE_LABELS: Record<UserRole, string> = {
  REQUESTER: "Requester",
  IT_STAFF: "IT Staff",
  ADMINISTRATOR: "Administrator",
};

export const isRequester = (role: string | undefined): boolean => role === "REQUESTER";
export const isStaffOrAdmin = (role: string | undefined): boolean => role === "IT_STAFF" || role === "ADMINISTRATOR";

/** The dashboard of a role: /dashboard for Requesters, /staff/dashboard for IT Staff and Administrators. */
export function dashboardPathFor(role: string | undefined): DashboardPath {
  return isRequester(role) ? ROUTES.requesterDashboard : ROUTES.staffDashboard;
}

/**
 * Where each role starts after login (FR-16 as clarified): IT Staff and Administrators land on the
 * IT Staff Dashboard; a Requester keeps landing on My Tickets, as in Labs 2 and 3.
 */
export function landingPathFor(role: string | undefined): string {
  return isRequester(role) ? ROUTES.myTickets : ROUTES.staffDashboard;
}
