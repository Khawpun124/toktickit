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


