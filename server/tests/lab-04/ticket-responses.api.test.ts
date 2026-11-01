import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { api, createFixture, ticketApi, type Fixture } from "./helpers.js";

/**
 * API-39 (api-spec section 6, "Additive response fields"): Ticket responses gain version, resolvedAt,
 * statusChangedAt (and openActionsCount on the staff detail and the Ticket header); every earlier
 * field is unchanged.
 */
describe("API-39: Ticket responses", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;

  const LAB3_REQUESTER_DETAIL = [
    "id", "ticketNumber", "requesterId", "categoryName", "relatedSystemName", "summary", "description",
    "requestedPriority", "itPriority", "currentStatus", "createdAt", "updatedAt",
  ];
  const LAB3_STAFF_DETAIL = [
    "id", "ticketNumber", "requesterId", "requesterName", "requesterEmail", "categoryId", "categoryName",
    "relatedSystemId", "relatedSystemName", "summary", "description", "requestedPriority", "itPriority",
    "currentStatus", "problemAppearsResolved", "ticketOwnerId", "ticketOwnerName", "createdAt", "updatedAt",
  ];
  const WORKFLOW = ["version", "resolvedAt", "statusChangedAt"];
  const HEADER = [
    "id", "currentStatus", "itPriority", "ticketOwnerId", "ticketOwnerName", "problemAppearsResolved",
    "version", "resolvedAt", "statusChangedAt", "openActionsCount",
  ];

  beforeAll(async () => {
    fx = await createFixture("resp", "ticketwf");
    ticketId = await fx.createTicket({ status: "IN_PROGRESS", owner: "staffA", requester: "requesterA" });
    await api.create(fx.users.staffA.cookie, ticketId, { description: "Open action for the count", status: "PLANNED" });
    await api.create(fx.users.staffA.cookie, ticketId, { description: "Finished action", status: "COMPLETED", result: "All done" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  it("API-39: GET /api/tickets/:id keeps every Lab 3 field and adds version, resolvedAt, statusChangedAt", async () => {
    const res = await ticketApi.detail(fx.users.requesterA.cookie, ticketId);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...LAB3_REQUESTER_DETAIL, ...WORKFLOW].sort());
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(res.body).toMatchObject({
      id: t.id, ticketNumber: t.ticketNumber, currentStatus: "IN_PROGRESS",
      version: t.version, resolvedAt: null, statusChangedAt: t.statusChangedAt.toISOString(),
      createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString(),
    });
  });

  it("API-39: GET /api/staff/tickets/:id keeps every Lab 3 field and adds the workflow fields and openActionsCount", async () => {
    const res = await ticketApi.staffDetail(fx.users.staffA.cookie, ticketId);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([...LAB3_STAFF_DETAIL, ...WORKFLOW, "openActionsCount"].sort());
    expect(res.body.openActionsCount).toBe(1);
    expect(res.body.ticketOwnerId).toBe(fx.users.staffA.id);
    expect(res.body.ticketOwnerName).toBe(fx.users.staffA.name);
  });

  it("API-39: status, owner, and priority return the Ticket header (their Lab 3 fields included) and no comments, notes, or attachments", async () => {
    const staff = fx.users.staffA.cookie;
    const owner = await ticketApi.owner(staff, ticketId, { ticketOwnerId: fx.users.staffB.id });
    const priority = await ticketApi.priority(staff, ticketId, { itPriority: "HIGH" });
    const status = await ticketApi.status(staff, ticketId, { newStatus: "WAITING_FOR_REQUESTER" });
    for (const [name, res] of [["owner", owner], ["priority", priority], ["status", status]] as const) {
      expect(res.status, name).toBe(200);
      expect(Object.keys(res.body).sort(), name).toEqual([...HEADER].sort());
    }
    // Lab 3 fields of each endpoint, with the values they had in Lab 3.
    expect(owner.body).toMatchObject({ id: ticketId, ticketOwnerId: fx.users.staffB.id, ticketOwnerName: fx.users.staffB.name });
    expect(priority.body).toMatchObject({ id: ticketId, itPriority: "HIGH" });
    expect(status.body).toMatchObject({ id: ticketId, currentStatus: "WAITING_FOR_REQUESTER" });
    expect(status.body).toMatchObject({ itPriority: "HIGH", ticketOwnerId: fx.users.staffB.id, openActionsCount: 1 });
    expect([owner.body.version, priority.body.version, status.body.version]).toEqual([
      owner.body.version, owner.body.version + 1, owner.body.version + 2,
    ]);
  });

  it("API-39: a cancel adds cancelledActionsCount; a STALE_VERSION body carries the same header", async () => {
    const id = await fx.createTicket({ status: "OPEN" });
    const stale = await ticketApi.status(fx.users.staffA.cookie, id, { newStatus: "CANCELLED", expectedVersion: 9 });
    expect(stale.status).toBe(409);
    expect(Object.keys(stale.body).sort()).toEqual(["code", "current", "currentVersion", "error"]);
    expect(Object.keys(stale.body.current).sort()).toEqual([...HEADER].sort());

    const cancelled = await ticketApi.status(fx.users.staffA.cookie, id, { newStatus: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    expect(Object.keys(cancelled.body).sort()).toEqual([...HEADER, "cancelledActionsCount"].sort());
  });
});
