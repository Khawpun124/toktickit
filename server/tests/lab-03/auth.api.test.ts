import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { hashPassword } from "../../src/utils/password.js";

describe("Auth API Tests (API-01..05, SEC-04)", () => {
  const prisma = getPrisma();
  const testEmail = `authtest-${Date.now()}@tiktockit.com`;
  const rawPass = "InitialPass123!";
  let createdUserId: number;

  beforeEach(async () => {
    // Create test user
    const passHash = await hashPassword(rawPass);
    const user = await prisma.user.upsert({
      where: { email: testEmail },
      update: { passwordHash: passHash, isActive: true, mustChangePassword: true },
      create: {
        name: "Auth Test User",
        email: testEmail,
        passwordHash: passHash,
        role: "REQUESTER",
        isActive: true,
        mustChangePassword: true,
      },
    });
    createdUserId = user.id;

    // Create inactive test user
    const inactiveEmail = `inactive-${Date.now()}@tiktockit.com`;
    await prisma.user.upsert({
      where: { email: inactiveEmail },
      update: { passwordHash: passHash, isActive: false },
      create: {
        name: "Inactive Auth User",
        email: inactiveEmail,
        passwordHash: passHash,
        role: "REQUESTER",
        isActive: false,
        mustChangePassword: true,
      },
    });
  });

  it("API-01: Valid login returns safe user object and sets session cookie (AC-01, BR-01)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: rawPass });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", createdUserId);
    expect(res.body).toHaveProperty("email", testEmail);
    expect(res.body).toHaveProperty("role", "REQUESTER");
    expect(res.body).toHaveProperty("mustChangePassword", true);
    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("password");

    const cookies = res.get("Set-Cookie");
    expect(cookies).toBeDefined();
    expect(cookies?.[0]).toMatch(/tk_session=/);
  });

  it("API-02: Login with wrong password / inactive account / unknown email returns identical generic error (AC-05, BR-05)", async () => {
    const wrongPassRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "WrongPassword1!" });

    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body).toEqual({ error: "Invalid email or password" });

    const unknownEmailRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "doesnotexist@tiktockit.com", password: rawPass });

    expect(unknownEmailRes.status).toBe(401);
    expect(unknownEmailRes.body).toEqual({ error: "Invalid email or password" });
  });

  it("API-03: GET /api/auth/me returns unauthenticated error when no cookie sent", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("API-04: Change password with weak new password returns 400 with rule violations (BR-07)", async () => {
    // First login to get session cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: rawPass });

    const cookie = loginRes.get("Set-Cookie");

    const changeRes = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie!)
      .send({
        currentPassword: rawPass,
        newPassword: "weak",
        confirmPassword: "weak",
      });

    expect(changeRes.status).toBe(400);
    expect(changeRes.body).toHaveProperty("error", "Password does not meet requirements");
    expect(changeRes.body).toHaveProperty("rules");
    expect(changeRes.body.rules.minLength).toBe(false);
  });

  it("API-05 & SEC-04: Reuse session cookie after logout returns 401 Unauthorized (AC-15)", async () => {
    // Login
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: rawPass });

    const cookie = loginRes.get("Set-Cookie");

    // Verify /api/auth/me works
    const meResBefore = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie!);
    expect(meResBefore.status).toBe(200);

    // Logout
    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookie!);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ success: true });

    // Reuse old session cookie -> 401
    const meResAfter = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookie!);
    expect(meResAfter.status).toBe(401);
  });
});
