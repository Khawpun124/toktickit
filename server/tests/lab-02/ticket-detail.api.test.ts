import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets/:id (Ticket Detail API)", () => {
  const prisma = getPrisma();
  let ticket1Id: number;
  let ticket2Id: number;
  let req1Id: number;
  let req2Id: number;

  beforeEach(async () => {
    const requesters = await prisma.user.findMany({
      where: { role: "REQUESTER", isActive: true },
      orderBy: { id: "asc" },
      take: 2,
    });
    if (requesters.length < 1) {
      throw new Error("No active REQUESTER user found");
    }
    req1Id = requesters[0].id;
    req2Id = requesters[1] ? requesters[1].id : requesters[0].id;

    await prisma.ticket.deleteMany({ where: { requesterId: { in: [req1Id, req2Id] } } });
    const prefix = `TKT-DETAIL-${Date.now()}`;

    const t1 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-001`,
        requesterId: req1Id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Requester 1 ticket for detail test",
        description: "Detailed description for ticket 1.",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
      },
    });

    const t2 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-002`,
        requesterId: req2Id,
        categoryId: 2,
        relatedSystemId: 1,
        summary: "Requester 2 ticket for detail test",
        description: "Detailed description for ticket 2.",
        requestedPriority: "LOW",
        currentStatus: "NEW",
      },
    });

    ticket1Id = t1.id;
    ticket2Id = t2.id;
  });

  afterEach(async () => {
    await prisma.ticket.deleteMany({ where: { id: { in: [ticket1Id, ticket2Id] } } });
  });

  it("returns ticket details for valid owned ticket", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticket1Id}`)
      .set("X-Requester-Id", req1Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ticket1Id);
    expect(res.body.summary).toBe("Requester 1 ticket for detail test");
    expect(res.body.requesterId).toBe(req1Id);
    expect(res.body.categoryName).toBeDefined();
    expect(res.body.relatedSystemName).toBeDefined();
  });

  it("API-05: returns generic 404 Not Found for ticket owned by another requester (AC-03, BR-10)", async () => {
    const res = await request(app)
      .get(`/api/tickets/${ticket2Id}`)
      .set("X-Requester-Id", req1Id.toString());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
  });

  it("returns 404 for non-existent ticket ID", async () => {
    const res = await request(app)
      .get("/api/tickets/999999")
      .set("X-Requester-Id", req1Id.toString());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Ticket not found" });
  });
});
