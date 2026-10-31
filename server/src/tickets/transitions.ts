// Ticket status matrix (BR-16): the Lab 3 matrix, unchanged, in one place. The resolution gate
// (BR-17) and the cancel cascade (BR-18) are applied by the workflow on top of it.

export const TICKET_STATUSES = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
] as const;

export type TicketStatusValue = (typeof TICKET_STATUSES)[number];

export const TICKET_TRANSITIONS: Readonly<Record<TicketStatusValue, readonly TicketStatusValue[]>> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["OPEN"],
  CANCELLED: [],
};

export function isTicketStatus(value: unknown): value is TicketStatusValue {
  return typeof value === "string" && (TICKET_STATUSES as readonly string[]).includes(value);
}

/** The statuses a Ticket may move to from `from` (empty for Cancelled, which is terminal). */
export function nextTicketStatuses(from: string): readonly TicketStatusValue[] {
  return isTicketStatus(from) ? TICKET_TRANSITIONS[from] : [];
}

export function isAllowedTicketTransition(from: string, to: unknown): to is TicketStatusValue {
  return isTicketStatus(to) && nextTicketStatuses(from).includes(to);
}

export function isTerminalTicketStatus(status: string): boolean {
  return isTicketStatus(status) && TICKET_TRANSITIONS[status].length === 0;
}
