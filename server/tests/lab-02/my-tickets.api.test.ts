import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";

describe("GET /api/tickets (My Tickets API)", () => {
  const prisma = getPrisma();
  let createdTicketIds: number[] = [];

  beforeEach(async () => {
    createdTicketIds = [];
    await prisma.ticket.deleteMany({ where: { requesterId: { in: [3, 4] } } });
    const prefix = `TKT-TEST-${Date.now()}`;

    // Create tickets for Requester 3
    const t1 = await prisma.ticket.create({
      data: {
        ticketNumber: `${prefix}-001`,
        requesterId: 3,
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
        requesterId: 3,
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
        requesterId: 4,
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
      .set("X-Requester-Id", "3");

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
      .set("X-Requester-Id", "3");

    expect(res.status).toBe(200);
    expect(res.body.pagination.totalItems).toBe(1);
    expect(res.body.data[0].summary).toBe("Wi-Fi connection drops");
  });

  it("API-08: sorts results by createdAt descending by default with ticketNumber desc tiebreaker (BR-13)", async () => {
    const res = await request(app)
      .get("/api/tickets")
      .set("X-Requester-Id", "3");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    // Wi-Fi connection drops (Aug 2) should be before Laptop battery issues (Aug 1)
    expect(res.body.data[0].summary).toBe("Wi-Fi connection drops");
    expect(res.body.data[1].summary).toBe("Laptop battery issues");
  });


  it("API-09: falls back to default page size when out-of-range page parameter is supplied (BR-14)", async () => {
    const res = await request(app)
      .get("/api/tickets?pageSize=999&page=-5")
      .set("X-Requester-Id", "3");

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.pageSize).toBe(10);
  });
});
