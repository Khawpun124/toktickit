import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  getStaffTickets,
  getCategories,
  getStaffUsers,
  StaffTicketListItem,
  Category,
  StaffUserItem,
} from "../api.js";

export const StaffTicketQueueScreen: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tickets, setTickets] = useState<StaffTicketListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Filter States
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [requestedPriority, setRequestedPriority] = useState("");
  const [itPriority, setItPriority] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [ticketOwnerId, setTicketOwnerId] = useState("");

  // Sort States
  const [sortBy, setSortBy] = useState<"createdAt" | "ticketNumber" | "itPriority">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Pagination States
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Load initial dropdown options
  useEffect(() => {
    if (user && (user.role === "IT_STAFF" || user.role === "ADMINISTRATOR")) {
      getCategories()
        .then(setCategories)
        .catch(() => {});

      getStaffUsers()
        .then(setStaffUsers)
        .catch(() => {});
    }
  }, [user]);

  // Load staff queue tickets
  useEffect(() => {
    if (!user) return;

    if (user.role === "REQUESTER") {
      setIsForbidden(true);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getStaffTickets({
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      requestedPriority: requestedPriority || undefined,
      itPriority: itPriority || undefined,
      currentStatus: currentStatus || undefined,
      ticketOwnerId: ticketOwnerId || undefined,
      sortBy,
      sortDir,
      page,
      pageSize,
    })
      .then((res) => {
        if (!isMounted) return;
        setTickets(res.data);
        setTotalItems(res.pagination.totalItems);
        setTotalPages(res.pagination.totalPages);
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err.status === 403 || err.message === "Forbidden") {
          setIsForbidden(true);
        } else {
          setError(err.message || "Unable to load staff queue tickets");
        }
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [
    user,
    search,
    categoryId,
    requestedPriority,
    itPriority,
    currentStatus,
    ticketOwnerId,
    sortBy,
    sortDir,
    page,
    pageSize,
  ]);

  const handleSort = (field: "createdAt" | "ticketNumber" | "itPriority") => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir(field === "createdAt" ? "desc" : "asc");
    }
    setPage(1);
  };

  const handleClearFilters = () => {
    setSearch("");
    setCategoryId("");
    setRequestedPriority("");
    setItPriority("");
    setCurrentStatus("");
    setTicketOwnerId("");
    setSortBy("createdAt");
    setSortDir("desc");
    setPage(1);
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

  const formatStatusLabel = (status: string) => {
    return status.replace(/_/g, " ");
  };

  if (isForbidden) {
    return (
      <div className="container py-5">
        <div className="alert alert-danger shadow-sm" role="alert">
          <h4 className="alert-heading fw-bold">403 Forbidden</h4>
          <p className="mb-0">
            Access denied. You do not have permission to view the IT Staff Queue.
          </p>
        </div>
      </div>
    );
  }

  const hasFilters =
    Boolean(search) ||
    Boolean(categoryId) ||
    Boolean(requestedPriority) ||
    Boolean(itPriority) ||
    Boolean(currentStatus) ||
    Boolean(ticketOwnerId);

  const startItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="container-fluid py-4 px-3 px-md-4">
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h1 className="h3 mb-1 fw-bold tracking-tight text-dark">My Queue</h1>
          <p className="text-muted mb-0">
            IT Staff Ticket Queue — Search, filter, claim, and work incoming tickets.
          </p>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body p-3 p-md-4">
          <div className="row g-3">
            {/* Search */}
            <div className="col-12 col-md-4">
              <label htmlFor="search" className="form-label small fw-bold text-secondary">
                Search
              </label>
              <input
                id="search"
                type="text"
                className="form-control form-control-sm"
                placeholder="Ticket No. or summary..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>

            {/* Category */}
            <div className="col-6 col-md-2">
              <label htmlFor="categoryId" className="form-label small fw-bold text-secondary">
                Category
              </label>
              <select
                id="categoryId"
                className="form-select form-select-sm"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Requested Priority */}
            <div className="col-6 col-md-2">
              <label htmlFor="requestedPriority" className="form-label small fw-bold text-secondary">
                Req. Priority
              </label>
              <select
                id="requestedPriority"
                className="form-select form-select-sm"
                value={requestedPriority}
                onChange={(e) => {
                  setRequestedPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* IT Priority */}
            <div className="col-6 col-md-2">
              <label htmlFor="itPriority" className="form-label small fw-bold text-secondary">
                IT Priority
              </label>
              <select
                id="itPriority"
                className="form-select form-select-sm"
                value={itPriority}
                onChange={(e) => {
                  setItPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>

            {/* Current Status */}
            <div className="col-6 col-md-2">
              <label htmlFor="currentStatus" className="form-label small fw-bold text-secondary">
                Status
              </label>
              <select
                id="currentStatus"
                className="form-select form-select-sm"
                value={currentStatus}
                onChange={(e) => {
                  setCurrentStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="NEW">New</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="WAITING_FOR_REQUESTER">Waiting for Requester</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed</option>
                <option value="REOPENED">Reopened</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Owner Filter */}
            <div className="col-12 col-md-4">
              <label htmlFor="ticketOwnerId" className="form-label small fw-bold text-secondary">
                Ticket Owner
              </label>
              <select
                id="ticketOwnerId"
                className="form-select form-select-sm"
                value={ticketOwnerId}
                onChange={(e) => {
                  setTicketOwnerId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Owners</option>
                <option value="unassigned">Unassigned</option>
                {staffUsers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasFilters && (
              <div className="col-12 d-flex justify-content-end">
                <button
                  onClick={handleClearFilters}
                  className="btn btn-sm btn-link text-decoration-none text-danger"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {error && (
        <div className="alert alert-danger shadow-sm mb-4" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="card border-0 shadow-sm py-5 text-center">
          <div className="spinner-border text-success mx-auto mb-2" role="status">
            <span className="visually-hidden">Loading queue...</span>
          </div>
          <div className="text-muted small">Loading ticket queue...</div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="card border-0 shadow-sm py-5 text-center">
          <div className="card-body">
            {hasFilters ? (
              <>
                <h5 className="fw-bold text-secondary mb-2">No tickets match your search</h5>
                <p className="text-muted small mb-3">
                  Try adjusting or clearing your filters to see more tickets.
                </p>
                <button onClick={handleClearFilters} className="btn btn-sm btn-outline-secondary">
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <h5 className="fw-bold text-secondary mb-2">No tickets in the queue yet</h5>
                <p className="text-muted small mb-0">
                  When requesters submit tickets, they will appear in this queue.
                </p>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="card border-0 shadow-sm d-none d-md-block mb-3">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light small text-secondary">
                  <tr>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSort("ticketNumber")}
                      className="py-3 ps-3"
                    >
                      Ticket No. {sortBy === "ticketNumber" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSort("createdAt")}
                      className="py-3"
                    >
                      Created Date {sortBy === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="py-3">Summary</th>
                    <th className="py-3">Category</th>
                    <th className="py-3">Req. Priority</th>
                    <th
                      style={{ cursor: "pointer" }}
                      onClick={() => handleSort("itPriority")}
                      className="py-3"
                    >
                      IT Priority {sortBy === "itPriority" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                    <th className="py-3">Status</th>
                    <th className="py-3">Owner</th>
                    <th className="py-3 pe-3 text-end">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr
                      key={t.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => navigate(`/staff/tickets/${t.id}`)}
                    >
                      <td className="ps-3 fw-bold text-primary">{t.ticketNumber}</td>
                      <td className="small text-muted">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="fw-semibold text-dark">{t.summary}</div>
                        {t.problemAppearsResolved && (
                          <span className="badge bg-warning text-dark me-1 mt-1 small" style={{ fontSize: "0.7rem" }}>
                            Appears Resolved
                          </span>
                        )}
                      </td>
                      <td className="small">{t.categoryName}</td>
                      <td>
                        <span className={getPriorityBadgeClass(t.requestedPriority)}>
                          {t.requestedPriority}
                        </span>
                      </td>
                      <td>
                        <span className={getPriorityBadgeClass(t.itPriority)}>
                          {t.itPriority || "-"}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(t.currentStatus)}`}>
                          {formatStatusLabel(t.currentStatus)}
                        </span>
                      </td>
                      <td>
                        {t.ticketOwnerName ? (
                          <span className="badge bg-light text-dark border">
                            {t.ticketOwnerName}
                          </span>
                        ) : (
                          <span className="badge bg-light text-muted border border-dashed">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="pe-3 text-end" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => navigate(`/staff/tickets/${t.id}`)}
                          className="btn btn-sm btn-outline-primary"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View (<768px) */}
          <div className="d-md-none d-flex flex-column gap-3 mb-3">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="card border-0 shadow-sm"
                onClick={() => navigate(`/staff/tickets/${t.id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <span className="fw-bold text-primary">{t.ticketNumber}</span>
                    <span className={`badge ${getStatusBadgeClass(t.currentStatus)}`}>
                      {formatStatusLabel(t.currentStatus)}
                    </span>
                  </div>

                  <h6 className="card-title fw-bold text-dark mb-2">{t.summary}</h6>

                  {t.problemAppearsResolved && (
                    <div className="mb-2">
                      <span className="badge bg-warning text-dark small">
                        Problem Appears Resolved
                      </span>
                    </div>
                  )}

                  <div className="d-flex flex-wrap gap-2 mb-2 small text-muted">
                    <div>
                      <strong>Category:</strong> {t.categoryName}
                    </div>
                    <div>
                      <strong>Req:</strong>{" "}
                      <span className={getPriorityBadgeClass(t.requestedPriority)}>
                        {t.requestedPriority}
                      </span>
                    </div>
                    <div>
                      <strong>IT:</strong>{" "}
                      <span className={getPriorityBadgeClass(t.itPriority)}>
                        {t.itPriority || "-"}
                      </span>
                    </div>
                  </div>

                  <div className="d-flex justify-content-between align-items-center pt-2 border-top text-muted small">
                    <div>
                      Owner:{" "}
                      <strong className="text-dark">
                        {t.ticketOwnerName || "Unassigned"}
                      </strong>
                    </div>
                    <div>{new Date(t.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2 mt-3">
            <div className="small text-muted">
              Showing {startItem} to {endItem} of {totalItems} tickets
            </div>
            {totalPages > 1 && (
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
                    <button className="page-link" onClick={() => setPage(p)}>
                      {p}
                    </button>
                  </li>
                ))}
                <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
                  <button className="page-link" onClick={() => setPage(page + 1)}>
                    Next
                  </button>
                </li>
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};
