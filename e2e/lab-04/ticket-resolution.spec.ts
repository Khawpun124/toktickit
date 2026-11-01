import type { Page } from "@playwright/test";
import { test, expect, createTicket, createAction, moveTicket, setOwner } from "./support/fixtures";
import { API_URL } from "./support/env";
import { expectOk } from "./support/http";
import { answerNextConfirm, expectNoHorizontalScroll, snap } from "./support/ui";

// E2E-03 and E2E-04 (tests.md section 2): the resolution gate in the UI and through the API, and
// the cancel cascade. Each test makes its own users and Ticket. The Requester's "problem appears
// resolved" flag is set before the staff page opens: the flag raises the Ticket version (BR-22), and
// a page opened earlier would then get a version conflict instead of the gate.

const card = (page: Page) => page.getByTestId("actions-taken-card");
const row = (page: Page, text: string) => page.locator("[data-action-id]:visible").filter({ hasText: text });
const statusSelect = (page: Page) => page.getByRole("combobox", { name: "Select new ticket status" });
const gateCallout = (page: Page) => page.getByTestId("resolution-gate-callout");

async function openStaffTicket(page: Page, id: number, actions: number) {
  await page.goto(`/staff/tickets/${id}`);
  await expect(card(page).getByRole("heading", { name: `Actions Taken (${actions})` })).toBeVisible();
}

/** Page (document) y of the two section headings, independent of the scroll position. */
async function headingTops(page: Page): Promise<Record<string, number>> {
  const tops: Record<string, number> = {};
  for (const [name, heading] of [
    ["Ticket Information", page.getByText("Ticket Information", { exact: true })],
    ["Actions Taken", card(page).getByRole("heading", { name: /^Actions Taken/ })],
  ] as const) {
    tops[name] = await heading.evaluate(el => Math.round(el.getBoundingClientRect().top + window.scrollY));
  }
  return tops;
}

async function completeAction(page: Page, description: string, result: string) {
  await row(page, description).getByRole("button", { name: /View action from/ }).click();
  const details = page.getByRole("dialog", { name: "Action details" });
  await details.getByRole("button", { name: "Mark completed" }).click();
  await details.getByLabel(/^Result/).fill(result);
  await details.getByRole("button", { name: "Confirm" }).click();
  await expect(details.getByText("Completed and cancelled actions cannot be changed.")).toBeVisible();
  await details.getByText("Close", { exact: true }).click();
  await expect(row(page, description)).toContainText("Completed");
}

