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

// ─── Hardening: forms (FR-19, BR-34) ─────────────────────────────────────────
// Every important form in client/src, table-driven. For each one and for both failure kinds
// (network down, 5xx): (a) two quick clicks send one request and the control is disabled while it
// is in flight; (b) after the failure the entered values are all still there, the form is still
// open, a readable message is shown (no raw JSON), and the control works again; (c) submitting again
// sends one new request with the same values, and only that success clears or closes the form.

type FormReply = { status: number; body: unknown };
function pending() {
  let resolve!: (r: FormReply) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<FormReply>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const STAFF_TICKET = {
  id: 101, ticketNumber: "TKT-2026-000101", requesterId: 9, requesterName: "Robin Requester", requesterEmail: "robin@example.com",
  categoryId: 1, categoryName: "Hardware", relatedSystemId: 1, relatedSystemName: "Corporate Laptop",
  summary: "Laptop battery drains quickly", description: "It lasts an hour.", requestedPriority: "MEDIUM", itPriority: "HIGH",
  currentStatus: "IN_PROGRESS", problemAppearsResolved: false, ticketOwnerId: null, ticketOwnerName: null,
  createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T08:00:00.000Z",
  version: 3, resolvedAt: null, statusChangedAt: "2026-10-12T08:00:00.000Z", openActionsCount: 0,
};
const ADMIN_ROW = { id: 60, name: "Pat Person", email: "pat@example.com", role: "REQUESTER", isActive: true, mustChangePassword: false };
const COMMENT = (content: string, role = "REQUESTER") => ({
  id: 900, ticketId: 101, authorId: 9, authorName: "Robin Requester", authorRole: role, content, createdAt: "2026-10-12T09:00:00.000Z",
});

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.querySelectorAll<T>(`#${id}`)[0];
/** Waits until the element exists (waitFor retries only on a thrown error). */
const findById = (id: string) => waitFor(() => { const el = byId(id); if (!el) throw new Error(`#${id} not rendered yet`); return el; });
const valueOf = (id: string) => (byId<HTMLInputElement>(id)?.value ?? null);

type User = ReturnType<typeof userEvent.setup>;
type FormCase = {
  form: string;
  file: string;
  me: object | null;
  path: string;
  routes?: Record<string, (ctx: { url: URL; body: any }) => FormReply | Promise<FormReply>>;
  submitKey: string;
  successReply: FormReply;
  /** Opens the form and enters the values. */
  fill: (user: User) => Promise<void>;
  /** The control that sends the request. */
  control: () => HTMLElement;
  /** Submits once. */
  send: (user: User) => Promise<void>;
  /** The entered values that must survive a failure. */
  values: () => Record<string, unknown>;
  /** Proof that the form is still open after a failure. */
  stillOpen: () => void;
  /** What success does to the form: clear it or close it. */
  afterSuccess: () => Promise<void>;
};

const clickOn = (get: () => HTMLElement) => async (user: User) => {
  await user.click(get());
};
const PDF = () => new File(["%PDF-1.4 hello"], "invoice.pdf", { type: "application/pdf" });

const STAFF_DETAIL_ROUTES = {
  "GET /api/staff/tickets/101": () => ({ status: 200, body: STAFF_TICKET }),
  "GET /api/tickets/101/comments": () => ({ status: 200, body: [] }),
  "GET /api/tickets/101/notes": () => ({ status: 200, body: [] }),
  "GET /api/tickets/101/attachments": () => ({ status: 200, body: [] }),
  "GET /api/tickets/101/actions": () => ({ status: 200, body: [] }),
};

const staffTextForm = (kind: "comment" | "note"): FormCase => {
  const input = kind === "comment" ? "staff-public-comment-input" : "staff-internal-note-input";
  const button = kind === "comment" ? "staff-post-comment-btn" : "staff-post-note-btn";
  const text = kind === "comment" ? "Replacement battery ordered." : "Vendor case 4471 opened.";
  return {
    form: kind === "comment" ? "Public Comment (Staff)" : "Internal Note (Staff)",
    file: "client/src/components/StaffTicketDetailScreen.tsx", me: STAFF, path: "/staff/tickets/101",
    routes: STAFF_DETAIL_ROUTES,
    submitKey: kind === "comment" ? "POST /api/tickets/101/comments" : "POST /api/tickets/101/notes",
    successReply: { status: 201, body: COMMENT(text, "IT_STAFF") },
    fill: async user => {
      await screen.findByText("Laptop battery drains quickly");
      if (kind === "note") await user.click(byId("tab-notes"));
      await waitFor(() => expect(byId(input)).toBeTruthy());
      await user.type(byId(input), text);
    },
    control: () => byId(button),
    send: clickOn(() => byId(button)),
    values: () => ({ text: valueOf(input) }),
    stillOpen: () => expect(byId(input)).toBeTruthy(),
    afterSuccess: async () => {
      await waitFor(() => expect(valueOf(input)).toBe(""));
    },
  };
};

const FORMS: FormCase[] = [
  {
    form: "Create Ticket", file: "client/src/components/CreateTicketScreen.tsx", me: REQUESTER, path: "/tickets/new",
    submitKey: "POST /api/tickets",
    successReply: {
      status: 201,
      body: {
        id: 501, ticketNumber: "TKT-2026-000501", requesterId: 9, categoryId: 1, relatedSystemId: 1, summary: "Printer is jammed",
        description: "Paper stuck in tray 2.", requestedPriority: "HIGH", itPriority: null, currentStatus: "NEW",
        createdAt: "2026-10-12T09:00:00.000Z", updatedAt: "2026-10-12T09:00:00.000Z", attachmentUploadErrors: [],
      },
    },
    fill: async user => {
      await screen.findByRole("option", { name: "Hardware" });
      await user.selectOptions(byId("categorySelect"), "1");
      await user.selectOptions(byId("relatedSystemSelect"), "1");
      await user.selectOptions(byId("prioritySelect"), "HIGH");
      await user.type(byId("summaryInput"), "Printer is jammed");
      await user.type(byId("descriptionInput"), "Paper stuck in tray 2.");
    },
    control: () => screen.getByRole("button", { name: /Submit Ticket|Submitting/ }),
    send: clickOn(() => screen.getByRole("button", { name: "Submit Ticket" })),
    values: () => ({
      category: valueOf("categorySelect"), system: valueOf("relatedSystemSelect"), priority: valueOf("prioritySelect"),
      summary: valueOf("summaryInput"), description: valueOf("descriptionInput"),
    }),
    stillOpen: () => expect(byId("summaryInput")).toBeTruthy(),
    afterSuccess: async () => {
      expect(await screen.findByText("Ticket Created Successfully!")).toBeInTheDocument();
      expect(byId("summaryInput")).toBeUndefined();
    },
  },
  {
    form: "Public Comment (Requester)", file: "client/src/components/RequesterTicketDetailScreen.tsx", me: REQUESTER, path: "/tickets/101",
    routes: requesterDetailRoutes(), submitKey: "POST /api/tickets/101/comments",
    successReply: { status: 201, body: COMMENT("Still draining after the update.") },
    fill: async user => {
      await user.type(await screen.findByLabelText("Add Public Comment"), "Still draining after the update.");
    },
    control: () => screen.getByRole("button", { name: /Post Comment|Posting/ }),
    send: clickOn(() => screen.getByRole("button", { name: "+ Post Comment" })),
    values: () => ({ text: valueOf("publicCommentInput") }),
    stillOpen: () => expect(byId("publicCommentInput")).toBeTruthy(),
    afterSuccess: async () => {
      await waitFor(() => expect(valueOf("publicCommentInput")).toBe(""));
      expect(screen.getByText("Still draining after the update.")).toBeInTheDocument();
    },
  },
  {
    form: "Upload Attachment (Requester)", file: "client/src/components/RequesterTicketDetailScreen.tsx", me: REQUESTER, path: "/tickets/101",
    routes: requesterDetailRoutes({ "GET /api/tickets/101/attachments": () => ({ status: 200, body: [] }) }),
    submitKey: "POST /api/tickets/101/attachments",
    successReply: { status: 201, body: { id: 8, fileName: "invoice.pdf", sizeBytes: 14, uploadedAt: "2026-10-12T09:00:00.000Z", removedAt: null, removedReason: null } },
    fill: async () => {
      await screen.findByLabelText("Upload Attachment");
    },
    control: () => screen.getByLabelText("Upload Attachment"),
    send: async user => {
      await user.upload(screen.getByLabelText("Upload Attachment") as HTMLInputElement, PDF());
    },
    values: () => ({}), // a file is chosen again; nothing typed can be lost
    stillOpen: () => expect(screen.getByLabelText("Upload Attachment")).toBeInTheDocument(),
    afterSuccess: async () => {
      expect(await screen.findByText(/uploaded successfully/)).toBeInTheDocument();
    },
  },
  {
    form: "Remove Attachment (Requester)", file: "client/src/components/RequesterTicketDetailScreen.tsx", me: REQUESTER, path: "/tickets/101",
    routes: requesterDetailRoutes(), submitKey: "DELETE /api/attachments/7",
    successReply: { status: 200, body: { ...ATTACHMENT, removedAt: "2026-10-12T09:00:00.000Z", removedReason: "Uploaded the wrong file" } },
    fill: async user => {
      await user.click(await screen.findByRole("button", { name: "Remove battery.pdf" }));
      await user.type(screen.getByLabelText(/Reason/i), "Uploaded the wrong file");
    },
    control: () => screen.getByRole("button", { name: /Confirm Removal|Removing/ }),
    send: clickOn(() => screen.getByRole("button", { name: "Confirm Removal" })),
    values: () => ({ reason: valueOf("removeReasonInput") }),
    stillOpen: () => expect(screen.getByRole("dialog", { name: "Remove Attachment" })).toBeInTheDocument(),
    afterSuccess: async () => {
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    },
  },
  {
    form: "Mark Problem as Resolved (Requester)", file: "client/src/components/RequesterTicketDetailScreen.tsx", me: REQUESTER, path: "/tickets/101",
    routes: requesterDetailRoutes(), submitKey: "PATCH /api/tickets/101/resolution-flag",
    successReply: { status: 200, body: { id: 101, problemAppearsResolved: true } },
    fill: async user => {
      await user.click(await screen.findByRole("button", { name: "Mark problem as resolved" }));
    },
    control: () => screen.getByRole("button", { name: /Confirm Resolution|Submitting/ }),
    send: clickOn(() => screen.getByRole("button", { name: "Confirm Resolution" })),
    values: () => ({}), // a confirmation without fields
    stillOpen: () => expect(screen.getByRole("dialog", { name: "Mark Problem as Resolved" })).toBeInTheDocument(),
    afterSuccess: async () => {
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(screen.getByText(/Problem Appears Resolved/)).toBeInTheDocument();
    },
  },
  staffTextForm("comment"),
  staffTextForm("note"),
  {
    form: "Login", file: "client/src/components/LoginScreen.tsx", me: null, path: "/",
    submitKey: "POST /api/auth/login", successReply: { status: 200, body: REQUESTER },
    fill: async user => {
      await screen.findByRole("heading", { name: "TokTickIT Login" });
      await user.type(screen.getByLabelText(/Email address/i), "robin@example.com");
      await user.type(screen.getByLabelText(/^Password$/i), "ChangeMe123!");
    },
    control: () => screen.getByRole("button", { name: /Sign In|Signing in/ }),
    send: clickOn(() => screen.getByRole("button", { name: "Sign In" })),
    values: () => ({ email: valueOf("email"), password: valueOf("password") }),
    stillOpen: () => expect(screen.getByRole("heading", { name: "TokTickIT Login" })).toBeInTheDocument(),
    afterSuccess: async () => {
      expect(await screen.findByRole("heading", { level: 1, name: "My Tickets" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "TokTickIT Login" })).not.toBeInTheDocument();
    },
  },
  {
    form: "Change Password", file: "client/src/components/ChangePasswordScreen.tsx", me: { ...REQUESTER, mustChangePassword: true }, path: "/",
    submitKey: "POST /api/auth/change-password", successReply: { status: 200, body: { success: true, mustChangePassword: false } },
    fill: async user => {
      await screen.findByRole("heading", { name: /Mandatory Password Change/i });
      await user.type(screen.getByLabelText(/Current \(Temporary\) Password/i), "ChangeMe123!");
      await user.type(screen.getByLabelText(/^New Password$/i), "NewPassword123!");
      await user.type(screen.getByLabelText(/^Confirm New Password$/i), "NewPassword123!");
    },
    control: () => document.querySelector<HTMLElement>("form button[type=submit]")!,
    send: clickOn(() => document.querySelector<HTMLElement>("form button[type=submit]")!),
    values: () => ({ current: valueOf("currentPassword"), next: valueOf("newPassword"), confirm: valueOf("confirmPassword") }),
    stillOpen: () => expect(screen.getByRole("heading", { name: /Mandatory Password Change/i })).toBeInTheDocument(),
    afterSuccess: async () => {
      await waitFor(() => expect(screen.queryByRole("heading", { name: /Mandatory Password Change/i })).not.toBeInTheDocument());
    },
  },
  {
    form: "Admin Create User", file: "client/src/components/UserManagementScreen.tsx", me: ADMIN, path: "/admin/users",
    routes: { "GET /api/admin/users": () => ({ status: 200, body: [ADMIN_ROW] }) },
    submitKey: "POST /api/admin/users",
    successReply: { status: 201, body: { ...ADMIN_ROW, id: 61, name: "Sam New", email: "sam.new@example.com", role: "IT_STAFF" } },
    fill: async user => {
      await user.click(await findById("create-user-btn"));
      await waitFor(() => expect(byId("user-form-name")).toBeTruthy());
      await user.type(byId("user-form-name"), "Sam New");
      await user.type(byId("user-form-email"), "sam.new@example.com");
      await user.selectOptions(byId("user-form-role"), "IT_STAFF");
      await user.type(byId("user-form-password"), "Welcome123!");
    },
    control: () => byId("user-form-submit-btn"),
    send: clickOn(() => byId("user-form-submit-btn")),
    values: () => ({ name: valueOf("user-form-name"), email: valueOf("user-form-email"), role: valueOf("user-form-role"), password: valueOf("user-form-password") }),
    stillOpen: () => expect(byId("user-form-name")).toBeTruthy(),
    afterSuccess: async () => {
      expect(await screen.findAllByText("User created successfully.")).not.toHaveLength(0);
      // BR-34: the entered values are cleared only after success
      expect(valueOf("user-form-name"), "create form after success").toBe("");
    },
  },
  {
    form: "Admin Edit User", file: "client/src/components/UserManagementScreen.tsx", me: ADMIN, path: "/admin/users",
    routes: { "GET /api/admin/users": () => ({ status: 200, body: [ADMIN_ROW] }) },
    submitKey: "PATCH /api/admin/users/60", successReply: { status: 200, body: { ...ADMIN_ROW, name: "Pat Renamed" } },
    fill: async user => {
      await user.click(await findById("edit-user-60-btn"));
      await waitFor(() => expect(byId("user-form-name")).toBeTruthy());
      await user.clear(byId("user-form-name"));
      await user.type(byId("user-form-name"), "Pat Renamed");
    },
    control: () => byId("user-form-submit-btn"),
    send: clickOn(() => byId("user-form-submit-btn")),
    values: () => ({ name: valueOf("user-form-name"), email: valueOf("user-form-email"), role: valueOf("user-form-role") }),
    stillOpen: () => expect(byId("user-form-name")).toBeTruthy(),
    afterSuccess: async () => {
      expect(await screen.findAllByText("User updated successfully.")).not.toHaveLength(0);
      expect(valueOf("user-form-name")).toBe("Pat Renamed"); // an edit form shows the saved record
    },
  },
  {
    form: "Admin Reset Password", file: "client/src/components/UserManagementScreen.tsx", me: ADMIN, path: "/admin/users",
    routes: { "GET /api/admin/users": () => ({ status: 200, body: [ADMIN_ROW] }) },
    submitKey: "POST /api/admin/users/60/reset-password", successReply: { status: 200, body: { success: true, mustChangePassword: true } },
    fill: async user => {
      await user.click(await findById("edit-user-60-btn"));
      await waitFor(() => expect(byId("user-reset-password")).toBeTruthy());
      await user.type(byId("user-reset-password"), "TempReset123!");
    },
    control: () => byId("reset-password-btn"),
    send: clickOn(() => byId("reset-password-btn")),
    values: () => ({ password: valueOf("user-reset-password") }),
    stillOpen: () => expect(byId("user-reset-password")).toBeTruthy(),
    afterSuccess: async () => {
      expect(await screen.findAllByText(/Password reset successfully/)).not.toHaveLength(0);
      expect(valueOf("user-reset-password")).toBe("");
    },
  },
];

describe("Hardening: forms keep their values, block a second submission, and retry once", () => {
  const FAILURES = [
    { kind: "network failure", fail: (p: ReturnType<typeof pending>) => p.reject(new TypeError("Failed to fetch")), message: /Unable to connect to TokTickIT API/ },
    {
      kind: "5xx",
      fail: (p: ReturnType<typeof pending>) => p.resolve({ status: 500, body: { error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" } }),
      message: /Unexpected error\. Please try again\./,
    },
  ];
  const cases = FORMS.flatMap(f => FAILURES.map(x => ({ ...f, ...x, label: `${f.form} after a ${x.kind}` })));

  it("Hardening: forms: the table covers every Lab 1-3 file that submits a form or a file", () => {
    const submitting = Object.entries(SOURCES)
      .filter(([f, t]) => /onSubmit=|type="file"/.test(t) && !f.includes("/actions/"))
      .map(([f]) => f.replace(/^.*\/src\//, "client/src/"))
      .sort();
    expect([...new Set(FORMS.map(f => f.file))].sort()).toEqual(submitting);
    expect(FORMS).toHaveLength(12);
  });

  it.each(cases)("Hardening: forms: $label", async c => {
    const user = userEvent.setup();
    const first = pending();
    let call = 0;
    const server = mockServer({
      me: c.me,
      loginAs: REQUESTER,
      routes: { ...c.routes, [c.submitKey]: () => (++call === 1 ? first.promise : c.successReply) },
    });
    renderApp(c.path);
    await c.fill(user);
    const before = c.values();

    // (a) two quick submissions: one request, and the control is disabled while it is in flight
    await c.send(user);
    await waitFor(() => expect(server.count(c.submitKey)).toBe(1));
    expect(c.control()).toBeDisabled();
    await c.send(user).catch(() => {}); // a disabled control does nothing
    expect(server.count(c.submitKey)).toBe(1);

    // (b) the failure keeps every value and the form, with a readable message
    c.fail(first);
    expect(await screen.findAllByText(c.message)).not.toHaveLength(0);
    c.stillOpen();
    expect(c.values()).toEqual(before);
    expect(screen.getByRole("main").textContent).not.toMatch(/\{"|INTERNAL_ERROR|TypeError|Failed to fetch/);
    await waitFor(() => expect(c.control()).not.toBeDisabled());

    // (c) submitting again sends one new request with the same values; that success clears or closes
    await c.send(user);
    await waitFor(() => expect(server.count(c.submitKey)).toBe(2));
    const [firstCall, retry] = server.calls.filter(x => x.key === c.submitKey);
    expect(retry.body).toEqual(firstCall.body);
    await c.afterSuccess();
    expect(server.count(c.submitKey)).toBe(2);
  });
});
