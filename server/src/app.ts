import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { getPrisma } from "./prisma.js";
import { AttachmentConstants } from "./constants.js";

const uploadDir = path.resolve(process.cwd(), "uploads/attachments");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    cb(null, storedName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

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
  const validPriorities = ["LOW", "MEDIUM", "HIGH"];
  if (requestedPriority !== undefined && requestedPriority !== "") {
    if (typeof requestedPriority !== "string" || !validPriorities.includes(requestedPriority)) {
      res.status(400).json({ error: "Invalid requestedPriority. Allowed values: LOW, MEDIUM, HIGH" });
      return;
    }
    whereClause.requestedPriority = requestedPriority;
  }

  if (itPriority !== undefined && itPriority !== "") {
    if (typeof itPriority !== "string" || !validPriorities.includes(itPriority)) {
      res.status(400).json({ error: "Invalid itPriority. Allowed values: LOW, MEDIUM, HIGH" });
      return;
    }
    whereClause.itPriority = itPriority;
  }

  // Current status filter
  const validStatuses = ["NEW"];
  if (currentStatus !== undefined && currentStatus !== "") {
    if (typeof currentStatus !== "string" || !validStatuses.includes(currentStatus)) {
      res.status(400).json({ error: "Invalid currentStatus. Allowed values: NEW" });
      return;
    }
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

// ---------------------------------------------------------------------------
// Lab 2 Issue 5 — Requester Ticket Detail & Attachments
// ---------------------------------------------------------------------------

// 6. GET /api/tickets/:id -> Retrieve one owned Ticket (BR-10, AC-03)
app.get("/api/tickets/:id", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({
      where: { id: parsedTicketId },
      include: {
        category: { select: { name: true } },
        relatedSystem: { select: { name: true } },
      },
    });

    if (!ticket || ticket.requesterId !== requesterId) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterId: ticket.requesterId,
      categoryName: ticket.category.name,
      relatedSystemName: ticket.relatedSystem.name,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load ticket details" });
  }
});

// 7. POST /api/tickets/:id/attachments -> Upload an Attachment to an owned Ticket (BR-21, BR-22, BR-23, BR-26)
app.post("/api/tickets/:id/attachments", async (req: Request, res: Response) => {
  // Pre-check 1: Validate Requester Header BEFORE multer parses or writes file to disk
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Pre-check 2: Validate Ticket Existence & Ownership BEFORE multer parses or writes file to disk
  const prisma = getPrisma();
  const preCheckTicket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
  if (!preCheckTicket || preCheckTicket.requesterId !== requesterId) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Proceed with multer upload middleware
  upload.single("file")(req, res, async (err: any) => {
    let success = false;

    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Validate type (BR-21): JPG/JPEG, PNG, WEBP, PDF
      const ext = path.extname(file.originalname).toLowerCase();
      if (
        !AttachmentConstants.ALLOWED_MIME_TYPES.includes(file.mimetype) ||
        !AttachmentConstants.ALLOWED_EXTENSIONS.includes(ext)
      ) {
        res.status(400).json({ error: "Only JPG, PNG, WEBP, and PDF files are allowed" });
        return;
      }

      // Validate size (BR-22): 5MB
      if (file.size > AttachmentConstants.MAX_SIZE_BYTES || err?.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "File exceeds the 5 MB limit" });
        return;
      }

      // Atomic Transaction with Row Locking (SELECT FOR UPDATE) to prevent race conditions on BR-23 5-active limit
      const attachment = await prisma.$transaction(async (tx) => {
        // Acquire row lock on the ticket to serialize concurrent uploads for the same ticket
        await tx.$executeRaw`SELECT id FROM "Ticket" WHERE id = ${parsedTicketId} FOR UPDATE`;

        const activeCount = await tx.attachment.count({
          where: { ticketId: parsedTicketId, removedAt: null },
        });

        if (activeCount >= AttachmentConstants.MAX_ACTIVE_ATTACHMENTS) {
          throw new Error("A ticket may have at most 5 active attachments");
        }

        return await tx.attachment.create({
          data: {
            ticketId: parsedTicketId,
            fileName: file.originalname,
            storedFileName: file.filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
          },
        });
      });

      success = true;

      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt.toISOString(),
        removedAt: null,
      });
    } catch (error: any) {
      if (error?.message === "A ticket may have at most 5 active attachments") {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Unable to upload attachment" });
      }
    } finally {
      // Safety net: If upload did not result in a successful 201 creation, guarantee file cleanup
      if (!success && req.file?.path && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // Ignore unlink errors if file was already removed
        }
      }
    }
  });
});

// 8. GET /api/tickets/:id/attachments -> List attachment metadata for an owned Ticket
app.get("/api/tickets/:id/attachments", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket || ticket.requesterId !== requesterId) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const attachments = await prisma.attachment.findMany({
      where: { ticketId: parsedTicketId },
      orderBy: { uploadedAt: "asc" },
    });

    const result = attachments.map((att) => ({
      id: att.id,
      fileName: att.fileName,
      sizeBytes: att.sizeBytes,
      uploadedAt: att.uploadedAt.toISOString(),
      removedAt: att.removedAt ? att.removedAt.toISOString() : null,
      removedReason: att.removedReason,
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Unable to load attachments" });
  }
});

// 9. GET /api/attachments/:id/download -> Download an active, owned Attachment (BR-25)
app.get("/api/attachments/:id/download", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const parsedAttachmentId = parseInt(req.params.id, 10);
  if (isNaN(parsedAttachmentId)) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  try {
    const prisma = getPrisma();
    const attachment = await prisma.attachment.findUnique({
      where: { id: parsedAttachmentId },
      include: { ticket: true },
    });

    if (!attachment || attachment.ticket.requesterId !== requesterId || attachment.removedAt !== null) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const filePath = path.join(uploadDir, attachment.storedFileName);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`
    );
    res.sendFile(filePath);
  } catch (error) {
    res.status(500).json({ error: "Unable to download attachment" });
  }
});

// 10. DELETE /api/attachments/:id -> Soft-remove an owned Attachment (BR-24, BR-26)
app.delete("/api/attachments/:id", async (req: Request, res: Response) => {
  const requesterId = await validateRequesterHeader(req, res);
  if (requesterId === null) return;

  const parsedAttachmentId = parseInt(req.params.id, 10);
  if (isNaN(parsedAttachmentId)) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  const { reason } = req.body || {};
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason) {
    res.status(400).json({ error: "A removal reason is required" });
    return;
  }

  if (trimmedReason.length > AttachmentConstants.MAX_REMOVAL_REASON_LENGTH) {
    res.status(400).json({ error: "Removal reason must not exceed 500 characters" });
    return;
  }

  try {
    const prisma = getPrisma();
    const attachment = await prisma.attachment.findUnique({
      where: { id: parsedAttachmentId },
      include: { ticket: true },
    });

    if (!attachment || attachment.ticket.requesterId !== requesterId) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    if (attachment.removedAt !== null) {
      res.status(409).json({ error: "Attachment has already been removed" });
      return;
    }

    const updated = await prisma.attachment.update({
      where: { id: parsedAttachmentId },
      data: {
        removedAt: new Date(),
        removedReason: reason.trim(),
      },
    });

    res.status(200).json({
      id: updated.id,
      fileName: updated.fileName,
      removedAt: updated.removedAt!.toISOString(),
      removedReason: updated.removedReason,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to remove attachment" });
  }
});

export default app;



