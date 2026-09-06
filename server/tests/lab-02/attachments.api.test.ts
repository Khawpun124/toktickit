import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import path from "path";
import fs from "fs";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("Attachment API (API-10 through API-15)", () => {
  const prisma = getPrisma();
  let ticket1Id: number;
  let ticket2Id: number;

  beforeEach(async () => {
    await prisma.attachment.deleteMany({ where: { ticket: { requesterId: { in: [1, 2] } } } });
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [1, 2] } } });

    const prefix = `TKT-ATT-${Date.now()}`;

    const t1 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-001`,
        requesterId: 1,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Attachment test ticket for Requester 1",
        description: "Description for attachment test.",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
      },
    });

    const t2 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-002`,
        requesterId: 2,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Attachment test ticket for Requester 2",
        description: "Description for attachment test 2.",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });

    ticket1Id = t1.id;
    ticket2Id = t2.id;
  });

  afterEach(async () => {
    await prisma.attachment.deleteMany({ where: { ticketId: { in: [ticket1Id, ticket2Id] } } });
    await prisma.ticket.deleteMany({ where: { id: { in: [ticket1Id, ticket2Id] } } });
  });

  it("API-10: uploads valid JPG under 5MB (AC-05, BR-21)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("fake-jpg-content"), "test-image.jpg");

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.fileName).toBe("test-image.jpg");
    expect(res.body.removedAt).toBeNull();
  });

  it("API-11: rejects 6MB file with size error (AC-06, BR-22)", async () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    const res = await request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", largeBuffer, "large.pdf");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the 5 MB limit/i);
  });

  it("API-12: rejects unsupported file type .docx (BR-21)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("docx-content"), "document.docx");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Only JPG, PNG, WEBP, and PDF files are allowed/i);
  });

  it("API-13: rejects 6th active attachment when 5 active attachments exist (AC-07, BR-23)", async () => {
    for (let i = 1; i <= 5; i++) {
      await prisma.attachment.create({
        data: {
          ticketId: ticket1Id,
          fileName: `file${i}.png`,
          storedFileName: `stored_${i}.png`,
          mimeType: "image/png",
          sizeBytes: 100,
        },
      });
    }

    const res = await request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("image6-content"), "file6.png");

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 5 active attachments/i);
  });

  it("API-14: soft-removes an attachment and blocks download (AC-08, BR-24, BR-25)", async () => {
    const att = await prisma.attachment.create({
      data: {
        ticketId: ticket1Id,
        fileName: "to-remove.pdf",
        storedFileName: "stored_to_remove.pdf",
        mimeType: "application/pdf",
        sizeBytes: 200,
      },
    });

    const deleteRes = await request(app)
      .delete(`/api/attachments/${att.id}`)
      .set("X-Requester-Id", "1")
      .send({ reason: "Uploaded wrong document" });

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.id).toBe(att.id);
    expect(deleteRes.body.removedAt).toBeDefined();
    expect(deleteRes.body.removedReason).toBe("Uploaded wrong document");

    // List attachments should still show metadata
    const listRes = await request(app)
      .get(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1");

    expect(listRes.status).toBe(200);
    const removedItem = listRes.body.find((a: any) => a.id === att.id);
    expect(removedItem).toBeDefined();
    expect(removedItem.removedAt).not.toBeNull();
    expect(removedItem.removedReason).toBe("Uploaded wrong document");

    // Download attempt on soft-removed attachment must return 404 (BR-25)
    const downloadRes = await request(app)
      .get(`/api/attachments/${att.id}/download`)
      .set("X-Requester-Id", "1");

    expect(downloadRes.status).toBe(404);
    expect(downloadRes.body.error).toBe("Attachment not found");
  });

  it("API-15: rejects soft-remove of an attachment belonging to another requester (BR-26)", async () => {
    const att2 = await prisma.attachment.create({
      data: {
        ticketId: ticket2Id,
        fileName: "requester2-file.png",
        storedFileName: "stored_req2.png",
        mimeType: "image/png",
        sizeBytes: 150,
      },
    });

    const deleteRes = await request(app)
      .delete(`/api/attachments/${att2.id}`)
      .set("X-Requester-Id", "1")
      .send({ reason: "Trying to remove other requester file" });

    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body.error).toBe("Attachment not found");
  });

  it("cleans up uploaded disk file when ownership check or validation fails", async () => {
    const uploadDir = path.resolve(process.cwd(), "uploads/attachments");
    const initialFiles = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];

    // Attempt upload to ticket owned by Requester 2 using Requester 1 header
    const res = await request(app)
      .post(`/api/tickets/${ticket2Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("unowned-file-content"), "unowned.png");

    expect(res.status).toBe(404);

    const currentFiles = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
    expect(currentFiles.length).toBe(initialFiles.length);
  });

  it("handles 2 concurrent upload requests atomically when 4 active attachments exist (race condition test)", async () => {
    for (let i = 1; i <= 4; i++) {
      await prisma.attachment.create({
        data: {
          ticketId: ticket1Id,
          fileName: `file${i}.png`,
          storedFileName: `stored_${i}.png`,
          mimeType: "image/png",
          sizeBytes: 100,
        },
      });
    }

    const req1 = request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("concurrent-file-1"), "concurrent1.png");

    const req2 = request(app)
      .post(`/api/tickets/${ticket1Id}/attachments`)
      .set("X-Requester-Id", "1")
      .attach("file", Buffer.from("concurrent-file-2"), "concurrent2.png");

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort();

    // Exactly one should succeed (201) and one should be rejected (400)
    expect(statuses).toEqual([201, 400]);

    const activeCount = await prisma.attachment.count({
      where: { ticketId: ticket1Id, removedAt: null },
    });
    expect(activeCount).toBe(5);
  });

  it("returns 400 when removalReason exceeds 500 characters (BR-32)", async () => {
    const att = await prisma.attachment.create({
      data: {
        ticketId: ticket1Id,
        fileName: "long-reason.pdf",
        storedFileName: "stored_long_reason.pdf",
        mimeType: "application/pdf",
        sizeBytes: 200,
      },
    });

    const longReason = "a".repeat(501);
    const res = await request(app)
      .delete(`/api/attachments/${att.id}`)
      .set("X-Requester-Id", "1")
      .send({ reason: longReason });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/must not exceed 500 characters/i);
  });
});
