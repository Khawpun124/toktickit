import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ticketStatusLabel } from "../../ticketWorkflow.js";
import { formatClock } from "../../dashboard/formatTime.js";
import "./dashboard.css";

// Building blocks shared by the Requester and IT Staff dashboards (ui-spec sections 4, 5, 9, 11).

export const firstName = (name?: string) => (name ?? "").trim().split(/\s+/)[0] || "there";

/** A metric card: one link whose accessible name is label, value, and action. */
export const MetricCard: React.FC<{ to: string; label: string; name: string; value: number; testId?: string }> = ({
  to, label, name, value, testId,
}) => (
  <Link to={to} className="zg-metric-card" aria-label={`${name}: ${value}. View all`} data-testid={testId}>
    <span className="zg-metric-label">{label}</span>
    <span className="zg-metric-value">{value}</span>
    <span className="zg-metric-link" aria-hidden="true">View all →</span>
  </Link>
);

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className="badge zg-status-badge zg-dash-badge" data-testid="status-badge">
    {ticketStatusLabel(status)}
  </span>
);

const PRIORITY_LABELS: Record<string, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export const PriorityBadge: React.FC<{ priority: string | null }> = ({ priority }) =>
  priority ? (
    <span className={`badge zg-priority-${priority.toLowerCase()} zg-dash-badge`} data-testid="priority-badge">
      <span className="visually-hidden">IT Priority: </span>
      {priority === "HIGH" ? "▲ " : ""}
      {PRIORITY_LABELS[priority] ?? priority}
    </span>
  ) : null;

/** Header row: greeting and subtitle; Refresh and "Updated hh:mm" on the right. */
export const DashboardHeader: React.FC<{
  title: string;
  subtitle: string;
  generatedAt?: string;
  refreshing: boolean;
  onRefresh?: () => void;
}> = ({ title, subtitle, generatedAt, refreshing, onRefresh }) => (
  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
    <div className="min-w-0">
      <h1 className="h3 fw-bold mb-1 text-break">{title}</h1>
      <p className="text-muted mb-0">{subtitle}</p>
    </div>
    {onRefresh && (
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm zg-touch"
          onClick={onRefresh}
          disabled={refreshing}
          aria-busy={refreshing}
        >
          {refreshing && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
          Refresh
        </button>
        {generatedAt && (
          <span className="small text-muted" data-testid="dashboard-updated">
            Updated {formatClock(generatedAt)}
          </span>
        )}
      </div>
    )}
  </div>
);

/** Notification left by a redirect (for example a wrong-role dashboard URL). */
export const RedirectNotice: React.FC = () => {
  const location = useLocation();
  const notice = (location.state as { notification?: string } | null)?.notification;
  if (!notice) return null;
  return (
    <div className="alert alert-warning py-2" role="status">
      {notice}
    </div>
  );
};

/** Loading: skeleton cards of the final size, so nothing shifts when the data arrives. */
export const DashboardSkeleton: React.FC<{ cards: number; gridClass: string }> = ({ cards, gridClass }) => (
  <div aria-busy="true" aria-label="Loading dashboard" className="placeholder-glow">
    <div className={`zg-metric-grid ${gridClass} mb-4`}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="zg-metric-card zg-metric-card--skeleton" aria-hidden="true">
          <span className="placeholder col-7" />
          <span className="placeholder col-4 placeholder-lg" />
          <span className="placeholder col-5" />
        </div>
      ))}
    </div>
    <div className="row g-4" aria-hidden="true">
      <div className="col-12 col-lg-8">
        <div className="card border-0 shadow-sm p-4"><span className="placeholder col-12" /><span className="placeholder col-10 mt-2" /></div>
      </div>
      <div className="col-12 col-lg-4">
        <div className="card border-0 shadow-sm p-4"><span className="placeholder col-8" /></div>
      </div>
    </div>
  </div>
);

/** Failure: a safe message and Retry; the header and navigation stay in place. */
export const DashboardFailed: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
    <span>We couldn't load your dashboard. Check your connection and try again.</span>
    <button type="button" className="btn btn-sm btn-outline-secondary zg-touch" onClick={onRetry}>
      Retry
    </button>
  </div>
);

export const DashboardForbidden: React.FC = () => (
  <div className="alert alert-warning" role="alert">
    You do not have access to that page.
  </div>
);

/** A titled list card with an empty message and an optional "View all" link. */
export function DashboardList<T>({
  title, items, empty, render, viewAll, testId, callout = false,
}: {
  title: string;
  items: T[];
  empty: string;
  render: (item: T) => React.ReactNode;
  viewAll?: { to: string; label: string };
  testId: string;
  callout?: boolean;
}) {
  const headingId = `${testId}-heading`;
  return (
    <section
      className={`card border-0 shadow-sm mb-4 zg-dash-list ${callout && items.length > 0 ? "zg-callout" : ""}`}
      aria-labelledby={headingId}
      data-testid={testId}
    >
      <div className="card-header bg-transparent d-flex flex-wrap justify-content-between align-items-center gap-2 py-3">
        <h2 className="h6 fw-bold mb-0" id={headingId}>{title}</h2>
        {viewAll && (
          <Link to={viewAll.to} className="small fw-semibold" aria-label={viewAll.label}>
            View all
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-muted mb-0 p-3">{empty}</p>
      ) : (
        <ul className="list-group list-group-flush">
          {items.map((item, i) => (
            <li className="list-group-item" key={i}>{render(item)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quick action: a link styled as a button (navigation, so it stays a link). */
export const QuickAction: React.FC<{ to: string; title: string; hint?: string; state?: unknown }> = ({ to, title, hint, state }) => (
  <Link to={to} state={state} className="btn btn-outline-success w-100 mb-2">
    <span className="fw-semibold">{title}</span>
    {hint && <span className="small text-muted fw-normal">{hint}</span>}
  </Link>
);
