import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ADMIN, CLOCK, DATE_TIME, STAFF, deferred, expectedTime, mockServer, renderApp, setBrowserTimeZone, staffPayload,
} from "./dashboardTestKit.js";

// IT Staff Dashboard (ui-spec section 4): UI-11 states, UI-12 links, UI-17 Refresh, UI-19 time zones,
// UI-21 Urgent Tickets. Rendered through the real routes at /staff/dashboard; fetch is mocked.

const ACTIVE = "currentStatus=NEW,OPEN,IN_PROGRESS,WAITING_FOR_REQUESTER,REOPENED";
const CARDS = [
  { name: "Unassigned tickets: 7. View all", href: `/staff/tickets?ticketOwnerId=unassigned&${ACTIVE}` },
  { name: "My assigned tickets: 4. View all", href: `/staff/tickets?ticketOwnerId=${STAFF.id}&${ACTIVE}` },
  { name: "New tickets: 14. View all", href: "/staff/tickets?currentStatus=NEW" },
  { name: "In Progress tickets: 18. View all", href: "/staff/tickets?currentStatus=IN_PROGRESS" },
  { name: "Waiting for Requester tickets: 6. View all", href: "/staff/tickets?currentStatus=WAITING_FOR_REQUESTER" },
  { name: "High IT Priority tickets: 3. View all", href: `/staff/tickets?itPriority=HIGH&${ACTIVE}` },
];

const cardsArea = () => screen.getByTestId("metric-cards");
const list = (testId: string) => screen.getByTestId(testId);
const rowIds = (testId: string, attr = "data-ticket-id") =>
  Array.from(list(testId).querySelectorAll(`[${attr}]`)).map(el => Number(el.getAttribute(attr)));

