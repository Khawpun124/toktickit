import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { render, screen, waitFor, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import * as api from "../../src/api.js";
import * as actionsApi from "../../src/actionsApi.js";
import type { ActionTaken } from "../../src/actionsApi.js";
import { ActionsTakenCard } from "../../src/components/actions/ActionsTakenCard.js";
import { StaffTicketDetailScreen } from "../../src/components/StaffTicketDetailScreen.js";
import { RequesterTicketDetailScreen } from "../../src/components/RequesterTicketDetailScreen.js";
import { AuthProvider } from "../../src/context/AuthContext.js";

// Issue 3: Actions Taken UI (tests.md UI-01..07, UI-18, UI-20, STYLE-03, STYLE-04, A11Y-01).
// The API is mocked at the client module boundary; the clock is fixed (Date only).

const FIXED_NOW = new Date("2026-10-12T09:30:00.000Z");
const TICKET_ID = 501;
const STAFF = { id: 7, name: "Morgan Staff" };
const ADMIN = { id: 8, name: "Riley Admin" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let seq = 0;
function makeAction(over: Partial<ActionTaken> = {}): ActionTaken {
  seq += 1;
  const at = new Date(Date.UTC(2026, 9, 12, 8, seq)).toISOString();
  return {
    id: 1000 + seq,
    ticketId: TICKET_ID,
    actionAt: at,
    description: `Checked the laptop battery, step ${seq}`,
    result: null,
    status: "PLANNED",
    performedBy: { ...STAFF },
    assignee: { ...STAFF, isActive: true },
    followUpRequired: false,
    followUpNote: null,
    attachmentNotes: null,
    version: 1,
    createdAt: at,
    updatedAt: at,
    ...over,
  };
}

const apiError = (status: number, body?: object) => new actionsApi.ActionApiError(status, body);
const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

let listSpy: MockInstance<typeof actionsApi.listActions>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  listSpy = vi.spyOn(actionsApi, "listActions").mockResolvedValue([]);
  vi.spyOn(api, "getStaffUsers").mockResolvedValue([
    { id: STAFF.id, name: STAFF.name, email: "morgan@example.com", role: "IT_STAFF" },
    { id: ADMIN.id, name: ADMIN.name, email: "riley@example.com", role: "ADMINISTRATOR" },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderStaffCard(actions: ActionTaken[], ticketStatus = "IN_PROGRESS") {
  listSpy.mockResolvedValue(actions);
  const view = render(<ActionsTakenCard ticketId={TICKET_ID} ticketStatus={ticketStatus} mode="staff" currentUser={STAFF} />);
  await screen.findByRole("heading", { name: `Actions Taken (${actions.length})` });
  return view;
}

async function renderRequesterCard(actions: ActionTaken[]) {
  listSpy.mockResolvedValue(actions);
  render(<ActionsTakenCard ticketId={TICKET_ID} ticketStatus="IN_PROGRESS" mode="requester" />);
  await screen.findByRole("heading", { name: `Actions Taken by IT Staff (${actions.length})` });
}

/** Opens the dialog of an Action from its table row. */
async function openAction(user: ReturnType<typeof userEvent.setup>, a: ActionTaken) {
  const table = screen.getByTestId("actions-table-view");
  const row = table.querySelector(`tr[data-action-id="${a.id}"]`) as HTMLElement;
  const button = within(row).getByRole("button", { name: /View action from/ });
  await user.click(button);
  return { dialog: await screen.findByRole("dialog", { name: "Action details" }), button };
}

async function openAdd(user: ReturnType<typeof userEvent.setup>) {
  const add = screen.getByRole("button", { name: "Add Action" });
  await user.click(add);
  return { dialog: await screen.findByRole("dialog", { name: "Add Action" }), add };
}

const queryControls = (root: HTMLElement) => ({
  edit: within(root).queryByRole("button", { name: "Edit" }),
  save: within(root).queryByRole("button", { name: /^Save/ }),
  start: within(root).queryByRole("button", { name: "Start" }),
  complete: within(root).queryByRole("button", { name: "Mark completed" }),
  cancel: within(root).queryByRole("button", { name: "Cancel action" }),
});

// ── UI-01 ────────────────────────────────────────────────────────────────

describe("Actions Taken list", () => {
  it("UI-01: rows keep the API order (never re-sorted), as a table and as mobile cards, with text status badges", async () => {
    // Deliberately not sorted by actionAt: the UI must keep the order the API sent.
    const later = makeAction({ status: "PLANNED", actionAt: "2026-10-12T09:00:00.000Z" });
    const earlier = makeAction({ status: "IN_PROGRESS", actionAt: "2026-10-12T07:00:00.000Z" });
    const done = makeAction({ status: "COMPLETED", result: "Battery replaced and tested." });
    const cancelled = makeAction({ status: "CANCELLED", result: "Requester no longer needs it.", followUpRequired: true, followUpNote: "Call back next week." });
    const list = [later, earlier, done, cancelled];
    await renderStaffCard(list);

    const table = screen.getByTestId("actions-table-view");
    expect(table).toHaveClass("d-none", "d-md-block", "table-responsive");
    const headers = within(table).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers).toEqual(["Date/Time", "Description", "Status", "Assigned to", "Follow-up", "Details"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map(r => Number(r.getAttribute("data-action-id")))).toEqual(list.map(a => a.id));

    const cards = screen.getByTestId("actions-card-view");
    expect(cards).toHaveClass("d-md-none");
    const items = within(cards).getAllByRole("listitem");
    expect(items.map(i => Number(i.getAttribute("data-action-id")))).toEqual(list.map(a => a.id));

    expect(rows[0]).toHaveTextContent("○ Planned");
    expect(rows[1]).toHaveTextContent("◐ In progress");
    expect(rows[2]).toHaveTextContent("✓ Completed");
    expect(rows[3]).toHaveTextContent("✕ Cancelled");
    expect(rows[3]).toHaveTextContent("⚑ Follow-up");
    expect(items[3]).toHaveTextContent("⚑ Follow-up");
    // Shown in the browser's time zone, display only.
    expect(rows[0]).toHaveTextContent(new Date(later.actionAt).toLocaleString());
    expect(rows[0]).toHaveTextContent(STAFF.name);
  });

  it("UI-01: empty state for staff", async () => {
    await renderStaffCard([]);
    expect(screen.getByText("No actions recorded yet.")).toBeInTheDocument();
    expect(screen.queryByTestId("actions-table-view")).not.toBeInTheDocument();
  });

  it("UI-01: empty state for the Requester", async () => {
    await renderRequesterCard([]);
    expect(screen.getByText("No actions have been recorded for this ticket yet.")).toBeInTheDocument();
  });

  it("UI-01: shows skeleton rows while loading and a safe message with Retry on failure", async () => {
    const pending = deferred<ActionTaken[]>();
    listSpy.mockReturnValueOnce(pending.promise);
    render(<ActionsTakenCard ticketId={TICKET_ID} ticketStatus="OPEN" mode="staff" currentUser={STAFF} />);
    expect(screen.getByLabelText("Loading actions")).toHaveAttribute("aria-busy", "true");

    await act(async () => pending.reject(apiError(500, { error: "Internal error", code: "INTERNAL_ERROR" })));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the actions. Please try again.");
    expect(alert.textContent).not.toMatch(/INTERNAL_ERROR|\{/);

    listSpy.mockResolvedValueOnce([makeAction()]);
    await userEvent.setup().click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Actions Taken (1)" })).toBeInTheDocument();
  });
});

// ── UI-02 and STYLE-03 ───────────────────────────────────────────────────

describe("Action form validation", () => {
  it("UI-02: create form shows field errors, the follow-up note error only when required, and Result required for COMPLETED", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(actionsApi, "createAction");
    await renderStaffCard([]);
    const { dialog } = await openAdd(user);

    // Defaults: now, PLANNED, assigned to the current user, performed by the current user.
    expect(within(dialog).getByLabelText(/Action Date\/Time/)).toHaveValue(localInput(FIXED_NOW));
    const status = within(dialog).getByLabelText(/^Status/) as HTMLSelectElement;
    expect(Array.from(status.options).map(o => o.value)).toEqual(["PLANNED", "IN_PROGRESS", "COMPLETED"]);
    expect(status).toHaveValue("PLANNED");
    await waitFor(() => expect(within(dialog).getByLabelText(/Assigned to/)).toHaveValue(String(STAFF.id)));
    expect(within(dialog).getByRole("group", { name: "Performed by" })).toHaveTextContent(STAFF.name);
    expect(within(dialog).getByText("0/1000", { selector: `[id$="description-count"]` })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Follow-up Note/)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Description must be between 5 and 1000 characters.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/follow-up note is required/i)).not.toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByLabelText(/Description/)).toHaveFocus());

    await user.click(within(dialog).getByRole("switch", { name: "Follow-up required?" }));
    const note = within(dialog).getByLabelText(/Follow-up Note/);
    expect(within(dialog).getByText("A follow-up note is required when follow-up is needed.")).toBeInTheDocument();
    expect(within(dialog).getByText("0/500", { selector: `[id$="followUpNote-count"]` })).toBeInTheDocument();
    await user.type(note, "Check again soon");
    await user.click(within(dialog).getByRole("switch", { name: "Follow-up required?" }));
    expect(within(dialog).queryByLabelText(/Follow-up Note/)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("switch", { name: "Follow-up required?" }));
    expect(within(dialog).getByLabelText(/Follow-up Note/)).toHaveValue("");
    await user.click(within(dialog).getByRole("switch", { name: "Follow-up required?" }));

    const resultLabel = () => dialog.querySelector(`label[for="${within(dialog).getByLabelText(/^Result/).id}"]`)!;
    expect(resultLabel()).not.toHaveTextContent("*");
    await user.selectOptions(status, "COMPLETED");
    expect(resultLabel()).toHaveTextContent("Result *");
    expect(within(dialog).getByText("A result is required when the action is created as completed.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-02: errors from the server appear under the same field and the entered values are kept", async () => {
    const user = userEvent.setup();
    vi.spyOn(actionsApi, "createAction").mockRejectedValue(apiError(400, {
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      fields: { assigneeId: "The assignee must be an active IT Staff or Administrator." },
    }));
    await renderStaffCard([]);
    const { dialog } = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/Description/), "Replaced the keyboard");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const assignee = within(dialog).getByLabelText(/Assigned to/);
    const message = await within(dialog).findByText("The assignee must be an active IT Staff or Administrator.");
    expect(assignee).toHaveAttribute("aria-invalid", "true");
    expect(assignee.getAttribute("aria-describedby")).toContain(message.id);
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue("Replaced the keyboard");
  });

  it("UI-02: edit form validates fields before sending", async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(actionsApi, "updateAction");
    const a = makeAction();
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("dialog", { name: "Edit Action" })).toBe(dialog);
    await user.clear(within(dialog).getByLabelText(/Description/));
    await user.type(within(dialog).getByLabelText(/Description/), "abc");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Description must be between 5 and 1000 characters.")).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("STYLE-03: the message sits directly under its field, the asterisk stays next to the label, and the field is marked invalid", async () => {
    const user = userEvent.setup();
    await renderStaffCard([]);
    const { dialog } = await openAdd(user);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const description = within(dialog).getByLabelText(/Description/);
    const message = description.nextElementSibling as HTMLElement;
    expect(message).toHaveTextContent("Description must be between 5 and 1000 characters.");
    expect(message).toHaveClass("invalid-feedback");
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAttribute("aria-required", "true");
    expect(description.getAttribute("aria-describedby")).toContain(message.id);
    const label = dialog.querySelector(`label[for="${description.id}"]`)!;
    expect(label).toHaveTextContent("Description *");
  });
});

