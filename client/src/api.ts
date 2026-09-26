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
  payload: CreateTicketPayload
): Promise<Ticket> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
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
  params: GetTicketsParams
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
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unable to load tickets");
  }

  return await res.json();
}

// Issue 4 — IT Staff Queue interfaces & API
export interface GetStaffTicketsParams {
  search?: string;
  categoryId?: string | number;
  requestedPriority?: string;
  itPriority?: string;
  currentStatus?: string;
  ticketOwnerId?: string | number;
  sortBy?: "createdAt" | "ticketNumber" | "itPriority";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface StaffTicketListItem {
  id: number;
  ticketNumber: string;
  summary: string;
  categoryName: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  currentStatus: string;
  problemAppearsResolved: boolean;
  ticketOwnerId: number | null;
  ticketOwnerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffTicketsResponse {
  data: StaffTicketListItem[];
  pagination: PaginationInfo;
}

export async function getStaffTickets(
  params: GetStaffTicketsParams
): Promise<StaffTicketsResponse> {
  const query = new URLSearchParams();
  if (params.search) query.append("search", params.search);
  if (params.categoryId) query.append("categoryId", params.categoryId.toString());
  if (params.requestedPriority) query.append("requestedPriority", params.requestedPriority);
  if (params.itPriority) query.append("itPriority", params.itPriority);
  if (params.currentStatus) query.append("currentStatus", params.currentStatus);
  if (params.ticketOwnerId !== undefined && params.ticketOwnerId !== "") {
    query.append("ticketOwnerId", params.ticketOwnerId.toString());
  }
  if (params.sortBy) query.append("sortBy", params.sortBy);
  if (params.sortDir) query.append("sortDir", params.sortDir);
  if (params.page) query.append("page", params.page.toString());
  if (params.pageSize) query.append("pageSize", params.pageSize.toString());

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets?${query.toString()}`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (res.status === 403) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  if (!res.ok) {
    throw new Error("Unable to load staff queue tickets");
  }

  return await res.json();
}

export interface StaffTicketDetail {
  id: number;
  ticketNumber: string;
  requesterId: number;
  requesterName: string;
  requesterEmail: string;
  categoryId: number;
  categoryName: string;
  relatedSystemId: number;
  relatedSystemName: string;
  summary: string;
  description: string;
  requestedPriority: "LOW" | "MEDIUM" | "HIGH";
  itPriority: "LOW" | "MEDIUM" | "HIGH" | null;
  currentStatus: string;
  problemAppearsResolved: boolean;
  ticketOwnerId: number | null;
  ticketOwnerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getStaffTicketDetail(
  id: number | string
): Promise<StaffTicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets/${id}`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (res.status === 403) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  if (res.status === 404) {
    const err = new Error("Ticket not found") as Error & { status?: number };
    err.status = 404;
    throw err;
  }

  if (!res.ok) {
    throw new Error("Unable to load staff ticket details");
  }

  return await res.json();
}

export interface StaffUserItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

export async function getStaffUsers(): Promise<StaffUserItem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/users`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unable to load staff users");
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
  problemAppearsResolved?: boolean;
  createdAt: string;
  updatedAt: string;
}

// Issue 5 — Get single ticket detail
export async function getTicket(id: number): Promise<TicketDetail> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${id}`, {
      credentials: "include",
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
export async function getAttachments(ticketId: number): Promise<AttachmentItem[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      credentials: "include",
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
  file: File
): Promise<AttachmentItem> {
  const formData = new FormData();
  formData.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/attachments`, {
      method: "POST",
      credentials: "include",
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

// Issue 5 — Download attachment with authentication
export async function downloadAttachment(
  attachmentId: number,
  fileName: string
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}/download`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    let errorMessage = "Unable to download attachment";
    try {
      const data = await res.json();
      if (data && data.error) {
        errorMessage = data.error;
      }
    } catch {
      // JSON parse error fallback
    }
    throw new Error(errorMessage);
  }

  const blob = await res.blob();
  const createUrl = window.URL?.createObjectURL || (() => "blob:mock");
  const revokeUrl = window.URL?.revokeObjectURL || (() => {});
  const url = createUrl(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  revokeUrl(url);
}


// Issue 5 — Soft-remove attachment
export async function deleteAttachment(
  attachmentId: number,
  reason: string
): Promise<{ id: number; fileName: string; removedAt: string; removedReason: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/attachments/${attachmentId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
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

// ---------------------------------------------------------------------------
// Lab 3 Issue 2 — Authentication API
// ---------------------------------------------------------------------------

export type UserRole = "REQUESTER" | "IT_STAFF" | "ADMINISTRATOR";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

export interface PasswordRuleResults {
  minLength: boolean;
  hasUpperLower: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Invalid email or password. Please try again.");
  }

  return data;
}

export async function logout(): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Logout failed");
  }
}

export async function getMe(): Promise<AuthUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/me`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (!res.ok) {
    throw new Error("Unauthenticated");
  }

  return await res.json();
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ success: boolean; mustChangePassword: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error || "Password change failed");
    err.rules = data.rules;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Lab 3 Issue 3 — Resolution Flag & Public Comments API
// ---------------------------------------------------------------------------

export async function updateResolutionFlag(
  ticketId: number
): Promise<{ id: number; problemAppearsResolved: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/resolution-flag`, {
      method: "PATCH",
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Unable to update resolution flag");
  }

  return data;
}

export interface PublicComment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: UserRole;
  content: string;
  createdAt: string;
}

