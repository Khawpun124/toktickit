import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DATE_TIME, REQUESTER, expectedTime, mockServer, renderApp, requesterPayload, setBrowserTimeZone,
} from "./dashboardTestKit.js";

// Requester Dashboard (ui-spec section 5): UI-13 cards, lists, zero state, "Waiting since"; UI-14
// drill-down links with the comma-separated status filter; UI-19 for the Requester's times.

const CARDS = [
  { name: "Open tickets: 3. View all", href: "/tickets?currentStatus=NEW,OPEN,IN_PROGRESS,REOPENED", option: "Open, In Progress, Reopened" },
  { name: "Tickets waiting for you: 2. View all", href: "/tickets?currentStatus=WAITING_FOR_REQUESTER", option: "Waiting for Requester" },
  { name: "Resolved tickets: 5. View all", href: "/tickets?currentStatus=RESOLVED", option: "Resolved" },
  { name: "Closed tickets: 12. View all", href: "/tickets?currentStatus=CLOSED", option: "Closed" },
];

const rows = (testId: string) => within(screen.getByTestId(testId)).queryAllByRole("listitem");
const rowNumbers = (testId: string) => rows(testId).map(r => r.querySelector(".fw-semibold")?.textContent);

async function openDashboard(routes = {}) {
  const server = mockServer({ me: REQUESTER, routes });
  renderApp("/dashboard");
  await screen.findByRole("heading", { level: 1, name: "Welcome, Robin" });
  return server;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UI-13: Requester Dashboard", () => {
  it("UI-13: four cards and three lists render from the payload, with the subtitle and quick actions", async () => {
    await openDashboard();
    const cards = within(await screen.findByTestId("metric-cards")).getAllByRole("link");
    expect(cards.map(c => c.getAttribute("aria-label"))).toEqual(CARDS.map(c => c.name));
    for (const title of ["Needs your attention", "Recently updated", "Recently resolved"]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByText("Here's the latest on your requests.")).toBeInTheDocument();
    expect(rowNumbers("list-needs-attention")).toEqual(["TKT-2026-000088", "TKT-2026-000090"]);
    expect(rowNumbers("list-recently-updated")).toEqual(["TKT-2026-000101", "TKT-2026-000088"]);
    expect(rowNumbers("list-recently-resolved")).toEqual(["TKT-2026-000095"]);
    expect(within(screen.getByTestId("list-needs-attention")).getByRole("link", { name: /TKT-2026-000088/ }))
      .toHaveAttribute("href", "/tickets/88");
    expect(screen.getByRole("link", { name: /Create Ticket/ })).toHaveAttribute("href", "/tickets/new");
    expect(screen.getByRole("link", { name: /View My Tickets/ })).toHaveAttribute("href", "/tickets");
    expect(screen.getByTestId("list-needs-attention")).toHaveClass("zg-callout");
  });

  it("UI-13: Needs-your-attention rows show \"Waiting since\" formatted in the browser's time zone", async () => {
    setBrowserTimeZone("Asia/Bangkok");
    await openDashboard();
    await screen.findByTestId("metric-cards");
    const [first, second] = rows("list-needs-attention");
    const payload = requesterPayload().needsAttention;
    expect(first).toHaveTextContent(`Waiting since ${expectedTime(payload[0].waitingSince, "Asia/Bangkok", DATE_TIME)}`);
    expect(second).toHaveTextContent(`Waiting since ${expectedTime(payload[1].waitingSince, "Asia/Bangkok", DATE_TIME)}`);
  });

  it("UI-13: a Requester with no Tickets sees 0 on every card (still links) and an empty message in each list", async () => {
    const zero = requesterPayload({ needsAttention: [], recentlyUpdated: [], recentlyResolved: [] });
    for (const m of Object.values(zero.metrics) as { count: number }[]) m.count = 0;
    await openDashboard({ "GET /api/dashboard/requester": () => ({ status: 200, body: zero }) });
    const cards = within(await screen.findByTestId("metric-cards")).getAllByRole("link");
    expect(cards).toHaveLength(4);
    cards.forEach((c, i) => {
      expect(c.getAttribute("aria-label")).toMatch(/: 0\. View all$/);
      expect(c).toHaveAttribute("href", CARDS[i].href);
    });
    expect(screen.getByText("Nothing needs your attention right now.")).toBeInTheDocument();
    expect(screen.getByText("No recent updates on your tickets.")).toBeInTheDocument();
    expect(screen.getByText("No tickets were resolved in the last 30 days.")).toBeInTheDocument();
    expect(screen.getByTestId("list-needs-attention")).not.toHaveClass("zg-callout");
  });
});

describe("UI-14: Requester Dashboard drill-down", () => {
  it("UI-14: the card links carry the comma-separated status filter", async () => {
    await openDashboard();
    await screen.findByTestId("metric-cards");
    for (const c of CARDS) {
      const link = screen.getByRole("link", { name: c.name });
      expect(link.tagName).toBe("A");
      expect(link).toHaveAttribute("href", c.href);
    }
  });

  it.each(CARDS)("UI-14: following \"$name\" opens My Tickets with that filter, shown in the Status control", async ({ name, href, option }) => {
    const user = userEvent.setup();
    const server = await openDashboard();
    await user.click(await screen.findByRole("link", { name }));
    await screen.findByRole("heading", { level: 1, name: "My Tickets" });
    const expected = new URLSearchParams(href.split("?")[1]).get("currentStatus");
    await waitFor(() => {
      const filtered = server.calls.filter(c => c.key === "GET /api/tickets" && c.url.searchParams.get("currentStatus") === expected);
      expect(filtered.length).toBeGreaterThan(0);
    });
    const status = screen.getByLabelText("Filter by Status") as HTMLSelectElement;
    expect(status.value).toBe(expected);
    expect(status.selectedOptions[0].textContent).toContain(option);
  });
});

describe("UI-19: the Requester Dashboard under different browser time zones", () => {
  async function snapshot(timeZone: string) {
    const tz = setBrowserTimeZone(timeZone);
    mockServer({ me: REQUESTER });
    const view = renderApp("/dashboard");
    await screen.findByTestId("metric-cards");
    const result = {
      updated: screen.getByTestId("dashboard-updated").textContent,
      waiting: rows("list-needs-attention").map(r => r.querySelector(".text-muted")?.textContent),
      cards: within(screen.getByTestId("metric-cards")).getAllByRole("link").map(l => l.getAttribute("aria-label")),
      needs: rowNumbers("list-needs-attention"),
      updatedRows: rowNumbers("list-recently-updated"),
      resolved: rowNumbers("list-recently-resolved"),
    };
    view.unmount();
    tz.mockRestore();
    vi.restoreAllMocks();
    return result;
  }

  it("UI-19: \"Waiting since\" and \"Updated\" change with the time zone; counts, rows, and order do not", async () => {
    const la = await snapshot("America/Los_Angeles");
    const bangkok = await snapshot("Asia/Bangkok");
    expect(la.updated).toBe("Updated 03:20");
    expect(bangkok.updated).toBe("Updated 17:20");
    expect(la.waiting).not.toEqual(bangkok.waiting);
    expect(bangkok.cards).toEqual(la.cards);
    expect(bangkok.needs).toEqual(la.needs);
    expect(bangkok.updatedRows).toEqual(la.updatedRows);
    expect(bangkok.resolved).toEqual(la.resolved);
    expect(la.needs).toEqual(requesterPayload().needsAttention.map((t: { ticketNumber: string }) => t.ticketNumber));
  });
});
