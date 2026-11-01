import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { serverLog } from "../../src/http/log.js";
import { createFixture, ticketApi, api, type Fixture } from "./helpers.js";

/**
 * Issue 6 hardening checks that have no row of their own in tests.md: the INVALID_TRANSITION body
 * never reflects a non-string `to` back to the client, and the Lab 4 routes log the real cause of a
 * 500 through the one server log while answering the safe body.
 */
describe("Hardening: INVALID_TRANSITION reports `to` as a string", () => {
  let fx: Fixture;
  let ticketId: number;

  beforeAll(async () => {
    fx = await createFixture("hard-transition", "hardtest");
    ticketId = await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it.each([
    ["an object", { evil: { nested: true } }, "[object Object]"],
    ["an array", ["RESOLVED", "CLOSED"], "RESOLVED,CLOSED"],
    ["a number", 42, "42"],
    ["true", true, "true"],
  ])("Hardening: a newStatus that is %s gives 400 INVALID_TRANSITION with a string `to`, and changes nothing", async (_label, value, text) => {
    const res = await ticketApi.status(fx.users.staffA.cookie, ticketId, { newStatus: value });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_TRANSITION");
    expect(res.body.from).toBe("OPEN");
    expect(typeof res.body.to).toBe("string");
    expect(res.body.to).toBe(text);
    const t = await getPrisma().ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t.currentStatus).toBe("OPEN");
    expect(t.version).toBe(1);
  });

  it("Hardening: a valid string pair still reports `to` unchanged", async () => {
    const res = await ticketApi.status(fx.users.staffA.cookie, ticketId, { newStatus: "CLOSED" });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_TRANSITION", from: "OPEN", to: "CLOSED" });
  });
});

describe("Hardening: Lab 4 routes log the real cause of a 500", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;

  beforeAll(async () => {
    fx = await createFixture("hard-log", "hardtest");
    ticketId = await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("Hardening: dashboards, the Actions list, and the Ticket status endpoint log the cause and answer safely", async () => {
    const write = vi.spyOn(serverLog, "write");
    vi.spyOn(prisma, "$transaction").mockRejectedValue(new Error("deadlock detected"));

    const staffDash = await request(app).get("/api/dashboard/staff").set("Cookie", fx.users.staffA.cookie);
    const requesterDash = await request(app).get("/api/dashboard/requester").set("Cookie", fx.users.requesterA.cookie);
    const status = await ticketApi.status(fx.users.staffA.cookie, ticketId, { newStatus: "IN_PROGRESS" });
    const create = await api.create(fx.users.staffA.cookie, ticketId, { description: "Check the cable" });

    for (const res of [staffDash, requesterDash, create]) {
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" });
      expect(res.text).not.toMatch(/deadlock/);
    }
    // The Ticket status endpoint was a Lab 3 endpoint and keeps its Lab 3 500 body.
    expect(status.status).toBe(500);
    expect(status.body).toEqual({ error: "Unable to update ticket status" });

    const entries = write.mock.calls.map(c => c[0]);
    expect(entries.map(e => e.route)).toEqual([
      "/api/dashboard/staff", "/api/dashboard/requester", "/api/staff/tickets/:id/status", "/api/staff/tickets/:id/actions",
    ]);
    for (const e of entries) expect(e.message).toBe("deadlock detected");
  });
});
