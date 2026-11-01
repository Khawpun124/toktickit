import type { Page, Response } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { expectNoHorizontalScroll, snap } from "./support/ui";

// E2E-05, RESP-01, RESP-02, and the dashboard part of RESP-04 (tests.md section 2). The seeded
// l4-dash-* users prepared by e2e/lab-04/support/prepare.ts are only read here: no Ticket changes.
// Staff card numbers count the whole system, which the other specs change, so every card is
// compared with the total of the list its own link opens, never with a fixed number.

const STAFF_CARDS = ["Unassigned tickets", "My assigned tickets", "New tickets", "In Progress tickets", "Waiting for Requester tickets", "High IT Priority tickets"];
const REQUESTER_CARDS = ["Open tickets", "Tickets waiting for you", "Resolved tickets", "Closed tickets"];

const cardLink = (page: Page, name: string) => page.getByRole("link", { name: new RegExp(`^${name}: \\d+\\. View all$`) });

async function cardCount(page: Page, name: string): Promise<number> {
  const label = await cardLink(page, name).getAttribute("aria-label");
  return Number(label!.match(/: (\d+)\. View all$/)![1]);
}

/** Opens a card and returns the total of the list request its link made. */
async function followCard(page: Page, name: string, listPath: string): Promise<{ total: number; query: string }> {
  const href = (await cardLink(page, name).getAttribute("href"))!;
  const query = href.split("?")[1];
  const listed = page.waitForResponse((r: Response) => {
    const url = new URL(r.url());
    return url.pathname === listPath && url.searchParams.get("currentStatus") === new URLSearchParams(query).get("currentStatus");
  });
  await cardLink(page, name).click();
  const response = await listed;
  expect(response.status(), `${name} list`).toBe(200);
  const body = await response.json();
  return { total: body.pagination.totalItems, query };
}

/** The list screen shows the same total ("of N tickets"), or its empty state when it is 0. */
async function expectListTotal(page: Page, total: number, emptyHeading: string) {
  if (total === 0) await expect(page.getByRole("heading", { name: emptyHeading })).toBeVisible();
  else await expect(page.getByText(new RegExp(`of\\s+${total}\\s+tickets`))).toBeVisible();
}

/** How many rows the metric cards take: cards sharing a top edge are in one row. */
async function cardRows(page: Page): Promise<number> {
  const tops = await page.getByTestId("metric-cards").locator(".zg-metric-card").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  return new Set(tops).size;
}

