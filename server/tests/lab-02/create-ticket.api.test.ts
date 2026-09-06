import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("POST /api/tickets (Create Ticket API)", () => {
  const validHeader = { "X-Requester-Id": "1" };

  it("API-01: creates a ticket with valid data and returns 201 with unique ticket number (AC-01, BR-01, BR-02)", async () => {
    const payload = {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Cannot access network drive",
      description: "When trying to connect to network share drive, access is denied.",
      requestedPriority: "HIGH",
    };

    const res = await request(app)
      .post("/api/tickets")
      .set(validHeader)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("ticketNumber");
    expect(res.body.ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    expect(res.body.requesterId).toBe(1);
    expect(res.body.categoryId).toBe(1);
    expect(res.body.relatedSystemId).toBe(1);
    expect(res.body.summary).toBe("Cannot access network drive");
    expect(res.body.description).toBe("When trying to connect to network share drive, access is denied.");
    expect(res.body.requestedPriority).toBe("HIGH");
    expect(res.body.itPriority).toBeNull();
    expect(res.body.currentStatus).toBe("NEW");
    expect(Array.isArray(res.body.attachmentUploadErrors)).toBe(true);
    expect(res.body.attachmentUploadErrors).toHaveLength(0);
  });

  it("API-02: returns 400 validation error when summary is shorter than 5 characters (AC-04, BR-15)", async () => {
    const payload = {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Help",
      description: "Detailed description of the issue that is long enough.",
      requestedPriority: "MEDIUM",
    };

    const res = await request(app)
      .post("/api/tickets")
      .set(validHeader)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
    expect(res.body.fields).toHaveProperty("summary");
  });

  it("API-03: returns 400 validation error when description exceeds 2000 characters (BR-16)", async () => {
    const longDescription = "A".repeat(2001);
    const payload = {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "Valid summary for testing",
      description: longDescription,
      requestedPriority: "LOW",
    };

    const res = await request(app)
      .post("/api/tickets")
      .set(validHeader)
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Validation failed");
    expect(res.body.fields).toHaveProperty("description");
  });

  it("API-04: returns 400 validation error when categoryId refers to an inactive category (BR-17)", async () => {
    const prisma = getPrisma();
    const inactiveCategory = await prisma.category.create({
      data: {
        name: "Inactive Hardware Test",
        isActive: false,
      },
    });

    try {
      const payload = {
        categoryId: inactiveCategory.id,
        relatedSystemId: 1,
        summary: "Valid summary for testing",
        description: "Valid description for testing category validation.",
        requestedPriority: "MEDIUM",
      };

      const res = await request(app)
        .post("/api/tickets")
        .set(validHeader)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error", "Validation failed");
      expect(res.body.fields).toHaveProperty("categoryId");
    } finally {
      await prisma.category.delete({
        where: { id: inactiveCategory.id },
      });
    }
  });

  it("returns 401 when X-Requester-Id header is missing", async () => {
    const res = await request(app).post("/api/tickets").send({});
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Missing X-Requester-Id header");
  });

  it("API-17: returns 201 Created and includes attachmentUploadErrors array on ticket creation (BR-27)", async () => {
    const payload = {
      categoryId: 1,
      relatedSystemId: 1,
      summary: "API-17 Partial Attachment Failure Test",
      description: "Testing API-17 attachmentUploadErrors structure returned on ticket creation.",
      requestedPriority: "LOW",
    };

    const res = await request(app)
      .post("/api/tickets")
      .set(validHeader)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body).toHaveProperty("attachmentUploadErrors");
    expect(Array.isArray(res.body.attachmentUploadErrors)).toBe(true);
  });
});

