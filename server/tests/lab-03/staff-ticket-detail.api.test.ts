import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { Role } from "@prisma/client";
import { hashPassword } from "../../src/utils/password.js";

describe("IT Staff Ticket Detail API Tests (Endpoints 13-15, 17 — BR-08-11, BR-14, AC-04, AC-06-08, AC-10)", () => {
  const prisma = getPrisma();
  let staffCookie: string;
  let adminCookie: string;
  let requesterCookie: string;
  let staffId: number;
  let adminId: number;
  let requesterId: number;
  let ticketId: number;
  let categoryId: number;
  let relatedSystemId: number;

  beforeEach(async () => {
    const passwordHash = await hashPassword("Password123!");

    // Create IT Staff user
    const staff = await prisma.user.create({
      data: {
        name: "IT Staff Detail",
        email: `staff-detail-${Date.now()}@tiktockit.com`,
        passwordHash,
        role: Role.IT_STAFF,
        mustChangePassword: false,
        isActive: true,
      },
    });
    staffId = staff.id;

    // Create Administrator
    const admin = await prisma.user.create({
      data: {
        name: "Admin Detail",
        email: `admin-detail-${Date.now()}@tiktockit.com`,
        passwordHash,
        role: Role.ADMINISTRATOR,
        mustChangePassword: false,
        isActive: true,
      },
    });
    adminId = admin.id;

    // Create Requester
    const requester = await prisma.user.create({
      data: {
        name: "Requester Detail",
        email: `req-detail-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
        isActive: true,
      },
    });
    requesterId = requester.id;

    // Shared fixtures
    const category = await prisma.category.upsert({
      where: { name: "Hardware" },
      update: {},
      create: { name: "Hardware" },
    });
    categoryId = category.id;

    const relatedSystem = await prisma.relatedSystem.upsert({
      where: { name: "Printer" },
      update: {},
      create: { name: "Printer" },
    });
    relatedSystemId = relatedSystem.id;

    // Create ticket (unassigned, NEW)
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-DETAIL-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Printer not working",
        description: "Cannot print documents after Windows update.",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
      },
    });
    ticketId = ticket.id;

    // Login all users
    const r1 = await request(app)
      .post("/api/auth/login")
      .send({ email: staff.email, password: "Password123!" });
    staffCookie = r1.headers["set-cookie"][0];

    const r2 = await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email, password: "Password123!" });
    adminCookie = r2.headers["set-cookie"][0];

    const r3 = await request(app)
      .post("/api/auth/login")
      .send({ email: requester.email, password: "Password123!" });
    requesterCookie = r3.headers["set-cookie"][0];
  });

  afterEach(async () => {
    await prisma.internalNote.deleteMany({ where: { ticketId } });
    await prisma.ticket.deleteMany({ where: { id: ticketId } });
    await prisma.session.deleteMany({
      where: { userId: { in: [staffId, adminId, requesterId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [staffId, adminId, requesterId] } },
    });
  });

  // ── Endpoint 13: PATCH /api/staff/tickets/:id/owner ─────────────────────

  it("API-11: IT Staff claims an unassigned ticket (AC-06, BR-08)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: staffId });

    expect(res.status).toBe(200);
    expect(res.body.ticketOwnerId).toBe(staffId);
    expect(res.body.ticketOwnerName).toBeTruthy();
  });

  it("API-12: Admin reassigns ticket to different staff member (AC-07, BR-09)", async () => {
    // First assign to staffId
    await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", adminCookie)
      .send({ ticketOwnerId: staffId });

    // Then reassign to adminId
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", adminCookie)
      .send({ ticketOwnerId: adminId });

    expect(res.status).toBe(200);
    expect(res.body.ticketOwnerId).toBe(adminId);
  });

  it("Endpoint 13: Unassign ticket by passing null (BR-09)", async () => {
    // First assign
    await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: staffId });

    // Then unassign
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: null });

    expect(res.status).toBe(200);
    expect(res.body.ticketOwnerId).toBeNull();
    expect(res.body.ticketOwnerName).toBeNull();
  });

  it("Endpoint 13: Rejects assigning to a Requester user (400)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", staffCookie)
      .send({ ticketOwnerId: requesterId });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("Endpoint 13: Requester gets 403", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/owner`)
      .set("Cookie", requesterCookie)
      .send({ ticketOwnerId: staffId });

    expect(res.status).toBe(403);
  });

  // ── Endpoint 14: PATCH /api/staff/tickets/:id/priority ──────────────────

  it("API-14: IT Staff sets IT Priority independently (BR-10)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/priority`)
      .set("Cookie", staffCookie)
      .send({ itPriority: "HIGH" });

    expect(res.status).toBe(200);
    expect(res.body.itPriority).toBe("HIGH");
  });

  it("Endpoint 14: Rejects invalid priority value (400)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/priority`)
      .set("Cookie", staffCookie)
      .send({ itPriority: "CRITICAL" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("Endpoint 14: Requester gets 403 for priority endpoint", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/priority`)
      .set("Cookie", requesterCookie)
      .send({ itPriority: "LOW" });

    expect(res.status).toBe(403);
  });

  // ── Endpoint 15: PATCH /api/staff/tickets/:id/status ────────────────────

  it("API-13: Valid status transition succeeds — NEW → OPEN (BR-11)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/status`)
      .set("Cookie", staffCookie)
      .send({ newStatus: "OPEN" });

    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe("OPEN");
  });

  it("API-13: Invalid transition returns 400 with from/to details — NEW → CLOSED (AC-08)", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/status`)
      .set("Cookie", staffCookie)
      .send({ newStatus: "CLOSED" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid status transition");
    expect(res.body.from).toBe("NEW");
    expect(res.body.to).toBe("CLOSED");
  });

  it("Endpoint 15: Invalid transition — CANCELLED → IN_PROGRESS returns 400", async () => {
    // Set ticket to CANCELLED first via valid path: NEW → CANCELLED
    await request(app)
      .patch(`/api/staff/tickets/${ticketId}/status`)
      .set("Cookie", staffCookie)
      .send({ newStatus: "CANCELLED" });

    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/status`)
      .set("Cookie", staffCookie)
      .send({ newStatus: "IN_PROGRESS" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid status transition");
  });

  it("Endpoint 15: Status chain — NEW → OPEN → IN_PROGRESS → RESOLVED (BR-11)", async () => {
    const transitions = [
      { newStatus: "OPEN", expected: "OPEN" },
      { newStatus: "IN_PROGRESS", expected: "IN_PROGRESS" },
      { newStatus: "RESOLVED", expected: "RESOLVED" },
    ];

    for (const { newStatus, expected } of transitions) {
      const res = await request(app)
        .patch(`/api/staff/tickets/${ticketId}/status`)
        .set("Cookie", staffCookie)
        .send({ newStatus });

      expect(res.status).toBe(200);
      expect(res.body.currentStatus).toBe(expected);
    }
  });

  it("Endpoint 15: Requester gets 403", async () => {
    const res = await request(app)
      .patch(`/api/staff/tickets/${ticketId}/status`)
      .set("Cookie", requesterCookie)
      .send({ newStatus: "OPEN" });

    expect(res.status).toBe(403);
  });

  // ── Endpoint 17: POST/GET /api/tickets/:id/notes ─────────────────────────

  it("API-08 (SEC-02): IT Staff can create and read Internal Notes (BR-14)", async () => {
    // Create note
    const resPost = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "Escalating to network team immediately." });

    expect(resPost.status).toBe(201);
    expect(resPost.body).toHaveProperty("id");
    expect(resPost.body.content).toBe("Escalating to network team immediately.");
    expect(resPost.body.authorRole).toBe("IT_STAFF");

    // Read notes
    const resGet = await request(app)
      .get(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", staffCookie);

    expect(resGet.status).toBe(200);
    expect(resGet.body).toHaveLength(1);
    expect(resGet.body[0].content).toBe("Escalating to network team immediately.");
  });

  it("API-10 (AC-04): Requester cannot POST internal notes — 403 with no note content (BR-14)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", requesterCookie)
      .send({ content: "Secret internal note attempt" });

    expect(res.status).toBe(403);
    // Response must NOT contain note content
    expect(JSON.stringify(res.body)).not.toContain("Secret internal note attempt");
  });

  it("AC-10: Requester cannot GET internal notes — 403 with no note data returned", async () => {
    // Create a note as staff first
    await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "Private staff note for requester test." });

    // Requester attempts to read
    const res = await request(app)
      .get(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", requesterCookie);

    expect(res.status).toBe(403);
    // Response must NOT leak note content
    expect(JSON.stringify(res.body)).not.toContain("Private staff note for requester test.");
  });

  it("Endpoint 17: Rejects empty / whitespace-only note content (400)", async () => {
    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "   " });

    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", staffCookie)
      .send({ content: "" });

    expect(res2.status).toBe(400);
  });

  it("Endpoint 17: Admin can also create internal notes (BR-14)", async () => {
    const res = await request(app)
      .post(`/api/tickets/${ticketId}/notes`)
      .set("Cookie", adminCookie)
      .send({ content: "Admin internal note." });

    expect(res.status).toBe(201);
    expect(res.body.authorRole).toBe("ADMINISTRATOR");
  });
});
