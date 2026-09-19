import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/utils/password.js";

describe("IT Staff Ticket Queue API Tests (API-16, FR-07, AC-14)", () => {
  const prisma = getPrisma();
  let requesterCookie: string;
  let staffCookie: string;
  let adminCookie: string;
  let staffUser: any;
  let requesterUser: any;
  let testCategory: any;
  let testSystem: any;
  let createdTicketIds: number[] = [];

  beforeEach(async () => {
    // Setup test users
    const defaultPasswordHash = await hashPassword("Password123!");
    const time = Date.now();

    requesterUser = await prisma.user.create({
      data: {
        name: "Queue Test Requester",
        email: `req-queue-${time}@example.com`,
        passwordHash: defaultPasswordHash,
        role: "REQUESTER",
        mustChangePassword: false,
      },
    });

    staffUser = await prisma.user.create({
      data: {
        name: "Queue Test Staff",
        email: `staff-queue-${time}@example.com`,
        passwordHash: defaultPasswordHash,
        role: "IT_STAFF",
        mustChangePassword: false,
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        name: "Queue Test Admin",
        email: `admin-queue-${time}@example.com`,
        passwordHash: defaultPasswordHash,
        role: "ADMINISTRATOR",
        mustChangePassword: false,
      },
    });

    // Login to get cookies
    const reqLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: requesterUser.email, password: "Password123!" });
    requesterCookie = reqLogin.headers["set-cookie"][0];

    const staffLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: staffUser.email, password: "Password123!" });
    staffCookie = staffLogin.headers["set-cookie"][0];

    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: adminUser.email, password: "Password123!" });
    adminCookie = adminLogin.headers["set-cookie"][0];

    // Category and System fixtures
    testCategory = await prisma.category.upsert({
      where: { name: "Hardware" },
      update: {},
      create: { name: "Hardware" },
    });

    testSystem = await prisma.relatedSystem.upsert({
      where: { name: "Email" },
      update: {},
      create: { name: "Email" },
    });

    // Create 3 tickets for queue testing
    const t1 = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-SQ1-${time}`,
        requesterId: requesterUser.id,
        categoryId: testCategory.id,
        relatedSystemId: testSystem.id,
        summary: `Staff Queue Monitor Display Issue ${time}`,
        description: "Monitor flickers when connected",
        requestedPriority: "HIGH",
        itPriority: "HIGH",
        currentStatus: "NEW",
        problemAppearsResolved: false,
      },
    });

    const t2 = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-SQ2-${time}`,
        requesterId: requesterUser.id,
        categoryId: testCategory.id,
        relatedSystemId: testSystem.id,
        summary: `Staff Queue Keyboard Broken ${time}`,
        description: "Key jammed",
        requestedPriority: "LOW",
        itPriority: "LOW",
        currentStatus: "IN_PROGRESS",
        ticketOwnerId: staffUser.id,
        problemAppearsResolved: true,
      },
    });

    const t3 = await prisma.ticket.create({
      data: {
        ticketNumber: `TKT-SQ3-${time}`,
        requesterId: requesterUser.id,
        categoryId: testCategory.id,
        relatedSystemId: testSystem.id,
        summary: `Staff Queue Printer Jam ${time}`,
        description: "Paper jammed in feeder",
        requestedPriority: "MEDIUM",
        itPriority: "MEDIUM",
        currentStatus: "RESOLVED",
        problemAppearsResolved: false,
      },
    });

    createdTicketIds = [t1.id, t2.id, t3.id];
  });

  afterEach(async () => {
    if (createdTicketIds.length > 0) {
      await prisma.ticket.deleteMany({ where: { id: { in: createdTicketIds } } });
    }
    await prisma.user.deleteMany({
      where: {
        email: { contains: "-queue-" },
      },
    });
  });

  it("API-16: Rejects Requester role with 403 Forbidden", async () => {
    const res = await request(app)
      .get("/api/staff/tickets")
      .set("Cookie", [requesterCookie]);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("API-16: Rejects unauthenticated request with 401 Unauthorized", async () => {
    const res = await request(app).get("/api/staff/tickets");
    expect(res.status).toBe(401);
  });

  it("API-16: IT Staff can retrieve queue tickets with pagination envelope", async () => {
    const res = await request(app)
      .get("/api/staff/tickets")
      .set("Cookie", [staffCookie]);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("data");
    expect(res.body).toHaveProperty("pagination");
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      pageSize: 10,
    });
  });

  it("API-16: Filters tickets by search parameter (ticketNumber or summary)", async () => {
    const res = await request(app)
      .get(`/api/staff/tickets?search=Monitor Display Issue`)
      .set("Cookie", [staffCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].summary).toContain("Monitor Display Issue");
  });

  it("API-16: Filters tickets by requestedPriority and currentStatus", async () => {
    const res = await request(app)
      .get(`/api/staff/tickets?requestedPriority=HIGH&currentStatus=NEW`)
      .set("Cookie", [staffCookie]);

    expect(res.status).toBe(200);
    for (const t of res.body.data) {
      expect(t.requestedPriority).toBe("HIGH");
      expect(t.currentStatus).toBe("NEW");
    }
  });

  it("API-16: Filters tickets by ticketOwnerId='unassigned'", async () => {
    const res = await request(app)
      .get("/api/staff/tickets?ticketOwnerId=unassigned")
      .set("Cookie", [staffCookie]);

    expect(res.status).toBe(200);
    for (const t of res.body.data) {
      expect(t.ticketOwnerId).toBeNull();
      expect(t.ticketOwnerName).toBeNull();
    }
  });

  it("API-16: Filters tickets by specific numeric ticketOwnerId", async () => {
    const res = await request(app)
      .get(`/api/staff/tickets?ticketOwnerId=${staffUser.id}`)
      .set("Cookie", [staffCookie]);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    for (const t of res.body.data) {
      expect(t.ticketOwnerId).toBe(staffUser.id);
      expect(t.ticketOwnerName).toBe(staffUser.name);
    }
  });

  it("API-16: Sorts queue by ticketNumber asc/desc", async () => {
    const resAsc = await request(app)
      .get("/api/staff/tickets?sortBy=ticketNumber&sortDir=asc")
      .set("Cookie", [staffCookie]);

    expect(resAsc.status).toBe(200);
    const nums = resAsc.body.data.map((t: any) => t.ticketNumber);
    const sortedNums = [...nums].sort();
    expect(nums).toEqual(sortedNums);
  });
});
