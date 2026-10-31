import { describe, it, expect, vi, afterEach } from "vitest";
import {
  ACTIVE_STATUSES, LIST_LIMIT, RECENTLY_RESOLVED_WINDOW_MS, isActiveStatus, isInRecentlyResolvedWindow,
  recentlyResolvedSince, statusQuery,
} from "../../src/dashboard/helpers.js";

/** UNIT-05 (BR-27, BR-28): the dashboard helpers that need no database. */
describe("UNIT-05: dashboard helpers", () => {
  const generatedAt = new Date("2026-10-12T10:20:00.000Z");

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UNIT-05: the active statuses are exactly NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED", () => {
    expect([...ACTIVE_STATUSES]).toEqual(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"]);
    for (const s of ["RESOLVED", "CLOSED", "CANCELLED", "UNKNOWN", ""]) expect(isActiveStatus(s), s).toBe(false);
    for (const s of ACTIVE_STATUSES) expect(isActiveStatus(s), s).toBe(true);
    expect(LIST_LIMIT).toBe(5);
  });

  it("UNIT-05: the window starts exactly 30 x 24 hours (2,592,000,000 ms) before generatedAt", () => {
    expect(RECENTLY_RESOLVED_WINDOW_MS).toBe(2_592_000_000);
    expect(recentlyResolvedSince(generatedAt).toISOString()).toBe("2026-09-12T10:20:00.000Z");
    expect(generatedAt.getTime() - recentlyResolvedSince(generatedAt).getTime()).toBe(2_592_000_000);
  });

  it("UNIT-05: both ends are inclusive: exactly 30 days is in, 30 days plus 1 ms is out, later than generatedAt is out", () => {
    const since = recentlyResolvedSince(generatedAt).getTime();
    expect(isInRecentlyResolvedWindow(new Date(since), generatedAt)).toBe(true);
    expect(isInRecentlyResolvedWindow(new Date(since - 1), generatedAt)).toBe(false);
    expect(isInRecentlyResolvedWindow(new Date(since + 1), generatedAt)).toBe(true);
    expect(isInRecentlyResolvedWindow(generatedAt, generatedAt)).toBe(true);
    expect(isInRecentlyResolvedWindow(new Date(generatedAt.getTime() + 1), generatedAt)).toBe(false);
    expect(isInRecentlyResolvedWindow(null, generatedAt)).toBe(false);
  });

  it("UNIT-05: a window across a daylight-saving change is still exactly 30 x 24 hours (no calendar days)", () => {
    // Los Angeles leaves daylight saving on 2026-11-01; a calendar-day window would be 1 hour off.
    const g = new Date("2026-11-20T08:00:00.000Z");
    expect(recentlyResolvedSince(g).toISOString()).toBe("2026-10-21T08:00:00.000Z");
  });

  it("UNIT-05: the helpers never read the process time zone or local calendar fields", () => {
    const forbidden = [
      "getTimezoneOffset", "getHours", "getDate", "getDay", "getMonth", "getFullYear", "toString", "toLocaleString",
    ] as const;
    for (const name of forbidden) {
      vi.spyOn(Date.prototype, name).mockImplementation(() => {
        throw new Error(`Date.prototype.${name} must not be used`);
      });
    }
    const since = recentlyResolvedSince(generatedAt);
    expect(since.getTime()).toBe(generatedAt.getTime() - 2_592_000_000);
    expect(isInRecentlyResolvedWindow(since, generatedAt)).toBe(true);
    expect(isInRecentlyResolvedWindow(new Date(since.getTime() - 1), generatedAt)).toBe(false);
  });

  it("UNIT-05: drill-down status queries are comma lists in the stated order", () => {
    expect(statusQuery(ACTIVE_STATUSES)).toBe("currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED");
    expect(statusQuery(["RESOLVED"])).toBe("currentStatus=RESOLVED");
  });
});
