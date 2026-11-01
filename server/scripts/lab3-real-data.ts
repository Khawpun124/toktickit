#!/usr/bin/env tsx
/**
 * lab3-real-data — Builds realistic Lab 3 data through the running application's HTTP API
 * (never SQL), and captures a fixed list of Lab 3 GET responses for byte-for-byte comparison
 * before and after the Lab 4 upgrade and rollback.
 *
 * Usage (from server/):
 *   npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode populate [--state <file>]
 *   npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode capture --out <file> [--state <file>]
 *   npx tsx scripts/lab3-real-data.ts --base http://localhost:3300 --mode smoke [--state <file>]
 *
 * smoke is a short write test of the Lab 3 app on the real data (for example after a rollback):
 * log in, create a Ticket, add a public comment and an internal note, set the owner, and move the
 * status along ALLOWED_TRANSITIONS. It prints the HTTP status of each step and exits non-zero if
 * any step fails.
 *
 * Environment:
 *   REHEARSAL_PASSWORD         new password for every user who changes it (never printed)
 *   INITIAL_MIGRATED_PASSWORD  the Lab 3 seed password (same default as src/constants.ts)
 *   REHEARSAL_DIR              default folder for the state file; keep it outside the repository
 *
 * populate writes <state> (ticket ids and user ids, no secrets) and <state dir>/leaver-session.txt
 * (the session of the user who is deactivated last; used by lab4-live-check). Keep both outside
 * the repository. Passwords, cookies, and session ids are never printed.
 *
 * capture records only status, content-type, and the raw body of each response. Transport headers
 * (Date, Set-Cookie, Connection, Keep-Alive, ETag) are left out because they change per request;
 * the body is kept unchanged, including stored timestamps.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const BASE = arg("base");
const MODE = arg("mode");
const OUT = arg("out");
const STATE = arg("state") ?? (process.env.REHEARSAL_DIR ? path.join(process.env.REHEARSAL_DIR, "state.json") : undefined);
const NEW_PASSWORD = process.env.REHEARSAL_PASSWORD;
const SEED_PASSWORD = process.env.INITIAL_MIGRATED_PASSWORD || "ChangeMe123!";

if (!BASE || !STATE || !NEW_PASSWORD || !["populate", "capture", "smoke"].includes(MODE ?? "") || (MODE === "capture" && !OUT)) {
  console.error("Usage: --base <url> --mode populate|capture|smoke [--out <file>] [--state <file>]; needs REHEARSAL_PASSWORD");
  process.exit(2);
}

/** Initial password the administrator gives to new users (differs from the one they choose). */
const initialPasswordFor = (pw: string) => `I${pw}`;

// ── HTTP helpers ───────────────────────────────────────────────────────────

type Res = { status: number; contentType: string; text: string; body: any; cookie?: string };

