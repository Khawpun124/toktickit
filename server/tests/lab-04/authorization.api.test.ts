import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { api, createFixture, missingId, TEST_PASSWORD, login, ticketApi, type Fixture } from "./helpers.js";

/** SEC-01, SEC-02, SEC-03, SEC-05 for the Actions Taken endpoints. */
describe("Authorization of the Actions Taken endpoints (SEC-01, SEC-02, SEC-03, SEC-05)", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;
  let actionId: number;

  beforeAll(async () => {
    fx = await createFixture("authz");
    ticketId = await fx.createTicket({ requester: "requesterA" });
    actionId = (await api.create(fx.users.staffA.cookie, ticketId, { description: "Existing action" })).body.id;
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const writes = () => [
    { name: "POST /api/staff/tickets/:id/actions", send: (c: string) => api.create(c, ticketId, { description: "Attempted action" }) },
    { name: "PATCH /api/staff/actions/:actionId", send: (c: string) => api.edit(c, actionId, { expectedVersion: 1, description: "Attempted edit" }) },
    { name: "PATCH /api/staff/actions/:actionId/status", send: (c: string) => api.status(c, actionId, { expectedVersion: 1, status: "IN_PROGRESS" }) },
  ];

  async function snapshot() {
    return {
      count: await prisma.actionTaken.count({ where: { ticketId } }),
      action: await prisma.actionTaken.findUniqueOrThrow({ where: { id: actionId } }),
    };
  }

  it("SEC-01: every new write endpoint as a Requester (even the Ticket's own Requester) gives 403 and changes nothing", async () => {
    const before = await snapshot();
    for (const w of writes()) {
      for (const requester of [fx.users.requesterA, fx.users.requesterB]) {
        const res = await w.send(requester.cookie);
        expect(res.status, w.name).toBe(403);
        expect(res.body, w.name).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("SEC-02: every new endpoint without a session gives 401", async () => {
    const before = await snapshot();
    const all = [...writes(), { name: "GET /api/tickets/:id/actions", send: (c: string) => api.list(c, ticketId) }];
    for (const e of all) {
      for (const cookie of ["", "tk_session=not-a-real-session"]) {
        const res = await e.send(cookie);
        expect(res.status, `${e.name} ${cookie}`).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized", code: "UNAUTHENTICATED" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("SEC-03: a user who must change the initial password is blocked until the password is changed", async () => {
    const user = fx.users.mustChangeStaff;
    const all = [...writes(), { name: "GET /api/tickets/:id/actions", send: (c: string) => api.list(c, ticketId) }];
    for (const e of all) {
      const res = await e.send(user.cookie);
      expect(res.status, e.name).toBe(403);
      expect(res.body).toEqual({ error: "Password change required before accessing this resource", code: "PASSWORD_CHANGE_REQUIRED" });
    }

    const newPassword = "ChangedPass456!";
    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", user.cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword, confirmPassword: newPassword });
    expect(change.status).toBe(200);
    const cookie = await login(user.email, newPassword);
    expect(cookie).toContain("tk_session=");

    expect((await api.list(cookie, ticketId)).status).toBe(200);
    const created = await api.create(cookie, ticketId, { description: "Created after the password change" });
    expect(created.status).toBe(201);
  });

  it("SEC-05: another Requester's Ticket and a missing Ticket give indistinguishable responses", async () => {
    const missing = await missingId("ticket");
    const other = await api.list(fx.users.requesterB.cookie, ticketId);
    const none = await api.list(fx.users.requesterB.cookie, missing);
    expect(other.status).toBe(404);
    expect(none.status).toBe(other.status);
    expect(none.body).toEqual(other.body);
    expect(other.body).toEqual({ error: "Ticket not found", code: "NOT_FOUND" });
    expect(none.headers["content-type"]).toBe(other.headers["content-type"]);
    // The owner still sees the list.
    expect((await api.list(fx.users.requesterA.cookie, ticketId)).status).toBe(200);
  });
});

/**
 * SEC-01, SEC-02, SEC-03 for the Ticket endpoints changed in Issue 4 (owner, priority, status).
 * They were Lab 3 endpoints, so the 401 and 403 bodies are the Lab 3 bodies, without a code.
 */
describe("Authorization of the Ticket workflow endpoints (SEC-01, SEC-02, SEC-03)", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;

  beforeAll(async () => {
    fx = await createFixture("authz-ticket", "ticketwf");
    ticketId = await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const writes = () => [
    { name: "PATCH /api/staff/tickets/:id/status", send: (c: string) => ticketApi.status(c, ticketId, { newStatus: "IN_PROGRESS" }) },
    { name: "PATCH /api/staff/tickets/:id/owner", send: (c: string) => ticketApi.owner(c, ticketId, { ticketOwnerId: fx.users.staffA.id }) },
    { name: "PATCH /api/staff/tickets/:id/priority", send: (c: string) => ticketApi.priority(c, ticketId, { itPriority: "HIGH" }) },
  ];
  const snapshot = () => prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });

  it("SEC-01: every Ticket workflow endpoint as a Requester (even the Ticket's own Requester) gives 403 and changes nothing", async () => {
    const before = await snapshot();
    for (const w of writes()) {
      for (const requester of [fx.users.requesterA, fx.users.requesterB]) {
        const res = await w.send(requester.cookie);
        expect(res.status, w.name).toBe(403);
        expect(res.body, w.name).toEqual({ error: "Forbidden" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("SEC-02: every Ticket workflow endpoint without a session gives 401", async () => {
    const before = await snapshot();
    for (const w of writes()) {
      for (const cookie of ["", "tk_session=not-a-real-session"]) {
        const res = await w.send(cookie);
        expect(res.status, `${w.name} ${cookie}`).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized" });
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it("SEC-03: a user who must change the initial password is blocked until the password is changed", async () => {
    const user = fx.users.mustChangeStaff;
    const before = await snapshot();
    for (const w of writes()) {
      const res = await w.send(user.cookie);
      expect(res.status, w.name).toBe(403);
      expect(res.body).toEqual({ error: "Password change required before accessing this resource" });
    }
    expect(await snapshot()).toEqual(before);

    const newPassword = "ChangedPass456!";
    const change = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", user.cookie)
      .send({ currentPassword: TEST_PASSWORD, newPassword, confirmPassword: newPassword });
    expect(change.status).toBe(200);
    const cookie = await login(user.email, newPassword);
    for (const w of writes()) {
      expect((await w.send(cookie)).status, w.name).toBe(200);
    }
  });
});