// ── UI-03 ────────────────────────────────────────────────────────────────

describe("Create requests", () => {
  it("UI-03: a double click sends one request with a clientRequestId, Save is disabled in flight, and a retry reuses the id", async () => {
    const user = userEvent.setup();
    const calls: { payload: actionsApi.CreateActionPayload; d: ReturnType<typeof deferred<ActionTaken>> }[] = [];
    const createSpy = vi.spyOn(actionsApi, "createAction").mockImplementation((_ticketId, payload) => {
      const d = deferred<ActionTaken>();
      calls.push({ payload, d });
      return d.promise;
    });
    await renderStaffCard([]);
    const { dialog, add } = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/Description/), "Reset the network adapter");

    const save = within(dialog).getByRole("button", { name: "Save" });
    await user.dblClick(save);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    const first = calls[0].payload;
    expect(first.clientRequestId).toMatch(UUID);
    expect(first).toMatchObject({ description: "Reset the network adapter", status: "PLANNED", assigneeId: STAFF.id, actionAt: FIXED_NOW.toISOString() });
    expect(createSpy.mock.calls[0][0]).toBe(TICKET_ID);

    // The response is lost: a retry must reuse the same clientRequestId.
    await act(async () => calls[0].d.reject(apiError(0)));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("We couldn't save this action. Please try again.");
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue("Reset the network adapter");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(calls[1].payload.clientRequestId).toBe(first.clientRequestId);

    const created = makeAction({ description: "Reset the network adapter" });
    listSpy.mockResolvedValueOnce([created]);
    await act(async () => calls[1].d.resolve(created));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getAllByRole("status").some(s => s.textContent === "Action added.")).toBe(true);
    expect(await screen.findByRole("heading", { name: "Actions Taken (1)" })).toBeInTheDocument();
    expect(add).toHaveFocus();

    // The next create gets a new clientRequestId.
    const again = await openAdd(user);
    await user.type(within(again.dialog).getByLabelText(/Description/), "Second action text");
    await user.click(within(again.dialog).getByRole("button", { name: "Save" }));
    expect(calls[2].payload.clientRequestId).toMatch(UUID);
    expect(calls[2].payload.clientRequestId).not.toBe(first.clientRequestId);
  });
});

