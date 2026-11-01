import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { logServerError, serverLog, type ServerErrorEntry } from "../../src/http/log.js";
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

/**
 * SEC-01, SEC-02, SEC-03 for the dashboard endpoints added in Issue 5. They are reads, so SEC-01
 * here is the role rule of api-spec section 11 (a Requester cannot read the staff dashboard, and
 * staff cannot read the Requester dashboard), checked to change nothing.
 */
describe("Authorization of the dashboard endpoints (SEC-01, SEC-02, SEC-03)", () => {
  const prisma = getPrisma();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("authz-dash", "dashtest");
    await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const endpoints = ["/api/dashboard/requester", "/api/dashboard/staff"];
  const get = (path: string, cookie: string) => request(app).get(path).set("Cookie", cookie);
  const snapshot = async () => ({
    tickets: await prisma.ticket.count(),
    users: await prisma.user.count(),
    actions: await prisma.actionTaken.count(),
  });

  it("SEC-01: a Requester gets 403 from the staff dashboard, and IT Staff and Administrators get 403 from the Requester dashboard", async () => {
    const before = await snapshot();
    for (const requester of [fx.users.requesterA, fx.users.requesterB]) {
      const res = await get("/api/dashboard/staff", requester.cookie);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
    }
    for (const staff of [fx.users.staffA, fx.users.admin]) {
      const res = await get("/api/dashboard/requester", staff.cookie);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "Forbidden", code: "FORBIDDEN" });
    }
    expect(await snapshot()).toEqual(before);
  });

  it("SEC-02: every dashboard endpoint without a session gives 401", async () => {
    for (const path of endpoints) {
      for (const cookie of ["", "tk_session=not-a-real-session"]) {
        const res = await get(path, cookie);
        expect(res.status, `${path} ${cookie}`).toBe(401);
        expect(res.body).toEqual({ error: "Unauthorized", code: "UNAUTHENTICATED" });
      }
    }
  });

  it("SEC-03: a user who must change the initial password is blocked from the dashboards until the password is changed", async () => {
    const cases = [
      { user: fx.users.mustChangeRequester, path: "/api/dashboard/requester" },
      { user: fx.users.mustChangeStaff, path: "/api/dashboard/staff" },
    ];
    for (const c of cases) {
      const blocked = await get(c.path, c.user.cookie);
      expect(blocked.status, c.path).toBe(403);
      expect(blocked.body).toEqual({ error: "Password change required before accessing this resource", code: "PASSWORD_CHANGE_REQUIRED" });

      const newPassword = "ChangedPass456!";
      const change = await request(app)
        .post("/api/auth/change-password")
        .set("Cookie", c.user.cookie)
        .send({ currentPassword: TEST_PASSWORD, newPassword, confirmPassword: newPassword });
      expect(change.status).toBe(200);
      const cookie = await login(c.user.email, newPassword);
      expect((await get(c.path, cookie)).status, c.path).toBe(200);
    }
  });
});

/**
 * SEC-04 (BR-33, api-spec section 0 "App-level safe errors"): what no endpoint answers itself gets a
 * safe `{ error, code }` body (malformed JSON, an oversized body, an unknown /api path, an error that
 * escapes a handler), with no stack trace, SQL, file path, or HTML page under any NODE_ENV. The real
 * cause is logged through the one server log, without bodies or cookies.
 */
