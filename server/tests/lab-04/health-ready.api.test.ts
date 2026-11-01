import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { serverLog } from "../../src/http/log.js";
import { createFixture, type Fixture } from "./helpers.js";

/**
 * API-38 (AC-31, BR-37): GET /api/health/ready reports database connectivity without a login, and
 * GET /api/health is unchanged. The outage is simulated with a spy on $queryRaw, so the real
 * database is never touched; the spy is removed after each test.
 */
describe("API-38: readiness and health endpoints", () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("health", "hardtest");
  });
  afterAll(async () => {
    await fx.cleanup();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("API-38: /api/health/ready answers 200 { status: \"ready\" } when the database answers, with no session", async () => {
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("API-38: readiness needs no login and ignores a session cookie, valid or not", async () => {
    for (const cookie of [fx.users.staffA.cookie, "tk_session=not-a-real-session"]) {
      const res = await request(app).get("/api/health/ready").set("Cookie", cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "ready" });
    }
  });

  it("API-38: when the database is unreachable it answers 503 with the safe body only, and logs the real cause", async () => {
    const write = vi.spyOn(serverLog, "write");
    const cause = "Can't reach database server at db.internal:5432 (P1001)";
    vi.spyOn(getPrisma(), "$queryRaw").mockRejectedValue(new Error(cause));

    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable", code: "NOT_READY" });
    expect(res.text).not.toMatch(/5432|P1001|db\.internal|reach|Error|at /);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({ method: "GET", route: "/api/health/ready", message: cause });
  });

  it("API-38: an outage also answers 503 (not 500) for a request that carries a session cookie", async () => {
    vi.spyOn(getPrisma(), "$queryRaw").mockRejectedValue(new Error("connection refused"));
    const res = await request(app).get("/api/health/ready").set("Cookie", fx.users.staffA.cookie);
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "unavailable", code: "NOT_READY" });
  });

  it("API-38: readiness recovers as soon as the database answers again", async () => {
    const spy = vi.spyOn(getPrisma(), "$queryRaw").mockRejectedValueOnce(new Error("down"));
    expect((await request(app).get("/api/health/ready")).status).toBe(503);
    spy.mockRestore();
    expect((await request(app).get("/api/health/ready")).body).toEqual({ status: "ready" });
  });

  it("API-38: /api/health is unchanged and does not depend on the database", async () => {
    vi.spyOn(getPrisma(), "$queryRaw").mockRejectedValue(new Error("down"));
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "TokTickIT API" });
  });
});
