import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, createFixture, type Fixture } from "./helpers.js";

/** PERF-02 (AC-32): the Actions list of a Ticket with 200 Actions responds in under 1 second. */
describe("PERF-02: Actions list with 200 Actions", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;

  beforeAll(async () => {
    fx = await createFixture("perf");
    ticketId = await fx.createTicket();
    const base = Date.now() - 200 * 60_000;
    await prisma.actionTaken.createMany({
      data: Array.from({ length: 200 }, (_, i) => ({
        ticketId,
        actionAt: new Date(base + i * 60_000),
        description: `Performance smoke action ${i + 1}`,
        performedById: fx.users.staffA.id,
        assigneeId: fx.users.staffA.id,
        createdAt: new Date(base + i * 60_000),
        updatedAt: new Date(base + i * 60_000),
      })),
    });
    // Warm-up request so connection setup is not measured.
    await api.list(fx.users.staffA.cookie, ticketId);
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("returns all 200 Actions in order in under 1 second", async () => {
    const start = performance.now();
    const res = await api.list(fx.users.staffA.cookie, ticketId);
    const ms = performance.now() - start;
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(200);
    expect(res.body[0].description).toBe("Performance smoke action 1");
    expect(res.body[199].description).toBe("Performance smoke action 200");
    console.log(`PERF-02: GET /api/tickets/:id/actions with 200 Actions took ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});

/**
 * PERF-01 (AC-32): both dashboards with 500 extra Tickets (and an Action for each) answer in under
 * 1 second each, measured per request. The Tickets belong to this file's dashtest- users and are
 * all removed in afterAll.
 */
describe("PERF-01: dashboards with 500 Tickets", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let prefix = "";

  beforeAll(async () => {
    fx = await createFixture("perf-dash", "dashtest");
    prefix = `TKT-PERF-${fx.runId}-`;
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
    const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"] as const;
    const priorities = ["LOW", "MEDIUM", "HIGH", null] as const;
    const base = Date.now() - 500 * 60_000;
    await prisma.ticket.createMany({
      data: Array.from({ length: 500 }, (_, i) => {
        const status = statuses[i % statuses.length];
        const when = new Date(base + i * 60_000);
        return {
          ticketNumber: `${prefix}${i + 1}`,
          requesterId: fx.users.requesterA.id,
          ticketOwnerId: i % 3 === 0 ? null : fx.users.staffA.id,
          categoryId: category.id,
          relatedSystemId: system.id,
          summary: `Performance smoke ticket ${i + 1}`,
          description: "Ticket created by the PERF-01 dashboard smoke test.",
          requestedPriority: "MEDIUM" as const,
          itPriority: priorities[i % priorities.length],
          currentStatus: status,
          statusChangedAt: when,
          resolvedAt: status === "RESOLVED" || status === "CLOSED" ? when : null,
          createdAt: when,
          updatedAt: when,
        };
      }),
    });
    const created = await prisma.ticket.findMany({ where: { ticketNumber: { startsWith: prefix } }, select: { id: true } });
    expect(created).toHaveLength(500);
    await prisma.actionTaken.createMany({
      data: created.map((t, i) => ({
        ticketId: t.id,
        actionAt: new Date(base + i * 60_000),
        description: `Performance smoke action ${i + 1}`,
        status: i % 2 === 0 ? ("PLANNED" as const) : ("COMPLETED" as const),
        result: i % 2 === 0 ? null : "Finished for the smoke test",
        performedById: fx.users.staffA.id,
        assigneeId: fx.users.staffA.id,
      })),
    });
    // Warm-up requests so connection setup is not measured.
    await request(app).get("/api/dashboard/requester").set("Cookie", fx.users.requesterA.cookie);
    await request(app).get("/api/dashboard/staff").set("Cookie", fx.users.staffA.cookie);
  });
  afterAll(async () => {
    // cleanup() removes the Actions (by assignee), then the Tickets (by requester), sessions, and users.
    await fx.cleanup();
    expect(await prisma.ticket.count({ where: { ticketNumber: { startsWith: prefix } } })).toBe(0);
  });

  it("PERF-01: the Requester dashboard answers in under 1 second", async () => {
    const start = performance.now();
    const res = await request(app).get("/api/dashboard/requester").set("Cookie", fx.users.requesterA.cookie);
    const ms = performance.now() - start;
    expect(res.status).toBe(200);
    expect(res.body.metrics.closed.count).toBe(62); // indices 5, 13, ..., 493
    console.log(`PERF-01: GET /api/dashboard/requester with 500 Tickets took ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  });

  it("PERF-01: the staff dashboard answers in under 1 second", async () => {
    const start = performance.now();
    const res = await request(app).get("/api/dashboard/staff").set("Cookie", fx.users.staffA.cookie);
    const ms = performance.now() - start;
    expect(res.status).toBe(200);
    expect(res.body.myOpenActions).toHaveLength(5);
    console.log(`PERF-01: GET /api/dashboard/staff with 500 Tickets took ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  });
});