test.describe("Ticket resolution (E2E-03, E2E-04)", () => {
  test("E2E-03: Resolved is blocked by an unfinished Action (UI and direct API, flag included), then allowed after completion", async ({ browser, makeUser, useSession }, testInfo) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Resolve Staff");
    const requester = await makeUser("REQUESTER", "Lab4 Resolve Requester");
    const ticket = await createTicket(requester, "VPN drops every ten minutes");
    await moveTicket(staff, ticket.id, ["OPEN", "IN_PROGRESS"]);
    await setOwner(staff, ticket.id, staff.id);
    await createAction(staff, ticket.id, { description: "Collect the VPN client logs" });

    // AC-19: the Requester's flag changes no status and does not lift the gate
    const flag = await expectOk("PATCH", `/api/tickets/${ticket.id}/resolution-flag`, { cookie: requester.cookie }, [200]);
    expect(flag.body.problemAppearsResolved).toBe(true);

    const context = await browser.newContext();
    await useSession(context, staff);
    const page = await context.newPage();
    await openStaffTicket(page, ticket.id, 1);

    // Blocked in the UI, with the open count
    await expect(statusSelect(page).locator('option[value="RESOLVED"]')).toBeDisabled();
    await expect(statusSelect(page).locator('option[value="RESOLVED"]')).toHaveText("Resolved (unfinished actions)");
    await expect(gateCallout(page)).toContainText("1 unfinished action(s) must be completed or cancelled before this ticket can be resolved.");
    await expectNoHorizontalScroll(page, "gate block");
    await snap(page, testInfo, "ticket-workflow", "gate-block");

    // Blocked through the API with the same session: 409 and nothing changes
    const bypass = await page.request.patch(`${API_URL}/api/staff/tickets/${ticket.id}/status`, { data: { newStatus: "RESOLVED" } });
    expect(bypass.status()).toBe(409);
    const body = await bypass.json();
    expect(body.code).toBe("OPEN_ACTIONS_BLOCK_RESOLUTION");
    expect(body.openActionsCount).toBe(1);
    const unchanged = await expectOk("GET", `/api/staff/tickets/${ticket.id}`, { cookie: staff.cookie });
    expect(unchanged.body.currentStatus).toBe("IN_PROGRESS");
    expect(unchanged.body.problemAppearsResolved).toBe(true);

    // Complete the Action: the gate lifts
    await completeAction(page, "Collect the VPN client logs", "Logs collected and attached to the vendor case.");
    await expect(gateCallout(page)).toHaveCount(0);
    await expect(statusSelect(page).locator('option[value="RESOLVED"]')).toBeEnabled();
    const permitted = await statusSelect(page).locator("option:not([disabled])").allTextContents();
    expect(permitted).toEqual(["Waiting for Requester", "Resolved", "Cancelled"]);
    testInfo.annotations.push({ type: "permitted transitions from In Progress", description: permitted.join(", ") });
    await snap(page, testInfo, "ticket-workflow", "permitted-transitions");

    // Resolve: confirm, then the summary updates
    const before = await headingTops(page);
    const question = answerNextConfirm(page, true);
    await statusSelect(page).selectOption("RESOLVED");
    expect(await question).toBe("Change status from In Progress to Resolved?");
    const done = page.getByRole("status").filter({ hasText: "Status changed from In Progress to Resolved." });
    await expect(done).toBeVisible();
    // ui-spec section 9: the message is a toast fixed to the bottom; it does not move the page
    const toast = await done.evaluate(el => { const s = getComputedStyle(el); return { position: s.position, color: s.color, background: s.backgroundColor }; });
    testInfo.annotations.push({ type: "success toast colours", description: `${toast.color} on ${toast.background}` });
    expect.soft(toast.position, "success message position").toBe("fixed");
    const whileShown = await headingTops(page);
    // Resolving also replaces the Add Action button with a line of text, which changes the Actions
    // Taken header; so only Ticket Information is compared with the state before the change.
    expect.soft(whileShown["Ticket Information"], "Ticket Information y while the message shows, compared with before it").toBe(before["Ticket Information"]);
    // The message is sticky and shows for 3 s: capture the viewport while it is still there
    await snap(page, testInfo, "ticket-workflow", "success", { fullPage: false });
    await expect(done, "the message was still showing after the screenshot").toBeVisible();
    // The same page with and without the message: the headings must not move
    await expect(done, "the message disappears by itself").toBeHidden();
    expect(await headingTops(page), "heading positions while the message showed, compared with after it disappeared").toEqual(whileShown);
    const resolved = await expectOk("GET", `/api/staff/tickets/${ticket.id}`, { cookie: staff.cookie });
    expect(resolved.body.currentStatus).toBe("RESOLVED");
    expect(resolved.body.resolvedAt).not.toBeNull();
    await expectNoHorizontalScroll(page, "after Resolved");

    // AC-19: reopening resets the flag
    await statusSelect(page).selectOption("REOPENED");
    await expect(page.getByRole("status").filter({ hasText: "Status changed from Resolved to Reopened." })).toBeVisible();
    const reopened = await expectOk("GET", `/api/staff/tickets/${ticket.id}`, { cookie: staff.cookie });
    expect(reopened.body.currentStatus).toBe("REOPENED");
    expect(reopened.body.problemAppearsResolved).toBe(false);

    await context.close();
  });

  test("E2E-04: cancelling a Ticket cancels its unfinished Actions with the automatic Result", async ({ browser, makeUser, useSession }, testInfo) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Cancel Staff");
    const requester = await makeUser("REQUESTER", "Lab4 Cancel Requester");
    const ticket = await createTicket(requester, "Projector in room 4 flickers");
    await moveTicket(staff, ticket.id, ["OPEN", "IN_PROGRESS"]);
    await createAction(staff, ticket.id, { description: "Replace the HDMI cable" });
    await createAction(staff, ticket.id, { description: "Test with a second laptop", status: "IN_PROGRESS" });

    const context = await browser.newContext();
    await useSession(context, staff);
    const page = await context.newPage();
    await openStaffTicket(page, ticket.id, 2);

    // The browser's own confirm box cannot be captured; the page is captured just before it opens,
    // and the question it asked is asserted and recorded below.
    await snap(page, testInfo, "ticket-workflow", "confirmation");
    const question = answerNextConfirm(page, true);
    await statusSelect(page).selectOption("CANCELLED");
    const asked = await question;
    expect(asked).toBe("Change status from In Progress to Cancelled?\n\n2 unfinished action(s) will be cancelled automatically.");
    testInfo.annotations.push({ type: "confirm dialog (native, not in the screenshot)", description: asked });

    await expect(page.getByRole("status").filter({ hasText: "2 unfinished action(s) were cancelled automatically." })).toBeVisible();
    for (const description of ["Replace the HDMI cable", "Test with a second laptop"]) {
      await expect(row(page, description)).toContainText("Cancelled");
      await row(page, description).getByRole("button", { name: /View action from/ }).click();
      const details = page.getByRole("dialog", { name: "Action details" });
      await expect(details.getByText("Cancelled automatically because the Ticket was cancelled.")).toBeVisible();
      await details.getByText("Close", { exact: true }).click();
    }
    await expect(card(page).getByRole("button", { name: "Add Action" })).toHaveCount(0);
    await expectNoHorizontalScroll(page, "cancelled Ticket");

    const actions = await expectOk("GET", `/api/tickets/${ticket.id}/actions`, { cookie: staff.cookie });
    expect(actions.body.map((a: { status: string }) => a.status)).toEqual(["CANCELLED", "CANCELLED"]);
    await context.close();
  });
});
