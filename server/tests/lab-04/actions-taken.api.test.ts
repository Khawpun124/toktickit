import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { MESSAGES } from "../../src/actions/validation.js";
import { api, createFixture, uuid, type Fixture } from "./helpers.js";

/** Actions Taken API (API-01 to API-17, API-40). Runs against the dev database and removes its data. */
describe("Actions Taken API (API-01 to API-17, API-40)", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  const HOUR = 3600_000;
  const DAY = 24 * HOUR;

  beforeAll(async () => {
    fx = await createFixture("actions");
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const staff = () => fx.users.staffA.cookie;
  const valid = (extra: Record<string, unknown> = {}) => ({ description: "Checked the network cable", ...extra });

  async function createAction(ticketId: number, extra: Record<string, unknown> = {}, cookie = staff()) {
    const res = await api.create(cookie, ticketId, valid(extra));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body;
  }

  const RESOURCE_KEYS = [
    "actionAt", "assignee", "attachmentNotes", "createdAt", "description", "followUpNote", "followUpRequired",
    "id", "performedBy", "result", "status", "ticketId", "updatedAt", "version",
  ];

  it("API-01: staff creates a valid Action: 201, stored under the Ticket, performed-by is the session user, assignee saved", async () => {
    const ticketId = await fx.createTicket();
    const res = await api.create(staff(), ticketId, valid({ assigneeId: fx.users.staffB.id, clientRequestId: uuid() }));
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(RESOURCE_KEYS);
    expect(res.body).toMatchObject({
      ticketId,
      status: "PLANNED",
      version: 1,
      performedBy: { id: fx.users.staffA.id, name: fx.users.staffA.name },
      assignee: { id: fx.users.staffB.id, name: fx.users.staffB.name, isActive: true },
    });
    expect(JSON.stringify(res.body)).not.toContain("@");
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: res.body.id } });
    expect([row.ticketId, row.performedById, row.assigneeId]).toEqual([ticketId, fx.users.staffA.id, fx.users.staffB.id]);
  });

  it("API-01: the assignee defaults to the creator", async () => {
    const ticketId = await fx.createTicket();
    const body = await createAction(ticketId);
    expect(body.assignee.id).toBe(fx.users.staffA.id);
  });

  it("API-02: a Requester cannot create an Action: 403, no row written", async () => {
    const ticketId = await fx.createTicket({ requester: "requesterA" });
    const res = await api.create(fx.users.requesterA.cookie, ticketId, valid());
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(0);
  });

  it("API-03: a Requester cannot edit or change the status of an Action: 403, data unchanged", async () => {
    const ticketId = await fx.createTicket({ requester: "requesterA" });
    const action = await createAction(ticketId);
    const edit = await api.edit(fx.users.requesterA.cookie, action.id, { expectedVersion: 1, description: "Requester edit attempt" });
    const status = await api.status(fx.users.requesterA.cookie, action.id, { expectedVersion: 1, status: "IN_PROGRESS" });
    expect([edit.status, status.status]).toEqual([403, 403]);
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: action.id } });
    expect([row.description, row.status, row.version]).toEqual([action.description, "PLANNED", 1]);
  });

  it("API-04: a Requester lists the Actions of their own Ticket with all fields", async () => {
    const ticketId = await fx.createTicket({ requester: "requesterA" });
    const a1 = await createAction(ticketId, { result: "First result text" });
    const a2 = await createAction(ticketId, { followUpRequired: true, followUpNote: "Call back tomorrow", attachmentNotes: "See the photo" });
    const res = await api.list(fx.users.requesterA.cookie, ticketId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([a1, a2]);
    for (const a of res.body) expect(Object.keys(a).sort()).toEqual(RESOURCE_KEYS);
  });

  it("API-05: listing another Requester's Ticket gives 404, identical to a missing Ticket", async () => {
    const otherTicket = await fx.createTicket({ requester: "requesterB" });
    await createAction(otherTicket);
    const other = await api.list(fx.users.requesterA.cookie, otherTicket);
    const missing = await api.list(fx.users.requesterA.cookie, 2147483000);
    expect(other.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(other.body).toEqual({ error: "Ticket not found", code: "NOT_FOUND" });
    expect(missing.body).toEqual(other.body);
  });

  describe("API-06: follow-up rules", () => {
    it("follow-up required without a note: 400 on followUpNote", async () => {
      const ticketId = await fx.createTicket();
      const res = await api.create(staff(), ticketId, valid({ followUpRequired: true }));
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION_FAILED", fields: { followUpNote: MESSAGES.followUpNoteRequired } });
    });
    it("create with follow-up false and a note: the note is discarded", async () => {
      const ticketId = await fx.createTicket();
      const body = await createAction(ticketId, { followUpRequired: false, followUpNote: "Should be dropped" });
      expect(body.followUpNote).toBeNull();
    });
    it("PATCH whose body sets follow-up false with a note: the note is dropped", async () => {
      const ticketId = await fx.createTicket();
      const a = await createAction(ticketId, { followUpRequired: true, followUpNote: "Original note" });
      const res = await api.edit(staff(), a.id, { expectedVersion: 1, followUpRequired: false, followUpNote: "Another note" });
      expect(res.status).toBe(200);
      expect([res.body.followUpRequired, res.body.followUpNote]).toEqual([false, null]);
    });
    it("PATCH that sends only a note while the stored follow-up is false: 400 on followUpNote", async () => {
      const ticketId = await fx.createTicket();
      const a = await createAction(ticketId);
      const res = await api.edit(staff(), a.id, { expectedVersion: 1, followUpNote: "A note without follow-up" });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "VALIDATION_FAILED", fields: { followUpNote: MESSAGES.followUpNoteWithoutFollowUp } });
      expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(1);
    });
  });

  it("API-07: an inactive, Requester, or unknown assignee gives a field-level 400 on create and edit", async () => {
    const ticketId = await fx.createTicket();
    const a = await createAction(ticketId);
    for (const assigneeId of [fx.users.inactiveStaff.id, fx.users.requesterA.id, 2147483000]) {
      const create = await api.create(staff(), ticketId, valid({ assigneeId }));
      expect(create.status, `create ${assigneeId}`).toBe(400);
      expect(create.body).toMatchObject({ code: "VALIDATION_FAILED", fields: { assigneeId: MESSAGES.assigneeId } });
      const edit = await api.edit(staff(), a.id, { expectedVersion: 1, assigneeId });
      expect(edit.status, `edit ${assigneeId}`).toBe(400);
      expect(edit.body.fields.assigneeId).toBe(MESSAGES.assigneeId);
    }
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(1);
  });

  it("API-08: performedBy, version, createdAt, and updatedAt in the body are ignored", async () => {
    const ticketId = await fx.createTicket();
    const before = Date.now();
    const body = await createAction(ticketId, {
      performedBy: fx.users.staffB.id, performedById: fx.users.staffB.id,
      version: 9, createdAt: "2000-01-01T00:00:00.000Z", updatedAt: "2000-01-01T00:00:00.000Z",
    });
    expect(body.performedBy.id).toBe(fx.users.staffA.id);
    expect(body.version).toBe(1);
    expect(new Date(body.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("API-09: edit or status change on a terminal Action gives 409 ACTION_TERMINAL; an invalid pair gives 400 INVALID_TRANSITION", async () => {
    const ticketId = await fx.createTicket();
    const done = await createAction(ticketId, { status: "COMPLETED", result: "Already finished" });
    const edit = await api.edit(staff(), done.id, { expectedVersion: 1, description: "Change after completion" });
    const status = await api.status(staff(), done.id, { expectedVersion: 1, status: "CANCELLED", result: "Too late now" });
    for (const r of [edit, status]) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe("ACTION_TERMINAL");
    }
    const started = await createAction(ticketId, { status: "IN_PROGRESS" });
    const back = await api.status(staff(), started.id, { expectedVersion: 1, status: "PLANNED" });
    expect(back.status).toBe(400);
    expect(back.body).toEqual({ error: "Invalid status transition", code: "INVALID_TRANSITION", from: "IN_PROGRESS", to: "PLANNED" });
  });

  it("API-10: Result is required to complete, to cancel, and to create as COMPLETED; not for PLANNED or IN_PROGRESS", async () => {
    const ticketId = await fx.createTicket();
    const a = await createAction(ticketId);
    const complete = await api.status(staff(), a.id, { expectedVersion: 1, status: "COMPLETED" });
    expect(complete.status).toBe(400);
    expect(complete.body.fields.result).toBe(MESSAGES.resultRequiredComplete);
    const cancel = await api.status(staff(), a.id, { expectedVersion: 1, status: "CANCELLED" });
    expect(cancel.status).toBe(400);
    expect(cancel.body.fields.result).toBe(MESSAGES.resultRequiredCancel);
    const create = await api.create(staff(), ticketId, valid({ status: "COMPLETED" }));
    expect(create.status).toBe(400);
    expect(create.body.fields.result).toBe(MESSAGES.resultRequiredCreate);
    for (const status of ["PLANNED", "IN_PROGRESS"]) {
      expect((await api.create(staff(), ticketId, valid({ status }))).status, status).toBe(201);
    }
  });

  it("API-11: there is no DELETE route; the list order does not change after editing an early Action", async () => {
    const ticketId = await fx.createTicket();
    const first = await createAction(ticketId);
    const second = await createAction(ticketId);
    const del = await request(app).delete(`/api/staff/actions/${first.id}`).set("Cookie", staff());
    expect([404, 405]).toContain(del.status);
    const delTicketScoped = await request(app).delete(`/api/tickets/${ticketId}/actions/${first.id}`).set("Cookie", staff());
    expect([404, 405]).toContain(delTicketScoped.status);
    expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(2);

    expect((await api.edit(staff(), first.id, { expectedVersion: 1, description: "Edited first action" })).status).toBe(200);
    const list = await api.list(staff(), ticketId);
    expect(list.body.map((a: { id: number }) => a.id)).toEqual([first.id, second.id]);
  });

  it("API-12: a stale expectedVersion gives 409 STALE_VERSION with the current state; a missing one gives 400", async () => {
    const ticketId = await fx.createTicket();
    const a = await createAction(ticketId);
    expect((await api.edit(staff(), a.id, { expectedVersion: 1, description: "Newer description" })).status).toBe(200);
    for (const r of [
      await api.edit(fx.users.staffB.cookie, a.id, { expectedVersion: 1, description: "Older description" }),
      await api.status(fx.users.staffB.cookie, a.id, { expectedVersion: 1, status: "IN_PROGRESS" }),
    ]) {
      expect(r.status).toBe(409);
      expect(r.body).toMatchObject({ code: "STALE_VERSION", currentVersion: 2, current: { id: a.id, version: 2, description: "Newer description" } });
      expect(Object.keys(r.body.current).sort()).toEqual(RESOURCE_KEYS);
    }
    const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } });
    expect([row.description, row.status, row.version]).toEqual(["Newer description", "PLANNED", 2]);

    for (const r of [
      await api.edit(staff(), a.id, { description: "No version given" }),
      await api.status(staff(), a.id, { status: "IN_PROGRESS" }),
    ]) {
      expect(r.status).toBe(400);
      expect(r.body.fields.expectedVersion).toBe(MESSAGES.expectedVersion);
    }
  });

  it("API-12: two parallel PATCH requests with the same expectedVersion: one 200, one 409 STALE_VERSION", async () => {
    const ticketId = await fx.createTicket();
    for (let i = 0; i < 5; i++) {
      const a = await createAction(ticketId);
      const [r1, r2] = await Promise.all([
        api.edit(staff(), a.id, { expectedVersion: 1, description: `Parallel edit A ${i}` }),
        api.edit(fx.users.staffB.cookie, a.id, { expectedVersion: 1, description: `Parallel edit B ${i}` }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect([r1, r2].find(r => r.status === 409)!.body.code).toBe("STALE_VERSION");
      expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(2);
    }
  });

  describe("API-13: idempotency with clientRequestId", () => {
    it("the same clientRequestId twice: one row, the second response is 200 with the original", async () => {
      const ticketId = await fx.createTicket();
      const key = uuid();
      const first = await api.create(staff(), ticketId, valid({ clientRequestId: key }));
      const second = await api.create(staff(), ticketId, valid({ clientRequestId: key, description: "Different text" }));
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(second.body).toEqual(first.body);
      expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(1);
    });
    it("two parallel requests with the same clientRequestId leave one row (repeated 10 times)", async () => {
      const ticketId = await fx.createTicket();
      for (let i = 0; i < 10; i++) {
        const key = uuid();
        const [r1, r2] = await Promise.all([
          api.create(staff(), ticketId, valid({ clientRequestId: key })),
          api.create(staff(), ticketId, valid({ clientRequestId: key })),
        ]);
        expect([r1.status, r2.status].sort()).toEqual([200, 201]);
        expect(r1.body.id).toBe(r2.body.id);
        expect(await prisma.actionTaken.count({ where: { clientRequestId: key } })).toBe(1);
      }
    });
    it("an upper-case UUID followed by the same UUID in lower case is a replay", async () => {
      const ticketId = await fx.createTicket();
      const key = uuid();
      const first = await api.create(staff(), ticketId, valid({ clientRequestId: key.toUpperCase() }));
      const second = await api.create(staff(), ticketId, valid({ clientRequestId: key.toLowerCase() }));
      expect([first.status, second.status]).toEqual([201, 200]);
      expect(second.body.id).toBe(first.body.id);
    });
    it("another user sending the same id is not a replay", async () => {
      const ticketId = await fx.createTicket();
      const key = uuid();
      const mine = await api.create(staff(), ticketId, valid({ clientRequestId: key }));
      const theirs = await api.create(fx.users.staffB.cookie, ticketId, valid({ clientRequestId: key }));
      expect([mine.status, theirs.status]).toEqual([201, 201]);
      expect(theirs.body.id).not.toBe(mine.body.id);
      expect(theirs.body.performedBy.id).toBe(fx.users.staffB.id);
    });
    it("the same id for another Ticket gives 400 on clientRequestId", async () => {
      const t1 = await fx.createTicket();
      const t2 = await fx.createTicket();
      const key = uuid();
      await createAction(t1, { clientRequestId: key });
      const res = await api.create(staff(), t2, valid({ clientRequestId: key }));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_FAILED");
      expect(Object.keys(res.body.fields)).toEqual(["clientRequestId"]);
      expect(await prisma.actionTaken.count({ where: { ticketId: t2 } })).toBe(0);
    });
    it("a replay is 200 even when this request's body is invalid or the Ticket has since been resolved", async () => {
      const ticketId = await fx.createTicket({ status: "IN_PROGRESS" });
      const key = uuid();
      const first = await createAction(ticketId, { clientRequestId: key, status: "COMPLETED", result: "Fixed it" });
      const invalid = await api.create(staff(), ticketId, { clientRequestId: key, description: "x" });
      expect(invalid.status).toBe(200);
      expect(invalid.body).toEqual(first);
      await prisma.ticket.update({ where: { id: ticketId }, data: { currentStatus: "RESOLVED" } });
      const afterResolve = await api.create(staff(), ticketId, valid({ clientRequestId: key }));
      expect(afterResolve.status).toBe(200);
      expect(afterResolve.body).toEqual(first);
    });
  });

  it("API-14: creating on a RESOLVED, CLOSED, or CANCELLED Ticket gives 409 TICKET_NOT_ACCEPTING_ACTIONS", async () => {
    for (const status of ["RESOLVED", "CLOSED", "CANCELLED"] as const) {
      const ticketId = await fx.createTicket({ status });
      const res = await api.create(staff(), ticketId, valid());
      expect(res.status, status).toBe(409);
      expect(res.body).toEqual({
        error: "This ticket no longer accepts actions. Reopen it first.",
        code: "TICKET_NOT_ACCEPTING_ACTIONS",
        ticketStatus: status,
      });
      expect(await prisma.actionTaken.count({ where: { ticketId } })).toBe(0);
    }
    for (const status of ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] as const) {
      const ticketId = await fx.createTicket({ status });
      expect((await api.create(staff(), ticketId, valid())).status, status).toBe(201);
    }
  });

  it("API-15: actionAt through the API: future COMPLETED rejected, PLANNED within 30 days accepted", async () => {
    const ticketId = await fx.createTicket();
    const future = new Date(Date.now() + HOUR).toISOString();
    const completed = await api.create(staff(), ticketId, valid({ status: "COMPLETED", result: "Done already", actionAt: future }));
    expect(completed.status).toBe(400);
    expect(completed.body.fields.actionAt).toBe(MESSAGES.actionAtInProgress);
    const planned = await api.create(staff(), ticketId, valid({ actionAt: new Date(Date.now() + 29 * DAY).toISOString() }));
    expect(planned.status).toBe(201);
    const tooFar = await api.create(staff(), ticketId, valid({ actionAt: new Date(Date.now() + 31 * DAY).toISOString() }));
    expect(tooFar.status).toBe(400);
    expect(tooFar.body.fields.actionAt).toBe(MESSAGES.actionAtPlanned);
    // Moving a planned future Action to IN_PROGRESS re-checks actionAt.
    const start = await api.status(staff(), planned.body.id, { expectedVersion: 1, status: "IN_PROGRESS" });
    expect(start.status).toBe(400);
    expect(start.body.fields.actionAt).toBe(MESSAGES.actionAtInProgress);
  });

  it("API-16: staff who is not the owner can create, and so can staff on a Ticket with no owner", async () => {
    const owned = await fx.createTicket({ owner: "staffA" });
    const unowned = await fx.createTicket({ owner: null });
    expect((await api.create(fx.users.staffB.cookie, owned, valid())).status).toBe(201);
    expect((await api.create(fx.users.staffB.cookie, unowned, valid())).status).toBe(201);
    expect((await api.create(fx.users.admin.cookie, unowned, valid())).status).toBe(201);
  });

  it("API-17: edit, then PLANNED -> IN_PROGRESS -> COMPLETED, each success increments version; the final state is read-only", async () => {
    const ticketId = await fx.createTicket();
    const a = await createAction(ticketId);
    const edited = await api.edit(staff(), a.id, { expectedVersion: 1, description: "Edited before starting", result: "Partial result" });
    expect([edited.status, edited.body.version]).toEqual([200, 2]);
    const started = await api.status(staff(), a.id, { expectedVersion: 2, status: "IN_PROGRESS" });
    expect([started.status, started.body.status, started.body.version]).toEqual([200, "IN_PROGRESS", 3]);
    const done = await api.status(staff(), a.id, { expectedVersion: 3, status: "COMPLETED" });
    expect([done.status, done.body.status, done.body.version, done.body.result]).toEqual([200, "COMPLETED", 4, "Partial result"]);
    expect((await api.edit(staff(), a.id, { expectedVersion: 4, description: "After completion" })).status).toBe(409);
  });

  it("API-17: create directly as IN_PROGRESS or COMPLETED (with a Result); creating as CANCELLED gives 400", async () => {
    const ticketId = await fx.createTicket();
    expect((await createAction(ticketId, { status: "IN_PROGRESS" })).status).toBe("IN_PROGRESS");
    expect((await createAction(ticketId, { status: "COMPLETED", result: "Fixed on the spot" })).status).toBe("COMPLETED");
    const cancelled = await api.create(staff(), ticketId, valid({ status: "CANCELLED", result: "Never started" }));
    expect(cancelled.status).toBe(400);
    expect(cancelled.body.fields.status).toBe(MESSAGES.createCancelled);
  });

  it("API-17: cancelling with a reason stores it as the Result", async () => {
    const ticketId = await fx.createTicket();
    const a = await createAction(ticketId);
    const res = await api.status(staff(), a.id, { expectedVersion: 1, status: "CANCELLED", result: "No longer needed" });
    expect([res.status, res.body.status, res.body.result, res.body.version]).toEqual([200, "CANCELLED", "No longer needed", 2]);
  });

  describe("API-40: the edit endpoint rejects status and ticketId, and requests with no changes", () => {
    it("status or ticketId in the body: 400 pointing to the status endpoint", async () => {
      const ticketId = await fx.createTicket();
      const a = await createAction(ticketId);
      const withStatus = await api.edit(staff(), a.id, { expectedVersion: 1, status: "COMPLETED" });
      const withTicket = await api.edit(staff(), a.id, { expectedVersion: 1, ticketId: ticketId + 1 });
      expect(withStatus.status).toBe(400);
      expect(withStatus.body).toMatchObject({ code: "VALIDATION_FAILED", fields: { status: MESSAGES.editStatus } });
      expect(withStatus.body.fields.status).toContain("/api/staff/actions/:actionId/status");
      expect(withTicket.status).toBe(400);
      expect(withTicket.body.fields.ticketId).toBe(MESSAGES.editTicketId);
      const row = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } });
      expect([row.status, row.ticketId, row.version]).toEqual(["PLANNED", ticketId, 1]);
    });
    it("a body with no editable field, or with only unchanged values: 400 'No changes supplied', nothing changed", async () => {
      const ticketId = await fx.createTicket();
      const a = await createAction(ticketId);
      const empty = await api.edit(staff(), a.id, { expectedVersion: 1 });
      const same = await api.edit(staff(), a.id, { expectedVersion: 1, description: a.description, assigneeId: a.assignee.id });
      for (const r of [empty, same]) {
        expect(r.status).toBe(400);
        expect(r.body).toEqual({ error: "No changes supplied", code: "VALIDATION_FAILED" });
      }
      expect((await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id } })).version).toBe(1);
    });
  });

  it("creating, editing, and changing the status of Actions never changes the Ticket's updatedAt, statusChangedAt, or version", async () => {
    const ticketId = await fx.createTicket();
    const before = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const a = await createAction(ticketId);
    await api.edit(staff(), a.id, { expectedVersion: 1, description: "Edited to check the Ticket" });
    await api.status(staff(), a.id, { expectedVersion: 2, status: "IN_PROGRESS" });
    await api.status(staff(), a.id, { expectedVersion: 3, status: "COMPLETED", result: "Finished the work" });
    const after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.statusChangedAt.getTime()).toBe(before.statusChangedAt.getTime());
    expect(after.version).toBe(before.version);
  });

  it("the list is ordered by createdAt ascending, then id ascending, for staff and administrators on any Ticket", async () => {
    const ticketId = await fx.createTicket({ requester: "requesterB" });
    const created = [];
    for (let i = 0; i < 3; i++) created.push((await createAction(ticketId)).id);
    // Same createdAt for two rows: the tiebreaker is id ascending.
    const tie = new Date("2026-01-01T00:00:00.000Z");
    await prisma.actionTaken.updateMany({ where: { id: { in: [created[1], created[2]] } }, data: { createdAt: tie } });
    for (const cookie of [staff(), fx.users.admin.cookie]) {
      const res = await api.list(cookie, ticketId);
      expect(res.status).toBe(200);
      expect(res.body.map((a: { id: number }) => a.id)).toEqual([created[1], created[2], created[0]]);
    }
  });
});
