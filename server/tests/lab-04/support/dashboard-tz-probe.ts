/**
 * API-41 child process. requester-dashboard.api.test.ts runs this file once per TZ value with
 * `TZ` set before Node starts (Node reads TZ only at start-up). It fixes the dashboard clock
 * in-process, calls both dashboards through the app, and prints one JSON line to stdout:
 * the process time zone facts and the two response bodies. It never prints a cookie, a
 * password, or the database URL: the cookies arrive in environment variables and only the
 * response bodies (which hold no secrets) are written out.
 */
import request from "supertest";
import app from "../../../src/app.js";
import { setDashboardClock } from "../../../src/dashboard/clock.js";
import { getPrisma } from "../../../src/prisma.js";

async function main(): Promise<void> {
  const now = new Date(process.env.DASH_PROBE_NOW ?? "");
  if (Number.isNaN(now.getTime())) throw new Error("DASH_PROBE_NOW is missing");
  setDashboardClock(() => now);

  const requester = await request(app).get("/api/dashboard/requester").set("Cookie", process.env.DASH_PROBE_REQUESTER_COOKIE ?? "");
  const staff = await request(app).get("/api/dashboard/staff").set("Cookie", process.env.DASH_PROBE_STAFF_COOKIE ?? "");

  const out = {
    tz: process.env.TZ,
    offsetMinutes: now.getTimezoneOffset(),
    resolvedTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    requester: { status: requester.status, body: requester.body },
    staff: { status: staff.status, body: staff.body },
  };
  process.stdout.write(`DASH_PROBE_RESULT ${JSON.stringify(out)}\n`);
  await getPrisma().$disconnect();
}

main().catch(err => {
  // Only the message: no stack, no environment.
  process.stderr.write(`probe failed: ${err instanceof Error ? err.message : "unknown error"}\n`);
  process.exit(1);
});
