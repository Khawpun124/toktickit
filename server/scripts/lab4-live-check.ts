#!/usr/bin/env tsx
/**
 * lab4-live-check — Live HTTP checks of the Lab 4 Actions Taken endpoints against a running server,
 * using the users and Tickets created by lab3-real-data (populate).
 *
 *   (a) 20 parallel creates with one clientRequestId  -> one 201, nineteen 200 with the same id, 1 row
 *   (b) 20 parallel creates with different ids         -> twenty 201, 20 new rows, all ids distinct
 *   (c) 20 parallel edits with the same expectedVersion -> one 200, nineteen 409 STALE_VERSION,
 *       version + 1, stored description = the winner's
 *   (d) 10 parallel status changes to COMPLETED         -> one 200, nine 409
 *   (e) authorization table: 4 endpoints x 7 kinds of caller vs api-spec section 11
 *   plus: another Requester's Ticket and a missing Ticket give byte-identical responses
 *
 * Writes only through HTTP: Actions Taken, and Session rows from logging in. The database is read
 * (Prisma) only to count rows and confirm stored values. Exits non-zero if any check fails.
 *
 * Usage (from server/):
 *   npx tsx scripts/lab4-live-check.ts --base http://localhost:3400 [--state <file>] [--round <n>]
 * Environment: REHEARSAL_PASSWORD, REHEARSAL_DIR (as for lab3-real-data). Secrets are never printed.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getPrisma } from "../src/prisma.js";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = arg("base");
const ROUND = arg("round") ?? "1";
const STATE = arg("state") ?? (process.env.REHEARSAL_DIR ? path.join(process.env.REHEARSAL_DIR, "state.json") : undefined);
const PASSWORD = process.env.REHEARSAL_PASSWORD;

if (!BASE || !STATE || !PASSWORD) {
  console.error("Usage: --base <url> [--state <file>] [--round <n>]; needs REHEARSAL_PASSWORD");
  process.exit(2);
}

type Res = { status: number; contentType: string; text: string; body: any };

async function call(method: string, url: string, cookie: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: any = undefined;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", text, body: parsed };
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  });
  const set = res.headers.getSetCookie().find(c => c.startsWith("tk_session="));
  if (res.status !== 200 || !set) throw new Error(`login ${email} failed with ${res.status}`);
  return set.split(";")[0];
}

const api = {
  list: (c: string, ticketId: number) => call("GET", `/api/tickets/${ticketId}/actions`, c),
  create: (c: string, ticketId: number, body: object) => call("POST", `/api/staff/tickets/${ticketId}/actions`, c, body),
  edit: (c: string, actionId: number, body: object) => call("PATCH", `/api/staff/actions/${actionId}`, c, body),
  status: (c: string, actionId: number, body: object) => call("PATCH", `/api/staff/actions/${actionId}/status`, c, body),
};

const failures: string[] = [];
function check(label: string, ok: boolean, detail: string) {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${detail}`);
  if (!ok) failures.push(label);
}
const tally = (rs: Res[]) => {
  const t: Record<string, number> = {};
  for (const r of rs) {
    const k = `${r.status}${r.body?.code ? " " + r.body.code : ""}`;
    t[k] = (t[k] ?? 0) + 1;
  }
  return Object.entries(t).sort().map(([k, n]) => `${k} x${n}`).join(", ");
};

async function main() {
  const prisma = getPrisma();
  const state = JSON.parse(fs.readFileSync(STATE!, "utf8"));
  const ticket = state.tickets.T08 as { id: number; ticketNumber: string; status: string };
  const tag = `round ${ROUND}`;

  const staff = await login(state.users.alex.email, PASSWORD!);
  const callers: Record<string, string> = {
    "no session": "",
    "Requester (owner)": await login(state.users.jennifer.email, PASSWORD!),
    "Requester (not owner)": await login(state.users.rhRequester.email, PASSWORD!),
    "IT Staff": await login(state.users.rhStaff.email, PASSWORD!),
    "Administrator": await login(state.users.admin.email, PASSWORD!),
    "must change password": await login(state.users.rhPending.email, `I${PASSWORD}`),
    "deactivated": fs.readFileSync(path.join(path.dirname(STATE!), "leaver-session.txt"), "utf8").trim(),
  };

  const ticketRow = () => prisma.$queryRaw<any[]>`
    SELECT "updatedAt", version, "statusChangedAt", "currentStatus"::text AS status FROM "Ticket" WHERE id = ${ticket.id}`;
  const ticketBefore = JSON.stringify(await ticketRow());
  const count = () => prisma.actionTaken.count({ where: { ticketId: ticket.id } });

  console.log(`[live-check ${tag}] Ticket ${ticket.ticketNumber} (${ticket.status}), performer ${state.users.alex.email}`);

  // (a) one clientRequestId, 20 parallel requests
  {
    const key = crypto.randomUUID();
    const before = await count();
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      api.create(staff, ticket.id, { description: `Replay check ${tag}, request ${i + 1}`, clientRequestId: key })));
    const ids = new Set(rs.map(r => r.body?.id));
    const rows = await prisma.actionTaken.count({ where: { clientRequestId: key } });
    const after = await count();
    console.log("(a) 20 parallel POST, one clientRequestId");
    check("(a) statuses", rs.filter(r => r.status === 201).length === 1 && rs.filter(r => r.status === 200).length === 19, tally(rs));
    check("(a) same id", ids.size === 1, `${ids.size} distinct id(s): ${[...ids].join(", ")}`);
    check("(a) rows with that clientRequestId", rows === 1, String(rows));
    check("(a) Actions on the Ticket", after - before === 1, `${before} -> ${after}`);
  }

  // (b) 20 different clientRequestIds
  {
    const before = await count();
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      api.create(staff, ticket.id, { description: `Parallel create ${tag}, request ${i + 1}`, clientRequestId: crypto.randomUUID() })));
    const ids = new Set(rs.map(r => r.body?.id));
    const after = await count();
    console.log("(b) 20 parallel POST, different clientRequestIds");
    check("(b) statuses", rs.every(r => r.status === 201), tally(rs));
    check("(b) distinct ids", ids.size === 20, String(ids.size));
    check("(b) Actions on the Ticket", after - before === 20, `${before} -> ${after} (+${after - before})`);
  }

  // (c) 20 parallel edits, same expectedVersion
  {
    const a = (await api.create(staff, ticket.id, { description: `Edit race target ${tag}` })).body;
    const bodies = Array.from({ length: 20 }, (_, i) => ({ expectedVersion: a.version, description: `Edit race ${tag}, writer ${i + 1}` }));
    const rs = await Promise.all(bodies.map(b => api.edit(staff, a.id, b)));
    const winners = rs.map((r, i) => ({ r, i })).filter(x => x.r.status === 200);
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id }, select: { version: true, description: true } });
    console.log(`(c) 20 parallel PATCH edit, Action ${a.id}, expectedVersion ${a.version}`);
    check("(c) statuses", winners.length === 1 && rs.filter(r => r.status === 409 && r.body?.code === "STALE_VERSION").length === 19, tally(rs));
    check("(c) version", stored.version === a.version + 1, `${a.version} -> ${stored.version}`);
    const w = winners[0];
    check("(c) stored description = winner", !!w && stored.description === bodies[w.i].description && w.r.body.description === stored.description,
      w ? `winner = writer ${w.i + 1}, stored "${stored.description}"` : "no winner");
  }

  // (d) 10 parallel status changes to COMPLETED, same expectedVersion
  {
    const a = (await api.create(staff, ticket.id, { description: `Status race target ${tag}` })).body;
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      api.status(staff, a.id, { expectedVersion: a.version, status: "COMPLETED", result: `Completed by writer ${i + 1}` })));
    const stored = await prisma.actionTaken.findUniqueOrThrow({ where: { id: a.id }, select: { version: true, status: true, result: true } });
    const winner = rs.find(r => r.status === 200);
    console.log(`(d) 10 parallel PATCH status -> COMPLETED, Action ${a.id}, expectedVersion ${a.version}`);
    check("(d) statuses", rs.filter(r => r.status === 200).length === 1 && rs.filter(r => r.status === 409).length === 9, tally(rs));
    check("(d) stored", stored.status === "COMPLETED" && stored.version === a.version + 1 && stored.result === winner?.body?.result,
      `${stored.status}, version ${a.version} -> ${stored.version}, result "${stored.result}"`);
  }

  // (e) authorization table
  {
    type Cell = [number, string];
    const ok = (s: number): Cell => [s, ""];
    const expected: Record<string, Cell[]> = {
      "no session": Array(4).fill([401, "UNAUTHENTICATED"]),
      "Requester (owner)": [ok(200), [403, "FORBIDDEN"], [403, "FORBIDDEN"], [403, "FORBIDDEN"]],
      "Requester (not owner)": [[404, "NOT_FOUND"], [403, "FORBIDDEN"], [403, "FORBIDDEN"], [403, "FORBIDDEN"]],
      "IT Staff": [ok(200), ok(201), ok(200), ok(200)],
      "Administrator": [ok(200), ok(201), ok(200), ok(200)],
      "must change password": Array(4).fill([403, "PASSWORD_CHANGE_REQUIRED"]),
      "deactivated": Array(4).fill([401, "UNAUTHENTICATED"]),
    };
    const endpoints = ["GET /api/tickets/:id/actions", "POST /api/staff/tickets/:id/actions",
      "PATCH /api/staff/actions/:actionId", "PATCH /api/staff/actions/:actionId/status"];

    console.log("(e) authorization (got / contract)");
    console.log(`  ${"caller".padEnd(22)} | ${endpoints.map(e => e.split(" ")[0] + " " + e.split("/").slice(-1)[0].padEnd(7)).join(" | ")}`);
    const untouched: number[] = [];
    for (const [who, cookie] of Object.entries(callers)) {
      // A fresh Action per caller, so a 2xx edit or status change always has the right version.
      const forEdit = (await api.create(staff, ticket.id, { description: `Authz edit target ${tag}, ${who}` })).body;
      const forStatus = (await api.create(staff, ticket.id, { description: `Authz status target ${tag}, ${who}` })).body;
      const rs = [
        await api.list(cookie, ticket.id),
        await api.create(cookie, ticket.id, { description: `Authz create ${tag}, ${who}` }),
        await api.edit(cookie, forEdit.id, { expectedVersion: 1, description: `Authz edit ${tag}, ${who}` }),
        await api.status(cookie, forStatus.id, { expectedVersion: 1, status: "IN_PROGRESS" }),
      ];
      const cells = rs.map((r, i) => {
        const [s, code] = expected[who][i];
        const got = `${r.status}${r.body?.code ? " " + r.body.code : ""}`;
        const want = `${s}${code ? " " + code : ""}`;
        if (got !== want) failures.push(`(e) ${who} ${endpoints[i]}: got ${got}, contract ${want}`);
        return `${got === want ? "ok" : "XX"} ${got}`.padEnd(28);
      });
      console.log(`  ${who.padEnd(22)} | ${cells.join(" | ")}`);
      if (rs[2].status >= 400) untouched.push(forEdit.id);
      if (rs[3].status >= 400) untouched.push(forStatus.id);
    }
    const changed = await prisma.actionTaken.count({ where: { id: { in: untouched }, version: { not: 1 } } });
    check("(e) every cell matches api-spec section 11", !failures.some(f => f.startsWith("(e)")), `${Object.keys(callers).length} callers x 4 endpoints`);
    check("(e) refused edits and status changes wrote nothing", changed === 0, `${untouched.length} target Actions, ${changed} changed`);
  }

  // Another Requester's Ticket vs a Ticket that does not exist
  {
    const other = callers["Requester (not owner)"];
    const max = await prisma.ticket.aggregate({ _max: { id: true } });
    const missing = (max._max.id ?? 0) + 1000;
    console.log(`(f) another Requester's Ticket ${ticket.id} vs missing Ticket ${missing}, as ${state.users.rhRequester.email}`);
    for (const [label, url] of [["actions list", "/actions"], ["Lab 3 ticket detail", ""]]) {
      const a = await call("GET", `/api/tickets/${ticket.id}${url}`, other);
      const b = await call("GET", `/api/tickets/${missing}${url}`, other);
      const same = a.status === b.status && a.contentType === b.contentType && a.text === b.text;
      check(`(f) ${label}`, same && a.status === 404, `${a.status} ${a.text} | ${b.status} ${b.text}`);
    }
  }

  const ticketAfter = JSON.stringify(await ticketRow());
  check("Ticket row unchanged (updatedAt, version, statusChangedAt, status)", ticketBefore === ticketAfter, ticketAfter);
  console.log(`Actions on ${ticket.ticketNumber}: ${await count()}; ActionTaken total: ${await prisma.actionTaken.count()}`);

  await prisma.$disconnect();
  if (failures.length) {
    console.log(`[live-check ${tag}] FAILED ${failures.length}:`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[live-check ${tag}] ALL PASSED`);
}

main().catch(err => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
