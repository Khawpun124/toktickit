import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import appSource from "../../src/App.tsx?raw";
import headerSource from "../../src/components/AppHeader.tsx?raw";
import dashboardRouteSource from "../../src/components/dashboard/DashboardRoute.tsx?raw";
import { ROUTES, dashboardPathFor, landingPathFor } from "../../src/roles.js";
import { ADMIN, REQUESTER, STAFF, deferred, mockServer, renderApp } from "./dashboardTestKit.js";

// Issue 6 (final hardening) checks that can be automated. They have no row of their own in
// tests.md, so they use the "Hardening:" prefix. Everything renders the real application routes.

const SOURCES = import.meta.glob("../../src/**/*.{ts,tsx,css}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const TICKET = {
  id: 101, ticketNumber: "TKT-2026-000101", requesterId: REQUESTER.id, categoryName: "Hardware", relatedSystemName: "Corporate Laptop",
  summary: "Laptop battery drains quickly", description: "It lasts an hour.", requestedPriority: "MEDIUM", itPriority: null,
  currentStatus: "IN_PROGRESS", problemAppearsResolved: false, createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T08:00:00.000Z",
};
const ATTACHMENT = { id: 7, fileName: "battery.pdf", sizeBytes: 2048, uploadedAt: "2026-10-12T07:05:00.000Z", removedAt: null, removedReason: null };

const requesterDetailRoutes = (over = {}) => ({
  "GET /api/tickets/101": () => ({ status: 200, body: TICKET }),
  "GET /api/tickets/101/attachments": () => ({ status: 200, body: [ATTACHMENT] }),
  "GET /api/tickets/101/comments": () => ({ status: 200, body: [] }),
  "GET /api/tickets/101/actions": () => ({ status: 200, body: [] }),
  ...over,
});

const location = () => screen.getByTestId("location").textContent;

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error");
});
afterEach(() => {
  // Any console.error while a screen rendered or reacted is a failure (BR-36).
  const calls = consoleError.mock.calls.map(c => String(c[0]).slice(0, 200));
  vi.restoreAllMocks();
  expect(calls).toEqual([]);
});

describe("Hardening: main screens render without leftovers or console errors", () => {
  const LEFTOVER = /Development Requester|implemented in Issue|\bTODO\b|Lorem|\bstub\b|404 Not Found|\{"error"|undefined|NaN/;

  it.each([
    { role: "Requester", who: REQUESTER, path: "/tickets", heading: "My Tickets" },
    { role: "Requester", who: REQUESTER, path: "/dashboard", heading: "Welcome, Robin" },
    { role: "Requester", who: REQUESTER, path: "/tickets/new", heading: "Create Support Ticket" },
    { role: "IT Staff", who: STAFF, path: "/staff/dashboard", heading: "Welcome back, Quinn" },
    { role: "IT Staff", who: STAFF, path: "/staff/tickets", heading: "My Queue" },
    { role: "Administrator", who: ADMIN, path: "/admin/users", heading: "User Management" },
  ])("Hardening: $role at $path shows its page with no placeholder or leftover text", async ({ who, path, heading }) => {
    mockServer({ me: who });
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: new RegExp(heading) })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText(/Loading/i)).not.toBeInTheDocument());
    expect(screen.getByRole("main").textContent).not.toMatch(LEFTOVER);
  });

  it("Hardening: the Requester Ticket Detail renders without leftovers or console errors", async () => {
    mockServer({ me: REQUESTER, routes: requesterDetailRoutes() });
    renderApp("/tickets/101");
    expect(await screen.findByText("Laptop battery drains quickly")).toBeInTheDocument();
    expect(screen.getByRole("main").textContent).not.toMatch(LEFTOVER);
  });

  it("Hardening: a missing ticket on Staff Ticket Detail reads \"Ticket not found\", not a status code", async () => {
    mockServer({ me: STAFF, routes: { "GET /api/staff/tickets/999": () => ({ status: 404, body: { error: "Ticket not found" } }) } });
    renderApp("/staff/tickets/999");
    expect(await screen.findByRole("heading", { name: "Ticket not found" })).toBeInTheDocument();
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
  });
});

