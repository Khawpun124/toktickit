import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import cookieParser from "cookie-parser";
import { getPrisma } from "./prisma.js";
import { AttachmentConstants } from "./constants.js";
import {
  attachUserSession,
  requireAuth,
  requirePasswordChanged,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
} from "./middleware/auth.js";
import {
  comparePassword,
  hashPassword,
  validatePasswordRules,
} from "./utils/password.js";

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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(attachUserSession);


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
    let requesters = await prisma.user.findMany({
      where: {
        role: "REQUESTER",
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

    if (requesters.length === 0) {
      const legacyRequesters = await prisma.requesterUser.findMany({
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
      res.status(200).json(legacyRequesters);
      return;
    }

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
// Lab 3 Issue 2 — Authentication Endpoints
// ---------------------------------------------------------------------------

// 1. POST /api/auth/login (BR-01, BR-05)
app.post("/api/auth/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // BR-05: Generic error for wrong password, unknown email, or inactive account
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Create session in DB
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt,
      },
    });

    res.cookie(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: expiresAt,
    });

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

// 2. POST /api/auth/logout (FR-05, AC-15)
app.post("/api/auth/logout", async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.[SESSION_COOKIE_NAME] || req.sessionId;

    if (!token && !req.user) {
      res.status(401).json({ error: "No active session" });
      return;
    }

    if (token) {
      const prisma = getPrisma();
      await prisma.session.deleteMany({ where: { id: token } });
    }

    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// 3. GET /api/auth/me (FR-04)
app.get("/api/auth/me", (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  res.status(200).json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    mustChangePassword: req.user.mustChangePassword,
  });
});

// 4. POST /api/auth/change-password (BR-02, BR-07)
app.post("/api/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};

    if (!currentPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ error: "All password fields are required" });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: "New password and confirm password do not match" });
      return;
    }

    const validation = validatePasswordRules(newPassword);
    if (!validation.isValid) {
      res.status(400).json({
        error: "Password does not meet requirements",
        rules: validation.rules,
      });
      return;
    }

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: "Incorrect current password" });
      return;
    }

    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        mustChangePassword: false,
      },
    });

    res.status(200).json({
      success: true,
      mustChangePassword: false,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ---------------------------------------------------------------------------
// Lab 2 Issue 3 — Create Ticket
// POST /api/tickets -> validates fields, generates unique Ticket Number,
// saves ticket with currentStatus: "NEW", and returns 201 (BR-01, BR-02, BR-15..17)
// ---------------------------------------------------------------------------
import { generateTicketNumber } from "./utils/ticket-number.js";
import { Priority } from "@prisma/client";

app.post("/api/tickets", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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
app.get("/api/tickets", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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
app.get("/api/tickets/:id", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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
app.post("/api/tickets/:id/attachments", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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

// 8. GET /api/tickets/:id/attachments -> List attachment metadata for an owned Ticket (or IT Staff/Admin)
app.get("/api/tickets/:id/attachments", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const isStaffOrAdmin = req.user!.role === "IT_STAFF" || req.user!.role === "ADMINISTRATOR";
    const isOwner = req.user!.role === "REQUESTER" && ticket.requesterId === req.user!.id;

    if (!isStaffOrAdmin && !isOwner) {
      if (req.user!.role === "REQUESTER") {
        res.status(404).json({ error: "Ticket not found" });
      } else {
        res.status(403).json({ error: "Forbidden" });
      }
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

// 9. GET /api/attachments/:id/download -> Download an active, owned Attachment (or IT Staff/Admin) (BR-25)
app.get("/api/attachments/:id/download", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
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

    if (!attachment || attachment.removedAt !== null) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const isStaffOrAdmin = req.user!.role === "IT_STAFF" || req.user!.role === "ADMINISTRATOR";
    const isOwner = req.user!.role === "REQUESTER" && attachment.ticket.requesterId === req.user!.id;

    if (!isStaffOrAdmin && !isOwner) {
      if (req.user!.role === "REQUESTER") {
        res.status(404).json({ error: "Ticket not found" });
      } else {
        res.status(403).json({ error: "Forbidden" });
      }
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
app.delete("/api/attachments/:id", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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

// ---------------------------------------------------------------------------
// Lab 3 Issue 3 — Resolution Flag & Public Comments Endpoints
// ---------------------------------------------------------------------------

// 1. PATCH /api/tickets/:id/resolution-flag (BR-12)
app.patch("/api/tickets/:id/resolution-flag", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const requesterId = req.user!.id;

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

    if (ticket.currentStatus === "CLOSED" || ticket.currentStatus === "CANCELLED") {
      res.status(400).json({ error: "Ticket is already Closed or Cancelled" });
      return;
    }

    const updated = await prisma.ticket.update({
      where: { id: parsedTicketId },
      data: { problemAppearsResolved: true },
    });

    res.status(200).json({
      id: updated.id,
      problemAppearsResolved: updated.problemAppearsResolved,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to update resolution flag" });
  }
});

// 2. POST /api/tickets/:id/comments — Public Comments (BR-13, BR-16)
app.post("/api/tickets/:id/comments", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { content } = req.body ?? {};
  const trimmed = typeof content === "string" ? content.trim() : "";

  if (!trimmed || trimmed.length > 2000) {
    res.status(400).json({ error: "Comment content is required and must not exceed 2000 characters" });
    return;
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const comment = await prisma.publicComment.create({
      data: {
        ticketId: parsedTicketId,
        authorId: req.user!.id,
        content: trimmed,
      },
      include: {
        author: {
          select: { name: true, role: true },
        },
      },
    });

    res.status(201).json({
      id: comment.id,
      ticketId: comment.ticketId,
      authorId: comment.authorId,
      authorName: comment.author.name,
      authorRole: comment.author.role,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to post comment" });
  }
});

// 3. GET /api/tickets/:id/comments — Public Comments List (BR-13)
app.get("/api/tickets/:id/comments", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const prisma = getPrisma();
    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (req.user!.role === "REQUESTER" && ticket.requesterId !== req.user!.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const comments = await prisma.publicComment.findMany({
      where: { ticketId: parsedTicketId },
      include: {
        author: {
          select: { name: true, role: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const result = comments.map((c) => ({
      id: c.id,
      ticketId: c.ticketId,
      authorId: c.authorId,
      authorName: c.author.name,
      authorRole: c.author.role,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
    }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Unable to load comments" });
  }
});

// ---------------------------------------------------------------------------
// Lab 3 Issue 4 — IT Staff Ticket Queue Endpoint (FR-07, API-16)
// ---------------------------------------------------------------------------

// 1. GET /api/staff/tickets — IT Staff Ticket Queue (search/filter/sort/paginate)
app.get("/api/staff/tickets", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const {
    search,
    categoryId,
    requestedPriority,
    itPriority,
    currentStatus,
    ticketOwnerId,
    sortBy,
    sortDir,
    page,
    pageSize,
  } = req.query;

  const whereClause: any = {};

  // Search filter (ticketNumber partial or summary case-insensitive partial)
  if (search && typeof search === "string" && search.trim() !== "") {
    const term = search.trim();
    whereClause.OR = [
      { ticketNumber: { contains: term, mode: "insensitive" } },
      { summary: { contains: term, mode: "insensitive" } },
    ];
  }

  // Category filter
  if (categoryId) {
    const parsedCatId = parseInt(categoryId as string, 10);
    if (!isNaN(parsedCatId)) {
      whereClause.categoryId = parsedCatId;
    }
  }

  // Requested Priority filter
  if (requestedPriority && ["LOW", "MEDIUM", "HIGH"].includes(requestedPriority as string)) {
    whereClause.requestedPriority = requestedPriority;
  }

  // IT Priority filter
  if (itPriority && ["LOW", "MEDIUM", "HIGH"].includes(itPriority as string)) {
    whereClause.itPriority = itPriority;
  }

  // Current Status filter
  const validStatuses = [
    "NEW",
    "OPEN",
    "IN_PROGRESS",
    "WAITING_FOR_REQUESTER",
    "RESOLVED",
    "CLOSED",
    "REOPENED",
    "CANCELLED",
  ];
  if (currentStatus !== undefined && currentStatus !== null && (currentStatus as string).trim() !== "") {
    const trimmedStatus = (currentStatus as string).trim();
    if (!validStatuses.includes(trimmedStatus)) {
      res.status(400).json({
        error: `Invalid currentStatus. Allowed values: ${validStatuses.join(", ")}`,
      });
      return;
    }
    whereClause.currentStatus = trimmedStatus;
  }

  // Ticket Owner filter ("unassigned" or numeric staff ID)
  if (ticketOwnerId !== undefined && ticketOwnerId !== null && ticketOwnerId !== "") {
    if (ticketOwnerId === "unassigned") {
      whereClause.ticketOwnerId = null;
    } else {
      const parsedOwnerId = parseInt(ticketOwnerId as string, 10);
      if (!isNaN(parsedOwnerId)) {
        whereClause.ticketOwnerId = parsedOwnerId;
      }
    }
  }

  // Sorting
  let sortField = "createdAt";
  if (sortBy === "ticketNumber") {
    sortField = "ticketNumber";
  } else if (sortBy === "itPriority") {
    sortField = "itPriority";
  }

  const sortOrder = sortDir === "asc" ? "asc" : "desc";

  const orderByClause: any[] = [
    { [sortField]: sortOrder },
  ];

  if (sortField !== "id") {
    orderByClause.push({ id: "desc" });
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
          category: { select: { name: true } },
          relatedSystem: { select: { name: true } },
          requester: { select: { id: true, name: true, email: true } },
          ticketOwner: { select: { id: true, name: true, email: true } },
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
      requesterId: t.requesterId,
      requesterName: t.requester.name,
      categoryId: t.categoryId,
      categoryName: t.category.name,
      relatedSystemId: t.relatedSystemId,
      relatedSystemName: t.relatedSystem.name,
      summary: t.summary,
      description: t.description,
      requestedPriority: t.requestedPriority,
      itPriority: t.itPriority,
      currentStatus: t.currentStatus,
      problemAppearsResolved: t.problemAppearsResolved,
      ticketOwnerId: t.ticketOwnerId,
      ticketOwnerName: t.ticketOwner ? t.ticketOwner.name : null,
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
    res.status(500).json({ error: "Unable to load staff queue tickets" });
  }
});

// 2. GET /api/staff/tickets/:id — Basic IT Staff Ticket Detail (FR-07, Endpoint 12)
app.get("/api/staff/tickets/:id", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

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
        requester: { select: { id: true, name: true, email: true } },
        ticketOwner: { select: { id: true, name: true, email: true } },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requesterId: ticket.requesterId,
      requesterName: ticket.requester.name,
      requesterEmail: ticket.requester.email,
      categoryId: ticket.categoryId,
      categoryName: ticket.category.name,
      relatedSystemId: ticket.relatedSystemId,
      relatedSystemName: ticket.relatedSystem.name,
      summary: ticket.summary,
      description: ticket.description,
      requestedPriority: ticket.requestedPriority,
      itPriority: ticket.itPriority,
      currentStatus: ticket.currentStatus,
      problemAppearsResolved: ticket.problemAppearsResolved,
      ticketOwnerId: ticket.ticketOwnerId,
      ticketOwnerName: ticket.ticketOwner ? ticket.ticketOwner.name : null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to load staff ticket detail" });
  }
});

// 2. GET /api/staff/users — Returns list of active IT Staff and Administrator users for dropdowns
app.get("/api/staff/users", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["IT_STAFF", "ADMINISTRATOR"] },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Unable to load staff users" });
  }
});

// ---------------------------------------------------------------------------
// Issue 5 — IT Staff Ticket Operations (Endpoints 13–15, 17)
// ---------------------------------------------------------------------------

/** Status Transition Matrix (BR-11). Key = from, Value = allowed "to" states. */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  NEW: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["IN_PROGRESS", "RESOLVED", "CANCELLED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["OPEN"],
  CANCELLED: [],
};

// Endpoint 13 — PATCH /api/staff/tickets/:id/owner (BR-08, BR-09)
app.patch("/api/staff/tickets/:id/owner", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { ticketOwnerId } = req.body as { ticketOwnerId: number | null };

  try {
    const prisma = getPrisma();

    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // null = unassign
    if (ticketOwnerId !== null && ticketOwnerId !== undefined) {
      const targetUser = await prisma.user.findUnique({ where: { id: ticketOwnerId } });
      if (!targetUser || !targetUser.isActive || (targetUser.role !== "IT_STAFF" && targetUser.role !== "ADMINISTRATOR")) {
        res.status(400).json({ error: "Target user is not an active IT Staff or Administrator" });
        return;
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: parsedTicketId },
      data: { ticketOwnerId: ticketOwnerId ?? null },
      include: {
        ticketOwner: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(200).json({
      id: updated.id,
      ticketOwnerId: updated.ticketOwnerId,
      ticketOwnerName: updated.ticketOwner ? updated.ticketOwner.name : null,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to update ticket owner" });
  }
});

// Endpoint 14 — PATCH /api/staff/tickets/:id/priority (BR-10)
app.patch("/api/staff/tickets/:id/priority", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { itPriority } = req.body as { itPriority: string };
  const validPriorities = ["LOW", "MEDIUM", "HIGH"];
  if (!itPriority || !validPriorities.includes(itPriority)) {
    res.status(400).json({ error: "Invalid priority value. Must be LOW, MEDIUM, or HIGH." });
    return;
  }

  try {
    const prisma = getPrisma();

    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const updated = await prisma.ticket.update({
      where: { id: parsedTicketId },
      data: { itPriority: itPriority as "LOW" | "MEDIUM" | "HIGH" },
    });

    res.status(200).json({
      id: updated.id,
      itPriority: updated.itPriority,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to update IT priority" });
  }
});

// Endpoint 15 — PATCH /api/staff/tickets/:id/status (BR-11)
app.patch("/api/staff/tickets/:id/status", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { newStatus } = req.body as { newStatus: string };
  if (!newStatus) {
    res.status(400).json({ error: "newStatus is required" });
    return;
  }

  try {
    const prisma = getPrisma();

    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const fromStatus = ticket.currentStatus;
    const allowedTargets = ALLOWED_TRANSITIONS[fromStatus] ?? [];

    if (!allowedTargets.includes(newStatus)) {
      res.status(400).json({
        error: "Invalid status transition",
        from: fromStatus,
        to: newStatus,
      });
      return;
    }

    const updated = await prisma.ticket.update({
      where: { id: parsedTicketId },
      data: { currentStatus: newStatus as any },
    });

    res.status(200).json({
      id: updated.id,
      currentStatus: updated.currentStatus,
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to update ticket status" });
  }
});

// Endpoint 17 — POST /api/tickets/:id/notes (Internal Notes, BR-14)
app.post("/api/tickets/:id/notes", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  // REQUESTER is forbidden — return 403 with no note content (AC-04)
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { content } = req.body as { content: string };
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "Note content cannot be empty or whitespace-only" });
    return;
  }

  if (content.trim().length > 2000) {
    res.status(400).json({ error: "Note content is required and must not exceed 2000 characters" });
    return;
  }

  try {
    const prisma = getPrisma();

    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const note = await prisma.internalNote.create({
      data: {
        ticketId: parsedTicketId,
        authorId: req.user!.id,
        content: content.trim(),
      },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });

    res.status(201).json({
      id: note.id,
      ticketId: note.ticketId,
      authorId: note.authorId,
      authorName: note.author.name,
      authorRole: note.author.role,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: "Unable to create internal note" });
  }
});

// Endpoint 17 — GET /api/tickets/:id/notes (Internal Notes, BR-14, AC-04, AC-10)
app.get("/api/tickets/:id/notes", requireAuth, requirePasswordChanged, async (req: Request, res: Response) => {
  // REQUESTER is forbidden — return 403 with no note content (AC-04, AC-10)
  if (req.user!.role === "REQUESTER") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const parsedTicketId = parseInt(req.params.id, 10);
  if (isNaN(parsedTicketId)) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  try {
    const prisma = getPrisma();

    const ticket = await prisma.ticket.findUnique({ where: { id: parsedTicketId } });
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    const notes = await prisma.internalNote.findMany({
      where: { ticketId: parsedTicketId },
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.status(200).json(
      notes.map((note) => ({
        id: note.id,
        ticketId: note.ticketId,
        authorId: note.authorId,
        authorName: note.author.name,
        authorRole: note.author.role,
        content: note.content,
        createdAt: note.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: "Unable to load internal notes" });
  }
});

// ---------------------------------------------------------------------------
// Issue 6 — Administrator User Management Endpoints (Endpoints 18–21)
// ---------------------------------------------------------------------------

const requireAdmin = (req: Request, res: Response, next: () => void) => {
  if (!req.user || req.user.role !== "ADMINISTRATOR") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
};

// Endpoint 18: GET /api/admin/users — List users (Admin only)
app.get("/api/admin/users", requireAuth, requirePasswordChanged, requireAdmin, async (req: Request, res: Response) => {
  const { search, role } = req.query;

  const whereClause: any = {};

  if (search && typeof search === "string" && search.trim() !== "") {
    const term = search.trim();
    whereClause.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ];
  }

  if (role && ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"].includes(role as string)) {
    whereClause.role = role as string;
  }

  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
      orderBy: { id: "asc" },
    });

    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Unable to load users" });
  }
});

// Endpoint 19: POST /api/admin/users — Create user (Admin only)
app.post("/api/admin/users", requireAuth, requirePasswordChanged, requireAdmin, async (req: Request, res: Response) => {
  const { name, email, role, isActive, initialPassword } = req.body ?? {};

  const trimmedName = typeof name === "string" ? name.trim() : "";
  const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  const validRoles = ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"];

  if (!trimmedName || !trimmedEmail || !role || !validRoles.includes(role) || !initialPassword || typeof initialPassword !== "string") {
    res.status(400).json({ error: "Name, email, valid role, and initial password are required" });
    return;
  }

  try {
    const prisma = getPrisma();

    // BR-19: Duplicate email check
    const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existing) {
      res.status(400).json({ error: "A user with this email already exists" });
      return;
    }

    const passwordHash = await hashPassword(initialPassword);

    const user = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        passwordHash,
        role: role as Role,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: "Unable to create user" });
  }
});

// Endpoint 20: PATCH /api/admin/users/:id — Edit user (Admin only)
app.patch("/api/admin/users/:id", requireAuth, requirePasswordChanged, requireAdmin, async (req: Request, res: Response) => {
  const parsedUserId = parseInt(req.params.id, 10);
  if (isNaN(parsedUserId)) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { name, email, role, isActive } = req.body ?? {};

  try {
    const prisma = getPrisma();

    const targetUser = await prisma.user.findUnique({ where: { id: parsedUserId } });
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // BR-20: Self-deactivation check (403)
    if (req.user!.id === targetUser.id && isActive === false) {
      res.status(403).json({ error: "You cannot deactivate your own account" });
      return;
    }

    // BR-19: Duplicate email check (400)
    if (email && typeof email === "string") {
      const trimmedEmail = email.trim().toLowerCase();
      if (trimmedEmail !== targetUser.email) {
        const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } });
        if (existing && existing.id !== targetUser.id) {
          res.status(400).json({ error: "A user with this email already exists" });
          return;
        }
      }
    }

    // BR-21: Last active Administrator protection (400)
    const nextRole = role !== undefined ? role : targetUser.role;
    const nextIsActive = isActive !== undefined ? Boolean(isActive) : targetUser.isActive;
    const wasActiveAdmin = targetUser.role === "ADMINISTRATOR" && targetUser.isActive;
    const willBeActiveAdmin = nextRole === "ADMINISTRATOR" && nextIsActive;

    if (wasActiveAdmin && !willBeActiveAdmin) {
      const activeAdminCount = await prisma.user.count({
        where: { role: "ADMINISTRATOR", isActive: true },
      });
      if (activeAdminCount <= 1) {
        res.status(400).json({ error: "Cannot remove or deactivate the last active Administrator" });
        return;
      }
    }

    const updateData: any = {};
    if (name && typeof name === "string") updateData.name = name.trim();
    if (email && typeof email === "string") updateData.email = email.trim().toLowerCase();
    if (role && ["REQUESTER", "IT_STAFF", "ADMINISTRATOR"].includes(role)) updateData.role = role as Role;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updatedUser = await prisma.user.update({
      where: { id: parsedUserId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: "Unable to update user" });
  }
});

// Endpoint 21: POST /api/admin/users/:id/reset-password — Set new initial password (Admin only)
app.post("/api/admin/users/:id/reset-password", requireAuth, requirePasswordChanged, requireAdmin, async (req: Request, res: Response) => {
  const parsedUserId = parseInt(req.params.id, 10);
  if (isNaN(parsedUserId)) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { newInitialPassword } = req.body ?? {};
  if (!newInitialPassword || typeof newInitialPassword !== "string" || newInitialPassword.trim() === "") {
    res.status(400).json({ error: "New initial password is required" });
    return;
  }

  try {
    const prisma = getPrisma();

    const targetUser = await prisma.user.findUnique({ where: { id: parsedUserId } });
    if (!targetUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordHash = await hashPassword(newInitialPassword);

    await prisma.user.update({
      where: { id: parsedUserId },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    res.status(200).json({ success: true, mustChangePassword: true });
  } catch (error) {
    res.status(500).json({ error: "Unable to reset password" });
  }
});

export default app;




