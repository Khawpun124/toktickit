import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";
import dashboardCss from "../../src/components/dashboard/dashboard.css?raw";
import { ADMIN, REQUESTER, mockServer, renderApp, staffPayload } from "./dashboardTestKit.js";

// STYLE-01 (metric card styling uses the Zen Green tokens) and STYLE-02 (status and priority
// badges always carry text, never colour alone), ui-spec sections 2 and 11.

/** The declarations of one CSS rule, by exact selector. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = dashboardCss.match(new RegExp(`(?:^|\\n|,)\\s*${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`));
  if (!match) throw new Error(`No CSS rule for ${selector}`);
  return match[1];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("STYLE-01: metric card styling", () => {
  it("STYLE-01: the metric tokens are defined with the ui-spec values (32 px bold value, 14 px medium label)", () => {
    const root = rule(":root");
    expect(root).toMatch(/--zg-metric-value-size:\s*32px/);
    expect(root).toMatch(/--zg-metric-value-weight:\s*700/);
    expect(root).toMatch(/--zg-metric-label-size:\s*14px/);
    expect(root).toMatch(/--zg-metric-label-weight:\s*500/);
    expect(root).toMatch(/--zg-metric-label:\s*rgba\(31, 42, 36, 0\.8\)/); // --zg-text #1F2A24 at 80%
  });

  it("STYLE-01: label, value, and link rules use the tokens and the Zen Green colours", () => {
    expect(rule(".zg-metric-value")).toMatch(/font-size:\s*var\(--zg-metric-value-size\)/);
    expect(rule(".zg-metric-value")).toMatch(/font-weight:\s*var\(--zg-metric-value-weight\)/);
    expect(rule(".zg-metric-value")).toMatch(/color:\s*var\(--zg-text\)/);
    expect(rule(".zg-metric-label")).toMatch(/font-size:\s*var\(--zg-metric-label-size\)/);
    expect(rule(".zg-metric-label")).toMatch(/color:\s*var\(--zg-metric-label\)/);
    expect(rule(".zg-metric-link")).toMatch(/color:\s*var\(--zg-secondary\)/);
    expect(rule(".zg-metric-card")).toMatch(/border-left:\s*4px solid var\(--zg-secondary\)/);
    expect(rule(".zg-metric-card")).toMatch(/background:\s*var\(--zg-surface\)/);
    expect(dashboardCss).toMatch(/\.zg-metric-card:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--zg-secondary\)/);
  });

  it("STYLE-01: every card on both dashboards uses the same label, value, and link parts", async () => {
    mockServer({
      me: ADMIN,
      routes: { "GET /api/dashboard/staff": () => ({ status: 200, body: staffPayload({ users: { active: 11, inactive: 3 } }) }) },
    });
    const staff = renderApp("/staff/dashboard");
    const cards = within(await screen.findByTestId("metric-cards")).getAllByRole("link");
    expect(cards).toHaveLength(7);
    for (const card of cards) {
      expect(card).toHaveClass("zg-metric-card");
      expect(card.querySelector(".zg-metric-label")?.textContent).toBeTruthy();
      expect(card.querySelector(".zg-metric-value")?.textContent).toMatch(/^\d+$/);
      expect(card.querySelector(".zg-metric-link")).toHaveTextContent("View all");
    }
    staff.unmount();
    vi.restoreAllMocks();

    mockServer({ me: REQUESTER });
    renderApp("/dashboard");
    const requesterCards = within(await screen.findByTestId("metric-cards")).getAllByRole("link");
    expect(requesterCards).toHaveLength(4);
    for (const card of requesterCards) {
      expect(card).toHaveClass("zg-metric-card");
      expect(card.querySelector(".zg-metric-value")?.textContent).toMatch(/^\d+$/);
    }
  });
});

describe("STYLE-02: status and priority badges", () => {
  it("STYLE-02: every status, priority, and Action badge shows its meaning as text", async () => {
    const payload = staffPayload();
    payload.myRecentTickets[0].itPriority = "MEDIUM";
    mockServer({ me: ADMIN, routes: { "GET /api/dashboard/staff": () => ({ status: 200, body: payload }) } });
    renderApp("/staff/dashboard");
    await screen.findByTestId("metric-cards");

    const statusLabels = ["New", "Open", "In Progress", "Waiting for Requester", "Resolved", "Closed", "Reopened", "Cancelled"];
    const statuses = screen.getAllByTestId("status-badge");
    expect(statuses.length).toBeGreaterThan(0);
    for (const b of statuses) expect(statusLabels).toContain(b.textContent);

    const priorities = screen.getAllByTestId("priority-badge");
    expect(priorities.length).toBeGreaterThan(0);
    for (const b of priorities) expect(b.textContent).toMatch(/^IT Priority: (▲ High|Medium|Low)$/);

    const actionBadges = document.querySelectorAll(".zg-action-badge");
    expect(actionBadges.length).toBe(2);
    for (const b of Array.from(actionBadges)) expect(b.textContent).toMatch(/^[○◐] (Planned|In progress)$/);
  });

  it("STYLE-02: badges never wrap, and the High priority also carries a symbol", () => {
    expect(rule(".zg-dash-badge")).toMatch(/white-space:\s*nowrap/);
    expect(dashboardCss).toMatch(/\.zg-priority-high\s*\{/);
  });
});