describe("SEC-04: app-level safe errors", () => {
  const prisma = getPrisma();
  let fx: Fixture;
  let ticketId: number;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    fx = await createFixture("sec04", "hardtest");
    ticketId = await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });
  afterAll(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    await fx.cleanup();
  });

  /**
   * Makes one Prisma model method reject until restored. Prisma's model delegates do not survive
   * vi.spyOn's restore (the method is left undefined), so the method is replaced and put back here.
   */
  const restores: (() => void)[] = [];
  function failModel(model: "session" | "category" | "ticket", method: "findUnique", message: string) {
    const delegate = prisma[model] as unknown as Record<string, unknown>;
    const original = delegate[method];
    delegate[method] = () => Promise.reject(new Error(message));
    restores.push(() => {
      delegate[method] = original;
    });
  }
  afterEach(() => {
    while (restores.length) restores.pop()!();
  });

  const MALFORMED = ['{"summary": ', "{bad json}", "[1, 2", "'single quotes'", '{"a": 1}}', "{\"a\": undefined}"];
  const NOT_JSON = { error: "Request body is not valid JSON.", code: "VALIDATION_FAILED" };
  const INTERNAL = { error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" };

  /** Nothing in a response may look like an internal detail. */
  function expectSafe(res: request.Response) {
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.text).not.toMatch(/<html|<!DOCTYPE|<pre>/i);
    expect(res.text).not.toMatch(/\bat [\w.<>]+ \(|node_modules|[A-Za-z]:\\|\/src\/|\.ts:\d+/);
    expect(res.text).not.toMatch(/SyntaxError|Unexpected token|PrismaClient|SELECT |prisma\./i);
    expect(Object.keys(res.body).sort()).toEqual(["code", "error"]);
  }

  const posts = () => [
    { name: "POST /api/auth/login (Lab 3, public)", path: "/api/auth/login", cookie: "" },
    { name: "POST /api/tickets (Lab 2)", path: "/api/tickets", cookie: fx.users.requesterA.cookie },
    { name: `POST /api/tickets/:id/comments (Lab 3)`, path: `/api/tickets/${ticketId}/comments`, cookie: fx.users.requesterA.cookie },
    { name: "POST /api/staff/tickets/:id/actions (Lab 4)", path: `/api/staff/tickets/${ticketId}/actions`, cookie: fx.users.staffA.cookie },
  ];

  it("SEC-04: a malformed JSON body gets 400 VALIDATION_FAILED on Lab 1-3 and Lab 4 endpoints, with no stack or HTML", async () => {
    const write = vi.spyOn(serverLog, "write");
    for (const target of posts()) {
      for (const body of MALFORMED) {
        const res = await request(app).post(target.path).set("Cookie", target.cookie).set("Content-Type", "application/json").send(body);
        expect(res.status, `${target.name} ${body}`).toBe(400);
        expect(res.body).toEqual(NOT_JSON);
        expectSafe(res);
      }
    }
    const patch = await request(app).patch(`/api/staff/tickets/${ticketId}/status`).set("Cookie", fx.users.staffA.cookie)
      .set("Content-Type", "application/json").send('{"newStatus": "IN_PROGRESS"');
    expect(patch.status).toBe(400);
    expect(patch.body).toEqual(NOT_JSON);
    expect(write).toHaveBeenCalled();
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } })).currentStatus).toBe("OPEN");
  });

  it("SEC-04: a body over the parser limit gets 413 VALIDATION_FAILED \"Request body is too large.\"", async () => {
    const big = JSON.stringify({ content: "x".repeat(200 * 1024) });
    const res = await request(app).post(`/api/tickets/${ticketId}/comments`).set("Cookie", fx.users.requesterA.cookie)
      .set("Content-Type", "application/json").send(big);
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: "Request body is too large.", code: "VALIDATION_FAILED" });
    expectSafe(res);
  });

  it("SEC-04: a body in a charset the parser cannot read keeps its 415 with the safe body, and logs one line without the body or cookie", async () => {
    const write = vi.spyOn(serverLog, "write");
    const marker = "MARKER-body-3c19";
    const token = fx.users.requesterA.cookie.split(";")[0].split("=")[1];
    const res = await request(app).post(`/api/tickets/${ticketId}/comments`).set("Cookie", fx.users.requesterA.cookie)
      .set("Content-Type", "application/json; charset=klingon-9").send(`{"content": "${marker}"}`);
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: "Request body could not be read.", code: "VALIDATION_FAILED" });
    expectSafe(res);

    expect(write).toHaveBeenCalledTimes(1);
    const entry: ServerErrorEntry = write.mock.calls[0][0];
    expect(entry).toMatchObject({ method: "POST", name: "UnsupportedMediaTypeError" });
    expect(entry.message).toMatch(/unsupported charset/i);
    const logged = JSON.stringify(entry);
    expect(logged).not.toContain(marker);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain("tk_session");
    expect(await prisma.publicComment.count({ where: { ticketId } })).toBe(0);
  });

  it("SEC-04: an unknown /api path gets 404 NOT_FOUND for every method, with or without a session", async () => {
    const cases: [string, string][] = [
      ["get", "/api/does-not-exist"], ["post", "/api/tickets/1/unknown"], ["delete", `/api/staff/actions/1`],
      ["put", "/api/tickets"], ["get", "/api/health/ready/extra"],
    ];
    for (const [method, path] of cases) {
      for (const cookie of ["", fx.users.staffA.cookie]) {
        const res = await (request(app) as any)[method](path).set("Cookie", cookie);
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(res.body).toEqual({ error: "Not found", code: "NOT_FOUND" });
        expectSafe(res);
      }
    }
  });

  it("SEC-04: an error that escapes a handler (session lookup fails) gets 500 INTERNAL_ERROR, and the log has the real cause but no cookie or body", async () => {
    const write = vi.spyOn(serverLog, "write");
    const cause = 'Invalid `prisma.session.findUnique()` invocation: SELECT "public"."Session" failed at C:\\srv\\app.js:12';
    failModel("session", "findUnique", cause);
    const secret = "TopSecretPass123!";
    const res = await request(app).post("/api/auth/change-password").set("Cookie", fx.users.requesterA.cookie)
      .send({ currentPassword: secret, newPassword: secret, confirmPassword: secret });
    expect(res.status).toBe(500);
    expect(res.body).toEqual(INTERNAL);
    expectSafe(res);

    expect(write).toHaveBeenCalledTimes(1);
    const entry: ServerErrorEntry = write.mock.calls[0][0];
    expect(entry).toMatchObject({ method: "POST", route: "/api/auth/change-password", name: "Error", message: cause });
    const logged = JSON.stringify(entry);
    const token = fx.users.requesterA.cookie.split(";")[0].split("=")[1];
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("tk_session");
  });

  it("SEC-04: a promise rejected inside a Lab 2 handler (create Ticket, upload) gets 500 INTERNAL_ERROR instead of hanging", async () => {
    const write = vi.spyOn(serverLog, "write");
    failModel("category", "findUnique", "category lookup failed");
    const create = await request(app).post("/api/tickets").set("Cookie", fx.users.requesterA.cookie)
      .send({ categoryId: 1, relatedSystemId: 1, summary: "Printer is offline", description: "", requestedPriority: "LOW" });
    expect(create.status).toBe(500);
    expect(create.body).toEqual(INTERNAL);
    expectSafe(create);

    failModel("ticket", "findUnique", "ticket lookup failed");
    const upload = await request(app).post(`/api/tickets/${ticketId}/attachments`).set("Cookie", fx.users.requesterA.cookie)
      .attach("file", Buffer.from("hello"), "note.pdf");
    expect(upload.status).toBe(500);
    expect(upload.body).toEqual(INTERNAL);
    expectSafe(upload);

    const routes = write.mock.calls.map(c => c[0].route);
    expect(routes).toEqual(["/api/tickets", "/api/tickets/:id/attachments"]);
    expect(write.mock.calls.map(c => c[0].message)).toEqual(["category lookup failed", "ticket lookup failed"]);
  });

  it.each(["production", "development", "test"])("SEC-04: NODE_ENV=%s gives the same safe bodies (no stack or HTML in development)", async env => {
    process.env.NODE_ENV = env;
    vi.spyOn(serverLog, "write").mockImplementation(() => {}); // keep the test output clean
    const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops");
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual(NOT_JSON);
    expectSafe(bad);

    failModel("session", "findUnique", "database went away");
    const crash = await request(app).get("/api/auth/me").set("Cookie", fx.users.staffA.cookie);
    expect(crash.status).toBe(500);
    expect(crash.body).toEqual(INTERNAL);
    expectSafe(crash);

    const missing = await request(app).get("/api/nothing-here");
    expect(missing.body).toEqual({ error: "Not found", code: "NOT_FOUND" });
  });

  it("SEC-04: the server log is silent under NODE_ENV=test and writes one line (no body, no cookie) otherwise", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = { method: "POST", originalUrl: "/api/tickets?x=1", body: { password: "Hidden1!" }, headers: { cookie: "tk_session=abc" } } as any;
    process.env.NODE_ENV = "test";
    logServerError(new Error("boom"), req);
    expect(consoleError).not.toHaveBeenCalled();

    process.env.NODE_ENV = "production";
    logServerError(new Error("boom"), req);
    expect(consoleError).toHaveBeenCalledTimes(1);
    const line = String(consoleError.mock.calls[0][0]);
    expect(line).toMatch(/POST \/api\/tickets Error: boom$/);
    expect(line).not.toMatch(/Hidden1!|tk_session|abc|x=1/);
  });
});
