import express, { Request, Response } from "express";
import cors from "cors";
import { getPrisma } from "./prisma.js";
// getPrisma() is your lazy database handle. Call it INSIDE a route when you
// need the DB (Issue 4). It is intentionally unused until then.
void getPrisma;

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)
// ---------------------------------------------------------------------------
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});


// ---------------------------------------------------------------------------
// Lab 2 Issue 2 — Development Requester list
// GET /api/requesters -> returns active RequesterUser records only (BR-06)
// ---------------------------------------------------------------------------
app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const requesters = await prisma.requesterUser.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        id: "asc",
      },
    });
    res.status(200).json(requesters);
  } catch (error) {
    res.status(500).json({ error: "Unable to load requesters" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 2 — Related Systems list
// GET /api/related-systems -> returns active RelatedSystem records only
// ---------------------------------------------------------------------------
app.get("/api/related-systems", async (_req: Request, res: Response) => {
  try {
    const prisma = getPrisma();
    const systems = await prisma.relatedSystem.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: "asc",
      },
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({ error: "Unable to load related systems" });
  }
});

// ---------------------------------------------------------------------------
// Helper: Validate X-Requester-Id Header (Section 12 of api-spec.md)
// ---------------------------------------------------------------------------
export async function validateRequesterHeader(req: Request, res: Response): Promise<number | null> {
  const header = req.header("X-Requester-Id");
  if (!header) {
    res.status(401).json({ error: "Missing X-Requester-Id header" });
    return null;
  }

  const requesterId = parseInt(header, 10);
  if (isNaN(requesterId) || requesterId.toString() !== header.trim()) {
    res.status(400).json({ error: "Invalid X-Requester-Id header format" });
    return null;
  }

  const prisma = getPrisma();
  const requester = await prisma.requesterUser.findUnique({
    where: { id: requesterId },
  });

  if (!requester || !requester.isActive) {
    res.status(400).json({ error: "Requester ID does not exist or is inactive" });
    return null;
  }

  return requesterId;
}

// ---------------------------------------------------------------------------
// Lab 2 Issue 3 — Create Ticket
// POST /api/tickets -> validates fields, generates unique Ticket Number,
// saves ticket with currentStatus: "NEW", and returns 201 (BR-01, BR-02, BR-15..17)
// ---------------------------------------------------------------------------
import { generateTicketNumber } from "./utils/ticket-number.js";
import { Priority } from "@prisma/client";

app.post("/api/tickets", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const { categoryId, relatedSystemId, summary, description, requestedPriority } = req.body ?? {};

  const fields: Record<string, string> = {};

  // Summary validation (5-150 chars, trimmed)
  const trimmedSummary = typeof summary === "string" ? summary.trim() : "";
  if (!trimmedSummary || trimmedSummary.length < 5 || trimmedSummary.length > 150) {
    fields.summary = "Summary must be between 5 and 150 characters";
  }

  // Description validation (10-2000 chars, trimmed)
  const trimmedDescription = typeof description === "string" ? description.trim() : "";
  if (!trimmedDescription || trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
    fields.description = "Description must be between 10 and 2000 characters";
  }

  // Requested priority validation
  if (!["LOW", "MEDIUM", "HIGH"].includes(requestedPriority)) {
    fields.requestedPriority = "Requested priority must be LOW, MEDIUM, or HIGH";
  }

  const prisma = getPrisma();

  // Category validation
  const parsedCategoryId = parseInt(categoryId, 10);
  if (isNaN(parsedCategoryId)) {
    fields.categoryId = "Category is invalid or inactive";
  } else {
    const category = await prisma.category.findUnique({
      where: { id: parsedCategoryId },
    });
    if (!category || !category.isActive) {
      fields.categoryId = "Category is invalid or inactive";
    }
  }

  // Related System validation
  const parsedRelatedSystemId = parseInt(relatedSystemId, 10);
  if (isNaN(parsedRelatedSystemId)) {
    fields.relatedSystemId = "Related system is invalid or inactive";
  } else {
    const relatedSystem = await prisma.relatedSystem.findUnique({
      where: { id: parsedRelatedSystemId },
    });
    if (!relatedSystem || !relatedSystem.isActive) {
      fields.relatedSystemId = "Related system is invalid or inactive";
    }
  }

  if (Object.keys(fields).length > 0) {
    res.status(400).json({
      error: "Validation failed",
      fields,
    });
    return;
  }

  // Generate ticket number and save ticket with retry loop for race condition safety
  let ticket = null;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      const ticketNumber = await generateTicketNumber(prisma);
      ticket = await prisma.ticket.create({
        data: {
          ticketNumber,
          requesterId,
          categoryId: parsedCategoryId,
          relatedSystemId: parsedRelatedSystemId,
          summary: trimmedSummary,
          description: trimmedDescription,
          requestedPriority: requestedPriority as Priority,
          currentStatus: "NEW",
        },
      });
      break;
    } catch (error: any) {
      if (error?.code === "P2002" && attempts < maxAttempts - 1) {
        attempts++;
        continue;
      }
      res.status(500).json({ error: "Unable to create ticket" });
      return;
    }
  }

  if (!ticket) {
    res.status(500).json({ error: "Unable to create ticket" });
    return;
  }

  res.status(201).json({
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requesterId: ticket.requesterId,
    categoryId: ticket.categoryId,
    relatedSystemId: ticket.relatedSystemId,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    itPriority: ticket.itPriority,
    currentStatus: ticket.currentStatus,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    attachmentUploadErrors: [],
  });
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 4 — My Tickets List
// GET /api/tickets -> lists tickets owned by current Requester with search,
// filters, sort, and pagination envelope (BR-10..14)
// ---------------------------------------------------------------------------
app.get("/api/tickets", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const {
    search,
    categoryId,
    requestedPriority,
    itPriority,
    currentStatus,
    sortBy,
    sortDir,
    page,
    pageSize,
  } = req.query;

  const whereClause: any = {
    requesterId,
  };

  // Category filter
  if (categoryId !== undefined && categoryId !== "") {
    const parsedCatId = parseInt(categoryId as string, 10);
    if (isNaN(parsedCatId)) {
      res.status(400).json({ error: "Invalid categoryId query parameter" });
      return;
    }
    whereClause.categoryId = parsedCatId;
  }

  // Priority filters
  if (requestedPriority && typeof requestedPriority === "string") {
    whereClause.requestedPriority = requestedPriority;
  }
  if (itPriority && typeof itPriority === "string") {
    whereClause.itPriority = itPriority;
  }

  // Current status filter
  if (currentStatus && typeof currentStatus === "string") {
    whereClause.currentStatus = currentStatus;
  }

  // Search filter (ticketNumber partial or summary case-insensitive partial)
  if (search && typeof search === "string" && search.trim() !== "") {
    const term = search.trim();
    whereClause.OR = [
      { ticketNumber: { contains: term, mode: "insensitive" } },
      { summary: { contains: term, mode: "insensitive" } },
    ];
  }

  // Sorting
  const sortField = sortBy === "ticketNumber" ? "ticketNumber" : "createdAt";
  const sortOrder = sortDir === "asc" ? "asc" : "desc";

  const orderByClause: any[] = [
    { [sortField]: sortOrder },
  ];

  if (sortField !== "ticketNumber") {
    orderByClause.push({ ticketNumber: "desc" });
  }

  // Pagination (default page 1, pageSize 10, clamped 1-50)
  let parsedPage = parseInt(page as string, 10);
  if (isNaN(parsedPage) || parsedPage < 1) {
    parsedPage = 1;
  }

  let parsedPageSize = parseInt(pageSize as string, 10);
  if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 50) {
    parsedPageSize = 10;
  }

  const skip = (parsedPage - 1) * parsedPageSize;
  const take = parsedPageSize;

  try {
    const prisma = getPrisma();
    const [totalItems, tickets] = await Promise.all([
      prisma.ticket.count({ where: whereClause }),
      prisma.ticket.findMany({
        where: whereClause,
        include: {
          category: {
            select: { name: true },
          },
        },
        orderBy: orderByClause,
        skip,
        take,
      }),
    ]);

    const totalPages = Math.ceil(totalItems / parsedPageSize) || 0;

    const data = tickets.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      summary: t.summary,
      categoryName: t.category.name,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    }));

    res.status(200).json({
      data,
      pagination: {
        page: parsedPage,
        pageSize: parsedPageSize,
        totalItems,
        totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load tickets" });
  }
});

export default app;



