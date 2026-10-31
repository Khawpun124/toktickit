import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPrisma } from "../../src/prisma.js";
import { MESSAGES } from "../../src/actions/validation.js";
import { api, createFixture, missingId, uuid, type Fixture } from "./helpers.js";

/**
 * API-42 (Actions endpoints): requests that break several rules at once. The first failing
 * check in the order of api-spec section 0 decides the response:
 * 401, 403 PASSWORD_CHANGE_REQUIRED, 403 FORBIDDEN, 404, 4a replay (create only),
 * 400 request, 409, 400 stored state.
 */
describe("API-42: check order of the Actions Taken endpoints", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let openTicket: number;
  let resolvedTicket: number;
  let terminalAction: number;   // COMPLETED, version 1
  let plannedAction: number;    // PLANNED, version 2 after one edit
  let freshAction: number;      // PLANNED, version 1
  let noAction: number;
  let noTicket: number;
  let replayKey: string;
  let replayed: { id: number };
  let actionsBefore: unknown;
  // Filled in beforeAll; the cases below read it only when they run.
  const u = {} as Fixture["users"];

  beforeAll(async () => {
    fx = await createFixture("order");
    const staff = fx.users.staffA.cookie;
    openTicket = await fx.createTicket({ status: "IN_PROGRESS" });
    resolvedTicket = await fx.createTicket({ status: "IN_PROGRESS" });

    terminalAction = (await api.create(staff, openTicket, { description: "Finished work", status: "COMPLETED", result: "All done" })).body.id;
    plannedAction = (await api.create(staff, openTicket, { description: "Planned work" })).body.id;
    await api.edit(staff, plannedAction, { expectedVersion: 1, description: "Planned work, edited" });
    freshAction = (await api.create(staff, openTicket, { description: "Fresh planned work" })).body.id;

    replayKey = uuid();
    replayed = (await api.create(staff, resolvedTicket, { description: "Work before resolving", clientRequestId: replayKey, status: "COMPLETED", result: "Resolved it" })).body;
    await prisma.ticket.update({ where: { id: resolvedTicket }, data: { currentStatus: "RESOLVED" } });

    noAction = await missingId("actionTaken");
    noTicket = await missingId("ticket");
    Object.assign(u, fx.users);
    actionsBefore = await snapshotActions();
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  type Case = { name: string; send: () => Promise<{ status: number; body: any }>; status: number; code: string; check?: (body: any) => void };
  const invalidEdit = { expectedVersion: 1, description: "x" };   // description too short
  const cases: Case[] = [
      // ── PATCH /api/staff/actions/:actionId ──
      { name: "edit: no session beats everything", send: () => api.edit("", noAction, invalidEdit), status: 401, code: "UNAUTHENTICATED" },
      { name: "edit: password change required beats wrong role and missing Action", send: () => api.edit(u.mustChangeRequester.cookie, noAction, invalidEdit), status: 403, code: "PASSWORD_CHANGE_REQUIRED" },
      { name: "edit: wrong role beats missing Action", send: () => api.edit(u.requesterA.cookie, noAction, invalidEdit), status: 403, code: "FORBIDDEN" },
      { name: "edit: missing Action beats invalid body", send: () => api.edit(u.staffA.cookie, noAction, invalidEdit), status: 404, code: "NOT_FOUND" },
      { name: "edit: invalid body beats terminal and stale", send: () => api.edit(u.staffA.cookie, terminalAction, { expectedVersion: 7, description: "x" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.description).toBe(MESSAGES.description) },
      { name: "edit: no editable field (step 5) beats terminal", send: () => api.edit(u.staffA.cookie, terminalAction, { expectedVersion: 7 }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.error).toBe(MESSAGES.noChanges) },
      { name: "edit: terminal beats stale", send: () => api.edit(u.staffA.cookie, terminalAction, { expectedVersion: 7, description: "Valid new text" }), status: 409, code: "ACTION_TERMINAL" },
      { name: "edit: stale beats unchanged values (step 7)", send: () => api.edit(u.staffA.cookie, plannedAction, { expectedVersion: 1, description: "Planned work, edited" }), status: 409, code: "STALE_VERSION" },
      { name: "edit: stale beats a stored-state follow-up error", send: () => api.edit(u.staffA.cookie, plannedAction, { expectedVersion: 1, followUpNote: "Note without follow-up" }), status: 409, code: "STALE_VERSION" },
      { name: "edit: unchanged values with the right version (step 7)", send: () => api.edit(u.staffA.cookie, plannedAction, { expectedVersion: 2, description: "Planned work, edited" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.error).toBe(MESSAGES.noChanges) },
      { name: "edit: invalid assignee (step 5) beats terminal", send: () => api.edit(u.staffA.cookie, terminalAction, { expectedVersion: 1, assigneeId: u.requesterA.id }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.assigneeId).toBe(MESSAGES.assigneeId) },

      // ── PATCH /api/staff/actions/:actionId/status ──
      { name: "status: no session", send: () => api.status("", noAction, { status: "DONE" }), status: 401, code: "UNAUTHENTICATED" },
      { name: "status: password change required beats wrong role", send: () => api.status(u.mustChangeRequester.cookie, noAction, { status: "DONE" }), status: 403, code: "PASSWORD_CHANGE_REQUIRED" },
      { name: "status: wrong role beats missing Action", send: () => api.status(u.requesterA.cookie, noAction, { status: "DONE" }), status: 403, code: "FORBIDDEN" },
      { name: "status: missing Action beats invalid body", send: () => api.status(u.staffA.cookie, noAction, { status: "DONE" }), status: 404, code: "NOT_FOUND" },
      { name: "status: unknown status value beats terminal", send: () => api.status(u.staffA.cookie, terminalAction, { expectedVersion: 7, status: "DONE" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.status).toBe(MESSAGES.status) },
      { name: "status: terminal beats stale and an invalid pair", send: () => api.status(u.staffA.cookie, terminalAction, { expectedVersion: 7, status: "PLANNED" }), status: 409, code: "ACTION_TERMINAL" },
      { name: "status: stale beats an invalid pair", send: () => api.status(u.staffA.cookie, plannedAction, { expectedVersion: 1, status: "PLANNED" }), status: 409, code: "STALE_VERSION" },
      { name: "status: stale beats a missing Result", send: () => api.status(u.staffA.cookie, plannedAction, { expectedVersion: 1, status: "COMPLETED" }), status: 409, code: "STALE_VERSION" },
      { name: "status: invalid pair with the right version (step 7)", send: () => api.status(u.staffA.cookie, freshAction, { expectedVersion: 1, status: "PLANNED" }), status: 400, code: "INVALID_TRANSITION", check: b => expect([b.from, b.to]).toEqual(["PLANNED", "PLANNED"]) },
      { name: "status: missing Result with the right version (step 7)", send: () => api.status(u.staffA.cookie, freshAction, { expectedVersion: 1, status: "COMPLETED" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.result).toBe(MESSAGES.resultRequiredComplete) },

      // ── POST /api/staff/tickets/:id/actions ──
      { name: "create: no session", send: () => api.create("", noTicket, {}), status: 401, code: "UNAUTHENTICATED" },
      { name: "create: password change required beats wrong role", send: () => api.create(u.mustChangeRequester.cookie, noTicket, {}), status: 403, code: "PASSWORD_CHANGE_REQUIRED" },
      { name: "create: wrong role beats missing Ticket", send: () => api.create(u.requesterA.cookie, noTicket, {}), status: 403, code: "FORBIDDEN" },
      { name: "create: missing Ticket beats a replay key and an invalid body", send: () => api.create(u.staffA.cookie, noTicket, { clientRequestId: replayKey }), status: 404, code: "NOT_FOUND" },
      { name: "create: replay beats an invalid body and a resolved Ticket", send: () => api.create(u.staffA.cookie, resolvedTicket, { clientRequestId: replayKey, description: "x", status: "CANCELLED" }), status: 200, code: "", check: b => expect(b.id).toBe(replayed.id) },
      { name: "create: replay key used on another Ticket beats an invalid body", send: () => api.create(u.staffA.cookie, openTicket, { clientRequestId: replayKey, description: "x" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(Object.keys(b.fields)).toEqual(["clientRequestId"]) },
      { name: "create: invalid body beats a resolved Ticket", send: () => api.create(u.staffA.cookie, resolvedTicket, { description: "x" }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.description).toBe(MESSAGES.description) },
      { name: "create: invalid assignee beats a resolved Ticket", send: () => api.create(u.staffA.cookie, resolvedTicket, { description: "Valid description", assigneeId: u.inactiveStaff.id }), status: 400, code: "VALIDATION_FAILED", check: b => expect(b.fields.assigneeId).toBe(MESSAGES.assigneeId) },
      { name: "create: valid body on a resolved Ticket", send: () => api.create(u.staffA.cookie, resolvedTicket, { description: "Valid description" }), status: 409, code: "TICKET_NOT_ACCEPTING_ACTIONS", check: b => expect(b.ticketStatus).toBe("RESOLVED") },

      // ── GET /api/tickets/:id/actions ──
      { name: "list: no session", send: () => api.list("", noTicket), status: 401, code: "UNAUTHENTICATED" },
      { name: "list: password change required beats missing Ticket", send: () => api.list(u.mustChangeRequester.cookie, noTicket), status: 403, code: "PASSWORD_CHANGE_REQUIRED" },
      { name: "list: missing Ticket", send: () => api.list(u.staffA.cookie, noTicket), status: 404, code: "NOT_FOUND" },
      { name: "list: non-numeric id is a missing Ticket", send: () => api.list(u.staffA.cookie, "abc"), status: 404, code: "NOT_FOUND" },
  ];

  // Runs in order after the cases above: none of them wrote anything.
  const snapshotActions = () => prisma.actionTaken.findMany({
    where: { ticketId: { in: [openTicket, resolvedTicket] } },
    orderBy: { id: "asc" },
    select: { id: true, version: true, status: true, description: true },
  });

  it.each(cases.map(c => [c.name, c] as const))("%s", async (_name, c) => {
    const res = await c.send();
    expect(`${res.status} ${res.body?.code ?? ""}`.trim(), JSON.stringify(res.body)).toBe(`${c.status} ${c.code}`.trim());
    c.check?.(res.body);
  });

  it("none of the cases above changed or created an Action", async () => {
    expect(await snapshotActions()).toEqual(actionsBefore);
  });
});