async function openDashboard(who: typeof STAFF | typeof ADMIN = STAFF, routes = {}) {
  const server = mockServer({ me: who, routes });
  renderApp("/staff/dashboard");
  await screen.findByRole("heading", { level: 1, name: /Welcome back/ });
  return server;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-11: Staff Dashboard states", () => {
  it("UI-11: six metric cards and three lists render from the payload", async () => {
    await openDashboard();
    await screen.findByTestId("metric-cards");
    expect(within(cardsArea()).getAllByRole("link")).toHaveLength(6);
    for (const title of ["My recent Tickets", "My open Actions", "Urgent Tickets"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    expect(rowIds("list-my-recent")).toEqual([101, 99]);
    expect(rowIds("list-my-actions", "data-action-id")).toEqual([33, 34]);
    expect(within(list("list-my-actions")).getByRole("link", { name: /Run the battery diagnostic\./ }))
      .toHaveAttribute("href", "/staff/tickets/101");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Welcome back, Quinn");
  });

  it("UI-11: while loading, skeleton cards are shown with aria-busy", async () => {
    const hold = deferred();
    mockServer({ me: STAFF, routes: { "GET /api/dashboard/staff": () => hold.promise } });
    renderApp("/staff/dashboard");
    const busy = await screen.findByLabelText("Loading dashboard");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelectorAll(".zg-metric-card")).toHaveLength(6);
    hold.release({ status: 200, body: staffPayload() });
    await screen.findByTestId("metric-cards");
    expect(screen.queryByLabelText("Loading dashboard")).not.toBeInTheDocument();
  });

  it("UI-11: an empty payload shows 0 on every card (still links) and an empty message for each list", async () => {
    const zero = staffPayload();
    for (const m of Object.values(zero.metrics) as { count: number }[]) m.count = 0;
    zero.myRecentTickets = [];
    zero.myOpenActions = [];
    zero.urgentTickets = [];
    await openDashboard(STAFF, { "GET /api/dashboard/staff": () => ({ status: 200, body: zero }) });
    const links = within(await screen.findByTestId("metric-cards")).getAllByRole("link");
    expect(links).toHaveLength(6);
    for (const link of links) {
      expect(link.getAttribute("aria-label")).toMatch(/: 0\. View all$/);
      expect(link.getAttribute("href")).toMatch(/^\/staff\/tickets\?/);
    }
    expect(screen.getByText("You don't own any tickets yet.")).toBeInTheDocument();
    expect(screen.getByText("No open actions are assigned to you.")).toBeInTheDocument();
    expect(screen.getByText("No urgent tickets.")).toBeInTheDocument();
  });

  it("UI-11: a 403 shows the forbidden message, never raw JSON", async () => {
    await openDashboard(STAFF, { "GET /api/dashboard/staff": () => ({ status: 403, body: { error: "Forbidden", code: "FORBIDDEN" } }) });
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to that page.");
    expect(screen.getByRole("main").textContent).not.toMatch(/FORBIDDEN|"error"|\{/);
  });

  it("UI-11: a failure shows a safe message with Retry inside the page, and Retry loads the data", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const server = await openDashboard(STAFF, {
      "GET /api/dashboard/staff": () => (++attempts === 1
        ? { status: 500, body: { error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" } }
        : { status: 200, body: staffPayload() }),
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load your dashboard.");
    expect(screen.getByRole("main").textContent).not.toMatch(/INTERNAL_ERROR|"error"|\{/);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await screen.findByTestId("metric-cards");
    expect(server.count("GET /api/dashboard/staff")).toBe(2);
  });
});

describe("UI-12: Staff Dashboard links", () => {
  it("UI-12: every card is one link (<a>, not a button) with an accessible name and the API's query as its target", async () => {
    await openDashboard();
    await screen.findByTestId("metric-cards");
    for (const c of CARDS) {
      const link = screen.getByRole("link", { name: c.name });
      expect(link.tagName).toBe("A");
      expect(link).not.toHaveAttribute("role");
      expect(link).toHaveAttribute("href", c.href);
    }
    expect(within(cardsArea()).queryAllByRole("button")).toHaveLength(0);
  });

  it("UI-12: the Users card appears only for an Administrator and opens /admin/users", async () => {
    await openDashboard(ADMIN, {
      "GET /api/dashboard/staff": () => ({ status: 200, body: staffPayload({ users: { active: 11, inactive: 3 } }) }),
    });
    const users = await screen.findByRole("link", { name: "Users: 11 active, 3 inactive. View all" });
    expect(users).toHaveAttribute("href", "/admin/users");
    expect(within(cardsArea()).getAllByRole("link")).toHaveLength(7);
  });

  it("UI-12: IT Staff get no Users card, even if a payload carried user counts", async () => {
    await openDashboard(STAFF, {
      "GET /api/dashboard/staff": () => ({ status: 200, body: staffPayload({ users: { active: 11, inactive: 3 } }) }),
    });
    await screen.findByTestId("metric-cards");
    expect(screen.queryByTestId("users-card")).not.toBeInTheDocument();
    expect(within(cardsArea()).getAllByRole("link")).toHaveLength(6);
  });

  it.each(CARDS)("UI-12: following \"$name\" opens the Queue with that filter, and the Queue's controls show it", async ({ name, href }) => {
    const user = userEvent.setup();
    const server = await openDashboard();
    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("heading", { level: 1, name: "My Queue" });
    const expected = new URLSearchParams(href.split("?")[1]);
    await waitFor(() => expect(server.last("GET /api/staff/tickets")).toBeDefined());
    const sent = server.last("GET /api/staff/tickets")!.url.searchParams;
    for (const [key, value] of expected) expect(sent.get(key), key).toBe(value);

    // Every filter in use is visible in the Queue's own controls.
    const status = screen.getByLabelText("Status") as HTMLSelectElement;
    expect(status.value).toBe(expected.get("currentStatus") ?? "");
    expect(status.selectedOptions[0].textContent).not.toBe("All Statuses");
    const owner = screen.getByLabelText("Ticket Owner") as HTMLSelectElement;
    expect(owner.value).toBe(expected.get("ticketOwnerId") ?? "");
    if (expected.get("ticketOwnerId") === String(STAFF.id)) expect(owner.selectedOptions[0].textContent).toBe("Quinn Staff (me)");
    const itPriority = screen.getByLabelText("IT Priority") as HTMLSelectElement;
    expect(itPriority.value).toBe(expected.get("itPriority") ?? "");
  });

  it("UI-12: list rows open Staff Ticket Detail and the lists' View all links target the Queue", async () => {
    await openDashboard();
    await screen.findByTestId("metric-cards");
    expect(within(list("list-urgent")).getByRole("link", { name: /TKT-2026-000077/ })).toHaveAttribute("href", "/staff/tickets/77");
    expect(screen.getByRole("link", { name: "View all urgent tickets in the Queue" })).toHaveAttribute("href", CARDS[5].href);
    expect(screen.getByRole("link", { name: "View all my tickets in the Queue" })).toHaveAttribute("href", `/staff/tickets?ticketOwnerId=${STAFF.id}`);
    expect(screen.getByRole("link", { name: /Search Tickets/ })).toHaveAttribute("href", "/staff/tickets");
  });
});

describe("UI-17: Refresh", () => {
  it("UI-17: Refresh re-fetches and updates the numbers without reloading the page, keeping the old data while busy", async () => {
    const user = userEvent.setup();
    const second = deferred();
    let calls = 0;
    const server = await openDashboard(STAFF, {
      "GET /api/dashboard/staff": () => (++calls === 1 ? { status: 200, body: staffPayload() } : second.promise),
    });
    await screen.findByRole("link", { name: CARDS[0].name });
    const heading = screen.getByRole("heading", { level: 1 });

    await user.click(screen.getByRole("button", { name: "Refresh" }));
    const refresh = screen.getByRole("button", { name: "Refresh" });
    expect(refresh).toBeDisabled();
    expect(refresh).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("link", { name: CARDS[0].name })).toBeInTheDocument(); // old data still shown

    const next = staffPayload({ generatedAt: "2026-10-12T11:45:00.000Z" });
    next.metrics.unassigned.count = 9;
    second.release({ status: 200, body: next });
    expect(await screen.findByRole("link", { name: "Unassigned tickets: 9. View all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).not.toBeDisabled();
    expect(server.count("GET /api/dashboard/staff")).toBe(2);
    expect(screen.getByRole("heading", { level: 1 })).toBe(heading); // same page, not remounted
  });
});

describe("UI-19: browser time zones", () => {
  async function snapshot(timeZone: string) {
    const tz = setBrowserTimeZone(timeZone);
    const view = { unmount: () => {} };
    mockServer({ me: STAFF });
    const r = renderApp("/staff/dashboard");
    view.unmount = r.unmount;
    await screen.findByTestId("metric-cards");
    const result = {
      updated: screen.getByTestId("dashboard-updated").textContent,
      times: Array.from(document.querySelectorAll(".zg-dash-row .text-muted")).map(el => el.textContent),
      cards: within(cardsArea()).getAllByRole("link").map(l => l.getAttribute("aria-label")),
      urgent: rowIds("list-urgent"),
      recent: rowIds("list-my-recent"),
      actions: rowIds("list-my-actions", "data-action-id"),
    };
    view.unmount();
    tz.mockRestore();
    vi.restoreAllMocks();
    return result;
  }

  it("UI-19: times follow the browser time zone; counts, rows, and order do not change", async () => {
    const utc = await snapshot("UTC");
    const bangkok = await snapshot("Asia/Bangkok");
    const generatedAt = staffPayload().generatedAt;

    expect(utc.updated).toBe(`Updated ${expectedTime(generatedAt, "UTC", CLOCK)}`);
    expect(bangkok.updated).toBe(`Updated ${expectedTime(generatedAt, "Asia/Bangkok", CLOCK)}`);
    expect(utc.updated).toBe("Updated 10:20");
    expect(bangkok.updated).toBe("Updated 17:20");
    expect(utc.times).not.toEqual(bangkok.times);
    expect(utc.times[0]).toBe(`Last updated ${expectedTime(staffPayload().myRecentTickets[0].updatedAt, "UTC", DATE_TIME)}`);
    expect(bangkok.times[0]).toBe(`Last updated ${expectedTime(staffPayload().myRecentTickets[0].updatedAt, "Asia/Bangkok", DATE_TIME)}`);

    expect(bangkok.cards).toEqual(utc.cards);
    expect(bangkok.urgent).toEqual(utc.urgent);
    expect(bangkok.recent).toEqual(utc.recent);
    expect(bangkok.actions).toEqual(utc.actions);
    expect(utc.urgent).toEqual(staffPayload().urgentTickets.map((t: { id: number }) => t.id)); // API order, not re-sorted
  });
});

describe("UI-21: Urgent Tickets list", () => {
  it("UI-21: rows are exactly the payload items in API order, each with an IT Priority High badge and an active status badge", async () => {
    await openDashboard();
    await screen.findByTestId("metric-cards");
    const payload = staffPayload().urgentTickets;
    expect(rowIds("list-urgent")).toEqual(payload.map((t: { id: number }) => t.id));
    const rows = within(list("list-urgent")).getAllByRole("listitem");
    expect(rows).toHaveLength(payload.length);
    const labels: Record<string, string> = { OPEN: "Open", WAITING_FOR_REQUESTER: "Waiting for Requester", REOPENED: "Reopened" };
    rows.forEach((row, i) => {
      expect(within(row).getByTestId("priority-badge")).toHaveTextContent("IT Priority: ▲ High");
      expect(within(row).getByTestId("status-badge")).toHaveTextContent(labels[payload[i].currentStatus]);
    });
  });

  it("UI-21: the UI does not filter or re-sort: whatever the API returns is shown as returned", async () => {
    const odd = staffPayload({
      urgentTickets: [
        { id: 5, ticketNumber: "TKT-2026-000005", summary: "Newest first in this payload", currentStatus: "OPEN", itPriority: "HIGH", updatedAt: "2026-10-12T09:00:00.000Z" },
        { id: 3, ticketNumber: "TKT-2026-000003", summary: "Older second", currentStatus: "CLOSED", itPriority: "MEDIUM", updatedAt: "2026-10-01T09:00:00.000Z" },
      ],
    });
    await openDashboard(STAFF, { "GET /api/dashboard/staff": () => ({ status: 200, body: odd }) });
    await screen.findByTestId("metric-cards");
    expect(rowIds("list-urgent")).toEqual([5, 3]);
    expect(within(list("list-urgent")).getByText("Closed")).toBeInTheDocument();
  });

  it("UI-21: an empty payload shows \"No urgent tickets.\"", async () => {
    await openDashboard(STAFF, { "GET /api/dashboard/staff": () => ({ status: 200, body: staffPayload({ urgentTickets: [] }) }) });
    await screen.findByTestId("metric-cards");
    expect(within(list("list-urgent")).getByText("No urgent tickets.")).toBeInTheDocument();
    expect(within(list("list-urgent")).queryAllByRole("listitem")).toHaveLength(0);
  });
});
