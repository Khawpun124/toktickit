import React from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AppContent } from "../../src/App.js";
import { AuthProvider } from "../../src/context/AuthContext.js";

/**
 * Shared kit for the Issue 5 client tests: a fetch-level mock server, payloads shaped like
 * api-spec sections 8 and 9, the real router (AppContent), and a browser time zone switch that
 * wraps Intl.DateTimeFormat (no environment variables, no real clock).
 */

type Json = any;
export type Reply = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
export type Handler = (ctx: { url: URL; body: Json }) => Reply;

export const REQUESTER = { id: 9, name: "Robin Requester", email: "robin@example.com", role: "REQUESTER" as const, mustChangePassword: false };
export const STAFF = { id: 41, name: "Quinn Staff", email: "quinn@example.com", role: "IT_STAFF" as const, mustChangePassword: false };
export const ADMIN = { id: 50, name: "Avery Admin", email: "avery@example.com", role: "ADMINISTRATOR" as const, mustChangePassword: false };

const ACTIVE = "currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED";

export function staffPayload(over: Json = {}): Json {
  return {
    generatedAt: "2026-10-12T10:20:00.000Z",
    metrics: {
      unassigned: { count: 7, query: `ticketOwnerId=unassigned&${ACTIVE}` },
      myAssigned: { count: 4, query: `ticketOwnerId=${STAFF.id}&${ACTIVE}` },
      new: { count: 14, query: "currentStatus=NEW" },
      inProgress: { count: 18, query: "currentStatus=IN_PROGRESS" },
      waitingForRequester: { count: 6, query: "currentStatus=WAITING_FOR_REQUESTER" },
      highPriority: { count: 3, query: `itPriority=HIGH&${ACTIVE}` },
    },
    myRecentTickets: [
      { id: 101, ticketNumber: "TKT-2026-000101", summary: "Laptop battery drains quickly", currentStatus: "IN_PROGRESS", itPriority: "MEDIUM", updatedAt: "2026-10-12T09:02:44.000Z" },
      { id: 99, ticketNumber: "TKT-2026-000099", summary: "Monitor flickers after lunch", currentStatus: "RESOLVED", itPriority: null, updatedAt: "2026-10-11T16:00:00.000Z" },
    ],
    myOpenActions: [
      { id: 33, ticketId: 101, ticketNumber: "TKT-2026-000101", description: "Run the battery diagnostic.", status: "PLANNED", actionAt: "2026-10-13T03:00:00.000Z" },
      { id: 34, ticketId: 99, ticketNumber: "TKT-2026-000099", description: "Swap the display cable.", status: "IN_PROGRESS", actionAt: "2026-10-13T05:30:00.000Z" },
    ],
    // API order on purpose: not sorted by updatedAt here, so a UI that re-sorted would show a different order.
    urgentTickets: [
      { id: 77, ticketNumber: "TKT-2026-000077", summary: "Cannot connect to VPN", currentStatus: "OPEN", itPriority: "HIGH", updatedAt: "2026-10-08T05:00:00.000Z" },
      { id: 12, ticketNumber: "TKT-2026-000012", summary: "Payroll system login loops", currentStatus: "WAITING_FOR_REQUESTER", itPriority: "HIGH", updatedAt: "2026-10-09T23:30:00.000Z" },
      { id: 80, ticketNumber: "TKT-2026-000080", summary: "Shared drive is read-only", currentStatus: "REOPENED", itPriority: "HIGH", updatedAt: "2026-10-07T01:15:00.000Z" },
    ],
    ...over,
  };
}