export async function getPublicComments(ticketId: number): Promise<PublicComment[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Unable to load public comments");
  }

  return data;
}

export async function postPublicComment(
  ticketId: number,
  content: string
): Promise<PublicComment> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Unable to post comment");
  }

  return data;
}



// ---------------------------------------------------------------------------
// Issue 5 — IT Staff Ticket Operations API
// ---------------------------------------------------------------------------

// Endpoint 13 — Claim / reassign / unassign Ticket Owner
export async function claimTicketOwner(
  ticketId: number,
  ticketOwnerId: number | null
): Promise<{ id: number; ticketOwnerId: number | null; ticketOwnerName: string | null }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/owner`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ticketOwnerId }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to update ticket owner");
  }
  return data;
}

// Endpoint 14 — Set IT Priority
export async function setItPriority(
  ticketId: number,
  itPriority: "LOW" | "MEDIUM" | "HIGH"
): Promise<{ id: number; itPriority: "LOW" | "MEDIUM" | "HIGH" }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ itPriority }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to update IT priority");
  }
  return data;
}

// Endpoint 15 — Status transition
export async function setTicketStatus(
  ticketId: number,
  newStatus: string
): Promise<{ id: number; currentStatus: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/staff/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newStatus }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err: any = new Error(data.error ?? "Unable to update ticket status");
    err.from = data.from;
    err.to = data.to;
    throw err;
  }
  return data;
}

// Internal Note shape (same as PublicComment)
export interface InternalNote {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string;
  authorRole: UserRole;
  content: string;
  createdAt: string;
}

// Endpoint 17 — GET internal notes (IT_STAFF/ADMINISTRATOR only)
export async function getInternalNotes(ticketId: number): Promise<InternalNote[]> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/notes`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (res.status === 403) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to load internal notes");
  }
  return data;
}

// Endpoint 17 — POST internal note (IT_STAFF/ADMINISTRATOR only)
export async function postInternalNote(
  ticketId: number,
  content: string
): Promise<InternalNote> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/tickets/${ticketId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to post internal note");
  }
  return data;
}

// ---------------------------------------------------------------------------
// Issue 6 — Administrator User Management API Client (Endpoints 18–21)
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  initialPassword: string;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

// Endpoint 18 — GET /api/admin/users (ADMINISTRATOR only)
export async function getAdminUsers(search?: string, role?: string): Promise<AdminUser[]> {
  const params = new URLSearchParams();
  if (search && search.trim() !== "") params.append("search", search.trim());
  if (role && role.trim() !== "") params.append("role", role.trim());

  const queryString = params.toString() ? `?${params.toString()}` : "";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/users${queryString}`, {
      credentials: "include",
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  if (res.status === 403) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to load users");
  }
  return data;
}

// Endpoint 19 — POST /api/admin/users (ADMINISTRATOR only)
export async function createAdminUser(payload: CreateUserPayload): Promise<AdminUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error ?? "Unable to create user") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

// Endpoint 20 — PATCH /api/admin/users/:id (ADMINISTRATOR only)
export async function updateAdminUser(id: number, payload: UpdateUserPayload): Promise<AdminUser> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error ?? "Unable to update user") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

// Endpoint 21 — POST /api/admin/users/:id/reset-password (ADMINISTRATOR only)
export async function resetAdminUserPassword(id: number, newInitialPassword: string): Promise<{ success: boolean; mustChangePassword: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ newInitialPassword }),
    });
  } catch {
    throw new Error("Unable to connect to TokTickIT API");
  }

  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error ?? "Unable to reset password") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}