async function call(method: string, url: string, cookie: string, body?: unknown, form?: FormData): Promise<Res> {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  let payload: any;
  if (form) payload = form;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  const text = await res.text();
  let parsed: any = undefined;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  const set = res.headers.getSetCookie().find(c => c.startsWith("tk_session="));
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    text,
    body: parsed,
    cookie: set ? set.split(";")[0] : undefined,
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Every write is followed by a short pause so createdAt/uploadedAt values never tie. */
async function write(method: string, url: string, cookie: string, expected: number, body?: unknown, form?: FormData) {
  const res = await call(method, url, cookie, body, form);
  await sleep(6);
  if (res.status !== expected) {
    throw new Error(`${method} ${url} expected ${expected}, got ${res.status}: ${res.text.slice(0, 300)}`);
  }
  return res.body;
}

async function login(email: string, password: string): Promise<string> {
  const res = await call("POST", "/api/auth/login", "", { email, password });
  if (res.status !== 200 || !res.cookie) throw new Error(`login ${email} failed with ${res.status}`);
  return res.cookie;
}

async function loginAndChange(email: string, current: string): Promise<string> {
  const cookie = await login(email, current);
  await write("POST", "/api/auth/change-password", cookie, 200,
    { currentPassword: current, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
  return cookie;
}

// ── Data plan ──────────────────────────────────────────────────────────────

const SEED_USERS = {
  admin: "admin@tiktockit.com",
  alex: "alex.staff@tiktockit.com",
  ben: "ben.staff@tiktockit.com",
  clara: "clara.staff@tiktockit.com",
  jennifer: "jennifer.anderson@example.com",
  emily: "emily.taylor@example.com",
  michael: "michael.brown@example.com",
  sarah: "sarah.connor@example.com",
} as const;

const NEW_USERS = {
  rhRequester: { name: "Rhea Requester", email: "rh.requester@example.com", role: "REQUESTER" },
  rhStaff: { name: "Rafael Staff", email: "rh.staff@tiktockit.com", role: "IT_STAFF" },
  rhLeaver: { name: "Leo Leaver", email: "rh.leaver@tiktockit.com", role: "IT_STAFF" },
  rhPending: { name: "Pat Pending", email: "rh.pending@example.com", role: "REQUESTER" },
} as const;

type UserKey = keyof typeof SEED_USERS | keyof typeof NEW_USERS;
type Status = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";

/** Status paths that follow ALLOWED_TRANSITIONS of Lab 3 (app.ts). */
const PATHS: Record<string, Status[]> = {
  NEW: [],
  OPEN: ["OPEN"],
  IN_PROGRESS: ["OPEN", "IN_PROGRESS"],
  CYCLE: ["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED", "OPEN", "IN_PROGRESS"],
  WFR: ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER"],
  RESOLVED: ["OPEN", "IN_PROGRESS", "RESOLVED"],
  RESOLVED_VIA_WFR: ["OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED"],
  CLOSED: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
  REOPENED_FROM_RESOLVED: ["OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED"],
  REOPENED_FROM_CLOSED: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED"],
  CANCELLED_FROM_NEW: ["CANCELLED"],
  CANCELLED_FROM_OPEN: ["OPEN", "CANCELLED"],
  CANCELLED_FROM_IN_PROGRESS: ["OPEN", "IN_PROGRESS", "CANCELLED"],
};

type P = "LOW" | "MEDIUM" | "HIGH";
// [key, requester, path, IT priority, owner, summary]
const TICKETS: [string, UserKey, keyof typeof PATHS, P | null, UserKey | null, string][] = [
  ["T01", "jennifer", "NEW", null, null, "Cannot sign in to the LEB2 app"],
  ["T02", "emily", "NEW", "LOW", null, "Printer on floor 3 prints blank pages"],
  ["T03", "rhRequester", "NEW", null, null, "Request access to the shared drive"],
  ["T04", "michael", "NEW", null, null, "Laptop fan is very loud"],
  ["T05", "jennifer", "OPEN", "MEDIUM", "alex", "VPN disconnects every ten minutes"],
  ["T06", "sarah", "OPEN", null, null, "Email signature is not saved"],
  ["T07", "rhRequester", "OPEN", "HIGH", "ben", "Grade submission page times out"],
  ["T08", "jennifer", "IN_PROGRESS", "HIGH", "alex", "Campus Wi-Fi drops in the library"],
  ["T09", "emily", "IN_PROGRESS", "MEDIUM", "clara", "Software license expired for the IDE"],
  ["T10", "rhRequester", "IN_PROGRESS", "LOW", "rhStaff", "Corporate laptop battery drains fast"],
  ["T11", "michael", "IN_PROGRESS", "HIGH", "admin", "Account locked after password reset"],
  ["T12", "jennifer", "CYCLE", "MEDIUM", "rhLeaver", "Calendar invites arrive twice"],
  ["T13", "jennifer", "WFR", "LOW", "alex", "Need a second monitor for the lab"],
  ["T14", "sarah", "WFR", "MEDIUM", null, "Cannot open PDF attachments in email"],
  ["T15", "rhRequester", "WFR", "HIGH", "admin", "Network share asks for credentials"],
  ["T16", "jennifer", "RESOLVED", "MEDIUM", "ben", "Keyboard keys are sticking"],
  ["T17", "emily", "RESOLVED_VIA_WFR", "HIGH", null, "LEB2 app shows the wrong course list"],
  ["T18", "rhRequester", "RESOLVED", "LOW", "rhStaff", "Printer driver install fails"],
  ["T19", "jennifer", "CLOSED", "HIGH", "clara", "Email quota is full"],
  ["T20", "michael", "CLOSED", "LOW", null, "Wi-Fi password for guests"],
  ["T21", "rhRequester", "CLOSED", "MEDIUM", "alex", "VPN client needs an update"],
  ["T22", "jennifer", "REOPENED_FROM_RESOLVED", "LOW", "ben", "Projector in room 204 has no signal"],
  ["T23", "sarah", "REOPENED_FROM_RESOLVED", "HIGH", null, "Grades not visible to students"],
  ["T24", "rhRequester", "REOPENED_FROM_CLOSED", "MEDIUM", "rhLeaver", "Laptop docking station not detected"],
  ["T25", "jennifer", "CANCELLED_FROM_NEW", null, null, "Duplicate request for shared drive"],
  ["T26", "emily", "CANCELLED_FROM_OPEN", null, null, "Software install request withdrawn"],
  ["T27", "rhRequester", "CANCELLED_FROM_IN_PROGRESS", "MEDIUM", "clara", "Old printer replacement no longer needed"],
  ["T28", "michael", "CANCELLED_FROM_NEW", null, null, "Wrong category request"],
];

// The ticket owner changes before the final owner is set (T08), or is removed (T14).
const OWNER_HISTORY: Record<string, (UserKey | null)[]> = { T08: ["ben", "alex"], T14: ["clara", null] };
// The IT priority changes before the final value (T09, T21).
const PRIORITY_HISTORY: Record<string, P[]> = { T09: ["LOW", "MEDIUM"], T21: ["HIGH", "MEDIUM"] };

const COMMENTS: [string, UserKey, string][] = [
  ["T08", "jennifer", "The connection drops near the study rooms on the second floor."],
  ["T08", "alex", "Thanks, we are checking the access point logs for that area."],
  ["T08", "jennifer", "It happened again this morning at about 9:30."],
  ["T13", "alex", "Could you tell us which lab room and the desk number?"],
  ["T13", "jennifer", "Room 3-105, desk 12."],
  ["T16", "ben", "We replaced the keyboard. Please confirm it works."],
  ["T16", "jennifer", "Works well now, thank you."],
  ["T10", "rhRequester", "Battery goes from full to 20% in two hours."],
  ["T10", "rhStaff", "Please keep the laptop plugged in until we run the battery report."],
  ["T22", "jennifer", "The projector lost signal again after the fix."],
  ["T22", "ben", "Reopened. We will test a new HDMI cable."],
  ["T27", "rhRequester", "The department bought a new printer, so this is no longer needed."],
];

const NOTES: [string, UserKey, string][] = [
  ["T08", "alex", "AP-LIB-2F shows 300 reconnects per hour. Suspect channel interference."],
  ["T08", "ben", "Changed AP-LIB-2F from channel 6 to channel 11."],
  ["T09", "clara", "License renewal is waiting for budget approval."],
  ["T12", "rhLeaver", "Duplicate invites come from a forwarding rule on the requester mailbox."],
  ["T12", "alex", "Taking over from Leo. Forwarding rule removed."],
  ["T15", "admin", "Share permissions were reset by the nightly sync job."],
  ["T19", "clara", "Archived 4 GB of old mail with the requester's agreement."],
  ["T24", "rhLeaver", "Dock firmware 1.2 is known to fail with this laptop model."],
  ["T11", "admin", "Lockout came from an old phone still using the previous password."],
];

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

// [ticket, file name, removal reason or null]
const ATTACHMENTS: [string, string, string | null][] = [
  ["T08", "wifi-signal-map.png", null],
  ["T08", "speedtest-results.pdf", null],
  ["T08", "wrong-screenshot.png", "Uploaded the wrong screenshot by mistake"],
  ["T13", "lab-desk-photo.png", null],
  ["T10", "battery-report.pdf", null],
  ["T10", "laptop-label.png", "The photo shows my personal information"],
  ["T22", "projector-error.png", null],
];

const RESOLUTION_FLAGS = ["T13", "T18"];

type State = {
  users: Record<string, { id: number; email: string; role: string }>;
  tickets: Record<string, { id: number; ticketNumber: string; requester: UserKey; status: Status }>;
};

// ── populate ───────────────────────────────────────────────────────────────

async function populate() {
  const cookies: Partial<Record<UserKey, string>> = {};
  const ids: Record<string, { id: number; email: string; role: string }> = {};

  for (const [key, email] of Object.entries(SEED_USERS)) {
    cookies[key as UserKey] = await loginAndChange(email, SEED_PASSWORD);
  }
  console.log(`seed users logged in and changed password: ${Object.keys(SEED_USERS).length}`);

  const admin = cookies.admin!;
  for (const [key, u] of Object.entries(NEW_USERS)) {
    const created = await write("POST", "/api/admin/users", admin, 201,
      { name: u.name, email: u.email, role: u.role, isActive: true, initialPassword: initialPasswordFor(NEW_PASSWORD!) });
    ids[key] = { id: created.id, email: created.email, role: created.role };
    if (key !== "rhPending") cookies[key as UserKey] = await loginAndChange(u.email, initialPasswordFor(NEW_PASSWORD!));
  }
  console.log(`admin created users: ${Object.keys(NEW_USERS).length} (rh.pending never logs in)`);

  const all = await call("GET", "/api/admin/users", admin);
  for (const [key, email] of Object.entries(SEED_USERS)) {
    const u = all.body.find((x: any) => x.email === email);
    ids[key] = { id: u.id, email: u.email, role: u.role };
  }

  const categories = (await call("GET", "/api/categories", "")).body as { id: number }[];
  const systems = (await call("GET", "/api/related-systems", "")).body as { id: number }[];
  const priorities: P[] = ["LOW", "MEDIUM", "HIGH"];
  const tickets: State["tickets"] = {};
  const staff = cookies.alex!;

  for (const [i, [key, requester, , , , summary]] of TICKETS.entries()) {
    const t = await write("POST", "/api/tickets", cookies[requester]!, 201, {
      categoryId: categories[i % categories.length].id,
      relatedSystemId: systems[i % systems.length].id,
      summary,
      description: `${summary}. Reported for the Lab 4 upgrade rehearsal, ticket ${key}.`,
      requestedPriority: priorities[i % 3],
    });
    tickets[key] = { id: t.id, ticketNumber: t.ticketNumber, requester, status: "NEW" };
  }

  for (const [key, , pathName, itPriority, owner] of TICKETS) {
    const id = tickets[key].id;
    for (const o of OWNER_HISTORY[key] ?? (owner ? [owner] : [])) {
      await write("PATCH", `/api/staff/tickets/${id}/owner`, staff, 200, { ticketOwnerId: o ? ids[o].id : null });
    }
    for (const p of PRIORITY_HISTORY[key] ?? (itPriority ? [itPriority] : [])) {
      await write("PATCH", `/api/staff/tickets/${id}/priority`, staff, 200, { itPriority: p });
    }
    for (const s of PATHS[pathName]) {
      await write("PATCH", `/api/staff/tickets/${id}/status`, staff, 200, { newStatus: s });
      tickets[key].status = s;
    }
  }

  for (const [key, author, content] of COMMENTS) {
    await write("POST", `/api/tickets/${tickets[key].id}/comments`, cookies[author]!, 201, { content });
  }
  for (const [key, author, content] of NOTES) {
    await write("POST", `/api/tickets/${tickets[key].id}/notes`, cookies[author]!, 201, { content });
  }

  const uploaded: number[] = [];
  for (const [key, fileName] of ATTACHMENTS) {
    const pdf = fileName.endsWith(".pdf");
    const form = new FormData();
    form.append("file", new Blob([pdf ? PDF : PNG], { type: pdf ? "application/pdf" : "image/png" }), fileName);
    const a = await write("POST", `/api/tickets/${tickets[key].id}/attachments`, cookies[tickets[key].requester]!, 201, undefined, form);
    uploaded.push(a.id);
  }
  for (const [i, [key, , reason]] of ATTACHMENTS.entries()) {
    if (reason) await write("DELETE", `/api/attachments/${uploaded[i]}`, cookies[tickets[key].requester]!, 200, { reason });
  }

  for (const key of RESOLUTION_FLAGS) {
    await write("PATCH", `/api/tickets/${tickets[key].id}/resolution-flag`, cookies[tickets[key].requester]!, 200);
  }

  // Last: deactivate rh.leaver. Its session stays in the Session table but no longer works.
  await write("PATCH", `/api/admin/users/${ids.rhLeaver.id}`, admin, 200, { isActive: false });
  fs.writeFileSync(path.join(path.dirname(STATE!), "leaver-session.txt"), cookies.rhLeaver!);
  const check = await call("GET", "/api/auth/me", cookies.rhLeaver!);
  if (check.status !== 401) throw new Error(`deactivated session still works: ${check.status}`);

  // Every Ticket reached its planned status (read back through the staff queue).
  const queue = await allPages("/api/staff/tickets?pageSize=50", staff);
  for (const [key, t] of Object.entries(tickets)) {
    const row = queue.find((r: any) => r.id === t.id);
    if (!row || row.currentStatus !== t.status) throw new Error(`${key} expected ${t.status}, got ${row?.currentStatus}`);
  }

  fs.writeFileSync(STATE!, JSON.stringify({ users: ids, tickets }, null, 2) + "\n");

  const byStatus: Record<string, number> = {};
  for (const t of Object.values(tickets)) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  console.log(`tickets: ${TICKETS.length}`, byStatus);
  console.log(`comments: ${COMMENTS.length}, internal notes: ${NOTES.length}, attachments: ${ATTACHMENTS.length} ` +
    `(removed with a reason: ${ATTACHMENTS.filter(a => a[2]).length}), resolution flags: ${RESOLUTION_FLAGS.length}`);
  console.log("rh.leaver deactivated; its old session now gives 401 on /api/auth/me");
  console.log(`state written (ids only): ${path.basename(STATE!)}`);
}

async function allPages(url: string, cookie: string) {
  const rows: any[] = [];
  for (let page = 1; ; page++) {
    const res = await call("GET", `${url}&page=${page}`, cookie);
    rows.push(...res.body.data);
    if (page >= res.body.pagination.totalPages) return rows;
  }
}

// ── capture ────────────────────────────────────────────────────────────────

async function capture() {
  const state: State = JSON.parse(fs.readFileSync(STATE!, "utf8"));
  const t = (key: string) => state.tickets[key].id;
  const sessions: Record<string, string> = {};
  for (const key of ["jennifer", "alex", "admin"] as const) sessions[key] = await login(SEED_USERS[key], NEW_PASSWORD!);
  sessions.rhRequester = await login(NEW_USERS.rhRequester.email, NEW_PASSWORD!);

  const entries: object[] = [];
  const failures: string[] = [];

  async function get(name: string, as: string, url: string) {
    const res = await call("GET", url, sessions[as]);
    entries.push({
      name, method: "GET", path: url, as,
      status: res.status, contentType: res.contentType, body: res.text,
      sha256: crypto.createHash("sha256").update(res.text).digest("hex"),
    });
    return res;
  }

  /** Lists ordered by a timestamp alone are only deterministic when no two rows share it. */
  function noTies(name: string, rows: any[], field: string) {
    const seen = new Set(rows.map(r => r[field]));
    if (seen.size !== rows.length) failures.push(`${name}: two rows share ${field}, so the order is not stable`);
  }

  async function paged(name: string, as: string, url: string) {
    for (let page = 1; ; page++) {
      const res = await get(`${name} page ${page}`, as, `${url}&page=${page}`);
      if (res.status !== 200 || page >= res.body.pagination.totalPages) return;
    }
  }

  await paged("my tickets (jennifer)", "jennifer", "/api/tickets?pageSize=50");
  await paged("my tickets (jennifer) by ticket number", "jennifer", "/api/tickets?pageSize=50&sortBy=ticketNumber&sortDir=asc");
  await paged("my tickets (rh.requester)", "rhRequester", "/api/tickets?pageSize=50");
  await paged("my tickets (rh.requester) by ticket number", "rhRequester", "/api/tickets?pageSize=50&sortBy=ticketNumber&sortDir=asc");
  await paged("staff queue", "alex", "/api/staff/tickets?pageSize=50");
  await paged("staff queue unassigned", "alex", "/api/staff/tickets?pageSize=50&ticketOwnerId=unassigned");
  await paged("staff queue resolved", "alex", "/api/staff/tickets?pageSize=50&currentStatus=RESOLVED");

  for (const key of ["T08", "T10", "T19", "T24", "T27"]) {
    await get(`staff detail ${key}`, "alex", `/api/staff/tickets/${t(key)}`);
    const c = await get(`comments ${key}`, "alex", `/api/tickets/${t(key)}/comments`);
    noTies(`comments ${key}`, c.body, "createdAt");
    const n = await get(`notes ${key}`, "alex", `/api/tickets/${t(key)}/notes`);
    noTies(`notes ${key}`, n.body, "createdAt");
    const a = await get(`attachments ${key}`, "alex", `/api/tickets/${t(key)}/attachments`);
    noTies(`attachments ${key}`, a.body, "uploadedAt");
  }

  await get("owner detail T08 (jennifer)", "jennifer", `/api/tickets/${t("T08")}`);
  await get("owner detail T10 (rh.requester)", "rhRequester", `/api/tickets/${t("T10")}`);
  await get("other requester's ticket T10 (jennifer)", "jennifer", `/api/tickets/${t("T10")}`);
  await get("admin users", "admin", "/api/admin/users");
  await get("staff users", "alex", "/api/staff/users");
  await get("categories", "alex", "/api/categories");
  await get("related systems", "alex", "/api/related-systems");

  const text = JSON.stringify(entries, null, 2) + "\n";
  fs.writeFileSync(OUT!, text);
  console.log(`captured ${entries.length} responses -> ${path.basename(OUT!)}`);
  console.log(`statuses: ${[...new Set(entries.map((e: any) => e.status))].join(", ")}`);
  console.log(`sha256(file) = ${crypto.createHash("sha256").update(text).digest("hex")}`);
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exit(1);
  }
}

// ── smoke ──────────────────────────────────────────────────────────────────

async function smoke() {
  const state: State = JSON.parse(fs.readFileSync(STATE!, "utf8"));
  let failed = 0;
  async function step(label: string, expected: number, run: () => Promise<Res>) {
    const res = await run();
    const ok = res.status === expected;
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: ${res.status} (expected ${expected})${ok ? "" : " " + res.text.slice(0, 200)}`);
    return res;
  }

  console.log("[smoke] Lab 3 write test");
  let requester = "";
  let staff = "";
  await step(`login ${SEED_USERS.jennifer}`, 200, async () => {
    const r = await call("POST", "/api/auth/login", "", { email: SEED_USERS.jennifer, password: NEW_PASSWORD });
    requester = r.cookie ?? "";
    return r;
  });
  await step(`login ${SEED_USERS.alex}`, 200, async () => {
    const r = await call("POST", "/api/auth/login", "", { email: SEED_USERS.alex, password: NEW_PASSWORD });
    staff = r.cookie ?? "";
    return r;
  });
  const categories = (await call("GET", "/api/categories", "")).body;
  const systems = (await call("GET", "/api/related-systems", "")).body;
  const created = await step("create Ticket (Requester)", 201, () => call("POST", "/api/tickets", requester, {
    categoryId: categories[0].id, relatedSystemId: systems[0].id, requestedPriority: "MEDIUM",
    summary: "Smoke test after rollback", description: "Ticket created by the smoke test on the rolled-back database.",
  }));
  const id = created.body?.id;
  console.log(`        ticket ${created.body?.ticketNumber} (${created.body?.currentStatus})`);
  await step("public comment (Requester)", 201, () => call("POST", `/api/tickets/${id}/comments`, requester, { content: "Smoke test comment." }));
  await step("internal note (IT Staff)", 201, () => call("POST", `/api/tickets/${id}/notes`, staff, { content: "Smoke test internal note." }));
  await step(`owner -> ${SEED_USERS.ben}`, 200, () => call("PATCH", `/api/staff/tickets/${id}/owner`, staff, { ticketOwnerId: state.users.ben.id }));
  for (const s of ["OPEN", "IN_PROGRESS", "RESOLVED"]) {
    await step(`status -> ${s}`, 200, () => call("PATCH", `/api/staff/tickets/${id}/status`, staff, { newStatus: s }));
  }
  const detail = await step("read back (IT Staff)", 200, () => call("GET", `/api/staff/tickets/${id}`, staff));
  const comments = (await call("GET", `/api/tickets/${id}/comments`, staff)).body;
  const notes = (await call("GET", `/api/tickets/${id}/notes`, staff)).body;
  const okRead = detail.body?.currentStatus === "RESOLVED" && detail.body?.ticketOwnerId === state.users.ben.id
    && comments.length === 1 && notes.length === 1;
  if (!okRead) failed++;
  console.log(`  ${okRead ? "PASS" : "FAIL"}  stored: status ${detail.body?.currentStatus}, owner ${detail.body?.ticketOwnerName}, ` +
    `comments ${comments.length}, notes ${notes.length}`);
  if (failed) {
    console.log(`[smoke] FAILED ${failed} step(s)`);
    process.exit(1);
  }
  console.log("[smoke] ALL PASSED");
}

(MODE === "populate" ? populate() : MODE === "capture" ? capture() : smoke()).catch(err => {
  console.error(`FAILED: ${err.message}`);
  process.exit(1);
});
