import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";

interface AppHeaderProps {
  activeTab?: "dashboard" | "my-tickets" | "create-ticket" | "my-queue" | "user-management";
  onSelectTab?: (tab: any) => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ activeTab, onSelectTab }) => {
  const { user, logout, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const currentUser = user;

  const currentTab =
    activeTab ||
    (location.pathname === "/dashboard" || location.pathname === "/staff/dashboard"
      ? "dashboard"
      : location.pathname === "/tickets/new"
      ? "create-ticket"
      : location.pathname.startsWith("/admin/users")
      ? "user-management"
      : location.pathname.startsWith("/staff/tickets")
      ? "my-queue"
      : "my-tickets");

  // Lab 4: the Dashboard entry, and aria-current="page" on the active entry (ui-spec section 3).
  const handleNavDashboard = () => {
    if (onSelectTab) onSelectTab("dashboard");
    navigate(currentUser?.role === "REQUESTER" ? "/dashboard" : "/staff/dashboard");
  };
  const ariaCurrent = (tab: string) => (currentTab === tab ? ("page" as const) : undefined);
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

  const handleNavMyTickets = () => {
    if (onSelectTab) onSelectTab("my-tickets");
    navigate("/tickets");
  };

  const handleNavCreateTicket = () => {
    if (onSelectTab) onSelectTab("create-ticket");
    navigate("/tickets/new");
  };

  const handleNavMyQueue = () => {
    if (onSelectTab) onSelectTab("my-queue");
    navigate("/staff/tickets");
  };

  const handleNavUserManagement = () => {
    if (onSelectTab) onSelectTab("user-management");
    navigate("/admin/users");
  };

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

  const formatRoleLabel = (role?: string) => {
    switch (role) {
      case "IT_STAFF":
        return "IT Staff";
      case "ADMINISTRATOR":
        return "Administrator";
      default:
        return "Requester";
    }
  };

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




