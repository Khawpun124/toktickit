import React from "react";
import { ACTION_STATUS_LABELS, type ActionStatus } from "../../actionsApi.js";

// Status always carries text and a symbol, so it never depends on color (ui-spec section 2).
const SYMBOLS: Record<ActionStatus, string> = {
  PLANNED: "○",
  IN_PROGRESS: "◐",
  COMPLETED: "✓",
  CANCELLED: "✕",
};

const CLASSES: Record<ActionStatus, string> = {
  PLANNED: "zg-action-badge--planned",
  IN_PROGRESS: "zg-action-badge--progress",
  COMPLETED: "zg-action-badge--done",
  CANCELLED: "zg-action-badge--cancelled",
};

export const ActionStatusBadge: React.FC<{ status: ActionStatus }> = ({ status }) => (
  <span className={`zg-action-badge ${CLASSES[status]}`} data-status={status}>
    <span aria-hidden="true">{SYMBOLS[status]}</span> {ACTION_STATUS_LABELS[status]}
  </span>
);

export const FollowUpBadge: React.FC = () => (
  <span className="zg-action-badge zg-action-badge--followup">
    <span aria-hidden="true">⚑</span> Follow-up
  </span>
);
