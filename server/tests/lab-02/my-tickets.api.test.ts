import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets (My Tickets API)", () => {
  const prisma = getPrisma();
  let createdTicketIds: number[] = [];
  let req3Id: number;
  let req4Id: number;

  beforeEach(async () => {
    createdTicketIds = [];
    const requesters = await prisma.user.findMany({
      where: { role: "REQUESTER", isActive: true },
      orderBy: { id: "asc" },
      take: 4,
    });
    if (requesters.length < 1) {
      throw new Error("No active REQUESTER user found");
    }
    req3Id = requesters[2] ? requesters[2].id : requesters[0].id;
    req4Id = requesters[3] ? requesters[3].id : (requesters[1] ? requesters[1].id : requesters[0].id);

    await prisma.ticket.deleteMany({ where: { requesterId: { in: [req3Id, req4Id] } } });
    const prefix = `TKT-TEST-${Date.now()}`;

    // Create tickets for Requester 3
    const t1 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-001`,
        requesterId: req3Id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Laptop battery issues",
        description: "Battery drains very fast.",
        requestedPriority: "HIGH",
        currentStatus: "NEW",
        createdAt: new Date("2026-08-01T10:00:00Z"),
      },
    });

    const t2 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-002`,
        requesterId: req3Id,
        categoryId: 2,
        relatedSystemId: 1,
        summary: "Wi-Fi connection drops",
        description: "Disconnects every 10 minutes.",
        requestedPriority: "MEDIUM",
        currentStatus: "NEW",
        createdAt: new Date("2026-08-02T10:00:00Z"),
      },
    });

    // Create ticket for Requester 4
    const t3 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-003`,
        requesterId: req4Id,
        categoryId: 1,
        relatedSystemId: 1,
        summary: "Password reset needed",
        description: "Forgotten email password.",
        requestedPriority: "LOW",
        currentStatus: "NEW",
        createdAt: new Date("2026-08-03T10:00:00Z"),
      },
    });

    createdTicketIds.push(t1.id, t2.id, t3.id);
  });

  afterEach(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.ticket.deleteMany({
        where: { id: { in: createdTicketIds } },
      });
    }
  });

  it("API-06: returns tickets scoped only to the specified Requester (AC-13, BR-10)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(res.body.pagination.totalItems).toBe(2);

    const summaries = res.body.data.map((t: any) => t.summary);
    expect(summaries).toContain("Laptop battery issues");
    expect(summaries).toContain("Wi-Fi connection drops");
    expect(summaries).not.toContain("Password reset needed");
  });

  it("API-07: applies combined filters (Category + Status) with AND logic (BR-12)", async () => {
    const res = await request(app)
      .get("/api/tickets?categoryId=2&currentStatus=NEW")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(1);
    expect(res.body.data[0].summary).toBe("Wi-Fi connection drops");
  });

  it("API-08: sorts results by createdAt descending by default with ticketNumber desc tiebreaker (BR-13)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // Wi-Fi connection drops (Aug 2) should be before Laptop battery issues (Aug 1)
    expect(res.body.data[0].summary).toBe("Wi-Fi connection drops");
    expect(res.body.data[1].summary).toBe("Laptop battery issues");
  });


  it("API-09: falls back to default page size when out-of-range page parameter is supplied (BR-14)", async () => {
    const res = await request(app)
      .get("/api/tickets?pageSize=999&page=-5")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
  });

  it("returns 400 when requestedPriority query parameter is invalid", async () => {
    const res = await request(app)
      .get("/api/tickets?requestedPriority=INVALID")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/Invalid requestedPriority/i);
  });

  it("returns 400 when currentStatus query parameter is invalid", async () => {
    const res = await request(app)
      .get("/api/tickets?currentStatus=NOT_A_REAL_STATUS")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toMatch(/Invalid currentStatus/i);
  });

  it("filters tickets correctly when valid requestedPriority is supplied (regression check)", async () => {
    const res = await request(app)
      .get("/api/tickets?requestedPriority=HIGH")
      .set("X-Requester-Id", req3Id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].summary).toBe("Laptop battery issues");
  });
});
