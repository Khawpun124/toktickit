import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TicketStatus } from "@prisma/client";
import { getPrisma } from "../../src/prisma.js";
import { AUTO_CANCEL_RESULT } from "../../src/tickets/workflow.js";
import { TICKET_STATUSES, TICKET_TRANSITIONS } from "../../src/tickets/transitions.js";
import { api, createFixture, ticketApi, type Fixture } from "./helpers.js";

/**
 * Issue 4 Ticket workflow (api-spec section 6, BR-16 to BR-22): API-18 to API-27.
 * Users are "ticketwf-..." and every row this file creates is removed in afterAll.
 */
describe("Ticket workflow", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  const staff = () => fx.users.staffA.cookie;

  beforeAll(async () => {
    fx = await createFixture("wf", "ticketwf");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const row = (id: number) => prisma.ticket.findUniqueOrThrow({ where: { id } });
  const actionsOf = (ticketId: number) => prisma.actionTaken.findMany({ where: { ticketId }, orderBy: { id: "asc" } });

  async function addAction(ticketId: number, status: "PLANNED" | "IN_PROGRESS" | "COMPLETED", extra: Record<string, unknown> = {}) {
    const body = { description: `Action ${status.toLowerCase()} for the workflow test`, status, ...(status === "COMPLETED" ? { result: "Finished during the test" } : {}), ...extra };
    const res = await api.create(staff(), ticketId, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as { id: number; version: number };
  }

  // ── API-18 ─────────────────────────────────────────────────────────────

  it("API-18: resolving through the API while an Action is unfinished gives 409 with the count and changes nothing", async () => {
    for (const from of ["IN_PROGRESS", "WAITING_FOR_REQUESTER"] as TicketStatus[]) {
      const id = await fx.createTicket({ status: from });
      await addAction(id, "PLANNED");
      await addAction(id, "IN_PROGRESS");
      await addAction(id, "COMPLETED");
      const before = await row(id);

      const res = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
      expect(res.status, from).toBe(409);
      expect(res.body).toEqual({
        error: "2 unfinished action(s) must be completed or cancelled before this ticket can be resolved.",
        code: "OPEN_ACTIONS_BLOCK_RESOLUTION",
        openActionsCount: 2,
      });
      expect(await row(id)).toEqual(before);
    }
  });

  it("API-18: a pair that is not in the matrix gives 400 INVALID_TRANSITION, not the gate, even with an unfinished Action", async () => {
    for (const from of ["NEW", "OPEN", "REOPENED", "CLOSED"] as TicketStatus[]) {
      const id = await fx.createTicket({ status: from });
      await prisma.actionTaken.create({
        // Inserted directly: the API refuses new Actions on a Closed Ticket, and this case needs one.
        data: { ticketId: id, actionAt: new Date(), description: "Unfinished action", status: "PLANNED", performedById: fx.users.staffA.id, assigneeId: fx.users.staffA.id },
      });
      const before = await row(id);
      const res = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
      expect(res.status, from).toBe(400);
      expect(res.body).toEqual({ error: "Invalid status transition", code: "INVALID_TRANSITION", from, to: "RESOLVED" });
      expect(await row(id)).toEqual(before);
    }
  });

  // ── API-19, API-20 ─────────────────────────────────────────────────────

  it("API-19: once every Action is COMPLETED or CANCELLED (follow-up included), Resolved succeeds and sets resolvedAt", async () => {
    const id = await fx.createTicket({ status: "IN_PROGRESS" });
    const a = await addAction(id, "IN_PROGRESS");
    const b = await addAction(id, "PLANNED");
    await addAction(id, "COMPLETED", { followUpRequired: true, followUpNote: "Check again next week" });
    expect((await api.status(staff(), a.id, { expectedVersion: a.version, status: "COMPLETED", result: "Finished the work" })).status).toBe(200);
    expect((await api.status(staff(), b.id, { expectedVersion: b.version, status: "CANCELLED", result: "Not needed" })).status).toBe(200);

    const before = await row(id);
    const startedAt = Date.now();
    const res = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
    expect(res.status).toBe(200);
    const after = await row(id);
    expect(after.currentStatus).toBe("RESOLVED");
    expect(after.resolvedAt).not.toBeNull();
    expect(after.resolvedAt!.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
    expect(after.version).toBe(before.version + 1);
    expect(res.body).toMatchObject({ currentStatus: "RESOLVED", resolvedAt: after.resolvedAt!.toISOString(), version: after.version, openActionsCount: 0 });
  });

  it("API-20: a Ticket with zero Actions can be resolved", async () => {
    for (const from of ["IN_PROGRESS", "WAITING_FOR_REQUESTER"] as TicketStatus[]) {
      const id = await fx.createTicket({ status: from });
      const res = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
      expect(res.status, from).toBe(200);
      expect((await row(id)).currentStatus).toBe("RESOLVED");
    }
  });

  // ── API-21 ─────────────────────────────────────────────────────────────

  it("API-21: cancelling cancels every PLANNED and IN_PROGRESS Action with the automatic Result and version + 1, and reports the count", async () => {
    const id = await fx.createTicket({ status: "IN_PROGRESS" });
    const planned = await addAction(id, "PLANNED");
    const progress = await addAction(id, "IN_PROGRESS", { result: "Half done" });
    await addAction(id, "COMPLETED");
    const before = await actionsOf(id);

    const res = await ticketApi.status(staff(), id, { newStatus: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.cancelledActionsCount).toBe(2);
    expect(res.body.currentStatus).toBe("CANCELLED");
    expect(res.body.openActionsCount).toBe(0);

    const after = await actionsOf(id);
    for (const a of after) {
      const old = before.find(b => b.id === a.id)!;
      if (a.id === planned.id || a.id === progress.id) {
        expect(a.status).toBe("CANCELLED");
        expect(a.result).toBe(AUTO_CANCEL_RESULT);
        expect(a.version).toBe(old.version + 1);
      } else {
        expect(a).toEqual(old); // the COMPLETED Action is not touched
      }
    }
  });

  it("API-21: a Ticket without unfinished Actions reports cancelledActionsCount 0", async () => {
    const id = await fx.createTicket({ status: "NEW" });
    const res = await ticketApi.status(staff(), id, { newStatus: "CANCELLED" });
    expect(res.status).toBe(200);
    expect(res.body.cancelledActionsCount).toBe(0);
  });

  // ── API-22 ─────────────────────────────────────────────────────────────

  it("API-22: creating a PLANNED Action while resolving the same Ticket, 20 times, always gives one consistent outcome", async () => {
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      const id = await fx.createTicket({ status: "IN_PROGRESS" });
      const [created, resolved] = await Promise.all([
        api.create(staff(), id, { description: `Racing action ${i + 1}`, status: "PLANNED" }),
        ticketApi.status(fx.users.staffB.cookie, id, { newStatus: "RESOLVED" }),
      ]);
      const pair = `create ${created.status}${created.body.code ? " " + created.body.code : ""} / resolve ${resolved.status}${resolved.body.code ? " " + resolved.body.code : ""}`;
      outcomes[pair] = (outcomes[pair] ?? 0) + 1;

      const resolvedFirst = resolved.status === 200 && created.status === 409 && created.body.code === "TICKET_NOT_ACCEPTING_ACTIONS";
      const createdFirst = created.status === 201 && resolved.status === 409 && resolved.body.code === "OPEN_ACTIONS_BLOCK_RESOLUTION";
      expect(resolvedFirst || createdFirst, pair).toBe(true);

      const ticket = await row(id);
      const open = await prisma.actionTaken.count({ where: { ticketId: id, status: { in: ["PLANNED", "IN_PROGRESS"] } } });
      expect(ticket.currentStatus).toBe(resolvedFirst ? "RESOLVED" : "IN_PROGRESS");
      expect(open).toBe(resolvedFirst ? 0 : 1);
      if (ticket.currentStatus === "RESOLVED") expect(open).toBe(0); // BR-14
    }
    console.log("API-22 outcomes:", outcomes);
  });

  // ── API-23 ─────────────────────────────────────────────────────────────

  it("API-23: a stale expectedVersion gives 409 STALE_VERSION with the current header and changes nothing", async () => {
    const id = await fx.createTicket({ status: "OPEN" });
    expect((await ticketApi.priority(staff(), id, { itPriority: "LOW" })).status).toBe(200); // version 2
    const before = await row(id);

    const res = await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS", expectedVersion: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_VERSION");
    expect(res.body.error).toBe("This ticket was changed by someone else. Reload it to see the latest version.");
    expect(res.body.currentVersion).toBe(2);
    expect(res.body.current).toMatchObject({ id, currentStatus: "OPEN", version: 2, itPriority: "LOW" });
    expect(await row(id)).toEqual(before);

    const ok = await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS", expectedVersion: 2 });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(3);
  });

  it("API-23: without expectedVersion the change applies, but the pair and the gate are still checked", async () => {
    const id = await fx.createTicket({ status: "OPEN" });
    const ok = await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS" });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(2);

    const invalid = await ticketApi.status(staff(), id, { newStatus: "CLOSED" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe("INVALID_TRANSITION");

    await addAction(id, "PLANNED");
    const gated = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
    expect(gated.status).toBe(409);
    expect(gated.body.code).toBe("OPEN_ACTIONS_BLOCK_RESOLUTION");
    expect((await row(id)).version).toBe(2);
  });

  it("API-23: a malformed expectedVersion is a 400 VALIDATION_FAILED", async () => {
    const id = await fx.createTicket({ status: "OPEN" });
    for (const expectedVersion of ["1", 0, -1, 1.5, null]) {
      const res = await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS", expectedVersion });
      expect(res.status, String(expectedVersion)).toBe(400);
      expect(res.body).toEqual({ error: "Validation failed", code: "VALIDATION_FAILED", fields: { expectedVersion: "expectedVersion must be a positive integer." } });
    }
    expect((await row(id)).version).toBe(1);
  });

  // ── API-24 ─────────────────────────────────────────────────────────────

  it("API-24: the Requester's flag changes no status and does not lift the gate; Reopened clears resolvedAt and resets the flag", async () => {
    const id = await fx.createTicket({ status: "IN_PROGRESS", requester: "requesterA" });
    const action = await addAction(id, "IN_PROGRESS");
    const before = await row(id);

    const flagged = await ticketApi.flag(fx.users.requesterA.cookie, id);
    expect(flagged.status).toBe(200);
    const afterFlag = await row(id);
    expect(afterFlag.problemAppearsResolved).toBe(true);
    expect(afterFlag.currentStatus).toBe("IN_PROGRESS");
    expect(afterFlag.statusChangedAt).toEqual(before.statusChangedAt);
    expect(afterFlag.version).toBe(before.version + 1); // BR-22: every successful update

    const gated = await ticketApi.status(staff(), id, { newStatus: "RESOLVED" });
    expect(gated.status).toBe(409);
    expect(gated.body.code).toBe("OPEN_ACTIONS_BLOCK_RESOLUTION");

    await api.status(staff(), action.id, { expectedVersion: action.version, status: "COMPLETED", result: "Fixed" });
    expect((await ticketApi.status(staff(), id, { newStatus: "RESOLVED" })).status).toBe(200);
    expect((await row(id)).resolvedAt).not.toBeNull();

    const reopened = await ticketApi.status(staff(), id, { newStatus: "REOPENED" });
    expect(reopened.status).toBe(200);
    const afterReopen = await row(id);
    expect(afterReopen.resolvedAt).toBeNull();
    expect(afterReopen.problemAppearsResolved).toBe(false);
    expect(reopened.body).toMatchObject({ currentStatus: "REOPENED", resolvedAt: null, problemAppearsResolved: false });
  });

  // ── API-25 ─────────────────────────────────────────────────────────────

  const VALID = Object.entries(TICKET_TRANSITIONS).flatMap(([from, tos]) => tos.map(to => [from, to] as [TicketStatus, TicketStatus]));

  it.each(VALID)("API-25: %s -> %s gives 200", async (from, to) => {
    const id = await fx.createTicket({ status: from });
    const res = await ticketApi.status(staff(), id, { newStatus: to });
    expect(res.status).toBe(200);
    expect(res.body.currentStatus).toBe(to);
    expect((await row(id)).currentStatus).toBe(to);
  });

  it("API-25: every pair not in the matrix gives 400 naming the current and requested status, and changes nothing", async () => {
    expect(VALID).toHaveLength(14);
    const valid = new Set(VALID.map(([f, t]) => `${f}->${t}`));
    const invalid = TICKET_STATUSES.flatMap(f => TICKET_STATUSES.map(t => [f, t] as [TicketStatus, TicketStatus]))
      .filter(([f, t]) => !valid.has(`${f}->${t}`));
    expect(invalid).toHaveLength(50);
    for (const [from, to] of invalid) {
      const id = await fx.createTicket({ status: from });
      const before = await row(id);
      const res = await ticketApi.status(staff(), id, { newStatus: to });
      expect(res.status, `${from}->${to}`).toBe(400);
      expect(res.body, `${from}->${to}`).toEqual({ error: "Invalid status transition", code: "INVALID_TRANSITION", from, to });
      expect(await row(id)).toEqual(before);
    }
    const unknown = await ticketApi.status(staff(), await fx.createTicket({ status: "OPEN" }), { newStatus: "DONE" });
    expect(unknown.body).toEqual({ error: "Invalid status transition", code: "INVALID_TRANSITION", from: "OPEN", to: "DONE" });
  });

  // ── API-26 ─────────────────────────────────────────────────────────────

  it("API-26: a \"from\" status claimed by the client is ignored; the stored status decides", async () => {
    const id = await fx.createTicket({ status: "OPEN" });
    const wrongClaim = await ticketApi.status(staff(), id, { newStatus: "CLOSED", from: "RESOLVED", currentStatus: "RESOLVED", fromStatus: "RESOLVED" });
    expect(wrongClaim.status).toBe(400);
    expect(wrongClaim.body.from).toBe("OPEN");
    expect((await row(id)).currentStatus).toBe("OPEN");

    const allowed = await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS", from: "WAITING_FOR_REQUESTER", currentStatus: "CANCELLED" });
    expect(allowed.status).toBe(200);
    expect((await row(id)).currentStatus).toBe("IN_PROGRESS");
  });

  // ── API-27 ─────────────────────────────────────────────────────────────

  it("API-27: owner and IT Priority with a stale expectedVersion give 409 STALE_VERSION and change nothing", async () => {
    const id = await fx.createTicket({ status: "OPEN", owner: "staffA", priority: "MEDIUM" });
    await prisma.ticket.update({ where: { id }, data: { itPriority: "LOW" } });
    expect((await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS" })).status).toBe(200); // version 2
    const before = await row(id);

    const owner = await ticketApi.owner(staff(), id, { ticketOwnerId: fx.users.staffB.id, expectedVersion: 1 });
    expect(owner.status).toBe(409);
    expect(owner.body).toMatchObject({ code: "STALE_VERSION", currentVersion: 2, current: { id, ticketOwnerId: fx.users.staffA.id, version: 2 } });
    const priority = await ticketApi.priority(staff(), id, { itPriority: "HIGH", expectedVersion: 1 });
    expect(priority.status).toBe(409);
    expect(priority.body).toMatchObject({ code: "STALE_VERSION", currentVersion: 2, current: { itPriority: "LOW" } });
    expect(await row(id)).toEqual(before);

    const ownerOk = await ticketApi.owner(staff(), id, { ticketOwnerId: fx.users.staffB.id, expectedVersion: 2 });
    expect(ownerOk.status).toBe(200);
    expect(ownerOk.body).toMatchObject({ ticketOwnerId: fx.users.staffB.id, ticketOwnerName: fx.users.staffB.name, version: 3 });
    const priorityOk = await ticketApi.priority(staff(), id, { itPriority: "HIGH" }); // without expectedVersion: Lab 3 behavior
    expect(priorityOk.status).toBe(200);
    expect(priorityOk.body).toMatchObject({ itPriority: "HIGH", version: 4 });
  });

  // ── Independence of status, owner, and priority ───────────────────────

  it("API-27: a status change keeps owner and IT Priority; owner and IT Priority changes keep the status and statusChangedAt", async () => {
    const id = await fx.createTicket({ status: "OPEN", owner: "staffA" });
    await prisma.ticket.update({ where: { id }, data: { itPriority: "HIGH" } });

    expect((await ticketApi.status(staff(), id, { newStatus: "IN_PROGRESS" })).status).toBe(200);
    const afterStatus = await row(id);
    expect(afterStatus.ticketOwnerId).toBe(fx.users.staffA.id);
    expect(afterStatus.itPriority).toBe("HIGH");

    expect((await ticketApi.owner(staff(), id, { ticketOwnerId: fx.users.admin.id })).status).toBe(200);
    expect((await ticketApi.priority(staff(), id, { itPriority: "LOW" })).status).toBe(200);
    const afterFields = await row(id);
    expect(afterFields.currentStatus).toBe("IN_PROGRESS");
    expect(afterFields.statusChangedAt).toEqual(afterStatus.statusChangedAt);
    expect(afterFields.resolvedAt).toEqual(afterStatus.resolvedAt);
    expect(afterFields.ticketOwnerId).toBe(fx.users.admin.id);
    expect(afterFields.itPriority).toBe("LOW");
    expect(afterFields.version).toBe(afterStatus.version + 2);
  });

  it("API-27: owner and IT Priority stay editable on Closed and Cancelled Tickets (no new server rule)", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as TicketStatus[]) {
      const id = await fx.createTicket({ status });
      expect((await ticketApi.owner(staff(), id, { ticketOwnerId: fx.users.staffA.id })).status, status).toBe(200);
      expect((await ticketApi.priority(staff(), id, { itPriority: "HIGH" })).status, status).toBe(200);
      expect((await row(id)).currentStatus).toBe(status);
    }
  });
});
