import { API_URL } from "../api.js";
import type { ActionStatus } from "../actionsApi.js";

// Lab 4 dashboards (api-spec sections 8 and 9). The UI shows these figures as returned: it never
// computes a metric, re-filters, or re-sorts a list (BR-26, BR-28).

export interface Metric {
  count: number;
  /** The exact list query for the drill-down; its totalItems equals `count` (BR-31). */
  query: string;
}

export interface DashboardTicketRow {
  id: number;
  ticketNumber: string;
  summary: string;
  currentStatus: string;
  updatedAt: string;
}

export interface RequesterDashboard {
  generatedAt: string;
  recentlyResolvedSince: string;
  metrics: { open: Metric; waitingForYou: Metric; resolved: Metric; closed: Metric };
  needsAttention: (DashboardTicketRow & { waitingSince: string })[];
  recentlyUpdated: DashboardTicketRow[];
  recentlyResolved: (DashboardTicketRow & { resolvedAt: string })[];
}

export interface StaffTicketRow extends DashboardTicketRow {
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
}

export interface OpenActionRow {
  id: number;
  ticketId: number;
  ticketNumber: string;
  description: string;
  status: ActionStatus;
  actionAt: string;
}

export interface StaffDashboard {
  generatedAt: string;
  metrics: {
    unassigned: Metric; myAssigned: Metric; new: Metric; inProgress: Metric; waitingForRequester: Metric; highPriority: Metric;
  };
  myRecentTickets: StaffTicketRow[];
  myOpenActions: OpenActionRow[];
  urgentTickets: StaffTicketRow[];
  /** Administrator only. */
  users?: { active: number; inactive: number };
}

/** A failed dashboard request. `status` 0 means the API could not be reached. */
export class DashboardError extends Error {
  constructor(public status: number) {
    super(status === 403 ? "Forbidden" : "Dashboard request failed");
  }
}

async function getDashboard<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  } catch {
    throw new DashboardError(0);
  }
  if (!res.ok) throw new DashboardError(res.status);
  return (await res.json()) as T;
}

export const getRequesterDashboard = () => getDashboard<RequesterDashboard>("/api/dashboard/requester");
export const getStaffDashboard = () => getDashboard<StaffDashboard>("/api/dashboard/staff");
