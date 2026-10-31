import React, { useEffect, useId, useState } from "react";
import { setTicketStatus, type StaffTicketDetail, type TicketUpdateError } from "../../api.js";
import {
  confirmationMessage, gateMessage, needsConfirmation, nextTicketStatuses, ticketStatusLabel,
} from "../../ticketWorkflow.js";

// Status control in Ticket Operations (ui-spec section 8). It offers only the permitted next
// statuses, asks with the browser's window.confirm for the flagged pairs, sends the Ticket's version,
// and explains the resolution gate. The server is the authority; its answers are shown as they come.

interface TicketStatusControlProps {
  ticket: StaffTicketDetail;
  getStatusBadgeClass: (status: string) => string;
  /** Applies the Ticket header from a successful change and announces `message`. */
  onUpdated: (changes: Partial<StaffTicketDetail>, message: string) => void;
  /** Loads the Ticket again (after a conflict, or to refresh the unfinished-action count). */
  onReload: () => Promise<void>;
}

type ControlError = { message: string; reload: boolean };

export const TicketStatusControl: React.FC<TicketStatusControlProps> = ({ ticket, getStatusBadgeClass, onUpdated, onReload }) => {
  const id = useId();
  const calloutId = `${id}-gate`;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ControlError | null>(null);
  // Set when the server answered 409 OPEN_ACTIONS_BLOCK_RESOLUTION (the page data was stale).
  const [gateFromServer, setGateFromServer] = useState<number | null>(null);

  useEffect(() => setGateFromServer(null), [ticket.version]);

  const from = ticket.currentStatus;
  const allowedNext = nextTicketStatuses(from);
  const openActions = ticket.openActionsCount ?? 0;
  const blockedCount = openActions > 0 ? openActions : gateFromServer ?? 0;
  const resolveBlocked = allowedNext.includes("RESOLVED") && blockedCount > 0;

  const goToActions = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const card = document.getElementById("actions-taken");
    card?.scrollIntoView?.({ block: "start" });
    card?.focus();
  };

  const reload = async () => {
    await onReload();
    setError(null);
  };

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const to = e.target.value;
    if (!to) return;
    if (needsConfirmation(from, to) && !window.confirm(confirmationMessage(from, to, openActions))) return;

    setSaving(true);
    setError(null);
    setGateFromServer(null);
    try {
      // expectedVersion only when the Ticket has a version (Lab 3 callers and data have none).
      const res = ticket.version !== undefined
        ? await setTicketStatus(ticket.id, to, { expectedVersion: ticket.version })
        : await setTicketStatus(ticket.id, to);
      const { cancelledActionsCount, ...header } = res;
      let message = `Status changed from ${ticketStatusLabel(from)} to ${ticketStatusLabel(res.currentStatus ?? to)}.`;
      if (cancelledActionsCount) message += ` ${cancelledActionsCount} unfinished action(s) were cancelled automatically.`;
      onUpdated({ ...header, currentStatus: res.currentStatus ?? to }, message);
    } catch (caught) {
      const err = caught as TicketUpdateError;
      if (err.code === "STALE_VERSION") {
        setError({ message: "This ticket was changed by someone else, so your change was not saved. Reload to see the latest version.", reload: true });
      } else if (err.code === "OPEN_ACTIONS_BLOCK_RESOLUTION") {
        setGateFromServer(err.openActionsCount ?? 1);
        await onReload();
      } else if (err.from && err.to) {
        setError({ message: `Cannot change status from ${ticketStatusLabel(err.from)} to ${ticketStatusLabel(err.to)}. Reload to see the current status.`, reload: true });
      } else {
        setError({ message: err.message || "Unable to update status", reload: false });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <label htmlFor="staff-status-select" className="form-label small fw-semibold mb-1">
        Change Status
      </label>
      <div className="mb-2">
        <span className={`badge ${getStatusBadgeClass(from)} me-1`}>{ticketStatusLabel(from)}</span>
        {allowedNext.length > 0 && <span className="small text-muted">→ select new status</span>}
      </div>
      {allowedNext.length > 0 ? (
        <select
          id="staff-status-select"
          className="form-select form-select-sm"
          value=""
          onChange={handleChange}
          disabled={saving}
          aria-label="Select new ticket status"
          aria-describedby={resolveBlocked ? calloutId : undefined}
        >
          <option value="" disabled>— Transition to… —</option>
          {allowedNext.map(s => (
            <option key={s} value={s} disabled={s === "RESOLVED" && resolveBlocked}>
              {ticketStatusLabel(s)}{s === "RESOLVED" && resolveBlocked ? " (unfinished actions)" : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="small text-muted fst-italic">No further transitions available from this status.</div>
      )}

      {resolveBlocked && (
        <div
          id={calloutId}
          className="alert alert-warning small py-2 px-3 mt-2 mb-0"
          role={gateFromServer !== null ? "alert" : undefined}
          data-testid="resolution-gate-callout"
        >
          {gateMessage(blockedCount)}{" "}
          <a href="#actions-taken" onClick={goToActions} className="alert-link">Go to Actions Taken</a>
        </div>
      )}
      {saving && <div className="small text-muted mt-1">Saving…</div>}
      {error && (
        <div className="small text-danger mt-1" role="alert">
          {error.message}
          {error.reload && (
            <>
              {" "}
              <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => void reload()}>
                Reload
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
