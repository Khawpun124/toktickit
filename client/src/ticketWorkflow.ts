// Ticket status matrix for the UI (BR-16; the server is the authority and enforces the same matrix).
// Used by the status control on Staff Ticket Detail and by UNIT-06.

export const TICKET_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export const TICKET_TRANSITIONS: Record<string, string[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["OPEN"],
  CANCELLED: [],
};

// Pairs whose "Confirmation in UI" column in BR-16 is Yes.
const CONFIRM_PAIRS = new Set([
  "NEW->CANCELLED",
  "OPEN->CANCELLED",
  "IN_PROGRESS->RESOLVED",
  "IN_PROGRESS->CANCELLED",
  "WAITING_FOR_REQUESTER->RESOLVED",
  "WAITING_FOR_REQUESTER->CANCELLED",
  "CLOSED->REOPENED",
]);

/** Ticket statuses whose Ticket Operations fields are read-only in the UI. */
export const READ_ONLY_TICKET_STATUSES = ["CLOSED", "CANCELLED"];

export const ticketStatusLabel = (status: string) => TICKET_STATUS_LABELS[status] ?? status;

export function nextTicketStatuses(from: string): string[] {
  return TICKET_TRANSITIONS[from] ?? [];
}

/** UNIT-06: whether changing from `from` to `to` asks for confirmation first. */
export function needsConfirmation(from: string, to: string): boolean {
  return CONFIRM_PAIRS.has(`${from}->${to}`);
}

/** Text of the native confirmation (ui-spec section 8). */
export function confirmationMessage(from: string, to: string, openActionsCount: number): string {
  const question = `Change status from ${ticketStatusLabel(from)} to ${ticketStatusLabel(to)}?`;
  if (to !== "CANCELLED") return question;
  return `${question}\n\n${openActionsCount} unfinished action(s) will be cancelled automatically.`;
}

export function gateMessage(openActionsCount: number): string {
  return `${openActionsCount} unfinished action(s) must be completed or cancelled before this ticket can be resolved.`;
}
