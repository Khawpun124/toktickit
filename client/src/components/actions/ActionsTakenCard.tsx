import React, { useEffect, useId, useState } from "react";
import { formatActionTime, type ActionTaken } from "../../actionsApi.js";
import { ActionDialog } from "./ActionDialog.js";
import { ActionStatusBadge, FollowUpBadge } from "./ActionStatusBadge.js";
import { useActions } from "./useActions.js";
import "./actions.css";

// Actions Taken card for Staff Ticket Detail (ui-spec section 6) and, read-only, for Requester
// Ticket Detail (section 7). The list keeps the API order; times are shown in the browser's zone.

const ACCEPTING_STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

interface ActionsTakenCardProps {
  ticketId: number;
  ticketStatus: string;
  mode: "staff" | "requester";
  currentUser?: { id: number; name: string };
  /** Called after an Action was created, edited, or changed status (the page reloads the Ticket). */
  onActionsChanged?: () => void;
  /** Changing it reloads the list (for example after the server refused Resolved). */
  refreshKey?: number;
}

type DialogState = { kind: "create" } | { kind: "view"; actionId: number };

const EyeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M8 3C4.4 3 1.6 5.4.5 8c1.1 2.6 3.9 5 7.5 5s6.4-2.4 7.5-5C14.4 5.4 11.6 3 8 3zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4zM8 6.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4z" />
  </svg>
);

export const ActionsTakenCard: React.FC<ActionsTakenCardProps> = ({
  ticketId, ticketStatus, mode, currentUser, onActionsChanged, refreshKey = 0,
}) => {
  const staff = mode === "staff";
  const headingId = useId();
  const { actions, error, loading, reload, replace } = useActions(ticketId, `${ticketStatus}:${refreshKey}`);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Set when the server says the Ticket no longer accepts actions (a 409 on create).
  const [closedByServer, setClosedByServer] = useState(false);

  useEffect(() => setClosedByServer(false), [ticketStatus]);

  const accepting = ACCEPTING_STATUSES.includes(ticketStatus) && !closedByServer;
  const title = staff ? "Actions Taken" : "Actions Taken by IT Staff";
  const viewing = dialog?.kind === "view" ? actions?.find(a => a.id === dialog.actionId) : undefined;

  const openView = (a: ActionTaken) => {
    setAnnouncement("");
    setDialog({ kind: "view", actionId: a.id });
  };

  const viewLabel = (a: ActionTaken) => `View action from ${formatActionTime(a.actionAt)}`;

  const renderList = (list: ActionTaken[]) => (
    <>
      <div className="d-none d-md-block table-responsive" data-testid="actions-table-view">
        <table className="table table-sm align-middle mb-0 zg-actions-table">
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Date/Time</th>
              <th scope="col">Description</th>
              <th scope="col">Status</th>
              <th scope="col">Assigned to</th>
              <th scope="col">Follow-up</th>
              <th scope="col"><span className="visually-hidden">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id} data-action-id={a.id}>
                <td className="text-nowrap">{formatActionTime(a.actionAt)}</td>
                <td className="zg-col-description"><div className="zg-clamp-2">{a.description}</div></td>
                <td><ActionStatusBadge status={a.status} /></td>
                <td>{a.assignee.name}</td>
                <td>{a.followUpRequired ? <FollowUpBadge /> : <span className="text-muted">—</span>}</td>
                <td className="text-end">
                  <button type="button" className="btn btn-sm btn-outline-secondary zg-touch" onClick={() => openView(a)} aria-label={viewLabel(a)}>
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="d-md-none list-unstyled mb-0" data-testid="actions-card-view">
        {list.map(a => (
          <li key={a.id} className="border rounded p-3 mb-2" data-action-id={a.id}>
            <dl className="row small mb-2">
              <dt className="col-5 text-muted">Date/Time</dt>
              <dd className="col-7 mb-1">{formatActionTime(a.actionAt)}</dd>
              <dt className="col-5 text-muted">Description</dt>
              <dd className="col-7 mb-1 text-break">{a.description}</dd>
              <dt className="col-5 text-muted">Status</dt>
              <dd className="col-7 mb-1"><ActionStatusBadge status={a.status} /></dd>
              <dt className="col-5 text-muted">Assigned to</dt>
              <dd className="col-7 mb-1">{a.assignee.name}</dd>
              {a.followUpRequired && (
                <>
                  <dt className="col-5 text-muted">Follow-up</dt>
                  <dd className="col-7 mb-1"><FollowUpBadge /></dd>
                </>
              )}
            </dl>
            <button type="button" className="btn btn-outline-secondary w-100 zg-touch" onClick={() => openView(a)} aria-label={viewLabel(a)}>
              View
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  const renderBody = () => {
    if (loading && !actions) {
      return (
        <div aria-busy="true" aria-label="Loading actions" className="d-flex flex-column gap-2">
          <div className="zg-skeleton-row" />
          <div className="zg-skeleton-row" />
          <div className="zg-skeleton-row" />
        </div>
      );
    }
    if (error) {
      return (
        <div className="alert alert-warning d-flex flex-wrap align-items-center justify-content-between gap-2 mb-0" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-secondary zg-touch" onClick={() => void reload()}>Retry</button>
        </div>
      );
    }
    if (!actions || actions.length === 0) {
      return (
        <p className="text-muted mb-0">
          {staff ? "No actions recorded yet." : "No actions have been recorded for this ticket yet."}
        </p>
      );
    }
    return renderList(actions);
  };

  const heading = `${title}${actions ? ` (${actions.length})` : ""}`;

  const header = (
    <div className={`d-flex flex-wrap align-items-center justify-content-between gap-2 ${staff ? "card-header bg-light py-3" : "border-bottom pb-3 mb-3"}`}>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <h2 className={`${staff ? "h6" : "h5"} fw-bold mb-0`} id={headingId}>{heading}</h2>
        {staff && (
          <span className="zg-shared-label">
            <EyeIcon /> Visible to the Requester
          </span>
        )}
      </div>
      {staff && (accepting ? (
        <button
          type="button"
          className="btn btn-success btn-sm zg-touch"
          onClick={() => { setAnnouncement(""); setDialog({ kind: "create" }); }}
        >
          Add Action
        </button>
      ) : (
        <span className="small text-muted fst-italic">Reopen the Ticket to add actions.</span>
      ))}
    </div>
  );

  return (
    <section
      id="actions-taken"
      tabIndex={-1}
      className={`zg-actions-card zg-actions-scope mb-4 ${staff ? "card border-0 shadow-sm" : "zg-card p-4"}`}
      aria-labelledby={headingId}
      data-testid="actions-taken-card"
    >
      {header}
      <div className={staff ? "card-body p-3 p-md-4" : ""}>
        <div role="status" className="small text-success fw-semibold">{announcement}</div>
        {renderBody()}
      </div>

      {dialog && (dialog.kind === "create" || viewing) && (
        <ActionDialog
          key={dialog.kind === "create" ? "create" : dialog.actionId}
          ticketId={ticketId}
          initialMode={dialog.kind}
          action={viewing}
          readOnly={!staff}
          currentUser={currentUser}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            setAnnouncement("Action added.");
            void reload();
            onActionsChanged?.();
          }}
          onSaved={saved => {
            replace(saved);
            setDialog(null);
            setAnnouncement("Action saved.");
            onActionsChanged?.();
          }}
          onActionUpdated={updated => {
            replace(updated);
            onActionsChanged?.();
          }}
          onTicketClosed={() => setClosedByServer(true)}
        />
      )}
    </section>
  );
};
