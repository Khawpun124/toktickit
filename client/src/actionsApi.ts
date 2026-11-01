// Lab 4 Issue 3 — Actions Taken API client (api-spec sections 1-5) and the single place that
// turns an Actions error into a message a person can read. Raw JSON is never shown.
import { API_URL } from "./api.js";

export type ActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type CreateActionStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED";

export interface ActionTaken {
  id: number;
  ticketId: number;
  actionAt: string;
  description: string;
  result: string | null;
  status: ActionStatus;
  performedBy: { id: number; name: string };
  assignee: { id: number; name: string; isActive: boolean };
  followUpRequired: boolean;
  followUpNote: string | null;
  attachmentNotes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActionPayload {
  actionAt: string;
  description: string;
  status: CreateActionStatus;
  assigneeId: number;
  result?: string | null;
  followUpRequired: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
  clientRequestId: string;
}

/** Field edit. Status and Ticket never change here (AC-37); there is no field for them. */
export interface UpdateActionPayload {
  expectedVersion: number;
  description?: string;
  assigneeId?: number;
  actionAt?: string;
  result?: string | null;
  followUpRequired?: boolean;
  followUpNote?: string | null;
  attachmentNotes?: string | null;
}

export interface ChangeActionStatusPayload {
  expectedVersion: number;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  result?: string;
}

const EDITABLE_FIELDS: (keyof UpdateActionPayload)[] = [
  "expectedVersion", "description", "assigneeId", "actionAt", "result",
  "followUpRequired", "followUpNote", "attachmentNotes",
];

/** status 0 means the request never got an answer (network failure). */
export class ActionApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string>;
  body?: any;

  constructor(status: number, body?: any) {
    super(body?.error ?? (status === 0 ? "Network error" : `Request failed with ${status}`));
    this.name = "ActionApiError";
    this.status = status;
    this.code = body?.code;
    this.fields = body?.fields;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ActionApiError(0);
  }

  let data: any = undefined;
  try {
    data = await res.json();
  } catch {
    // An empty or non-JSON body is handled by the status alone.
  }
  if (!res.ok) throw new ActionApiError(res.status, data);
  return data as T;
}

export function listActions(ticketId: number): Promise<ActionTaken[]> {
  return request("GET", `/api/tickets/${ticketId}/actions`);
}

export function createAction(ticketId: number, payload: CreateActionPayload): Promise<ActionTaken> {
  return request("POST", `/api/staff/tickets/${ticketId}/actions`, payload);
}

export function updateAction(actionId: number, payload: UpdateActionPayload): Promise<ActionTaken> {
  // Only the editable fields are sent, so a status or ticketId can never reach the edit endpoint.
  const body: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (payload[key] !== undefined) body[key] = payload[key];
  }
  return request("PATCH", `/api/staff/actions/${actionId}`, body);
}

export function changeActionStatus(actionId: number, payload: ChangeActionStatusPayload): Promise<ActionTaken> {
  return request("PATCH", `/api/staff/actions/${actionId}/status`, payload);
}

// ── Error messages ─────────────────────────────────────────────────────────

export type ActionErrorKind =
  | "network" | "validation" | "stale" | "terminal" | "transition" | "ticketClosed"
  | "unauthenticated" | "passwordChange" | "forbidden" | "notFound";

export interface ActionErrorView {
  kind: ActionErrorKind;
  message: string;
  fields?: Record<string, string>;
  current?: ActionTaken;
  ticketStatus?: string;
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  WAITING_FOR_REQUESTER: "Waiting for Requester",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  CANCELLED: "Cancelled",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function ticketStatusLabel(status: string): string {
  return TICKET_STATUS_LABELS[status] ?? status;
}

export function formatActionTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Maps any failure of an Actions request to one readable message.
 * `purpose` picks the wording for a failed load versus a failed save or status change.
 */
export function describeActionError(err: unknown, purpose: "load" | "save" = "save"): ActionErrorView {
  const e = err instanceof ActionApiError ? err : new ActionApiError(0);
  const body = e.body ?? {};

  if (e.status === 0 || e.status >= 500) {
    return {
      kind: "network",
      message: purpose === "load"
        ? "We couldn't load the actions. Please try again."
        : "We couldn't save this action. Please try again.",
    };
  }
  if (e.status === 401) return { kind: "unauthenticated", message: "Your session has ended. Please sign in again." };
  if (e.status === 403 && e.code === "PASSWORD_CHANGE_REQUIRED") {
    return { kind: "passwordChange", message: "Please change your password before continuing." };
  }
  if (e.status === 403) return { kind: "forbidden", message: "You don't have permission to do this." };
  if (e.status === 404) return { kind: "notFound", message: "This ticket or action could not be found. It may have been removed." };

  switch (e.code) {
    case "VALIDATION_FAILED":
      return { kind: "validation", message: "Please correct the highlighted fields.", fields: e.fields ?? {} };
    case "INVALID_TRANSITION":
      return {
        kind: "transition",
        message: `This status change is not allowed (${ACTION_STATUS_LABELS[body.from as ActionStatus] ?? body.from} to ` +
          `${ACTION_STATUS_LABELS[body.to as ActionStatus] ?? body.to}). Load the latest version to see the current status.`,
      };
    case "ACTION_TERMINAL":
      return { kind: "terminal", message: "This action is already completed or cancelled and can no longer be changed." };
    case "STALE_VERSION": {
      const current = body.current as ActionTaken | undefined;
      const when = current?.updatedAt ? ` at ${formatActionTime(current.updatedAt)}` : "";
      return {
        kind: "stale",
        message: `Someone else changed this action${when}. Your changes were not saved.`,
        current,
      };
    }
    case "TICKET_NOT_ACCEPTING_ACTIONS": {
      const status = typeof body.ticketStatus === "string" ? body.ticketStatus : undefined;
      return {
        kind: "ticketClosed",
        message: `This ticket is ${status ? ticketStatusLabel(status) : "closed"} and no longer accepts actions. Reopen the Ticket to add actions.`,
        ticketStatus: status,
      };
    }
  }
  return {
    kind: "network",
    message: purpose === "load"
      ? "We couldn't load the actions. Please try again."
      : "We couldn't save this action. Please try again.",
  };
}
