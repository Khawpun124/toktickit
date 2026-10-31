import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { getStaffDashboard, type StaffDashboard } from "../../dashboard/dashboardApi.js";
import { formatDateTime } from "../../dashboard/formatTime.js";
import { useDashboard } from "../../dashboard/useDashboard.js";
import { ActionStatusBadge } from "../actions/ActionStatusBadge.js";
import "../actions/actions.css";
import {
  DashboardFailed, DashboardForbidden, DashboardHeader, DashboardList, DashboardSkeleton, MetricCard, PriorityBadge,
  QuickAction, RedirectNotice, StatusBadge, firstName,
} from "./DashboardParts.js";

// IT Staff Dashboard (/staff/dashboard, ui-spec section 4); the Administrator sees it too, plus the
// Users card. Cards link to the Queue with the card's query from the API. Rows and order are
// exactly the API's: the UI never filters or re-sorts them (UI-21).

export const StaffDashboardScreen: React.FC = () => {
  const { user } = useAuth();
  const { state, refreshing, refresh, retry } = useDashboard<StaffDashboard>(getStaffDashboard);
  const data = state.kind === "ready" ? state.data : undefined;
  const isAdmin = user?.role === "ADMINISTRATOR";
  const queue = (query: string) => `/staff/tickets?${query}`;

  const ticketRow = (t: StaffDashboard["urgentTickets"][number], showPriority: boolean) => (
    <Link to={`/staff/tickets/${t.id}`} className="zg-dash-row" data-ticket-id={t.id}>
      <span className="fw-semibold text-nowrap">{t.ticketNumber}</span>
      <span className="zg-dash-summary" title={t.summary}>{t.summary}</span>
      {showPriority && <PriorityBadge priority={t.itPriority} />}
      <StatusBadge status={t.currentStatus} />
      <span className="small text-muted text-nowrap">Last updated {formatDateTime(t.updatedAt)}</span>
    </Link>
  );

  return (
    <div className="container-fluid py-4 px-3 px-md-4 zg-dashboard" data-testid="staff-dashboard">
      <RedirectNotice />
      <DashboardHeader
        title={`Welcome back, ${firstName(user?.name)}`}
        subtitle="Here is what needs attention across the service desk."
        generatedAt={data?.generatedAt}
        refreshing={refreshing}
        onRefresh={state.kind === "ready" ? () => void refresh() : undefined}
      />

      {state.kind === "loading" && <DashboardSkeleton cards={6} gridClass="zg-metric-grid--staff zg-metric-grid--six" />}
      {state.kind === "failed" && <DashboardFailed onRetry={() => void retry()} />}
      {state.kind === "forbidden" && <DashboardForbidden />}

      {data && (
        <>
          <div
            className={`zg-metric-grid zg-metric-grid--staff ${data.users ? "" : "zg-metric-grid--six"} mb-4`}
            data-testid="metric-cards"
          >
            <MetricCard to={queue(data.metrics.unassigned.query)} label="Unassigned" name="Unassigned tickets" value={data.metrics.unassigned.count} />
            <MetricCard to={queue(data.metrics.myAssigned.query)} label="My Assigned" name="My assigned tickets" value={data.metrics.myAssigned.count} />
            <MetricCard to={queue(data.metrics.new.query)} label="New" name="New tickets" value={data.metrics.new.count} />
            <MetricCard to={queue(data.metrics.inProgress.query)} label="In Progress" name="In Progress tickets" value={data.metrics.inProgress.count} />
            <MetricCard to={queue(data.metrics.waitingForRequester.query)} label="Waiting for Requester" name="Waiting for Requester tickets" value={data.metrics.waitingForRequester.count} />
            <MetricCard to={queue(data.metrics.highPriority.query)} label="High IT Priority" name="High IT Priority tickets" value={data.metrics.highPriority.count} />
            {isAdmin && data.users && (
              <Link
                to="/admin/users"
                className="zg-metric-card"
                aria-label={`Users: ${data.users.active} active, ${data.users.inactive} inactive. View all`}
                data-testid="users-card"
              >
                <span className="zg-metric-label">Users</span>
                <span className="zg-metric-value">{data.users.active}</span>
                <span className="small text-muted">{data.users.inactive} inactive</span>
                <span className="zg-metric-link" aria-hidden="true">View all →</span>
              </Link>
            )}
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-8">
              <DashboardList
                title="My recent Tickets"
                testId="list-my-recent"
                items={data.myRecentTickets}
                empty="You don't own any tickets yet."
                viewAll={user ? { to: queue(`ticketOwnerId=${user.id}`), label: "View all my tickets in the Queue" } : undefined}
                render={t => ticketRow(t, false)}
              />
              <DashboardList
                title="My open Actions"
                testId="list-my-actions"
                items={data.myOpenActions}
                empty="No open actions are assigned to you."
                render={a => (
                  <Link to={`/staff/tickets/${a.ticketId}`} className="zg-dash-row" data-action-id={a.id}>
                    <span className="zg-dash-summary" title={a.description}>{a.description}</span>
                    <span className="fw-semibold text-nowrap">{a.ticketNumber}</span>
                    <ActionStatusBadge status={a.status} />
                    <span className="small text-muted text-nowrap">{formatDateTime(a.actionAt)}</span>
                  </Link>
                )}
              />
              <DashboardList
                title="Urgent Tickets"
                testId="list-urgent"
                items={data.urgentTickets}
                empty="No urgent tickets."
                viewAll={{ to: queue(data.metrics.highPriority.query), label: "View all urgent tickets in the Queue" }}
                render={t => ticketRow(t, true)}
              />
            </div>
            <div className="col-12 col-lg-4">
              <section className="card border-0 shadow-sm p-3 zg-quick-actions" aria-labelledby="staff-quick-actions">
                <h2 className="h6 fw-bold mb-3" id="staff-quick-actions">Quick actions</h2>
                <QuickAction to="/staff/tickets" title="Open My Queue" />
                <QuickAction to="/staff/tickets" title="Search Tickets" state={{ focusSearch: true }} />
                {!isAdmin && <QuickAction to="/tickets/new" title="Create Ticket" />}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
