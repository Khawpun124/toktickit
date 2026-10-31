import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import * as api from "../../src/api.js";
import type { ActionTaken } from "../../src/actionsApi.js";
import { StaffTicketDetailScreen } from "../../src/components/StaffTicketDetailScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";

// Issue 4: status control on Staff Ticket Detail (ui-spec section 8): UI-08, UI-09, UI-10.
// Every request goes through a mocked fetch; no test depends on the real clock.

const TICKET_ID = 777;
const STAFF = { id: 41, name: "Quinn Staff", email: "quinn@example.com", role: "IT_STAFF" as const, mustChangePassword: false };

type Json = Record<string, any>;
type Reply = { status: number; body: unknown };
type Handler = (body: Json) => Reply;

function staffTicket(over: Json = {}): Json {
  return {
    id: TICKET_ID, ticketNumber: "TKT-2026-000777", requesterId: 9, requesterName: "Robin Requester",
    requesterEmail: "robin@example.com", categoryId: 1, categoryName: "Hardware", relatedSystemId: 1,
    relatedSystemName: "Corporate Laptop", summary: "Docking station not detected",
    description: "The laptop does not see the docking station.", requestedPriority: "MEDIUM", itPriority: "HIGH",
    currentStatus: "IN_PROGRESS", problemAppearsResolved: false, ticketOwnerId: null, ticketOwnerName: null,
    createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T08:00:00.000Z",
    version: 5, resolvedAt: null, statusChangedAt: "2026-10-12T08:00:00.000Z", openActionsCount: 0,
    ...over,
  };
}

const header = (t: Json) => ({
  id: t.id, currentStatus: t.currentStatus, itPriority: t.itPriority, ticketOwnerId: t.ticketOwnerId,
  ticketOwnerName: t.ticketOwnerName, problemAppearsResolved: t.problemAppearsResolved, version: t.version,
  resolvedAt: t.resolvedAt, statusChangedAt: t.statusChangedAt, openActionsCount: t.openActionsCount,
});

let seq = 0;
function action(over: Partial<ActionTaken> = {}): ActionTaken {
  seq += 1;
  const at = new Date(Date.UTC(2026, 9, 12, 6, seq)).toISOString();
  return {
    id: 5000 + seq, ticketId: TICKET_ID, actionAt: at, description: `Diagnose the dock, step ${seq}`, result: null,
    status: "PLANNED", performedBy: { id: STAFF.id, name: STAFF.name }, assignee: { id: STAFF.id, name: STAFF.name, isActive: true },
    followUpRequired: false, followUpNote: null, attachmentNotes: null, version: 1, createdAt: at, updatedAt: at, ...over,
  };
}

/**
 * A small in-memory server behind fetch. `state.ticket` is what GET returns; the default status
 * handler applies the change and returns the Ticket header, like the Lab 4 API.
 */
