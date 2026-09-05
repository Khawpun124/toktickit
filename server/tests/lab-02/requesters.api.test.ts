import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

describe("GET /api/requesters (API-16)", () => {
  it("returns active requesters only and excludes inactive requesters", async () => {
    const res = await request(app).get("/api/requesters");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    // Each object must have id, name, email
    for (const req of res.body) {
      expect(req).toHaveProperty("id");
      expect(req).toHaveProperty("name");
      expect(req).toHaveProperty("email");
      expect(req).not.toHaveProperty("isActive");
    }

    // Inactive requester must NOT be included (BR-06, AC-12, API-16)
    const inactiveFound = res.body.some(
      (req: { name: string; email: string }) =>
        req.name === "Inactive Tester" || req.email === "inactive.tester@example.com"
    );
    expect(inactiveFound).toBe(false);
  });
});

describe("GET /api/related-systems", () => {
  it("returns active related systems", async () => {
    const res = await request(app).get("/api/related-systems");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6);

    for (const sys of res.body) {
      expect(sys).toHaveProperty("id");
      expect(sys).toHaveProperty("name");
      expect(sys).not.toHaveProperty("isActive");
    }
  });
});