describe("Hardening: the client source has no leftovers", () => {
  const files = Object.entries(SOURCES);
  const RULES: [string, RegExp][] = [
    ["console output", /\bconsole\.(log|debug|info|warn|error)\s*\(/],
    ["TODO or FIXME", /\b(TODO|FIXME|XXX)\b/],
    ["Lorem ipsum", /\blorem\b/i],
    ["Development Requester", /Development Requester/],
    ["\"implemented in Issue\"", /implemented in Issue/i],
    ["stub", /\bstub\b/i],
    ["a link to # or to nothing", /href=(["'])#?\1|href=\{["'`]#?["'`]\}/],
    ["a blocking window.alert", /(^|[^.\w])(window\.)?alert\s*\(/m],
  ];

  it("Hardening: the scan covers every source file under client/src", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some(([f]) => f.endsWith("/App.tsx"))).toBe(true);
    expect(files.some(([f]) => f.endsWith(".css"))).toBe(true);
  });

  it.each(RULES)("Hardening: no file contains %s", (_label, pattern) => {
    const hits = files.filter(([, text]) => pattern.test(text)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});

describe("Hardening: roles and paths come from src/roles.ts", () => {
  it("Hardening: App, AppHeader, and DashboardRoute import roles.ts and hold no path literal of their own", () => {
    for (const [name, text] of [["App.tsx", appSource], ["AppHeader.tsx", headerSource], ["DashboardRoute.tsx", dashboardRouteSource]] as const) {
      expect(text, name).toMatch(/from "(\.\.\/)*(\.\/)?roles\.js"|from "\.\.\/\.\.\/roles\.js"|from "\.\/roles\.js"/);
      for (const path of Object.values(ROUTES)) {
        expect(text.includes(`"${path}"`), `${name} has "${path}"`).toBe(false);
      }
    }
  });

  it.each([
    { role: "Requester", who: REQUESTER, entries: [["Dashboard", ROUTES.requesterDashboard], ["My Tickets", ROUTES.myTickets], ["+ Create Ticket", ROUTES.createTicket]] },
    { role: "IT Staff", who: STAFF, entries: [["Dashboard", ROUTES.staffDashboard], ["My Queue", ROUTES.queue], ["+ Create Ticket", ROUTES.createTicket]] },
    { role: "Administrator", who: ADMIN, entries: [["Dashboard", ROUTES.staffDashboard], ["My Queue", ROUTES.queue], ["Admin / User Management", ROUTES.userManagement]] },
  ])("Hardening: the $role starts at landingPathFor and every header entry opens its ROUTES path", async ({ who, entries }) => {
    const user = userEvent.setup();
    mockServer({ me: who });
    renderApp("/");
    await waitFor(() => expect(location()).toBe(landingPathFor(who.role)));
    expect(dashboardPathFor(who.role)).toBe(entries[0][1]);
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    for (const [label, path] of entries) {
      await user.click(within(nav).getByRole("button", { name: label }));
      await waitFor(() => expect(location()).toBe(path));
      expect(within(nav).getByRole("button", { name: label })).toHaveAttribute("aria-current", "page");
    }
  });
});

describe("Hardening: Lab 2 and Lab 3 dialogs", () => {
  it("Hardening: Remove Attachment traps focus, closes with Escape, and returns focus to its opener", async () => {
    const user = userEvent.setup();
    mockServer({ me: REQUESTER, routes: requesterDetailRoutes() });
    renderApp("/tickets/101");
    const opener = await screen.findByRole("button", { name: "Remove battery.pdf" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Remove Attachment" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/Reason/i)).toHaveFocus();

    // Tab from the last control wraps to the first, Shift+Tab from the first wraps to the last.
    const buttons = within(dialog).getAllByRole("button");
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    within(dialog).getByRole("button", { name: "Close" }).focus();
    await user.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("Hardening: Remove Attachment keeps the typed reason and stays open after a failure, and ignores Escape while removing", async () => {
    const user = userEvent.setup();
    const hold = deferred();
    const server = mockServer({ me: REQUESTER, routes: requesterDetailRoutes({ "DELETE /api/attachments/7": () => hold.promise }) });
    renderApp("/tickets/101");
    await user.click(await screen.findByRole("button", { name: "Remove battery.pdf" }));
    await user.type(screen.getByLabelText(/Reason/i), "Uploaded the wrong file");
    await user.click(screen.getByRole("button", { name: "Confirm Removal" }));
    expect(screen.getByRole("button", { name: "Removing..." })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // cannot close while the request is in flight
    await user.click(screen.getByRole("button", { name: "Removing..." }));
    expect(server.count("DELETE /api/attachments/7")).toBe(1); // no duplicate submission

    hold.release({ status: 500, body: { error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" } });
    expect(await within(screen.getByRole("dialog")).findByText(/Unexpected error|Unable|Failed/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason/i)).toHaveValue("Uploaded the wrong file");
  });

  it("Hardening: Mark Problem as Resolved shows a failure inside the dialog (no window.alert) and returns focus on Escape", async () => {
    const user = userEvent.setup();
    const alertSpy = vi.fn();
    vi.stubGlobal("alert", alertSpy);
    mockServer({
      me: REQUESTER,
      routes: requesterDetailRoutes({ "PATCH /api/tickets/101/resolution-flag": () => ({ status: 500, body: { error: "Unable to update resolution flag" } }) }),
    });
    renderApp("/tickets/101");
    const opener = await screen.findByRole("button", { name: "Mark problem as resolved" });
    await user.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Mark Problem as Resolved" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Confirm Resolution" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Unable to update resolution flag");
    expect(alertSpy).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("Hardening: the Admin user panel is a modal dialog only as the narrow-screen overlay", async () => {
    const user = userEvent.setup();
    const matchMedia = (matches: boolean) => vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });

    // Desktop: the side panel is part of the page, not a dialog.
    vi.stubGlobal("matchMedia", matchMedia(false));
    mockServer({ me: ADMIN });
    const desktop = renderApp("/admin/users");
    await user.click(await screen.findByRole("button", { name: /Create User|New User|Add User/i }));
    expect((await screen.findAllByText("Create New User")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    desktop.unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    consoleError = vi.spyOn(console, "error");

    // Narrow screen: the overlay is a modal dialog with focus inside; Escape closes it and focus returns.
    vi.stubGlobal("matchMedia", matchMedia(true));
    mockServer({ me: ADMIN });
    renderApp("/admin/users");
    const opener = await screen.findByRole("button", { name: /Create User|New User|Add User/i });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Create New User" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    vi.unstubAllGlobals();
  });
});

describe("Hardening: forms keep their values and block duplicate submission", () => {
  async function fillLogin() {
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "TokTickIT Login" });
    await user.type(screen.getByLabelText(/Email address/i), "robin@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "ChangeMe123!");
    return user;
  }

  it("Hardening: Login sends once while in flight, then keeps both fields after a failure", async () => {
    const hold = deferred();
    const server = mockServer({ me: null, routes: { "POST /api/auth/login": () => hold.promise } });
    renderApp("/");
    const user = await fillLogin();
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    const busy = screen.getByRole("button", { name: /Signing in/ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(server.count("POST /api/auth/login")).toBe(1);
    hold.release({ status: 401, body: { error: "Invalid email or password. Please try again." } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password. Please try again.");
    expect(screen.getByLabelText(/Email address/i)).toHaveValue("robin@example.com");
    expect(screen.getByLabelText(/^Password$/i)).toHaveValue("ChangeMe123!");
  });

  it("Hardening: a Login answer that is not JSON shows the readable message, not a parse error", async () => {
    mockServer({ me: null });
    renderApp("/");
    const user = await fillLogin();
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }));
    await user.click(screen.getByRole("button", { name: "Sign In" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Invalid email or password. Please try again.");
    expect(alert.textContent).not.toMatch(/Unexpected token|JSON|<html|502/);
  });

  it("Hardening: a Change Password answer that is not JSON shows the readable message and keeps the fields", async () => {
    const user = userEvent.setup();
    mockServer({ me: { ...REQUESTER, mustChangePassword: true } });
    renderApp("/");
    await screen.findByRole("heading", { name: /Mandatory Password Change/i });
    await user.type(screen.getByLabelText(/Current \(Temporary\) Password/i), "ChangeMe123!");
    await user.type(screen.getByLabelText(/^New Password$/i), "NewPassword123!");
    await user.type(screen.getByLabelText(/^Confirm New Password$/i), "NewPassword123!");
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => new Response("Service Unavailable", { status: 503 }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Password change failed");
    expect(alert.textContent).not.toMatch(/Unexpected token|JSON/);
    expect(screen.getByLabelText(/^New Password$/i)).toHaveValue("NewPassword123!");
  });
});
