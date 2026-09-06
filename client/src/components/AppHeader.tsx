import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRequester } from "../context/RequesterContext.js";

interface AppHeaderProps {
  activeTab?: "my-tickets" | "create-ticket";
  onSelectTab?: (tab: "my-tickets" | "create-ticket") => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({ activeTab, onSelectTab }) => {
  const { selectedRequester, clearRequester } = useRequester();
  const location = useLocation();
  const navigate = useNavigate();

  const currentTab =
    activeTab || (location.pathname === "/tickets/new" ? "create-ticket" : "my-tickets");

  const handleNavMyTickets = () => {
    if (onSelectTab) {
      onSelectTab("my-tickets");
    }
    navigate("/tickets");
  };

  const handleNavCreateTicket = () => {
    if (onSelectTab) {
      onSelectTab("create-ticket");
    }
    navigate("/tickets/new");
  };

  const handleClearRequester = () => {
    clearRequester();
    navigate("/");
  };

  return (
    <header className="zg-header shadow-sm py-2 px-3">
      <div className="container-fluid d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-4">
          <div className="d-flex align-items-center gap-2">
            <span className="h4 mb-0 fw-bold tracking-tight text-white">TokTickIT</span>
            <span className="badge bg-light text-dark font-weight-normal small">IT Service Desk</span>
          </div>

          {selectedRequester && (
            <nav className="d-flex gap-2">
              <button
                onClick={handleNavMyTickets}
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
                className={`btn btn-sm ${
                  currentTab === "create-ticket"
                    ? "btn-light fw-bold text-success"
                    : "btn-outline-light"
                }`}
              >
                + Create Ticket
              </button>
            </nav>
          )}
        </div>

        {selectedRequester && (
          <div className="d-flex align-items-center gap-3">
            <div className="text-end text-white d-none d-sm-block">
              <div className="small opacity-75">Selected Requester</div>
              <div className="fw-semibold text-truncate" style={{ maxWidth: 200 }}>
                {selectedRequester.name}
              </div>
            </div>
            <button
              onClick={handleClearRequester}
              className="btn btn-sm btn-outline-light"
              aria-label="Change Requester"
            >
              Change Requester
            </button>
          </div>
        )}
      </div>
    </header>
  );
};