function mockServer(state: { ticket: Json; actions: ActionTaken[] }, overrides: Record<string, Handler> = {}) {
  const calls: { key: string; body: Json }[] = [];
  const routes: Record<string, Handler> = {
    "GET /api/auth/me": () => ({ status: 200, body: STAFF }),
    [`GET /api/staff/tickets/${TICKET_ID}`]: () => ({ status: 200, body: state.ticket }),
    "GET /api/staff/users": () => ({ status: 200, body: [{ id: STAFF.id, name: STAFF.name, email: STAFF.email, role: "IT_STAFF" }] }),
    [`GET /api/tickets/${TICKET_ID}/comments`]: () => ({ status: 200, body: [] }),
    [`GET /api/tickets/${TICKET_ID}/notes`]: () => ({ status: 200, body: [] }),
    [`GET /api/tickets/${TICKET_ID}/attachments`]: () => ({ status: 200, body: [] }),
    [`GET /api/tickets/${TICKET_ID}/actions`]: () => ({ status: 200, body: state.actions }),
    [`PATCH /api/staff/tickets/${TICKET_ID}/status`]: body => {
      state.ticket = { ...state.ticket, currentStatus: body.newStatus, version: state.ticket.version + 1 };
      return { status: 200, body: header(state.ticket) };
    },
    ...overrides,
  };
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${new URL(String(input)).pathname}`;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ key, body });
    const handler = routes[key];
    const reply = handler ? handler(body) : { status: 404, body: { error: "Not found" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
  });
  const count = (key: string) => calls.filter(c => c.key === key).length;
  return { spy, calls, count };
}

const DETAIL = `GET /api/staff/tickets/${TICKET_ID}`;
const STATUS = `PATCH /api/staff/tickets/${TICKET_ID}/status`;

async function renderPage() {
  const view = render(
    <MemoryRouter initialEntries={[`/staff/tickets/${TICKET_ID}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/staff/tickets/:id" element={<StaffTicketDetailScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
  await screen.findByText("TKT-2026-000777");
  await screen.findByRole("heading", { name: /^Actions Taken \(/ });
  // The page loads the Comments tab on open; wait for it so nothing updates after the test.
  await screen.findByText("No public comments yet.");
  return view;
}

const statusSelect = () => screen.getByLabelText("Select new ticket status") as HTMLSelectElement;
const optionValues = (s: HTMLSelectElement) => Array.from(s.options).map(o => o.value).filter(Boolean);

beforeEach(() => {
  vi.restoreAllMocks();
});

// ── UI-08 ────────────────────────────────────────────────────────────────

describe("Status control", () => {
  it.each([
    ["NEW", ["OPEN", "CANCELLED"]],
    ["OPEN", ["IN_PROGRESS", "CANCELLED"]],
    ["IN_PROGRESS", ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]],
    ["WAITING_FOR_REQUESTER", ["IN_PROGRESS", "RESOLVED", "CANCELLED"]],
    ["RESOLVED", ["CLOSED", "REOPENED"]],
    ["CLOSED", ["REOPENED"]],
    ["REOPENED", ["OPEN"]],
  ])("UI-08: from %s only the permitted next statuses %j are offered", async (from, expected) => {
    mockServer({ ticket: staffTicket({ currentStatus: from }), actions: [] });
    await renderPage();
    expect(optionValues(statusSelect())).toEqual(expected);
  });

  it("UI-08: a Cancelled Ticket offers no transition and its Ticket Operations fields are read-only", async () => {
    mockServer({ ticket: staffTicket({ currentStatus: "CANCELLED" }), actions: [] });
    await renderPage();
    expect(screen.queryByLabelText("Select new ticket status")).not.toBeInTheDocument();
    expect(screen.getByText("No further transitions available from this status.")).toBeInTheDocument();
    expect(screen.getByLabelText("Select ticket owner")).toBeDisabled();
    expect(screen.getByLabelText("Select IT priority")).toBeDisabled();
  });

  it("UI-08: a Closed Ticket has read-only owner and priority but still offers Reopened", async () => {
    mockServer({ ticket: staffTicket({ currentStatus: "CLOSED" }), actions: [] });
    await renderPage();
    expect(screen.getByLabelText("Select ticket owner")).toBeDisabled();
    expect(screen.getByLabelText("Select IT priority")).toBeDisabled();
    expect(screen.getByTestId("operations-read-only")).toHaveTextContent("read-only while the ticket is Closed");
    expect(statusSelect()).toBeEnabled();
    expect(optionValues(statusSelect())).toEqual(["REOPENED"]);
  });

  it("UI-08: the Requester's \"problem appears resolved\" flag is a read-only badge that enables or disables nothing", async () => {
    const snapshot = () => ({
      options: Array.from(statusSelect().options).map(o => `${o.value}:${o.disabled}`),
      owner: (screen.getByLabelText("Select ticket owner") as HTMLSelectElement).disabled,
      priority: (screen.getByLabelText("Select IT priority") as HTMLSelectElement).disabled,
    });
    mockServer({ ticket: staffTicket({ openActionsCount: 1 }), actions: [action()] });
    const first = await renderPage();
    const withoutFlag = snapshot();

    first.unmount();
    mockServer({ ticket: staffTicket({ openActionsCount: 1, problemAppearsResolved: true }), actions: [action()] });
    await renderPage();
    const badge = screen.getByText("Problem Appears Resolved");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.closest("button, a, select, input")).toBeNull();
    expect(snapshot()).toEqual(withoutFlag);
    // The gate still blocks Resolved.
    expect(Array.from(statusSelect().options).find(o => o.value === "RESOLVED")!.disabled).toBe(true);
  });
});

