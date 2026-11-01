import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.js";
import { getRequesterDashboard, type RequesterDashboard } from "../../dashboard/dashboardApi.js";
import { formatDateTime } from "../../dashboard/formatTime.js";
import { useDashboard } from "../../dashboard/useDashboard.js";
import {
  DashboardFailed, DashboardForbidden, DashboardHeader, DashboardList, DashboardSkeleton, MetricCard, QuickAction,
  RedirectNotice, StatusBadge, firstName,
} from "./DashboardParts.js";

// Requester Dashboard (/dashboard, ui-spec section 5). Cards link to My Tickets with the card's query
// from the API; rows open Requester Ticket Detail. Rows and order are exactly the API's.

export const RequesterDashboardScreen: React.FC = () => {
  const { user } = useAuth();
  const { state, refreshing, refresh, retry } = useDashboard<RequesterDashboard>(getRequesterDashboard);
  const data = state.kind === "ready" ? state.data : undefined;

  const ticketRow = (extra: (t: any) => React.ReactNode) => (t: RequesterDashboard["recentlyUpdated"][number]) => (
    <Link to={`/tickets/${t.id}`} className="zg-dash-row">
      <span className="fw-semibold text-nowrap">{t.ticketNumber}</span>
      <span className="zg-dash-summary" title={t.summary}>{t.summary}</span>
      {extra(t)}
    </Link>
  );

  return (
    <div className="container-fluid py-4 px-3 px-md-4 zg-dashboard" data-testid="requester-dashboard">
      <RedirectNotice />
      <DashboardHeader
        title={`Welcome, ${firstName(user?.name)}`}
        subtitle="Here's the latest on your requests."
        generatedAt={data?.generatedAt}
        refreshing={refreshing}
        onRefresh={state.kind === "ready" ? () => void refresh() : undefined}
      />

      {state.kind === "loading" && <DashboardSkeleton cards={4} gridClass="zg-metric-grid--requester" />}
      {state.kind === "failed" && <DashboardFailed onRetry={() => void retry()} />}
      {state.kind === "forbidden" && <DashboardForbidden />}

      {data && (
        <>
          <div className="zg-metric-grid zg-metric-grid--requester mb-4" data-testid="metric-cards">
            <MetricCard to={`/tickets?${data.metrics.open.query}`} label="Open" name="Open tickets" value={data.metrics.open.count} />
            <MetricCard to={`/tickets?${data.metrics.waitingForYou.query}`} label="Waiting for you" name="Tickets waiting for you" value={data.metrics.waitingForYou.count} />
            <MetricCard to={`/tickets?${data.metrics.resolved.query}`} label="Resolved" name="Resolved tickets" value={data.metrics.resolved.count} />
            <MetricCard to={`/tickets?${data.metrics.closed.query}`} label="Closed" name="Closed tickets" value={data.metrics.closed.count} />
          </div>

          <div className="row g-4">
            <div className="col-12 col-lg-8">
              <DashboardList
                title="Needs your attention"
                testId="list-needs-attention"
                items={data.needsAttention}
                empty="Nothing needs your attention right now."
                callout
                render={ticketRow(t => (
                  <span className="small text-muted text-nowrap">Waiting since {formatDateTime(t.waitingSince)}</span>
                ))}
              />
              <DashboardList
                title="Recently updated"
                testId="list-recently-updated"
                items={data.recentlyUpdated}
                empty="No recent updates on your tickets."
                render={ticketRow(t => (
                  <>
                    <StatusBadge status={t.currentStatus} />
                    <span className="small text-muted text-nowrap">Last updated {formatDateTime(t.updatedAt)}</span>
                  </>
                ))}
              />
              <DashboardList
                title="Recently resolved"
                testId="list-recently-resolved"
                items={data.recentlyResolved}
                empty="No tickets were resolved in the last 30 days."
                render={ticketRow(t => (
                  <>
                    <StatusBadge status={t.currentStatus} />
                    <span className="small text-muted text-nowrap">Resolved {formatDateTime(t.resolvedAt)}</span>
                  </>
                ))}
              />
            </div>
            <div className="col-12 col-lg-4">
              <section className="card border-0 shadow-sm p-3 zg-quick-actions" aria-labelledby="requester-quick-actions">
                <h2 className="h6 fw-bold mb-3" id="requester-quick-actions">Quick actions</h2>
                <QuickAction to="/tickets/new" title="Create Ticket" hint="Submit a new request" />
                <QuickAction to="/tickets" title="View My Tickets" hint="Track existing requests" />
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
