import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import { getStaffTicketDetail, StaffTicketDetail } from "../api.js";

export const StaffTicketDetailScreen: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [is404, setIs404] = useState(false);
  const [is403, setIs403] = useState(false);

  useEffect(() => {
    if (!user) return;

    if (user.role === "REQUESTER") {
      setIs403(true);
      setLoading(false);
      return;
    }

    if (!id) {
      setIs404(true);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setIs404(false);
    setIs403(false);

    getStaffTicketDetail(id)
      .then((data) => {
        if (!isMounted) return;
        setTicket(data);
        setLoading(false);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        if (err.status === 403 || err.message === "Forbidden") {
          setIs403(true);
        } else if (err.status === 404 || err.message === "Ticket not found") {
          setIs404(true);
        } else {
          setError(err.message || "Unable to load staff ticket detail");
        }
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, user]);

  if (is403) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger shadow-sm" role="alert">
          <h4 className="alert-heading fw-bold">403 Forbidden</h4>
          <p className="mb-0">
            Access denied. You do not have permission to view IT Staff Ticket Details.
          </p>
        </div>
      </div>
    );
  }

  if (is404) {
    return (
      <div className="container py-5">
        <div className="alert alert-warning shadow-sm" role="alert">
          <h4 className="alert-heading fw-bold">404 Not Found</h4>
          <p className="mb-3">
            The requested ticket does not exist or could not be found.
          </p>
          <button
            onClick={() => navigate("/staff/tickets")}
            className="btn btn-sm btn-outline-secondary"
          >
            ← Back to Queue
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-5 text-center">
        <div className="spinner-border text-success mx-auto mb-2" role="status">
          <span className="visually-hidden">Loading ticket details...</span>
        </div>
        <div className="text-muted small">Loading IT Staff Ticket Details...</div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger shadow-sm mb-3" role="alert">
          {error || "Unable to load ticket details"}
        </div>
        <button
          onClick={() => navigate("/staff/tickets")}
          className="btn btn-sm btn-outline-secondary"
        >
          ← Back to Queue
        </button>
      </div>
    );
  }

  const getPriorityBadgeClass = (priority: string | null) => {
    switch (priority) {
      case "HIGH":
        return "badge bg-danger";
      case "MEDIUM":
        return "badge bg-warning text-dark";
      case "LOW":
        return "badge bg-info text-dark";
      default:
        return "badge bg-light text-muted";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "NEW":
        return "bg-primary text-white";
      case "OPEN":
        return "bg-info text-dark";
      case "IN_PROGRESS":
        return "bg-warning text-dark";
      case "WAITING_FOR_REQUESTER":
        return "bg-secondary text-white";
      case "RESOLVED":
        return "bg-success text-white";
      case "CLOSED":
        return "bg-dark text-white";
      case "REOPENED":
        return "bg-danger text-white";
      case "CANCELLED":
        return "bg-light text-muted border";
      default:
        return "bg-secondary text-white";
    }
  };

  return (
    <div className="container py-4">
      {/* Navigation & Header */}
      <div className="mb-4">
        <button
          onClick={() => navigate("/staff/tickets")}
          className="btn btn-sm btn-outline-secondary mb-3"
        >
          ← Back to Queue
        </button>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
          <div>
            <span className="h4 fw-bold text-primary me-2">{ticket.ticketNumber}</span>
            <span className={`badge ${getStatusBadgeClass(ticket.currentStatus)}`}>
              {ticket.currentStatus.replace(/_/g, " ")}
            </span>
            {ticket.problemAppearsResolved && (
              <span className="badge bg-warning text-dark ms-2">
                Problem Appears Resolved
              </span>
            )}
          </div>
          <div className="small text-muted">
            Created: {new Date(ticket.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Ticket Details Card */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-light fw-bold py-3">
          IT Staff Ticket View (Read-Only Placeholder)
        </div>
        <div className="card-body p-4">
          <div className="row g-3 mb-4">
            <div className="col-12 col-md-6">
              <label className="form-label small text-muted mb-1">Requester</label>
              <div className="fw-semibold text-dark">
                {ticket.requesterName} ({ticket.requesterEmail})
              </div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-muted mb-1">Category</label>
              <div className="fw-semibold text-dark">{ticket.categoryName}</div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-muted mb-1">Related System</label>
              <div className="fw-semibold text-dark">{ticket.relatedSystemName}</div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-muted mb-1">Requested Priority</label>
              <div>
                <span className={getPriorityBadgeClass(ticket.requestedPriority)}>
                  {ticket.requestedPriority}
                </span>
              </div>
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small text-muted mb-1">IT Priority</label>
              <div>
                <span className={getPriorityBadgeClass(ticket.itPriority)}>
                  {ticket.itPriority || "-"}
                </span>
              </div>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small text-muted mb-1">Ticket Owner</label>
              <div>
                {ticket.ticketOwnerName ? (
                  <span className="badge bg-light text-dark border">
                    {ticket.ticketOwnerName}
                  </span>
                ) : (
                  <span className="badge bg-light text-muted border border-dashed">
                    Unassigned
                  </span>
                )}
              </div>
            </div>
          </div>

          <hr />

          <div className="mb-3">
            <label className="form-label small text-muted mb-1">Summary</label>
            <h5 className="fw-bold text-dark">{ticket.summary}</h5>
          </div>

          <div>
            <label className="form-label small text-muted mb-1">Description</label>
            <div className="bg-light p-3 rounded text-dark" style={{ whiteSpace: "pre-wrap" }}>
              {ticket.description}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