// ── UI-09 ────────────────────────────────────────────────────────────────

describe("Status-change confirmation (window.confirm)", () => {
  it("UI-09: Open to Cancelled asks with the count of unfinished actions; Cancel sends nothing, OK sends the change", async () => {
    const user = userEvent.setup();
    const server = mockServer({ ticket: staffTicket({ currentStatus: "OPEN", openActionsCount: 2 }), actions: [action(), action({ status: "IN_PROGRESS" })] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await renderPage();

    await user.selectOptions(statusSelect(), "CANCELLED");
    expect(confirmSpy).toHaveBeenCalledWith("Change status from Open to Cancelled?\n\n2 unfinished action(s) will be cancelled automatically.");
    expect(server.count(STATUS)).toBe(0);
    expect(statusSelect().value).toBe("");

    await user.selectOptions(statusSelect(), "CANCELLED");
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(server.count(STATUS)).toBe(1));
    expect(server.calls.find(c => c.key === STATUS)!.body).toEqual({ newStatus: "CANCELLED", expectedVersion: 5 });
    await screen.findByText(/Status changed from Open to Cancelled\./);
  });

  it.each([["RESOLVED", "CLOSED"], ["RESOLVED", "REOPENED"]])("UI-09: %s to %s does not ask and sends the change", async (from, to) => {
    const user = userEvent.setup();
    const server = mockServer({ ticket: staffTicket({ currentStatus: from }), actions: [] });
    const confirmSpy = vi.spyOn(window, "confirm");
    await renderPage();

    await user.selectOptions(statusSelect(), to);
    await waitFor(() => expect(server.count(STATUS)).toBe(1));
    expect(confirmSpy).not.toHaveBeenCalled();
    await screen.findByText(new RegExp(`Status changed from .* to ${to === "CLOSED" ? "Closed" : "Reopened"}\\.`));
  });

  it.each([
    ["CLOSED", "REOPENED", "Change status from Closed to Reopened?"],
    ["IN_PROGRESS", "RESOLVED", "Change status from In Progress to Resolved?"],
    ["WAITING_FOR_REQUESTER", "RESOLVED", "Change status from Waiting for Requester to Resolved?"],
  ])("UI-09: %s to %s asks \"%s\" first", async (from, to, question) => {
    const user = userEvent.setup();
    const server = mockServer({ ticket: staffTicket({ currentStatus: from }), actions: [] });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderPage();

    await user.selectOptions(statusSelect(), to);
    expect(confirmSpy).toHaveBeenCalledWith(question);
    await waitFor(() => expect(server.count(STATUS)).toBe(1));
    await screen.findByText(/Status changed from/);
  });
});

// ── UI-10 ────────────────────────────────────────────────────────────────

describe("Resolution gate and success", () => {
  it("UI-10: with unfinished actions Resolved is disabled, the callout shows the count, and its link moves focus to the Actions Taken card", async () => {
    const user = userEvent.setup();
    mockServer({ ticket: staffTicket({ openActionsCount: 2 }), actions: [action(), action({ status: "IN_PROGRESS" })] });
    await renderPage();

    const resolved = Array.from(statusSelect().options).find(o => o.value === "RESOLVED")!;
    expect(resolved.disabled).toBe(true);
    const callout = screen.getByTestId("resolution-gate-callout");
    expect(callout).toHaveTextContent("2 unfinished action(s) must be completed or cancelled before this ticket can be resolved.");
    expect(statusSelect().getAttribute("aria-describedby")).toBe(callout.id);

    await user.click(within(callout).getByRole("link", { name: "Go to Actions Taken" }));
    const card = document.getElementById("actions-taken")!;
    expect(card).toHaveFocus();
    expect(card).toHaveAttribute("tabindex", "-1");
  });

  it("UI-10: a successful change refreshes the summary status badge and version without reloading, and announces it politely", async () => {
    const user = userEvent.setup();
    const server = mockServer({ ticket: staffTicket({ currentStatus: "IN_PROGRESS", version: 5 }), actions: [] });
    await renderPage();
    expect(screen.getByTestId("ticket-summary-version")).toHaveTextContent("Version 5");
    const detailLoads = server.count(DETAIL);

    await user.selectOptions(statusSelect(), "WAITING_FOR_REQUESTER");
    const message = await screen.findByText("Status changed from In Progress to Waiting for Requester.", { exact: false });
    expect(message.closest("[role='status']")).not.toBeNull(); // a polite live region, not an alert
    expect(screen.getByTestId("ticket-summary-status")).toHaveTextContent("Waiting for Requester");
    expect(screen.getByTestId("ticket-summary-version")).toHaveTextContent("Version 6");
    expect(server.count(DETAIL)).toBe(detailLoads);
    expect(server.calls.find(c => c.key === STATUS)!.body).toEqual({ newStatus: "WAITING_FOR_REQUESTER", expectedVersion: 5 });
  });

  it("UI-10: a change sends expectedVersion only when the Ticket has a version (setTicketStatus with 3 or 2 arguments)", async () => {
    const user = userEvent.setup();
    const statusSpy = vi.spyOn(api, "setTicketStatus");
    let server = mockServer({ ticket: staffTicket({ currentStatus: "NEW", version: 3 }), actions: [] });
    statusSpy.mockClear();
    const first = await renderPage();
    await user.selectOptions(statusSelect(), "OPEN");
    await waitFor(() => expect(server.count(STATUS)).toBe(1));
    expect(statusSpy.mock.calls[0]).toEqual([TICKET_ID, "OPEN", { expectedVersion: 3 }]);
    expect(server.calls.find(c => c.key === STATUS)!.body).toEqual({ newStatus: "OPEN", expectedVersion: 3 });
    await screen.findByText(/Status changed from New to Open\./);

    first.unmount();
    const noVersion = staffTicket({ currentStatus: "NEW" });
    delete noVersion.version;
    server = mockServer({ ticket: noVersion, actions: [] }, {
      [STATUS]: () => ({ status: 200, body: { id: TICKET_ID, currentStatus: "OPEN" } }),
    });
    const statusSpy2 = vi.spyOn(api, "setTicketStatus");
    await renderPage();
    await user.selectOptions(statusSelect(), "OPEN");
    await waitFor(() => expect(server.count(STATUS)).toBe(1));
    expect(statusSpy2.mock.calls[0]).toEqual([TICKET_ID, "OPEN"]);
    expect(server.calls.find(c => c.key === STATUS)!.body).toEqual({ newStatus: "OPEN" });
    await screen.findByText(/Status changed from New to Open\./);
  });

  it("UI-10: a 409 gate from the server (stale data) shows the same callout and refreshes the counts", async () => {
    const user = userEvent.setup();
    const state = { ticket: staffTicket({ currentStatus: "IN_PROGRESS", openActionsCount: 0 }), actions: [] as ActionTaken[] };
    const server = mockServer(state, {
      [STATUS]: () => {
        // Someone added an Action after this page loaded.
        state.actions = [action()];
        state.ticket = { ...state.ticket, openActionsCount: 1 };
        return {
          status: 409,
          body: { error: "1 unfinished action(s) must be completed or cancelled before this ticket can be resolved.", code: "OPEN_ACTIONS_BLOCK_RESOLUTION", openActionsCount: 1 },
        };
      },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderPage();
    expect(screen.queryByTestId("resolution-gate-callout")).not.toBeInTheDocument();
    const detailLoads = server.count(DETAIL);
    const listLoads = server.count(`GET /api/tickets/${TICKET_ID}/actions`);

    await user.selectOptions(statusSelect(), "RESOLVED");
    const callout = await screen.findByTestId("resolution-gate-callout");
    expect(callout).toHaveTextContent("1 unfinished action(s) must be completed or cancelled before this ticket can be resolved.");
    await waitFor(() => expect(server.count(DETAIL)).toBe(detailLoads + 1));
    await waitFor(() => expect(server.count(`GET /api/tickets/${TICKET_ID}/actions`)).toBe(listLoads + 1));
    expect(await screen.findByRole("heading", { name: "Actions Taken (1)" })).toBeInTheDocument();
    expect(Array.from(statusSelect().options).find(o => o.value === "RESOLVED")!.disabled).toBe(true);
    expect(screen.getByTestId("ticket-summary-status")).toHaveTextContent("In Progress");
  });

  it("UI-10: a 409 STALE_VERSION shows the conflict with a Reload button and does not overwrite", async () => {
    const user = userEvent.setup();
    const state = { ticket: staffTicket({ currentStatus: "OPEN", version: 5 }), actions: [] as ActionTaken[] };
    const server = mockServer(state, {
      [STATUS]: () => {
        state.ticket = { ...state.ticket, currentStatus: "CANCELLED", version: 6 }; // changed in another tab
        return { status: 409, body: { error: "This ticket was changed by someone else. Reload it to see the latest version.", code: "STALE_VERSION", currentVersion: 6, current: header(state.ticket) } };
      },
    });
    await renderPage();

    await user.selectOptions(statusSelect(), "IN_PROGRESS");
    const alert = await screen.findByText(/changed by someone else, so your change was not saved/);
    expect(screen.getByTestId("ticket-summary-status")).toHaveTextContent("Open");
    expect(screen.getByTestId("ticket-summary-version")).toHaveTextContent("Version 5");

    await user.click(within(alert.closest("[role='alert']") as HTMLElement).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(screen.getByTestId("ticket-summary-version")).toHaveTextContent("Version 6"));
    expect(screen.getByTestId("ticket-summary-status")).toHaveTextContent("Cancelled");
    expect(screen.queryByText(/changed by someone else, so your change was not saved/)).not.toBeInTheDocument();
    expect(server.count(STATUS)).toBe(1);
  });

  it("UI-10: owner and priority conflicts (409 STALE_VERSION) offer a Reload too", async () => {
    const user = userEvent.setup();
    const state = { ticket: staffTicket({ currentStatus: "OPEN", version: 5 }), actions: [] as ActionTaken[] };
    mockServer(state, {
      [`PATCH /api/staff/tickets/${TICKET_ID}/priority`]: () => ({
        status: 409,
        body: { error: "Stale", code: "STALE_VERSION", currentVersion: 6, current: header({ ...state.ticket, version: 6 }) },
      }),
    });
    await renderPage();
    await user.selectOptions(screen.getByLabelText("Select IT priority"), "LOW");
    const alert = (await screen.findByText(/changed by someone else, so your change was not saved/)).closest("[role='alert']") as HTMLElement;
    expect(within(alert).getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect((screen.getByLabelText("Select IT priority") as HTMLSelectElement).value).toBe("HIGH");
  });

  it("UI-10: the Actions Taken card and the status control are linked: completing an Action lowers the count in the callout", async () => {
    const user = userEvent.setup();
    const first = action({ status: "IN_PROGRESS" });
    const second = action({ status: "PLANNED" });
    const state = { ticket: staffTicket({ currentStatus: "IN_PROGRESS", openActionsCount: 2 }), actions: [first, second] };
    const server = mockServer(state, {
      [`PATCH /api/staff/actions/${first.id}/status`]: body => {
        const done = { ...first, status: "COMPLETED" as const, result: body.result, version: first.version + 1 };
        state.actions = [done, second];
        state.ticket = { ...state.ticket, openActionsCount: 1 };
        return { status: 200, body: done };
      },
    });
    await renderPage();
    expect(screen.getByTestId("resolution-gate-callout")).toHaveTextContent("2 unfinished action(s)");
    const detailLoads = server.count(DETAIL);

    const row = screen.getByTestId("actions-table-view").querySelector(`tr[data-action-id="${first.id}"]`) as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /View action from/ }));
    const dialog = await screen.findByRole("dialog", { name: "Action details" });
    await user.click(within(dialog).getByRole("button", { name: "Mark completed" }));
    await user.type(within(dialog).getByLabelText(/^Result/), "Dock firmware updated");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByTestId("resolution-gate-callout")).toHaveTextContent("1 unfinished action(s)"));
    expect(server.count(DETAIL)).toBe(detailLoads + 1);
    await within(dialog).findByText("Status changed to Completed.");
  });
});
