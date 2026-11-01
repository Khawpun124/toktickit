import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { Prisma, type TicketStatus } from "@prisma/client";
import app from "../../src/app.js";
import { getPrisma } from "../../src/prisma.js";
import { setDashboardClock } from "../../src/dashboard/clock.js";
import { createFixture, ticketApi, type Fixture } from "./helpers.js";
import { DAY_MS, WINDOW_MS, dashApi, setTicket, sqlCount, sqlTicketIds, statusIn } from "./dashboard-support.js";

/**
 * GET /api/dashboard/requester: API-28, API-29, API-30, API-35 (Requester cards), API-37, API-41,
 * API-44. The dashboard clock is fixed in-process to G (setDashboardClock; no HTTP can change it)
 * and restored to the real clock in afterAll.
 */
const G = new Date("2026-10-15T12:00:00.000Z");
const at = (offsetMs: number) => new Date(G.getTime() + offsetMs);

describe("Requester dashboard (API-28, 29, 30, 35, 37, 41, 44)", () => {
  const prisma = getPrisma();
  let fx: Fixture; // requesterA: the data set; requesterB: forged id target, then API-44
  let fx2: Fixture; // requesterA: no Tickets (API-29); requesterB: the window edges (API-37)
  const a: Record<string, number> = {};

  async function make(fixture: Fixture, key: string, requester: "requesterA" | "requesterB", status: TicketStatus,
    cols: Parameters<typeof setTicket>[1] = {}) {
    const id = await fixture.createTicket({ requester, status });
    await setTicket(id, cols);
    a[key] = id;
    return id;
  }

  beforeAll(async () => {
    fx = await createFixture("reqdash", "dashtest");
    fx2 = await createFixture("reqdash-empty", "dashtest");
    setDashboardClock(() => G);

    let minute = 0;
    const upd = () => at(-DAY_MS + ++minute * 60_000);
    // Open card: NEW, OPEN, IN_PROGRESS, REOPENED
    for (const [i, s] of (["NEW", "NEW", "OPEN", "IN_PROGRESS", "REOPENED"] as TicketStatus[]).entries()) {
      await make(fx, `open${i}`, "requesterA", s, { updatedAt: upd() });
    }
    // Waiting for you: six, so the list is capped; two share statusChangedAt (tie by id ascending)
    const waits = [-20, -10, -10, -5, -2, -1];
    for (const [i, d] of waits.entries()) {
      await make(fx, `wait${i}`, "requesterA", "WAITING_FOR_REQUESTER", { statusChangedAt: at(d * DAY_MS), updatedAt: upd() });
    }
    // Resolved and Closed, inside and outside the 30-day window; two Closed share resolvedAt (tie by id descending)
    const resolved: [TicketStatus, number][] = [
      ["RESOLVED", -1 * DAY_MS], ["RESOLVED", -31 * DAY_MS], ["RESOLVED", -2 * DAY_MS], ["RESOLVED", -6 * 3600_000],
      ["CLOSED", -3 * DAY_MS], ["CLOSED", -3 * DAY_MS], ["CLOSED", -40 * DAY_MS], ["CLOSED", -4 * DAY_MS],
    ];
    for (const [i, [s, off]] of resolved.entries()) {
      await make(fx, `res${i}`, "requesterA", s, { resolvedAt: at(off), updatedAt: upd() });
    }
    await make(fx, "cancelled", "requesterA", "CANCELLED", { updatedAt: upd() });
    // Two Tickets share the newest updatedAt (tie by id descending in Recently updated)
    await setTicket(a.open0, { updatedAt: at(DAY_MS) });
    await setTicket(a.wait3, { updatedAt: at(DAY_MS) });

    // requesterB: someone else's data, so a forged id would show
    await make(fx, "bOpen", "requesterB", "OPEN");
    await make(fx, "bResolved", "requesterB", "RESOLVED", { resolvedAt: at(-DAY_MS) });
  });

  afterAll(async () => {
    setDashboardClock(null);
    await fx.cleanup();
    await fx2.cleanup();
  });

  const A = () => fx.users.requesterA;
  const ids = (list: { id: number }[]) => list.map(t => t.id);

  it("API-28: a forged user id in the query or body is ignored; only the session user's Tickets are returned", async () => {
    const own = await dashApi.requester(A().cookie);
    expect(own.status).toBe(200);
    const b = fx.users.requesterB.id;
    const forgedQuery = await dashApi.requester(A().cookie, `?requesterId=${b}&userId=${b}&id=${b}`);
    const forgedBody = await request(app).get("/api/dashboard/requester").set("Cookie", A().cookie)
      .send({ requesterId: b, userId: b, performedBy: b });
    expect(forgedQuery.body).toEqual(own.body);
    expect(forgedBody.body).toEqual(own.body);

    const listed = [...own.body.needsAttention, ...own.body.recentlyUpdated, ...own.body.recentlyResolved].map(t => t.id);
    const owners = await prisma.ticket.findMany({ where: { id: { in: listed } }, select: { requesterId: true } });
    expect(owners.every(t => t.requesterId === A().id)).toBe(true);
    expect(listed).not.toContain(a.bOpen);
    expect(listed).not.toContain(a.bResolved);
  });

  it("API-29: a Requester with no Tickets gets every count 0 and empty lists", async () => {
    const res = await dashApi.requester(fx2.users.requesterA.cookie);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({
      open: { count: 0, query: "currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED" },
      waitingForYou: { count: 0, query: "currentStatus=WAITING_FOR_REQUESTER" },
      resolved: { count: 0, query: "currentStatus=RESOLVED" },
      closed: { count: 0, query: "currentStatus=CLOSED" },
    });
    expect(res.body.needsAttention).toEqual([]);
    expect(res.body.recentlyUpdated).toEqual([]);
    expect(res.body.recentlyResolved).toEqual([]);
  });

  it("API-30: every count equals its own SQL count, and the response carries generatedAt and recentlyResolvedSince", async () => {
    const res = await dashApi.requester(A().cookie);
    const own = Prisma.sql`"requesterId" = ${A().id}`;
    const and = (s: Prisma.Sql) => Prisma.sql`${own} AND ${s}`;
    expect(res.body.metrics.open.count).toBe(await sqlCount(and(statusIn(["NEW", "OPEN", "IN_PROGRESS", "REOPENED"]))));
    expect(res.body.metrics.waitingForYou.count).toBe(await sqlCount(and(statusIn(["WAITING_FOR_REQUESTER"]))));
    expect(res.body.metrics.resolved.count).toBe(await sqlCount(and(statusIn(["RESOLVED"]))));
    expect(res.body.metrics.closed.count).toBe(await sqlCount(and(statusIn(["CLOSED"]))));
    // The fixture sizes, so the SQL above is not trivially 0
    expect([res.body.metrics.open.count, res.body.metrics.waitingForYou.count, res.body.metrics.resolved.count, res.body.metrics.closed.count])
      .toEqual([5, 6, 4, 4]);
    expect(res.body.generatedAt).toBe(G.toISOString());
    expect(res.body.recentlyResolvedSince).toBe(new Date(G.getTime() - WINDOW_MS).toISOString());
  });

  it("API-30: the three lists match their SQL order, are capped at 5, and break ties by id", async () => {
    const res = await dashApi.requester(A().cookie);
    const own = Prisma.sql`"requesterId" = ${A().id}`;
    const since = new Date(G.getTime() - WINDOW_MS);

    const needs = await sqlTicketIds(Prisma.sql`${own} AND ${statusIn(["WAITING_FOR_REQUESTER"])}`, Prisma.sql`"statusChangedAt" ASC, id ASC`);
    expect(ids(res.body.needsAttention)).toEqual(needs);
    expect(ids(res.body.needsAttention)).toEqual([a.wait0, a.wait1, a.wait2, a.wait3, a.wait4]);

    const updated = await sqlTicketIds(own, Prisma.sql`"updatedAt" DESC, id DESC`);
    expect(ids(res.body.recentlyUpdated)).toEqual(updated);
    expect(ids(res.body.recentlyUpdated).slice(0, 2)).toEqual([a.wait3, a.open0]); // same updatedAt: id descending

    const resolved = await sqlTicketIds(
      Prisma.sql`${own} AND ${statusIn(["RESOLVED", "CLOSED"])} AND "resolvedAt" >= ${since} AND "resolvedAt" <= ${G}`,
      Prisma.sql`"resolvedAt" DESC, id DESC`
    );
    expect(ids(res.body.recentlyResolved)).toEqual(resolved);
    expect(ids(res.body.recentlyResolved)).toEqual([a.res3, a.res0, a.res2, a.res5, a.res4]);

    expect(res.body.needsAttention[0]).toEqual({
      id: a.wait0, ticketNumber: expect.any(String), summary: expect.any(String), currentStatus: "WAITING_FOR_REQUESTER",
      waitingSince: at(-20 * DAY_MS).toISOString(), updatedAt: expect.any(String),
    });
    expect(Object.keys(res.body.recentlyUpdated[0]).sort()).toEqual(["currentStatus", "id", "summary", "ticketNumber", "updatedAt"]);
    expect(Object.keys(res.body.recentlyResolved[0]).sort()).toEqual(["currentStatus", "id", "resolvedAt", "summary", "ticketNumber", "updatedAt"]);
  });

  it("API-35: each Requester card's query on GET /api/tickets gives totalItems equal to the card number", async () => {
    for (const user of [A(), fx2.users.requesterA]) {
      const dash = await dashApi.requester(user.cookie);
      for (const [name, m] of Object.entries(dash.body.metrics) as [string, { count: number; query: string }][]) {
        const list = await dashApi.myTickets(user.cookie, `${m.query}&pageSize=1`);
        expect(list.status, name).toBe(200);
        expect(list.body.pagination.totalItems, name).toBe(m.count);
      }
    }
  });

  it("API-37: resolved exactly 30 days before generatedAt is included; 30 days plus 1 ms is excluded (fixed clock)", async () => {
    const since = G.getTime() - WINDOW_MS;
    const edge = {
      exact: await make(fx2, "exact", "requesterB", "RESOLVED", { resolvedAt: new Date(since) }),
      older: await make(fx2, "older", "requesterB", "RESOLVED", { resolvedAt: new Date(since - 1) }),
      atG: await make(fx2, "atG", "requesterB", "CLOSED", { resolvedAt: G }),
      future: await make(fx2, "future", "requesterB", "RESOLVED", { resolvedAt: new Date(G.getTime() + 1) }),
    };
    const cookie = fx2.users.requesterB.cookie;

    const res = await dashApi.requester(cookie);
    expect(res.body.recentlyResolvedSince).toBe(new Date(since).toISOString());
    expect(new Date(res.body.generatedAt).getTime() - new Date(res.body.recentlyResolvedSince).getTime()).toBe(2_592_000_000);
    expect(ids(res.body.recentlyResolved)).toEqual([edge.atG, edge.exact]);

    // One millisecond later the exact edge drops out and the "future" Ticket enters.
    setDashboardClock(() => new Date(G.getTime() + 1));
    try {
      const later = await dashApi.requester(cookie);
      expect(ids(later.body.recentlyResolved)).toEqual([edge.future, edge.atG]);
    } finally {
      setDashboardClock(() => G);
    }
  });

  it("API-41: under TZ=UTC, Asia/Bangkok, and America/Los_Angeles both dashboards return identical results in UTC", async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const serverDir = path.resolve(here, "../..");
    const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
    const probe = path.join(here, "support", "dashboard-tz-probe.ts");
    const zones = { "UTC": 0, "Asia/Bangkok": -420, "America/Los_Angeles": 420 } as const;

    const runProbe = (tz: string) => new Promise<any>((resolve, reject) => {
      const child = spawn(process.execPath, [tsxCli, probe], {
        cwd: serverDir,
        env: {
          ...process.env,
          TZ: tz,
          DASH_PROBE_NOW: G.toISOString(),
          DASH_PROBE_REQUESTER_COOKIE: A().cookie,
          DASH_PROBE_STAFF_COOKIE: fx.users.staffA.cookie,
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", d => (stdout += d));
      child.stderr.on("data", d => (stderr += d));
      child.on("error", reject);
      child.on("close", code => {
        const line = stdout.split(/\r?\n/).find(l => l.startsWith("DASH_PROBE_RESULT "));
        if (code !== 0 || !line) return reject(new Error(`probe for ${tz} exited ${code}: ${stderr.slice(0, 300)}`));
        resolve(JSON.parse(line.slice("DASH_PROBE_RESULT ".length)));
      });
    });

    const results = await Promise.all(Object.keys(zones).map(runProbe));
    const inProcessRequester = (await dashApi.requester(A().cookie)).body;
    const inProcessStaff = (await dashApi.staff(fx.users.staffA.cookie)).body;

    // Each child really ran in its own zone: three different offsets, each the expected one.
    expect(results.map(r => r.tz)).toEqual(Object.keys(zones));
    expect(results.map(r => r.resolvedTimeZone)).toEqual(Object.keys(zones));
    expect(results.map(r => r.offsetMinutes)).toEqual(Object.values(zones));
    expect(new Set(results.map(r => r.offsetMinutes)).size).toBe(3);

    for (const r of results) {
      expect(r.requester.status, r.tz).toBe(200);
      expect(r.staff.status, r.tz).toBe(200);
      expect(r.requester.body, r.tz).toEqual(inProcessRequester);
      expect(r.staff.body, r.tz).toEqual(inProcessStaff);
      expect(r.requester.body.generatedAt).toBe(G.toISOString());
      expect(r.requester.body.recentlyResolvedSince).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      expect(r.staff.body.generatedAt).toBe(G.toISOString());
      // The child prints only response bodies: no cookie or session value.
      expect(JSON.stringify(r)).not.toContain("tk_session");
    }
  }, 60_000);

  it("API-44: longest waiting first by statusChangedAt; a later comment or owner change does not reorder; re-entering Waiting restarts the wait", async () => {
    const B = fx.users.requesterB;
    const staff = fx.users.staffA;
    const w1 = await make(fx, "w1", "requesterB", "WAITING_FOR_REQUESTER", { statusChangedAt: at(-10 * DAY_MS) });
    const w2 = await make(fx, "w2", "requesterB", "WAITING_FOR_REQUESTER", { statusChangedAt: at(-5 * DAY_MS) });
    const w3 = await make(fx, "w3", "requesterB", "WAITING_FOR_REQUESTER", { statusChangedAt: at(-3 * DAY_MS) });
    const w4 = await make(fx, "w4", "requesterB", "WAITING_FOR_REQUESTER", { statusChangedAt: at(-3 * DAY_MS) });

    const first = await dashApi.requester(B.cookie);
    expect(ids(first.body.needsAttention)).toEqual([w1, w2, w3, w4]); // w3 and w4 tie: id ascending
    expect(first.body.needsAttention.map((t: { waitingSince: string }) => t.waitingSince)).toEqual(
      [-10, -5, -3, -3].map(d => at(d * DAY_MS).toISOString())
    );

    // A comment and an owner change on the longest-waiting Ticket
    const comment = await request(app).post(`/api/tickets/${w1}/comments`).set("Cookie", staff.cookie)
      .send({ content: "Could you confirm the printer model?" });
    expect(comment.status).toBe(201);
    const owner = await ticketApi.owner(staff.cookie, w1, { ticketOwnerId: staff.id });
    expect(owner.status).toBe(200);
    const edited = await prisma.ticket.findUniqueOrThrow({ where: { id: w1 } });
    expect(edited.statusChangedAt.toISOString()).toBe(at(-10 * DAY_MS).toISOString());

    const afterEdit = await dashApi.requester(B.cookie);
    expect(ids(afterEdit.body.needsAttention)).toEqual([w1, w2, w3, w4]);
    expect(afterEdit.body.needsAttention[0].waitingSince).toBe(at(-10 * DAY_MS).toISOString());

    // Leave Waiting and come back: the wait restarts from the new entry
    expect((await ticketApi.status(staff.cookie, w1, { newStatus: "IN_PROGRESS" })).status).toBe(200);
    expect((await ticketApi.status(staff.cookie, w1, { newStatus: "WAITING_FOR_REQUESTER" })).status).toBe(200);
    const reentered = await prisma.ticket.findUniqueOrThrow({ where: { id: w1 } });
    expect(reentered.statusChangedAt.getTime()).toBeGreaterThan(at(-10 * DAY_MS).getTime());

    const afterReentry = await dashApi.requester(B.cookie);
    expect(ids(afterReentry.body.needsAttention)).toEqual([w2, w3, w4, w1]);
    expect(afterReentry.body.needsAttention[3].waitingSince).toBe(reentered.statusChangedAt.toISOString());
  });
});