describe("Create requests: clientRequestId", () => {
  const postBodies = (fetchSpy: MockInstance<typeof fetch>) =>
    fetchSpy.mock.calls
      .filter(([url, init]) => String(url).endsWith(`/api/staff/tickets/${TICKET_ID}/actions`) && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init!.body)) as actionsApi.CreateActionPayload);

  it("UI-03: after a network failure on create, Save again sends the same clientRequestId", async () => {
    const user = userEvent.setup();
    const created = makeAction({ description: "Replaced the network cable" });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 201 }));
    await renderStaffCard([]);
    const { dialog } = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/Description/), "Replaced the network cable");

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("We couldn't save this action. Please try again.");
    listSpy.mockResolvedValueOnce([created]);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const bodies = postBodies(fetchSpy);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].clientRequestId).toMatch(UUID);
    expect(bodies[1].clientRequestId).toBe(bodies[0].clientRequestId);
    expect(bodies[1].description).toBe("Replaced the network cable");
  });

  it("UI-03: after a successful create, the next Add Action dialog uses a new clientRequestId", async () => {
    const user = userEvent.setup();
    const first = makeAction({ description: "First recorded action" });
    const second = makeAction({ description: "Second recorded action" });
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(first), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(second), { status: 201 }));
    await renderStaffCard([]);

    for (const a of [first, second]) {
      const { dialog } = await openAdd(user);
      await user.type(within(dialog).getByLabelText(/Description/), a.description);
      await user.click(within(dialog).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }

    const bodies = postBodies(fetchSpy);
    expect(bodies.map(b => b.description)).toEqual(["First recorded action", "Second recorded action"]);
    expect(bodies[0].clientRequestId).toMatch(UUID);
    expect(bodies[1].clientRequestId).toMatch(UUID);
    expect(bodies[1].clientRequestId).not.toBe(bodies[0].clientRequestId);
  });
});

