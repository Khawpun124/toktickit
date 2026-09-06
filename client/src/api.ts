const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface Category {
  id: number;
  name: string;
}

export interface RequesterUser {
  id: number;
  name: string;
  email: string;
}

export interface RelatedSystem {
  id: number;
  name: string;
}

export interface SystemStatus {
  online: boolean;
  categories: Category[];
}

export interface HealthResponse {
  status: string;
  service: string;
}

// Issue 2 — API health check
export async function checkHealth(): Promise<HealthResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/health`);
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("TokTickIT API returned an unexpected error");
  }

  return await res.json();
}

// Issue 4 — Category list
export async function getCategories(): Promise<Category[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/categories`);
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("TokTickIT API returned an unexpected error");
  }

  return await res.json();
}

// Issue 2 — Development Requester list
export async function getRequesters(): Promise<RequesterUser[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/requesters`);
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unable to load requesters");
  }

  return await res.json();
}

// Issue 2 — Related Systems list
export async function getRelatedSystems(): Promise<RelatedSystem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/related-systems`);
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unable to load related systems");
  }

  return await res.json();
}

export async function checkSystem(): Promise<SystemStatus> {
  const health = await checkHealth();
  if (health.status !== "ok") {
    return { online: false, categories: [] };
  }
  const categories = await getCategories();
  return { online: true, categories };
}

export interface CreateTicketPayload {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
  attachmentUploadErrors: { fileName: string; reason: string }[];
}

export async function createTicket(
  payload: CreateTicketPayload,
  requesterId: number
): Promise<Ticket> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requester-Id": requesterId.toString(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Unable to create ticket") as Error & { fields?: Record<string, string> };
    if (data && data.fields) {
      err.fields = data.fields;
    }
    throw err;
  }

  return data;
}

export interface GetTicketsParams {
  search?: string;
  categoryId?: string | number;
  requestedPriority?: string;
  itPriority?: string;
  currentStatus?: string;
  sortBy?: "createdAt" | "ticketNumber";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface TicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface TicketsResponse {
  data: TicketListItem[];
  pagination: PaginationInfo;
}

// Issue 4 — My Tickets List
export async function getTickets(
  params: GetTicketsParams,
  requesterId: number
): Promise<TicketsResponse> {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.categoryId) query.append("categoryId", params.categoryId.toString());
  if (params.requestedPriority) query.append("requestedPriority", params.requestedPriority);
  if (params.itPriority) query.append("itPriority", params.itPriority);
  if (params.currentStatus) query.append("currentStatus", params.currentStatus);
  if (params.sortBy) query.append("sortBy", params.sortBy);
  if (params.sortDir) query.append("sortDir", params.sortDir);
  if (params.page) query.append("page", params.page.toString());
  if (params.pageSize) query.append("pageSize", params.pageSize.toString());

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets?${query.toString()}`, {
      headers: {
        "X-Requester-Id": requesterId.toString(),
      },
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unable to load tickets");
  }

  return await res.json();
}

// Issue 5 — Requester Ticket Detail & Attachments interfaces
export interface AttachmentItem {
  id: number;
  fileName: string;
  sizeBytes: number;
  uploadedAt: string;
  removedAt: string | null;
  removedReason: string | null;
}

export interface TicketDetail {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryName: string;
  relatedSystemName: string;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  currentStatus: string;
  createdAt: string;
  updatedAt: string;
}

// Issue 5 — Get single ticket detail
export async function getTicket(id: number, requesterId: number): Promise<TicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${id}`, {
      headers: {
        "X-Requester-Id": requesterId.toString(),
      },
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Ticket not found");
    }
    throw new Error("Unable to load ticket detail");
  }

  return await res.json();
}

// Issue 5 — Get attachments list for ticket
export async function getAttachments(ticketId: number, requesterId: number): Promise<AttachmentItem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      headers: {
        "X-Requester-Id": requesterId.toString(),
      },
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Ticket not found");
    }
    throw new Error("Unable to load attachments");
  }

  return await res.json();
}

// Issue 5 — Upload attachment
export async function uploadAttachment(
  ticketId: number,
  file: File,
  requesterId: number
): Promise<AttachmentItem> {
  const formData = new FormData();
  formData.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      headers: {
        "X-Requester-Id": requesterId.toString(),
      },
      body: formData,
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to upload attachment");
  }

  return data;
}

// Issue 5 — Download attachment helper function
export function downloadAttachmentUrl(attachmentId: number): string {
  return `${API_URL}/api/attachments/${attachmentId}/download`;
}

// Issue 5 — Soft-remove attachment
export async function deleteAttachment(
  attachmentId: number,
  reason: string,
  requesterId: number
): Promise<{ id: number; fileName: string; removedAt: string; removedReason: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Requester-Id": requesterId.toString(),
      },
      body: JSON.stringify({ reason }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to remove attachment");
  }

  return data;
}



