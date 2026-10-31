import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
