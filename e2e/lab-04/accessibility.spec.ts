import type { Locator, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, createTicket, createAction, moveTicket, setOwner } from "./support/fixtures";
import { answerNextConfirm, expectVisibleFocus } from "./support/ui";

// A11Y-02 (keyboard only, focus always visible) and A11Y-03 (axe on four screens, no serious or
// critical violation; no rule is disabled and nothing is filtered). Each test uses its own users and
// Tickets; the status change through the keyboard runs on the test's own Ticket.

/**
 * Presses Tab until `target` has focus, checking at every stop that focus is visible. Fails if
 * the target is not reached within `max` stops (so the tab order really leads there).
 */
async function tabTo(page: Page, target: Locator, what: string, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const active = page.locator(":focus");
    await expectVisibleFocus(active, `${what}, tab stop ${i + 1}`);
    if (await target.evaluate(el => el === document.activeElement)) return;
  }
  throw new Error(`${what} was not reached within ${max} Tab presses`);
}

test.describe("Accessibility (A11Y-02, A11Y-03)", () => {
  test("A11Y-02: dashboard cards, the status control, and the Actions dialog work by keyboard with visible focus", async ({ browser, makeUser, useSession }) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Keyboard Staff");
    const requester = await makeUser("REQUESTER", "Lab4 Keyboard Requester");
    const closed = await createTicket(requester, "Keyboard: printer toner low");
    await moveTicket(staff, closed.id, ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]);
    const open = await createTicket(requester, "Keyboard: monitor stand loose");
    await moveTicket(staff, open.id, ["OPEN"]);
    await setOwner(staff, open.id, staff.id);

    const context = await browser.newContext();
    await useSession(context, staff);
    const page = await context.newPage();

    // A dashboard card: reached by Tab, opened with Enter
    await page.goto("/staff/dashboard");
    const card = page.getByRole("link", { name: /^My Assigned \d+ View all$/ });
    await expect(card).toBeVisible();
    await tabTo(page, card, "My assigned card");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/staff\/tickets\?ticketOwnerId=\d+&currentStatus=/);
    await expect(page.getByRole("heading", { level: 1, name: "My Queue" })).toBeVisible();

    // The status control: a Closed Ticket offers only Reopened, which asks for confirmation
    await page.goto(`/staff/tickets/${closed.id}`);
    const select = page.getByRole("combobox", { name: "Select new ticket status" });
    await expect(select).toBeVisible();
    await tabTo(page, select, "status control");
    const question = answerNextConfirm(page, true);
    await page.keyboard.press("ArrowDown");
    expect(await question).toBe("Change status from Closed to Reopened?");
    await expect(page.getByRole("status").filter({ hasText: "Status changed from Closed to Reopened." })).toBeVisible();

    // The Actions dialog: Enter opens it, Tab stays inside, Escape closes it, focus returns
    await page.goto(`/staff/tickets/${open.id}`);
    const add = page.getByTestId("actions-taken-card").getByRole("button", { name: "Add Action" });
    await expect(add).toBeVisible();
    await tabTo(page, add, "Add Action button");
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add Action" });
    await expect(dialog).toBeVisible();
    // Tab round the dialog until focus comes back to where it started. Every stop must be inside the
    // dialog. Ordinary controls must show a visible focus in their computed style. The parts inside
    // the native date-time field (day, month, year, time, calendar button) live in the browser's own
    // shadow DOM: there the field itself must be the active element, and the browser draws the ring.
    const start = await page.evaluate(() => document.activeElement?.id ?? "");
    let wrapped = false;
    let leftStart = false;
    for (let i = 1; i <= 40 && !wrapped; i++) {
      await page.keyboard.press("Tab");
      const at = await dialog.evaluate(d => {
        const a = document.activeElement as HTMLElement | null;
        return { inside: !!a && d.contains(a), id: a?.id ?? "", dateTime: a instanceof HTMLInputElement && a.type === "datetime-local", lightDomFocus: !!a?.matches(":focus") };
      });
      expect(at.inside, `Tab ${i} stays in the dialog`).toBe(true);
      if (at.dateTime && !at.lightDomFocus) {
        await expect(dialog.locator('input[type="datetime-local"]'), `Tab ${i}: the date-time field holds focus`).toBeFocused();
      } else {
        await expectVisibleFocus(page.locator(":focus"), `Add Action dialog, Tab ${i}`);
      }
      if (at.id !== start) leftStart = true;
      wrapped = leftStart && at.id === start;
    }
    expect(wrapped, "Tab wraps round the dialog back to the first control").toBe(true);
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate(d => d.contains(document.activeElement)), "Shift+Tab stays in the dialog").toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expectVisibleFocus(add, "Add Action button after Escape");

    await context.close();
  });

  test("A11Y-03: axe finds no serious or critical violation on both dashboards and both Ticket Detail screens", async ({ browser, makeUser, useSession }, testInfo) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Axe Staff");
    const requester = await makeUser("REQUESTER", "Lab4 Axe Requester");
    const ticket = await createTicket(requester, "Axe: laptop fan is loud");
    await moveTicket(staff, ticket.id, ["OPEN", "IN_PROGRESS"]);
    await setOwner(staff, ticket.id, staff.id);
    await createAction(staff, ticket.id, { description: "Clean the laptop fan" });

    const staffContext = await browser.newContext();
    await useSession(staffContext, staff);
    const requesterContext = await browser.newContext();
    await useSession(requesterContext, requester);
    const staffPage = await staffContext.newPage();
    const requesterPage = await requesterContext.newPage();

    const screens: { name: string; page: Page; path: string; ready: (p: Page) => Locator }[] = [
      { name: "Requester Dashboard", page: requesterPage, path: "/dashboard", ready: p => p.getByTestId("metric-cards") },
      { name: "Staff Dashboard", page: staffPage, path: "/staff/dashboard", ready: p => p.getByTestId("metric-cards") },
      { name: "Requester Ticket Detail", page: requesterPage, path: `/tickets/${ticket.id}`, ready: p => p.getByTestId("actions-taken-card").getByRole("heading", { name: /Actions Taken by IT Staff \(1\)/ }) },
      { name: "Staff Ticket Detail", page: staffPage, path: `/staff/tickets/${ticket.id}`, ready: p => p.getByTestId("actions-taken-card").getByRole("heading", { name: "Actions Taken (1)" }) },
    ];

    const blocking: { screen: string; viewport: string; rule: string; impact: string; help: string; targets: string[] }[] = [];
    const summary: Record<string, Record<string, number>> = {};
    for (const s of screens) {
      await s.page.goto(s.path);
      await expect(s.ready(s.page)).toBeVisible();
      await expect(s.page.locator('[aria-busy="true"]')).toHaveCount(0);
      const result = await new AxeBuilder({ page: s.page }).analyze();
      summary[s.name] = {};
      for (const v of result.violations) {
        summary[s.name][`${v.id} (${v.impact})`] = v.nodes.length;
        if (v.impact === "serious" || v.impact === "critical") {
          blocking.push({ screen: s.name, viewport: testInfo.project.name, rule: v.id, impact: v.impact, help: v.help, targets: v.nodes.map(n => n.target.join(" ")) });
        }
      }
    }
    await testInfo.attach("axe-summary.json", { body: JSON.stringify({ viewport: testInfo.project.name, violations: summary, blocking }, null, 2), contentType: "application/json" });
    expect(blocking, `serious or critical axe violations:\n${JSON.stringify(blocking, null, 2)}`).toEqual([]);

    await staffContext.close();
    await requesterContext.close();
  });
});
