import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { MAX_CAUSE_LENGTH, logServerError, serverLog, type ServerErrorEntry } from "../../src/http/log.js";
import { hashPassword } from "../../src/utils/password.js";
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

describe("Hardening: the server log keeps only the cause of a Prisma error", () => {
  const prisma = getPrisma();
  let fx: Fixture;

  beforeAll(async () => {
    fx = await createFixture("hard-prisma-log", "hardtest");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const req = { method: "POST", originalUrl: "/api/admin/users" } as any;
  const capture = () => {
    const entries: ServerErrorEntry[] = [];
    vi.spyOn(serverLog, "write").mockImplementation(e => {
      entries.push(e);
    });
    return entries;
  };

  it("Hardening: a multi-line message with a marker in its arguments block logs only the last line, without the marker", () => {
    const entries = capture();
    const marker = "MARKER-passwordHash-7f3a";
    const message = [
      "",
      "Invalid `prisma.user.create()` invocation in",
      "D:\srv\toktickit\server\src\app.ts:1480:18",
      "",
      "  1479 const created = await prisma.user.create({",
      "→ 1480   data: {",
      `           email: "someone@example.com",`,
      `           passwordHash: "${marker}",`,
      "         }",
      "       })",
      "",
      "Unique constraint failed on the fields: (`email`)",
    ].join("\n");
    logServerError(Object.assign(new Error(message), { name: "PrismaClientKnownRequestError", code: "P2002" }), req);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: "PrismaClientKnownRequestError", code: "P2002", message: "Unique constraint failed on the fields: (`email`)",
    });
    const written = JSON.stringify(entries[0]);
    for (const leaked of [marker, "someone@example.com", "passwordHash", "app.ts", "invocation"]) expect(written).not.toContain(leaked);
  });

  it("Hardening: the cause line is cut at 300 characters and only Prisma codes are kept", () => {
    const entries = capture();
    logServerError(new Error("x".repeat(1000)), req);
    logServerError(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }), req);
    expect(entries[0].message).toHaveLength(MAX_CAUSE_LENGTH);
    expect(entries[1]).not.toHaveProperty("code");
    expect(entries[1].message).toBe("connect ECONNREFUSED");
  });

  it("Hardening: a real Prisma unique-constraint error (duplicate email) logs P2002 and the cause, never the email or passwordHash", async () => {
    const entries = capture();
    const passwordHash = await hashPassword("MarkerPass123!");
    const email = `hardtest-dup-${fx.runId}@example.com`;
    const first = await prisma.user.create({ data: { name: "Dup One", email, passwordHash, role: "REQUESTER" } });
    try {
      let caught: unknown;
      try {
        await prisma.user.create({ data: { name: "Dup Two", email, passwordHash, role: "REQUESTER" } });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      expect(String((caught as Error).message).split("\n").length).toBeGreaterThan(1); // Prisma's message really is multi-line
      logServerError(caught, req);
      expect(entries[0]).toMatchObject({ name: "PrismaClientKnownRequestError", code: "P2002" });
      expect(entries[0].message).toMatch(/^Unique constraint failed/);
      const written = JSON.stringify(entries[0]);
      expect(written).not.toContain(email);
      expect(written).not.toContain(passwordHash);
      expect(written).not.toContain("Dup Two");
    } finally {
      await prisma.user.delete({ where: { id: first.id } });
    }
  });

  it("Hardening: a real Prisma validation error with the arguments block logs only its last line", async () => {
    const entries = capture();
    const marker = "MARKER-arg-value-91c2";
    let caught: unknown;
    try {
      await (prisma.user as any).create({ data: { name: "No Role", email: `hardtest-${marker}@example.com`, passwordHash: marker } });
    } catch (e) {
      caught = e;
    }
    expect(String((caught as Error).message)).toContain(marker); // the raw message does carry the argument values
    logServerError(caught, req);
    expect(entries[0].name).toBe("PrismaClientValidationError");
    expect(JSON.stringify(entries[0])).not.toContain(marker);
  });
});

describe("Hardening: an upload over multer's 10 MB cap reports the size limit", () => {
  let fx: Fixture;
  let ticketId: number;
  const uploads = path.resolve(process.cwd(), "uploads/attachments"); // the same directory as app.ts
  const listUploads = () => (fs.existsSync(uploads) ? fs.readdirSync(uploads).sort() : []);

  beforeAll(async () => {
    fx = await createFixture("hard-upload", "hardtest");
    ticketId = await fx.createTicket({ requester: "requesterA", status: "OPEN" });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  const upload = (buffer?: Buffer) => {
    const r = request(app).post(`/api/tickets/${ticketId}/attachments`).set("Cookie", fx.users.requesterA.cookie);
    return buffer ? r.attach("file", buffer, "large-scan.pdf") : r;
  };

  it("Hardening: an 11 MB file gets 400 { error: \"File exceeds the 5 MB limit\" } and leaves no file or row behind", async () => {
    const before = listUploads();
    const res = await upload(Buffer.alloc(11 * 1024 * 1024));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "File exceeds the 5 MB limit" });
    expect(listUploads()).toEqual(before);
    expect(await getPrisma().attachment.count({ where: { ticketId } })).toBe(0);
  }, 30_000);

  it("Hardening: the 6 MB case and the no-file case keep their Lab 2 messages", async () => {
    const six = await upload(Buffer.alloc(6 * 1024 * 1024));
    expect(six.status).toBe(400);
    expect(six.body).toEqual({ error: "File exceeds the 5 MB limit" });
    const none = await upload();
    expect(none.status).toBe(400);
    expect(none.body).toEqual({ error: "No file uploaded" });
  }, 30_000);
});
