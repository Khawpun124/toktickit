import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { ROLE_LABELS, ROUTES, dashboardPathFor } from "../roles.js";

type Tab = "dashboard" | "my-tickets" | "create-ticket" | "my-queue" | "user-management";

/** Which entry is the current page, from the path (src/roles.ts holds the paths). */
function tabFor(pathname: string): Tab {
  if (pathname === ROUTES.requesterDashboard || pathname === ROUTES.staffDashboard) return "dashboard";
  if (pathname === ROUTES.createTicket) return "create-ticket";
  if (pathname.startsWith(ROUTES.userManagement)) return "user-management";
  if (pathname.startsWith(ROUTES.queue)) return "my-queue";
  return "my-tickets";
}

export const AppHeader: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const currentUser = user;
  const currentTab = tabFor(location.pathname);

  // Lab 4: the Dashboard entry, and aria-current="page" on the active entry (ui-spec section 3).
  const handleNavDashboard = () => navigate(dashboardPathFor(currentUser?.role));
  const ariaCurrent = (tab: Tab) => (currentTab === tab ? ("page" as const) : undefined);
  const dashboardButton = (
    <button
      onClick={handleNavDashboard}
      aria-current={ariaCurrent("dashboard")}
      className={`btn btn-sm ${
        currentTab === "dashboard"
          ? "btn-light fw-bold text-success"
          : "btn-outline-light"
      }`}
    >
      Dashboard
    </button>
  );

  const handleNavMyTickets = () => navigate(ROUTES.myTickets);
  const handleNavCreateTicket = () => navigate(ROUTES.createTicket);
  const handleNavMyQueue = () => navigate(ROUTES.queue);
  const handleNavUserManagement = () => navigate(ROUTES.userManagement);

  const handleLogout = async () => {
    if (user) {
      try {
        await logout();
      } catch {}
    }
    await refreshUser();
    navigate("/");
  };

  const getRoleBadgeStyle = (role?: string) => {
    switch (role) {
      case "IT_STAFF":
        return { backgroundColor: "#E6F0FA", color: "#1B5FA8" };
      case "ADMINISTRATOR":
        return { backgroundColor: "#F3E8FF", color: "#6B21A8" };
      default:
        return { backgroundColor: "#E6F4EA", color: "#137333" };
    }
  };

  const formatRoleLabel = (role?: string) => ROLE_LABELS[(role ?? "REQUESTER") as keyof typeof ROLE_LABELS] ?? ROLE_LABELS.REQUESTER;


  return (
    <header className="zg-header shadow-sm py-2 px-3" style={{ backgroundColor: "var(--zg-primary)" }}>
      <div className="container-fluid d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div className="d-flex flex-wrap align-items-center gap-2 gap-md-4">
          <div className="d-flex align-items-center gap-2">
            <span className="h4 mb-0 fw-bold tracking-tight text-white">TokTickIT</span>
            <span className="badge bg-light text-dark font-weight-normal small">IT Service Desk</span>
          </div>

          {currentUser && (
            <nav className="d-flex flex-wrap gap-2" aria-label="Main navigation" data-testid="main-nav">
              {currentUser.role === "REQUESTER" && (
                <>
                  {dashboardButton}
                  <button
                    onClick={handleNavMyTickets}
                    aria-current={ariaCurrent("my-tickets")}
                    className={`btn btn-sm ${
                      currentTab === "my-tickets"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    My Tickets
                  </button>
                  <button
                    onClick={handleNavCreateTicket}
                    aria-current={ariaCurrent("create-ticket")}
                    className={`btn btn-sm ${
                      currentTab === "create-ticket"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    + Create Ticket
                  </button>
                </>
              )}
              {currentUser.role === "IT_STAFF" && (
                <>
                  {dashboardButton}
                  <button
                    onClick={handleNavMyQueue}
                    aria-current={ariaCurrent("my-queue")}
                    className={`btn btn-sm ${
                      currentTab === "my-queue"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    My Queue
                  </button>
                  <button
                    onClick={handleNavCreateTicket}
                    aria-current={ariaCurrent("create-ticket")}
                    className={`btn btn-sm ${
                      currentTab === "create-ticket"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    + Create Ticket
                  </button>
                </>
              )}
              {currentUser.role === "ADMINISTRATOR" && (
                <>
                  {dashboardButton}
                  <button
                    onClick={handleNavMyQueue}
                    aria-current={ariaCurrent("my-queue")}
                    className={`btn btn-sm ${
                      currentTab === "my-queue"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    My Queue
                  </button>
                  <button
                    onClick={handleNavUserManagement}
                    aria-current={ariaCurrent("user-management")}
                    className={`btn btn-sm ${
                      currentTab === "user-management"
                        ? "btn-light fw-bold text-success"
                        : "btn-outline-light"
                    }`}
                  >
                    Admin / User Management
                  </button>
                </>
              )}
            </nav>
          )}
        </div>

        {currentUser && (
          <div className="d-flex align-items-center gap-3">
            <div className="text-end text-white d-none d-sm-block">
              <div className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>
                {currentUser.name}
              </div>
              <span
                className="badge me-1"
                style={{
                  ...getRoleBadgeStyle(currentUser.role),
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "12px",
                }}
              >
                {formatRoleLabel(currentUser.role)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="btn btn-sm btn-outline-light"
              aria-label="Logout"
            >
              Logout
            </button>
          </div>
        )}
      </div>
    </header>
  );
};




