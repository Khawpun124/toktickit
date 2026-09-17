import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { Role } from "@prisma/client";
import { hashPassword } from "../../src/utils/password.js";

describe("Resolution Flag API Tests (BR-12, API-15)", () => {
  const prisma = getPrisma();
  let requesterCookie: string;
  let otherRequesterCookie: string;
  let requesterId: number;
  let otherRequesterId: number;
  let ticketId: number;
  let closedTicketId: number;

  beforeEach(async () => {
    const passwordHash = await hashPassword("Password123!");

    const requester = await prisma.user.create({
      data: {
        name: "Resolution Flag Requester",
        email: `res-req-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
      },
    });
    requesterId = requester.id;

    const otherRequester = await prisma.user.create({
      data: {
        name: "Other Requester",
        email: `other-res-req-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
      },
    });
    otherRequesterId = otherRequester.id;

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

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-RES-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Testing Resolution Flag Endpoint",
        description: "Testing resolution flag functionality",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });
    ticketId = ticket.id;

    const closedTicket = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-RES-CLOSED-${Date.now()}`,
        requesterId: requester.id,
        categoryId: category.id,
        relatedSystemId: relatedSystem.id,
        summary: "Closed Ticket Resolution Test",
        description: "Testing resolution flag on closed ticket",
        requestedPriority: "LOW",
        currentStatus: "CLOSED",
      },
    });
    closedTicketId = closedTicket.id;

    const res1 = await request(app)
      .post("/api/auth/login")
      .send({ email: requester.email, password: "Password123!" });
    requesterCookie = res1.headers["set-cookie"][0];

    const res2 = await request(app)
      .post("/api/auth/login")
      .send({ email: otherRequester.email, password: "Password123!" });
    otherRequesterCookie = res2.headers["set-cookie"][0];
  });

  afterEach(async () => {
    if (ticketId) await prisma.ticket.deleteMany({ where: { id: ticketId } });
    if (closedTicketId) await prisma.ticket.deleteMany({ where: { id: closedTicketId } });
    await prisma.session.deleteMany({ where: { userId: { in: [requesterId, otherRequesterId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [requesterId, otherRequesterId] } } });
  });

  it("API-15: Requester sets problemAppearsResolved to true on own open Ticket (BR-12)", async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}/resolution-flag`)
      .set("Cookie", requesterCookie);

    expect(res.status).toBe(200);
    expect(res.body.problemAppearsResolved).toBe(true);

    const updated = await prisma.ticket.findUnique({ where: { id: ticketId } });
    expect(updated?.problemAppearsResolved).toBe(true);
    // Current status must remain unchanged
    expect(updated?.currentStatus).toBe("NEW");
  });

  it("Rejects non-owner Requester from updating resolution flag (404)", async () => {
    const res = await request(app)
      .patch(`/api/tickets/${ticketId}/resolution-flag`)
      .set("Cookie", otherRequesterCookie);

    expect(res.status).toBe(404);
  });

  it("Rejects resolution flag update if ticket is Closed or Cancelled (400)", async () => {
    const res = await request(app)
      .patch(`/api/tickets/${closedTicketId}/resolution-flag`)
      .set("Cookie", requesterCookie);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Closed or Cancelled");
  });
});
