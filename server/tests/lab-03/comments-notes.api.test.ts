import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { Role } from "@prisma/client";
import { hashPassword } from "../../src/utils/password.js";

describe("Public Comments API Tests (BR-13, BR-16, API-09, API-10)", () => {
  const prisma = getPrisma();
  let requesterCookie: string;
  let otherRequesterCookie: string;
  let staffCookie: string;
  let requesterId: number;
  let otherRequesterId: number;
  let staffId: number;
  let ticketId: number;

  beforeEach(async () => {
    const passwordHash = await hashPassword("Password123!");

    // Create primary requester
    const requester = await prisma.user.create({
      data: {
        name: "Public Comment Requester",
        email: `comment-req-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
      },
    });
    requesterId = requester.id;

    // Create secondary requester (non-owner)
    const otherRequester = await prisma.user.create({
      data: {
        name: "Other Requester",
        email: `other-req-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
      },
    });
    otherRequesterId = otherRequester.id;

    // Create IT staff user
    const staff = await prisma.user.create({
      data: {
        name: "IT Staff Commenter",
        email: `staff-comment-${Date.now()}@tiktockit.com`,
        passwordHash,
        role: Role.IT_STAFF,
        mustChangePassword: false,
      },
    });
    staffId = staff.id;

    // Create Category & RelatedSystem fixtures if needed
    const category = await prisma.category.upsert({
      where: { name: "Software" },
      update: {},
      create: { name: "Software" },
    });

    const relatedSystem = await prisma.relatedSystem.upsert({
      where: { name: "Email" },
      update: {},
      create: { name: "Email" },
    });

    // Create ticket owned by primary requester
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-CMT-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Testing Public Comments Endpoint",
        description: "Detailed summary of public comment issue",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
      },
    });
    ticketId = ticket.id;

    // Login primary requester to obtain session cookie
    const res1 = await request(app)
      .post("/api/auth/login")
      .send({ email: requester.email, password: "Password123!" });
    requesterCookie = res1.headers["set-cookie"][0];

    // Login secondary requester
    const res2 = await request(app)
      .post("/api/auth/login")
      .send({ email: otherRequester.email, password: "Password123!" });
    otherRequesterCookie = res2.headers["set-cookie"][0];

    // Login IT staff
    const res3 = await request(app)
      .post("/api/auth/login")
      .send({ email: staff.email, password: "Password123!" });
    staffCookie = res3.headers["set-cookie"][0];
  });

  afterEach(async () => {
    if (ticketId) {
      await prisma.publicComment.deleteMany({ where: { ticketId } });
      await prisma.ticket.deleteMany({ where: { id: ticketId } });
    }
    await prisma.session.deleteMany({ where: { userId: { in: [requesterId, otherRequesterId, staffId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, otherRequesterId, staffId] } } });
  });

  it("API-09: Requester owner and IT Staff can post and view Public Comments (BR-13)", async () => {
    // Requester posts a comment
    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "I am having trouble logging in to email." });

    expect(res1.status).toBe(201);
    expect(res1.body).toHaveProperty("id");
    expect(res1.body.content).toBe("I am having trouble logging in to email.");
    expect(res1.body.authorRole).toBe("REQUESTER");

    // Staff posts a comment
    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", staffCookie)
      .send({ content: "Investigating the account now." });

    expect(res2.status).toBe(201);
    expect(res2.body.authorRole).toBe("IT_STAFF");

    // Fetch comments as Requester
    const resGet = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterCookie);

    expect(resGet.status).toBe(200);
    expect(resGet.body).toHaveLength(2);
    expect(resGet.body[0].content).toBe("I am having trouble logging in to email.");
    expect(resGet.body[1].content).toBe("Investigating the account now.");
  });

  it("API-10: Reject empty or whitespace-only comment content (BR-16)", async () => {
    const res1 = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "    " });

    expect(res1.status).toBe(400);

    const res2 = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", requesterCookie)
      .send({ content: "" });

    expect(res2.status).toBe(400);
  });

  it("Rejects non-owner Requester from reading or posting public comments (403)", async () => {
    const resPost = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", otherRequesterCookie)
      .send({ content: "Unauthorized comment attempt" });

    expect(resPost.status).toBe(403);

    const resGet = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", otherRequesterCookie);

    expect(resGet.status).toBe(403);
  });
});