test.describe("Dashboards (E2E-05, RESP-01, RESP-02, RESP-04)", () => {
  test("E2E-05: Staff Dashboard cards equal the Queue totals they open, and Urgent Tickets holds only active High-priority Tickets", async ({ browser, seed, useSession }, testInfo) => {
    const context = await browser.newContext();
    await useSession(context, seed.users.dashStaff);
    const page = await context.newPage();
    await page.goto("/staff/dashboard");
    await expect(page.getByTestId("metric-cards")).toBeVisible();

    const urgent = page.getByTestId("list-urgent");
    for (const seeded of ["TKT-L4-0002", "TKT-L4-0003", "TKT-L4-0006"]) await expect(urgent.getByText(seeded), `${seeded} is urgent`).toBeVisible();
    for (const excluded of ["TKT-L4-0007", "TKT-L4-0004"]) await expect(urgent.getByText(excluded), `${excluded} is not urgent`).toHaveCount(0);
    for (const badge of await urgent.getByTestId("priority-badge").allTextContents()) expect(badge).toContain("High");

    // RESP-01: six in a row at 1280 px, three per row on the tablet, two per row on the phone
    expect(await cardRows(page)).toBe({ desktop: 1, tablet: 2, mobile: 3 }[testInfo.project.name]);
    await expectNoHorizontalScroll(page, "Staff Dashboard");
    await snap(page, testInfo, "staff-dashboard", "populated");

    for (const name of STAFF_CARDS) {
      await page.goto("/staff/dashboard");
      await expect(cardLink(page, name)).toBeVisible();
      const count = await cardCount(page, name);
      const list = await followCard(page, name, "/api/staff/tickets");
      expect(list.total, `${name}: card ${count}, Queue (${list.query}) ${list.total}`).toBe(count);
      await expect(page.getByRole("heading", { level: 1, name: "My Queue" })).toBeVisible();
      await expectListTotal(page, count, "No tickets match your search");
    }
    await context.close();
  });

  test("E2E-05: Requester Dashboard cards equal the My Tickets totals they open; a Requester with no Tickets sees zeros and empty messages", async ({ browser, seed, useSession }, testInfo) => {
    const context = await browser.newContext();
    await useSession(context, seed.users.dashRequesterMany);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByTestId("metric-cards")).toBeVisible();
    await expect(page.getByTestId("list-needs-attention").getByRole("link")).toHaveCount(3);

    // RESP-02: four in a row on the desktop, two by two on the tablet and the phone
    expect(await cardRows(page)).toBe({ desktop: 1, tablet: 2, mobile: 2 }[testInfo.project.name]);
    await expectNoHorizontalScroll(page, "Requester Dashboard");
    await snap(page, testInfo, "requester-dashboard", "populated");

    for (const name of REQUESTER_CARDS) {
      await page.goto("/dashboard");
      await expect(cardLink(page, name)).toBeVisible();
      const count = await cardCount(page, name);
      const list = await followCard(page, name, "/api/tickets");
      expect(list.total, `${name}: card ${count}, My Tickets (${list.query}) ${list.total}`).toBe(count);
      await expect(page.getByRole("heading", { level: 1, name: "My Tickets" })).toBeVisible();
      await expectListTotal(page, count, "No tickets match your filters");
    }
    await context.close();

    // AC-23: no Tickets at all
    const emptyContext = await browser.newContext();
    await useSession(emptyContext, seed.users.dashRequesterEmpty);
    const empty = await emptyContext.newPage();
    await empty.goto("/dashboard");
    await expect(empty.getByTestId("metric-cards")).toBeVisible();
    for (const name of REQUESTER_CARDS) expect(await cardCount(empty, name), name).toBe(0);
    for (const message of ["Nothing needs your attention right now.", "No recent updates on your tickets.", "No tickets were resolved in the last 30 days."]) {
      await expect(empty.getByText(message)).toBeVisible();
    }
    await expectNoHorizontalScroll(empty, "empty Requester Dashboard");
    await snap(empty, testInfo, "requester-dashboard", "empty");
    await emptyContext.close();
  });

  test("RESP-01: Staff Dashboard empty (no work assigned) and failure states at every viewport", async ({ browser, seed, useSession }, testInfo) => {
    const context = await browser.newContext();
    await useSession(context, seed.users.dashStaffIdle);
    const page = await context.newPage();

    // Real data: this IT Staff member owns nothing and has no Actions. The cards count the whole
    // system, so they are not zero; the "My" cards and lists are.
    await page.goto("/staff/dashboard");
    await expect(page.getByTestId("metric-cards")).toBeVisible();
    expect(await cardCount(page, "My assigned tickets")).toBe(0);
    await expect(page.getByText("You don't own any tickets yet.")).toBeVisible();
    await expect(page.getByText("No open actions are assigned to you.")).toBeVisible();
    await expectNoHorizontalScroll(page, "Staff Dashboard, no work assigned");
    await snap(page, testInfo, "staff-dashboard", "empty");

    // Failure: the dashboard request answers 500
    await page.route("**/api/dashboard/staff", route => route.fulfill({
      status: 500, contentType: "application/json", body: JSON.stringify({ error: "Unexpected error. Please try again.", code: "INTERNAL_ERROR" }),
    }));
    await page.goto("/staff/dashboard");
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("We couldn't load your dashboard.");
    await expect(alert.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("INTERNAL_ERROR");
    await expectNoHorizontalScroll(page, "Staff Dashboard failure");
    await snap(page, testInfo, "staff-dashboard", "failure");
    await context.close();
  });
});
