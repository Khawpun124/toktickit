import React, { useEffect, useState } from "react";
import {
  getTickets,
  getCategories,
  Category,
  TicketListItem,
  PaginationInfo,
} from "../api.js";
import { useRequester } from "../context/RequesterContext.js";

interface MyTicketsScreenProps {
  onNavigateToCreate: () => void;
}

export const MyTicketsScreen: React.FC<MyTicketsScreenProps> = ({ onNavigateToCreate }) => {
  const { selectedRequester } = useRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 10,
    totalItems: 0,
    totalPages: 0,
  });

  const [search, setSearch] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [requestedPriority, setRequestedPriority] = useState<string>("");
  const [itPriority, setItPriority] = useState<string>("");
  const [currentStatus, setCurrentStatus] = useState<string>("");

  const [sortBy, setSortBy] = useState<"createdAt" | "ticketNumber">("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState<number>(1);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [totalUnfilteredCount, setTotalUnfilteredCount] = useState<number | null>(null);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const fetchTickets = async () => {
    if (!selectedRequester) return;

    setLoading(true);
    setError("");

    try {
      const res = await getTickets(
        {
          search,
          categoryId,
          requestedPriority,
          itPriority,
          currentStatus,
          sortBy,
          sortDir,
          page,
          pageSize: 10,
        },
        selectedRequester.id
      );

      setTickets(res.data);
      setPagination(res.pagination);

      // Check if user has zero tickets overall (for Empty vs No-Results distinction - BR-29)
      const isFiltersEmpty =
        !search && !categoryId && !requestedPriority && !itPriority && !currentStatus;
      if (isFiltersEmpty) {
        setTotalUnfilteredCount(res.pagination.totalItems);
      } else if (totalUnfilteredCount === null) {
        // Fetch total unfiltered count if filters are applied on initial load
        getTickets({}, selectedRequester.id)
          .then((allRes) => setTotalUnfilteredCount(allRes.pagination.totalItems))
          .catch(() => setTotalUnfilteredCount(res.pagination.totalItems));
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to load tickets");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [
    selectedRequester,
    search,
    categoryId,
    requestedPriority,
    itPriority,
    currentStatus,
    sortBy,
    sortDir,
    page,
  ]);

  const handleClearFilters = () => {
    setSearch("");
    setCategoryId("");
    setRequestedPriority("");
    setItPriority("");
    setCurrentStatus("");
    setPage(1);
  };

  const handleSortToggle = (field: "createdAt" | "ticketNumber") => {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(categoryId) ||
    Boolean(requestedPriority) ||
    Boolean(itPriority) ||
    Boolean(currentStatus);

  const isZeroTotalTickets = totalUnfilteredCount === 0 && !hasActiveFilters && tickets.length === 0;
  const isNoResultsFromFilters = hasActiveFilters && tickets.length === 0 && !loading;

  const startItemIndex =
    pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const endItemIndex = Math.min(
    pagination.page * pagination.pageSize,
    pagination.totalItems
  );

  const renderPriorityBadge = (priority: string | null) => {
    if (!priority) {
      return <span className="badge bg-secondary opacity-75">—</span>;
    }
    switch (priority) {
      case "HIGH":
        return <span className="badge bg-danger text-white">🔴 High</span>;
      case "MEDIUM":
        return <span className="badge bg-warning text-dark">🟡 Medium</span>;
      case "LOW":
        return <span className="badge bg-success text-white">🟢 Low</span>;
      default:
        return <span className="badge bg-secondary">{priority}</span>;
    }
  };

  const renderStatusBadge = (status: string) => {
    return (
      <span
        className="badge px-2 py-1"
        style={{ backgroundColor: "var(--zg-pale)", color: "var(--zg-secondary)" }}
      >
        ● {status}
      </span>
    );
  };

  return (
    <div className="container py-4">
      {/* Header Row */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <h1 className="h3 font-weight-bold mb-1">My Tickets</h1>
          <p className="text-muted mb-0 small">
            View and search tickets created under your Requester profile.
          </p>
        </div>
        <button
          onClick={onNavigateToCreate}
          className="btn zg-btn-primary px-4 py-2"
        >
          + Create Ticket
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="zg-card p-3 mb-4">
        <div className="row g-2 align-items-center">
          {/* Search Bar */}
          <div className="col-12 col-md-4">
            <div className="input-group">
              <span className="input-group-text bg-white text-muted">🔍</span>
              <input
                type="text"
                className="form-control"
                placeholder="Search ticket number or summary..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Filter Dropdowns */}
          <div className="col-6 col-md-2">
            <select
              className="form-select text-truncate"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Category"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              className="form-select text-truncate"
              value={requestedPriority}
              onChange={(e) => {
                setRequestedPriority(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Requested Priority"
            >
              <option value="">Req Priority</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              className="form-select text-truncate"
              value={itPriority}
              onChange={(e) => {
                setItPriority(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by IT Priority"
            >
              <option value="">IT Priority</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div className="col-6 col-md-2">
            <select
              className="form-select text-truncate"
              value={currentStatus}
              onChange={(e) => {
                setCurrentStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by Status"
            >
              <option value="">All Statuses</option>
              <option value="NEW">NEW</option>
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-2 text-end">
            <button
              onClick={handleClearFilters}
              className="btn btn-link btn-sm text-secondary p-0"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="zg-card p-5 text-center my-4">
          <div className="spinner-border text-success mb-2" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <div className="text-muted">Loading tickets...</div>
        </div>
      )}

      {/* Failure State */}
      {!loading && error && (
        <div className="alert alert-danger my-4 text-center" role="alert">
          <div className="fw-bold mb-1">Failed to load tickets</div>
          <div className="small mb-3">{error}</div>
          <button className="btn btn-outline-danger btn-sm" onClick={fetchTickets}>
            Retry
          </button>
        </div>
      )}

      {/* Empty State (Zero Tickets Owned - BR-29) */}
      {!loading && !error && isZeroTotalTickets && (
        <div className="zg-card p-5 text-center my-4">
          <div className="display-4 mb-2">🎫</div>
          <h2 className="h4 font-weight-bold mb-2">You haven't created any tickets yet</h2>
          <p className="text-muted mb-4 small">
            Need help with hardware, software, or network access? Create your first ticket below.
          </p>
          <button onClick={onNavigateToCreate} className="btn zg-btn-primary px-4">
            + Create Ticket
          </button>
        </div>
      )}

      {/* No-Results State (Filters Matched 0 Items - BR-29) */}
      {!loading && !error && !isZeroTotalTickets && isNoResultsFromFilters && (
        <div className="zg-card p-5 text-center my-4">
          <div className="display-4 mb-2">🔍</div>
          <h2 className="h4 font-weight-bold mb-2">No tickets match your filters</h2>
          <p className="text-muted mb-4 small">
            Try adjusting or clearing your search term and filter selections.
          </p>
          <button onClick={handleClearFilters} className="btn btn-outline-secondary">
            Clear Filters
          </button>
        </div>
      )}

      {/* Ticket List View (Desktop Table & Mobile Cards) */}
      {!loading && !error && tickets.length > 0 && (
        <>
          {/* Desktop Table View (d-none d-md-block) */}
          <div className="zg-card table-responsive d-none d-md-block mb-4">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSortToggle("ticketNumber")}
                  >
                    Ticket No. {sortBy === "ticketNumber" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th
                    style={{ cursor: "pointer" }}
                    onClick={() => handleSortToggle("createdAt")}
                  >
                    Created Date {sortBy === "createdAt" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th>Summary</th>
                  <th>Category</th>
                  <th>Req. Priority</th>
                  <th>IT Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td className="font-monospace fw-bold text-success">{t.ticketNumber}</td>
                    <td className="small text-muted">
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="fw-medium">{t.summary}</td>
                    <td>{t.categoryName}</td>
                    <td>{renderPriorityBadge(t.requestedPriority)}</td>
                    <td>{renderPriorityBadge(t.itPriority)}</td>
                    <td>{renderStatusBadge(t.currentStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View (d-md-none) */}
          <div className="d-md-none d-flex flex-column gap-3 mb-4">
            {tickets.map((t) => (
              <div key={t.id} className="zg-card p-3">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="font-monospace fw-bold text-success">{t.ticketNumber}</span>
                  {renderStatusBadge(t.currentStatus)}
                </div>
                <div className="fw-medium mb-2">{t.summary}</div>
                <div className="d-flex justify-content-between align-items-center small text-muted">
                  <span>{t.categoryName}</span>
                  <span>
                    {new Date(t.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-center gap-3">
            <div className="small text-muted">
              Showing <strong>{startItemIndex}</strong> to <strong>{endItemIndex}</strong> of{" "}
              <strong>{pagination.totalItems}</strong> tickets
            </div>

            <nav aria-label="Tickets pagination">
              <ul className="pagination mb-0">
                <li className={`page-item ${pagination.page <= 1 ? "disabled" : ""}`}>
                  <button
                    className="page-link"
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    disabled={pagination.page <= 1}
                  >
                    Previous
                  </button>
                </li>
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((pNum) => (
                  <li
                    key={pNum}
                    className={`page-item ${pNum === pagination.page ? "active" : ""}`}
                  >
                    <button className="page-link" onClick={() => setPage(pNum)}>
                      {pNum}
                    </button>
                  </li>
                ))}
                <li
                  className={`page-item ${
                    pagination.page >= pagination.totalPages ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </>
      )}
    </div>
  );
};