// ── UI-04 ────────────────────────────────────────────────────────────────

describe("Conflicts and failures on save", () => {
  it("UI-04: 409 STALE_VERSION names the time, keeps the text, and loads the latest version only after confirmation", async () => {
    const user = userEvent.setup();
    const a = makeAction({ version: 2 });
    const current = { ...a, version: 3, description: "Changed by someone else", updatedAt: "2026-10-12T09:05:00.000Z" };
    const updateSpy = vi.spyOn(actionsApi, "updateAction").mockRejectedValue(apiError(409, {
      error: "This action was changed by someone else. Reload it to see the latest version.",
      code: "STALE_VERSION",
      currentVersion: 3,
      current,
    }));
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    const description = within(dialog).getByLabelText(/Description/);
    await user.clear(description);
    await user.type(description, "My new wording here");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(`Someone else changed this action at ${new Date(current.updatedAt).toLocaleString()}. Your changes were not saved.`);
    expect(alert.textContent).not.toMatch(/STALE_VERSION|\{/);
    expect(description).toHaveValue("My new wording here");
    const body = updateSpy.mock.calls[0][1];
    expect(body).toEqual({ expectedVersion: 2, description: "My new wording here" });

    await user.click(within(alert).getByRole("button", { name: "Load latest version" }));
    const confirm = await screen.findByRole("dialog", { name: "Load the latest version?" });
    expect(description).toHaveValue("My new wording here");
    await user.click(within(confirm).getByRole("button", { name: "Load latest version" }));
    await waitFor(() => expect(within(dialog).getByLabelText(/Description/)).toHaveValue("Changed by someone else"));
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("UI-04: a network failure or 5xx keeps the dialog open with every value and a readable message", async () => {
    const user = userEvent.setup();
    const a = makeAction();
    vi.spyOn(actionsApi, "updateAction").mockRejectedValue(apiError(500, { error: "Internal error", code: "INTERNAL_ERROR" }));
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    await user.type(within(dialog).getByLabelText(/Attachment Notes/), "See the photo under Attachments");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't save this action. Please try again.");
    expect(alert.textContent).not.toMatch(/INTERNAL_ERROR|500|\{/);
    expect(screen.getByRole("dialog", { name: "Edit Action" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Attachment Notes/)).toHaveValue("See the photo under Attachments");
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue(a.description);
  });
});

// ── UI-05 ────────────────────────────────────────────────────────────────

describe("Terminal Actions", () => {
  it.each(["COMPLETED", "CANCELLED"] as const)("UI-05: a %s Action opens read-only with no save, edit, or status control", async status => {
    const user = userEvent.setup();
    const a = makeAction({ status, result: "Done and confirmed by the Requester." });
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);

    expect(within(dialog).getByText("Completed and cancelled actions cannot be changed.")).toBeInTheDocument();
    expect(within(dialog).getByText("Done and confirmed by the Requester.")).toBeInTheDocument();
    const c = queryControls(dialog);
    expect([c.edit, c.save, c.start, c.complete, c.cancel]).toEqual([null, null, null, null, null]);
    expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(dialog).queryAllByRole("combobox")).toHaveLength(0);
    expect(within(dialog).queryAllByRole("switch")).toHaveLength(0);
  });
});

// ── UI-06 ────────────────────────────────────────────────────────────────

describe("Requester view", () => {
  it("UI-06: no create, edit, or status control exists in the DOM, and the dialog shows every field read-only", async () => {
    const user = userEvent.setup();
    const open = makeAction({ status: "IN_PROGRESS" });
    const full = makeAction({
      status: "COMPLETED",
      result: "Battery replaced.",
      followUpRequired: true,
      followUpNote: "Check battery health after one week.",
      attachmentNotes: "See the battery report PDF under Attachments.",
    });
    await renderRequesterCard([open, full]);

    expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
    expect(screen.queryByText("Reopen the Ticket to add actions.")).not.toBeInTheDocument();

    for (const a of [open, full]) {
      const { dialog } = await openAction(user, a);
      const c = queryControls(document.body);
      expect([c.edit, c.save, c.start, c.complete, c.cancel]).toEqual([null, null, null, null, null]);
      expect(within(dialog).queryAllByRole("textbox")).toHaveLength(0);
      if (a === full) {
        expect(within(dialog).getByText("Check battery health after one week.")).toBeInTheDocument();
        expect(within(dialog).getByText("See the battery report PDF under Attachments.")).toBeInTheDocument();
        expect(within(dialog).getByText("Battery replaced.")).toBeInTheDocument();
      }
      await user.click(within(dialog).getAllByRole("button", { name: "Close" })[0]);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    }
    expect(api.getStaffUsers).not.toHaveBeenCalled();
  });

  it("UI-06: on Requester Ticket Detail the card sits after the header and before Public Comments, without Internal Notes", async () => {
    vi.spyOn(api, "getMe").mockResolvedValue({ id: 31, name: "Jordan Requester", email: "jordan@example.com", role: "REQUESTER", mustChangePassword: false });
    vi.spyOn(api, "getTicket").mockResolvedValue({
      id: TICKET_ID, ticketNumber: "TKT-2026-000501", requesterId: 31, categoryName: "Hardware",
      relatedSystemName: "Corporate Laptop", summary: "Laptop battery drains quickly",
      description: "The battery lasts less than an hour.", requestedPriority: "MEDIUM", itPriority: null,
      currentStatus: "IN_PROGRESS", problemAppearsResolved: false,
      createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T07:00:00.000Z",
    } as api.TicketDetail);
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
    vi.spyOn(api, "getPublicComments").mockResolvedValue([]);
    listSpy.mockResolvedValue([makeAction()]);
    render(
      <MemoryRouter>
        <AuthProvider>
          <RequesterTicketDetailScreen ticketId={TICKET_ID} onBack={() => {}} />
        </AuthProvider>
      </MemoryRouter>
    );

    const heading = await screen.findByRole("heading", { name: "Actions Taken by IT Staff (1)" });
    const card = screen.getByTestId("actions-taken-card");
    const summary = screen.getByRole("heading", { level: 1, name: "Laptop battery drains quickly" });
    const comments = screen.getByRole("heading", { name: /Public Comments/ });
    expect(summary.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card).toContainElement(heading);
    expect(screen.queryByText(/Internal Notes/)).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
  });
});

// ── UI-07 ────────────────────────────────────────────────────────────────

describe("Shared area label", () => {
  it("UI-07: staff see the \"Visible to the Requester\" label with an icon on the card header", async () => {
    await renderStaffCard([makeAction()]);
    const label = screen.getByText("Visible to the Requester");
    expect(label).toHaveClass("zg-shared-label");
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const card = screen.getByTestId("actions-taken-card");
    expect(within(card).getByRole("heading", { name: "Actions Taken (1)" }).parentElement).toContainElement(label);
  });
});

// ── UI-18 ────────────────────────────────────────────────────────────────

describe("Status buttons in the Action dialog", () => {
  it("UI-18: the buttons follow the Action matrix", async () => {
    const user = userEvent.setup();
    const planned = makeAction({ status: "PLANNED" });
    const progress = makeAction({ status: "IN_PROGRESS" });
    await renderStaffCard([planned, progress]);

    let { dialog } = await openAction(user, planned);
    let c = queryControls(dialog);
    expect([!!c.start, !!c.complete, !!c.cancel]).toEqual([true, true, true]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    ({ dialog } = await openAction(user, progress));
    c = queryControls(dialog);
    expect([!!c.start, !!c.complete, !!c.cancel]).toEqual([false, true, true]);
  });

  it("UI-18: Start is one click with no extra step, and the dialog stays open in view mode with the new badge", async () => {
    const user = userEvent.setup();
    const a = makeAction({ status: "PLANNED", version: 4 });
    const statusSpy = vi.spyOn(actionsApi, "changeActionStatus").mockResolvedValue({ ...a, status: "IN_PROGRESS", version: 5 });
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);

    await user.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(statusSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith(a.id, { expectedVersion: 4, status: "IN_PROGRESS" });
    expect(await within(dialog).findByText("Status changed to In progress.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Action details" })).toBe(dialog);
    expect(within(dialog).getByText(/In progress/, { selector: ".zg-action-badge" })).toBeInTheDocument();
    expect(queryControls(dialog).start).toBeNull();
    // The list row shows the new status too.
    const row = screen.getByTestId("actions-table-view").querySelector(`tr[data-action-id="${a.id}"]`)!;
    expect(row).toHaveTextContent("◐ In progress");
  });

  it("UI-18: Mark completed needs a Result in the step panel (prefilled with the stored one) and sends it", async () => {
    const user = userEvent.setup();
    const a = makeAction({ status: "IN_PROGRESS", result: "Partly done", version: 2 });
    const statusSpy = vi.spyOn(actionsApi, "changeActionStatus").mockImplementation(async (_id, body) => ({
      ...a, status: "COMPLETED", result: body.result ?? null, version: 3,
    }));
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);

    await user.click(within(dialog).getByRole("button", { name: "Mark completed" }));
    expect(within(dialog).getByText("Completed actions become read-only.")).toBeInTheDocument();
    const result = within(dialog).getByLabelText(/^Result/);
    expect(result).toHaveValue("Partly done");
    await user.clear(result);
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(within(dialog).getByText("A result is required to complete this action.")).toBeInTheDocument();
    expect(statusSpy).not.toHaveBeenCalled();

    await user.type(result, "Battery replaced and tested.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(statusSpy).toHaveBeenCalledWith(a.id, { expectedVersion: 2, status: "COMPLETED", result: "Battery replaced and tested." });
    expect(await within(dialog).findByText("Completed and cancelled actions cannot be changed.")).toBeInTheDocument();
    expect(queryControls(dialog).complete).toBeNull();
  });

  it("UI-18: Cancel action asks for a reason and a confirmation; Back returns to the buttons", async () => {
    const user = userEvent.setup();
    const a = makeAction({ status: "PLANNED" });
    const statusSpy = vi.spyOn(actionsApi, "changeActionStatus").mockResolvedValue({ ...a, status: "CANCELLED", result: "Duplicate request", version: 2 });
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);

    await user.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    expect(within(dialog).getByText("Cancel this action? This cannot be undone.")).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Reason for cancelling/)).toHaveValue("");
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(within(dialog).getByRole("button", { name: "Start" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel action" }));
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(within(dialog).getByText("A reason is required to cancel this action.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason for cancelling/), "Duplicate request");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    expect(statusSpy).toHaveBeenCalledWith(a.id, { expectedVersion: 1, status: "CANCELLED", result: "Duplicate request" });
  });

  it("UI-18: status buttons are disabled while the form has unsaved edits, and Save never sends a status", async () => {
    const user = userEvent.setup();
    const a = makeAction({ status: "PLANNED", version: 6 });
    const statusSpy = vi.spyOn(actionsApi, "changeActionStatus");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ...a, description: "Updated description text", version: 7 }), { status: 200 })
    );
    await renderStaffCard([a]);
    const { dialog, button } = await openAction(user, a);
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    expect(within(dialog).getByRole("button", { name: "Start" })).toBeEnabled();

    const description = within(dialog).getByLabelText(/Description/);
    await user.clear(description);
    await user.type(description, "Updated description text");
    for (const name of ["Start", "Mark completed", "Cancel action"]) {
      expect(within(dialog).getByRole("button", { name })).toBeDisabled();
    }
    expect(within(dialog).getByText("Save or discard your changes first")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(statusSpy).not.toHaveBeenCalled();
    // The request that left the client: the edit endpoint, with expectedVersion and no status or ticketId.
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/api/staff/actions/${a.id}$`));
    expect(init.method).toBe("PATCH");
    const sent = JSON.parse(String(init.body));
    expect(sent).toEqual({ expectedVersion: 6, description: "Updated description text" });
    expect(sent).not.toHaveProperty("status");
    expect(sent).not.toHaveProperty("ticketId");
    expect(screen.getAllByRole("status").some(s => s.textContent === "Action saved.")).toBe(true);
    expect(button).toHaveFocus();
  });
});

// ── UI-20 ────────────────────────────────────────────────────────────────

describe("A Ticket that no longer accepts actions", () => {
  it.each(["RESOLVED", "CLOSED", "CANCELLED"])("UI-20: on a %s Ticket the Add Action button is replaced by the Reopen note", async status => {
    await renderStaffCard([makeAction({ status: "COMPLETED", result: "All done here." })], status);
    expect(screen.queryByRole("button", { name: "Add Action" })).not.toBeInTheDocument();
    expect(screen.getByText("Reopen the Ticket to add actions.")).toBeInTheDocument();
  });

  it("UI-20: a 409 TICKET_NOT_ACCEPTING_ACTIONS explains the Ticket status and disables Save", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(actionsApi, "createAction").mockRejectedValue(apiError(409, {
      error: "This ticket no longer accepts actions. Reopen it first.",
      code: "TICKET_NOT_ACCEPTING_ACTIONS",
      ticketStatus: "RESOLVED",
    }));
    await renderStaffCard([], "OPEN");
    const { dialog } = await openAdd(user);
    await user.type(within(dialog).getByLabelText(/Description/), "Replace the projector cable");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("This ticket is Resolved and no longer accepts actions.");
    expect(alert.textContent).not.toMatch(/TICKET_NOT_ACCEPTING_ACTIONS|\{/);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Reopen the Ticket to add actions.")).toBeInTheDocument();
  });

  it("UI-20: ACTION_TERMINAL and INVALID_TRANSITION use the same readable alert", async () => {
    const user = userEvent.setup();
    const a = makeAction({ status: "PLANNED" });
    const statusSpy = vi.spyOn(actionsApi, "changeActionStatus")
      .mockRejectedValueOnce(apiError(400, { error: "Invalid status transition", code: "INVALID_TRANSITION", from: "COMPLETED", to: "IN_PROGRESS" }))
      .mockRejectedValueOnce(apiError(409, { error: "Action is terminal", code: "ACTION_TERMINAL" }));
    await renderStaffCard([a]);
    const { dialog } = await openAction(user, a);

    await user.click(within(dialog).getByRole("button", { name: "Start" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This status change is not allowed (Completed to In progress).");
    await user.click(within(dialog).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("This action is already completed or cancelled and can no longer be changed."));
    expect(statusSpy).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByRole("alert").textContent).not.toMatch(/ACTION_TERMINAL|INVALID_TRANSITION|\{/);
  });
});

// ── STYLE-04 ─────────────────────────────────────────────────────────────

describe("Shared versus private areas", () => {
  it("STYLE-04: on Staff Ticket Detail the shared Actions card is distinct from the amber Internal Notes and sits above the tabs", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "getMe").mockResolvedValue({ id: STAFF.id, name: STAFF.name, email: "morgan@example.com", role: "IT_STAFF", mustChangePassword: false });
    vi.spyOn(api, "getStaffTicketDetail").mockResolvedValue({
      id: TICKET_ID, ticketNumber: "TKT-2026-000501", requesterId: 31, requesterName: "Jordan Requester",
      requesterEmail: "jordan@example.com", categoryId: 1, categoryName: "Hardware", relatedSystemId: 1,
      relatedSystemName: "Corporate Laptop", summary: "Laptop battery drains quickly",
      description: "The battery lasts less than an hour.", requestedPriority: "MEDIUM", itPriority: null,
      currentStatus: "IN_PROGRESS", problemAppearsResolved: false, ticketOwnerId: null, ticketOwnerName: null,
      createdAt: "2026-10-12T07:00:00.000Z", updatedAt: "2026-10-12T07:00:00.000Z",
    });
    vi.spyOn(api, "getPublicComments").mockResolvedValue([]);
    vi.spyOn(api, "getInternalNotes").mockResolvedValue([]);
    vi.spyOn(api, "getAttachments").mockResolvedValue([]);
    listSpy.mockResolvedValue([makeAction()]);
    render(
      <MemoryRouter initialEntries={[`/staff/tickets/${TICKET_ID}`]}>
        <AuthProvider>
          <Routes>
            <Route path="/staff/tickets/:id" element={<StaffTicketDetailScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Actions Taken (1)" });
    const card = screen.getByTestId("actions-taken-card");
    const tablist = screen.getByRole("tablist");
    expect(card.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.closest(".col-lg-8")).toBe(tablist.closest(".col-lg-8"));
    expect(tablist).not.toContainElement(card);

    await user.click(screen.getByRole("tab", { name: /Internal Notes/i }));
    const notes = screen.getByRole("tabpanel", { name: /Internal Notes/i });
    // Lab 3 amber is unchanged on the private area; the shared card has its own label and edge.
    expect(notes.style.background).toBe("rgb(255, 251, 240)");
    expect(card.style.background).toBe("");
    expect(card).toHaveClass("zg-actions-card");
    expect(within(card).getByText("Visible to the Requester")).toBeInTheDocument();
    expect(within(notes).queryByText("Visible to the Requester")).not.toBeInTheDocument();
    expect(within(card).queryByText(/Internal Notes/)).not.toBeInTheDocument();
    expect(card).not.toContainElement(notes);
  });
});

// ── A11Y-01 ──────────────────────────────────────────────────────────────

describe("Dialog accessibility", () => {
  it("A11Y-01: focus moves in, Tab and Shift+Tab are trapped, Escape closes, and focus returns to the opener", async () => {
    const user = userEvent.setup();
    const a = makeAction();
    await renderStaffCard([a]);
    const { dialog, button } = await openAction(user, a);

    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Action details");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(document.body.style.overflow).toBe("hidden");

    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("A11Y-01: Escape with unsaved edits asks first; the confirmation follows the same rules", async () => {
    const user = userEvent.setup();
    const a = makeAction();
    await renderStaffCard([a]);
    const { dialog, button } = await openAction(user, a);
    await user.click(within(dialog).getByRole("button", { name: "Edit" }));
    await within(dialog).findByRole("option", { name: /Riley Admin/ });
    await user.type(within(dialog).getByLabelText(/Description/), " more");

    await user.keyboard("{Escape}");
    const confirm = await screen.findByRole("dialog", { name: "Discard changes?" });
    expect(confirm).toHaveAttribute("aria-modal", "true");
    expect(within(confirm).getByRole("button", { name: "Keep editing" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Discard changes?" })).not.toBeInTheDocument());
    expect(screen.getByRole("dialog", { name: "Edit Action" })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Description/)).toHaveValue(`${a.description} more`);

    await user.keyboard("{Escape}");
    await user.click(within(await screen.findByRole("dialog", { name: "Discard changes?" })).getByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(button).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });
});
