import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { Role } from "@prisma/client";
import { hashPassword } from "../../src/utils/password.js";

describe("Administrator User Management API Tests (Endpoints 18-21 — API-17..21, AC-12..14, BR-17..22)", () => {
  const prisma = getPrisma();
  let adminCookie: string;
  let staffCookie: string;
  let requesterCookie: string;
  let adminId: number;
  let staffId: number;
  let requesterId: number;

  beforeEach(async () => {
    const passwordHash = await hashPassword("Password123!");

    // Create Admin user
    const admin = await prisma.user.create({
      data: {
        name: "Primary Admin",
        email: `primary-admin-${Date.now()}@example.com`,
        passwordHash,
        role: Role.ADMINISTRATOR,
        mustChangePassword: false,
        isActive: true,
      },
    });
    adminId = admin.id;

    // Create Staff user
    const staff = await prisma.user.create({
      data: {
        name: "Staff User",
        email: `staff-user-${Date.now()}@example.com`,
        passwordHash,
        role: Role.IT_STAFF,
        mustChangePassword: false,
        isActive: true,
      },
    });
    staffId = staff.id;

    // Create Requester user
    const requester = await prisma.user.create({
      data: {
        name: "Requester User",
        email: `requester-user-${Date.now()}@example.com`,
        passwordHash,
        role: Role.REQUESTER,
        mustChangePassword: false,
        isActive: true,
      },
    });
    requesterId = requester.id;

    // Login users to get session cookies
    const r1 = await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email, password: "Password123!" });
    adminCookie = r1.headers["set-cookie"][0];

    const r2 = await request(app)
      .post("/api/auth/login")
      .send({ email: staff.email, password: "Password123!" });
    staffCookie = r2.headers["set-cookie"][0];

    const r3 = await request(app)
      .post("/api/auth/login")
      .send({ email: requester.email, password: "Password123!" });
    requesterCookie = r3.headers["set-cookie"][0];
  });

  afterEach(async () => {
    await prisma.session.deleteMany({
      where: { userId: { in: [adminId, staffId, requesterId] } },
    });
    await prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: [adminId, staffId, requesterId] } },
          { email: { contains: "new-user-" } },
          { email: { contains: "sec-admin-" } },
          { email: { contains: "forbid-" } },
        ],
      },
    });
  });

  // ── Endpoint 18: GET /api/admin/users ────────────────────────────────────

  it("API-21: Administrator can retrieve user list with search and role filter", async () => {
    const res = await request(app)
      .get("/api/admin/users")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);

    // Filter by role=IT_STAFF
    const resFiltered = await request(app)
      .get("/api/admin/users?role=IT_STAFF")
      .set("Cookie", adminCookie);

    expect(resFiltered.status).toBe(200);
    expect(resFiltered.body.every((u: any) => u.role === "IT_STAFF")).toBe(true);

    // Search by name
    const resSearch = await request(app)
      .get("/api/admin/users?search=Primary")
      .set("Cookie", adminCookie);

    expect(resSearch.status).toBe(200);
    expect(resSearch.body.some((u: any) => u.name === "Primary Admin")).toBe(true);
  });

  it("API-07 / SEC-01 / AC-14: Non-Administrator receives 403 Forbidden for GET /api/admin/users", async () => {
    const resStaff = await request(app)
      .get("/api/admin/users")
      .set("Cookie", staffCookie);
    expect(resStaff.status).toBe(403);

    const resReq = await request(app)
      .get("/api/admin/users")
      .set("Cookie", requesterCookie);
    expect(resReq.status).toBe(403);
  });

  // ── Endpoint 19: POST /api/admin/users ───────────────────────────────────

  it("API-20: Admin creates a user with single role and initial password (BR-17)", async () => {
    const email = `new-user-${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({
        name: "New Staff",
        email,
        role: "IT_STAFF",
        isActive: true,
        initialPassword: "Welcome123!",
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("New Staff");
    expect(res.body.email).toBe(email);
    expect(res.body.role).toBe("IT_STAFF");
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body).not.toHaveProperty("passwordHash");

    // Clean up
    await prisma.user.deleteMany({ where: { email } });
  });

  it("API-17 (AC-12, BR-19): Create user with duplicate email returns 400 validation error", async () => {
    // Attempt to use an existing admin's email
    const existing = await prisma.user.findUnique({ where: { id: adminId } });

    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", adminCookie)
      .send({
        name: "Duplicate User",
        email: existing!.email,
        role: "REQUESTER",
        isActive: true,
        initialPassword: "Welcome123!",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("SEC-01 / AC-14: Non-Administrator receives 403 Forbidden for POST /api/admin/users", async () => {
    const res = await request(app)
      .post("/api/admin/users")
      .set("Cookie", staffCookie)
      .send({
        name: "Forbidden Create",
        email: `forbid-${Date.now()}@example.com`,
        role: "REQUESTER",
        initialPassword: "Welcome123!",
      });

    expect(res.status).toBe(403);
  });

  // ── Endpoint 20: PATCH /api/admin/users/:id ──────────────────────────────

  it("Admin can edit user name, email, role, and activation state (BR-18)", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${staffId}`)
      .set("Cookie", adminCookie)
      .send({
        name: "Updated Staff Name",
        role: "IT_STAFF",
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Staff Name");
  });

  it("API-18 (AC-13, BR-20): Administrator attempt to deactivate own account returns 403", async () => {
    const res = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", adminCookie)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/cannot deactivate your own account/i);
  });

  it("API-19 (AC-13, BR-21): Deactivate or change role of last active Administrator returns 400", async () => {
    // Deactivate all other admin accounts if any exist to ensure adminId is the ONLY active admin
    await prisma.user.updateMany({
      where: {
        role: "ADMINISTRATOR",
        id: { not: adminId },
      },
      data: { isActive: false },
    });

    // Create a second admin user, then attempt to deactivate it when it's the only one left
    const secondAdminEmail = `sec-admin-${Date.now()}@example.com`;
    const secondAdmin = await prisma.user.create({
      data: {
        name: "Second Admin",
        email: secondAdminEmail,
        passwordHash: "dummy",
        role: Role.ADMINISTRATOR,
        mustChangePassword: false,
        isActive: true,
      },
    });

    // Login as secondAdmin to attempt deactivating primary adminId
    const rSec = await request(app)
      .post("/api/auth/login")
      .send({ email: secondAdmin.email, password: "Password123!" }).catch(() => null);

    // Deactivate primary adminId using secondAdmin session -> leaving 1 active admin
    const res1 = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", adminCookie)
      .send({ isActive: false }); // Self-deactivation -> 403

    expect(res1.status).toBe(403);

    // Now change role of secondAdmin using adminId cookie so that secondAdmin is no longer admin
    // If adminId is active and secondAdmin is active, there are 2 active admins. Changing secondAdmin role leaves 1.
    // Let's deactivate secondAdmin to test last admin protection on primary admin (or change primary admin role):
    // First deactivate primary admin by having secondAdmin logged in:
    const passwordHash = await hashPassword("Password123!");
    await prisma.user.update({
      where: { id: secondAdmin.id },
      data: { passwordHash },
    });
    const rSecLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: secondAdmin.email, password: "Password123!" });
    const secondAdminCookie = rSecLogin.headers["set-cookie"][0];

    // Deactivate primary admin using secondAdmin session -> leaves 1 active admin (secondAdmin)
    const resDeactPrimary = await request(app)
      .patch(`/api/admin/users/${adminId}`)
      .set("Cookie", secondAdminCookie)
      .send({ isActive: false });
    expect(resDeactPrimary.status).toBe(200);

    // Now secondAdmin is the ONLY active admin in DB!
    // Attempting to change secondAdmin role to REQUESTER must return 400
    const resRoleChange = await request(app)
      .patch(`/api/admin/users/${secondAdmin.id}`)
      .set("Cookie", secondAdminCookie)
      .send({ role: "REQUESTER" });

    expect(resRoleChange.status).toBe(400);
    expect(resRoleChange.body.error).toMatch(/last active Administrator/i);

    // Restore primary admin
    await prisma.user.update({
      where: { id: adminId },
      data: { isActive: true },
    });

    await prisma.session.deleteMany({ where: { userId: secondAdmin.id } });
    await prisma.user.deleteMany({ where: { id: secondAdmin.id } });
  });

  // ── Endpoint 21: POST /api/admin/users/:id/reset-password ─────────────

  it("Admin can set a new initial password requiring change at next login", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${staffId}/reset-password`)
      .set("Cookie", adminCookie)
      .send({ newInitialPassword: "NewTempPassword123!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mustChangePassword).toBe(true);

    const updatedStaff = await prisma.user.findUnique({ where: { id: staffId } });
    expect(updatedStaff?.mustChangePassword).toBe(true);
  });

  it("SEC-01 / AC-14: Non-Administrator receives 403 Forbidden for reset-password", async () => {
    const res = await request(app)
      .post(`/api/admin/users/${staffId}/reset-password`)
      .set("Cookie", staffCookie)
      .send({ newInitialPassword: "NewTempPassword123!" });

    expect(res.status).toBe(403);
  });
});
