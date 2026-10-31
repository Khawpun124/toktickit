import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, createFixture, type Fixture } from "./helpers.js";

/**
 * API-43 (AC-38, BR-39): statusChangedAt is set at creation and by every status transition,
 * and by nothing else.
 */
describe("API-43: statusChangedAt maintenance", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;

  beforeAll(async () => {
    fx = await createFixture("statusat");
    const category = await prisma.category.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
    const system = await prisma.relatedSystem.findFirstOrThrow({ where: { isActive: true }, orderBy: { id: "asc" } });
    const res = await request(app)
      .post("/api/tickets")
      .set("Cookie", fx.users.requesterA.cookie)
      .send({
        categoryId: category.id,
        relatedSystemId: system.id,
        summary: "statusChangedAt test ticket",
        description: "Ticket created through the API to check statusChangedAt.",
        requestedPriority: "MEDIUM",
      });
    expect(res.status).toBe(201);
    ticketId = res.body.id;
    fx.trackTicket(ticketId);
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const read = async () => (await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).statusChangedAt.getTime();
  const staff = () => fx.users.staffA.cookie;
  const setStatus = (newStatus: string) =>
    request(app).patch(`/api/staff/tickets/${ticketId}/status`).set("Cookie", staff()).send({ newStatus });

  // Each status change must give a strictly newer value. Waiting 5 ms first makes the
  // millisecond timestamps distinct even on a fast machine.
  async function expectStatusChangeMovesClock(newStatus: string) {
    const before = await read();
    await new Promise(r => setTimeout(r, 5));
    const res = await setStatus(newStatus);
    expect(res.status, newStatus).toBe(200);
    const after = await read();
    expect(after, newStatus).toBeGreaterThan(before);
    return after;
  }

  async function expectUnchangedBy(label: string, action: () => Promise<{ status: number }>, okStatus: number) {
    const before = await read();
    await new Promise(r => setTimeout(r, 5));
    const res = await action();
    expect(res.status, label).toBe(okStatus);
    expect(await read(), label).toBe(before);
  }

  it("is set when the Ticket is created", async () => {
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t.currentStatus).toBe("NEW");
    expect(Math.abs(t.statusChangedAt.getTime() - t.createdAt.getTime())).toBeLessThan(1000);
  });

  it("changes on every status transition and is not changed by owner, IT Priority, comment, note, or Action changes", async () => {
    await expectStatusChangeMovesClock("OPEN");

    await expectUnchangedBy("owner", () =>
      request(app).patch(`/api/staff/tickets/${ticketId}/owner`).set("Cookie", staff()).send({ ticketOwnerId: fx.users.staffA.id }), 200);
    await expectUnchangedBy("IT priority", () =>
      request(app).patch(`/api/staff/tickets/${ticketId}/priority`).set("Cookie", staff()).send({ itPriority: "HIGH" }), 200);
    await expectUnchangedBy("public comment", () =>
      request(app).post(`/api/tickets/${ticketId}/comments`).set("Cookie", staff()).send({ content: "A public comment" }), 201);
    await expectUnchangedBy("internal note", () =>
      request(app).post(`/api/tickets/${ticketId}/notes`).set("Cookie", staff()).send({ content: "An internal note" }), 201);

    let actionId = 0;
    await expectUnchangedBy("create Action", async () => {
      const r = await api.create(staff(), ticketId, { description: "Action that must not move the clock" });
      actionId = r.body.id;
      return r;
    }, 201);
    await expectUnchangedBy("edit Action", () => api.edit(staff(), actionId, { expectedVersion: 1, description: "Edited action text" }), 200);
    await expectUnchangedBy("Action status", () => api.status(staff(), actionId, { expectedVersion: 2, status: "IN_PROGRESS" }), 200);

    await expectStatusChangeMovesClock("IN_PROGRESS");
  });

  it("leaving WAITING_FOR_REQUESTER and returning starts a new wait; resolving and reopening also move it", async () => {
    const firstWait = await expectStatusChangeMovesClock("WAITING_FOR_REQUESTER");
    await expectStatusChangeMovesClock("IN_PROGRESS");
    const secondWait = await expectStatusChangeMovesClock("WAITING_FOR_REQUESTER");
    expect(secondWait).toBeGreaterThan(firstWait);
    await expectStatusChangeMovesClock("RESOLVED");
    await expectStatusChangeMovesClock("REOPENED");
  });

  it("a rejected transition does not change it", async () => {
    await expectUnchangedBy("invalid transition", () => setStatus("CLOSED"), 400);
  });
});