export function requesterPayload(over: Json = {}): Json {
  return {
    generatedAt: "2026-10-12T10:20:00.000Z",
    recentlyResolvedSince: "2026-09-12T10:20:00.000Z",
    metrics: {
      open: { count: 3, query: "currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED" },
      waitingForYou: { count: 2, query: "currentStatus=WAITING_FOR_REQUESTER" },
      resolved: { count: 5, query: "currentStatus=RESOLVED" },
      closed: { count: 12, query: "currentStatus=CLOSED" },
    },
    needsAttention: [
      { id: 88, ticketNumber: "TKT-2026-000088", summary: "VPN disconnects randomly", currentStatus: "WAITING_FOR_REQUESTER", waitingSince: "2026-10-08T07:00:00.000Z", updatedAt: "2026-10-11T07:00:00.000Z" },
      { id: 90, ticketNumber: "TKT-2026-000090", summary: "Printer asks for a PIN", currentStatus: "WAITING_FOR_REQUESTER", waitingSince: "2026-10-10T18:45:00.000Z", updatedAt: "2026-10-10T18:45:00.000Z" },
    ],
    recentlyUpdated: [
      { id: 101, ticketNumber: "TKT-2026-000101", summary: "Laptop battery drains quickly", currentStatus: "IN_PROGRESS", updatedAt: "2026-10-12T09:02:44.000Z" },
      { id: 88, ticketNumber: "TKT-2026-000088", summary: "VPN disconnects randomly", currentStatus: "WAITING_FOR_REQUESTER", updatedAt: "2026-10-11T07:00:00.000Z" },
    ],
    recentlyResolved: [
      { id: 95, ticketNumber: "TKT-2026-000095", summary: "Printer offline", currentStatus: "RESOLVED", updatedAt: "2026-10-11T15:00:00.000Z", resolvedAt: "2026-10-11T15:00:00.000Z" },
    ],
    ...over,
  };
}

export const emptyList = { data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } };

/**
 * A small server behind fetch. `me` is the session user (null: signed out). Login and the password
 * change update it, like the real API. Unknown routes answer 404.
 */
export function mockServer(opts: { me: Json | null; loginAs?: Json; routes?: Record<string, Handler> }) {
  const state = { me: opts.me };
  const calls: { key: string; url: URL; body: Json }[] = [];
  const routes: Record<string, Handler> = {
    "GET /api/auth/me": () => (state.me ? { status: 200, body: state.me } : { status: 401, body: { error: "Unauthorized" } }),
    "POST /api/auth/login": () => {
      state.me = opts.loginAs;
      return { status: 200, body: opts.loginAs };
    },
    "POST /api/auth/logout": () => {
      state.me = null;
      return { status: 200, body: { success: true } };
    },
    "POST /api/auth/change-password": () => {
      state.me = { ...state.me, mustChangePassword: false };
      return { status: 200, body: { success: true, mustChangePassword: false } };
    },
    "GET /api/dashboard/staff": () => ({ status: 200, body: staffPayload() }),
    "GET /api/dashboard/requester": () => ({ status: 200, body: requesterPayload() }),
    "GET /api/tickets": () => ({ status: 200, body: emptyList }),
    "GET /api/staff/tickets": () => ({ status: 200, body: emptyList }),
    "GET /api/categories": () => ({ status: 200, body: [{ id: 1, name: "Hardware" }] }),
    "GET /api/related-systems": () => ({ status: 200, body: [{ id: 1, name: "Email" }] }),
    "GET /api/staff/users": () => ({ status: 200, body: [{ id: 77, name: "Sam Other", email: "sam@example.com", role: "IT_STAFF" }] }),
    "GET /api/admin/users": () => ({ status: 200, body: [] }),
    ...opts.routes,
  };
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? "GET"} ${url.pathname}`;
    const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ key, url, body });
    const handler = routes[key];
    const reply = handler ? await handler({ url, body }) : { status: 404, body: { error: "Not found" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const count = (key: string) => calls.filter(c => c.key === key).length;
  const last = (key: string) => [...calls].reverse().find(c => c.key === key);
  return { spy, calls, count, last, state };
}

/** A reply the test releases later, to hold a request in flight. */
export function deferred() {
  let release!: (r: { status: number; body: unknown }) => void;
  const promise = new Promise<{ status: number; body: unknown }>(res => (release = res));
  return { promise, release };
}

const LocationProbe: React.FC = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
};

/** Renders the real application routes (AppContent, as App does) at `path`. */
export function renderApp(path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppContent />
        <LocationProbe />
      </MemoryRouter>
    </AuthProvider>
  );
}

const RealDateTimeFormat = Intl.DateTimeFormat;

/** Formats like the browser would in `timeZone` (en-US), without touching the process TZ. */
export function expectedTime(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new RealDateTimeFormat("en-US", { ...options, timeZone }).format(new Date(iso));
}
export const DATE_TIME: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" };
export const CLOCK: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

/** Makes every Intl.DateTimeFormat behave as in a browser set to `timeZone` (locale en-US). */
export function setBrowserTimeZone(timeZone: string) {
  return vi.spyOn(Intl, "DateTimeFormat").mockImplementation(((_locale?: string | string[], options?: Intl.DateTimeFormatOptions) =>
    new RealDateTimeFormat("en-US", { ...options, timeZone })) as unknown as typeof Intl.DateTimeFormat);
}
