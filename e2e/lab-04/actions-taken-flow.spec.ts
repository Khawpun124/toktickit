import type { Page } from "@playwright/test";
import { test, expect, createTicket, createAction, moveTicket, setOwner } from "./support/fixtures";
import { expectNoHorizontalScroll, snap } from "./support/ui";

// E2E-01, E2E-02, RESP-03, and the Actions Taken part of RESP-04 (tests.md section 2).
// Every test makes its own staff, Requester, and Ticket; nothing seeded is changed.

const card = (page: Page) => page.getByTestId("actions-taken-card");
const row = (page: Page, text: string) => page.locator("[data-action-id]:visible").filter({ hasText: text });
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });

async function openStaffTicket(page: Page, id: number, actions: number) {
  await page.goto(`/staff/tickets/${id}`);
  await expect(card(page).getByRole("heading", { name: `Actions Taken (${actions})` })).toBeVisible();
}

/** RESP-03: a table from tablet up, cards on mobile; and the open dialog fits the viewport. */
async function expectActionsLayout(page: Page, project: string) {
  const mobile = project === "mobile";
  await expect(page.getByTestId("actions-card-view")).toBeVisible({ visible: mobile });
  await expect(page.getByTestId("actions-table-view")).toBeVisible({ visible: !mobile });
}

/**
 * RESP-03 and RESP-04, desktop and tablet: the Actions table fits its card. Its box does not scroll
 * sideways, and the first row's View button lies wholly inside the card.
 */
async function expectActionsTableFits(page: Page, project: string) {
  if (project === "mobile") return; // mobile shows cards, checked by expectActionsLayout
  const table = page.getByTestId("actions-table-view");
  const size = await table.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(size.scroll, `Actions table box: scrollWidth ${size.scroll} must not exceed clientWidth ${size.client}`).toBeLessThanOrEqual(size.client);
  const cardBox = (await card(page).boundingBox())!;
  const view = (await table.getByRole("button", { name: /View action from/ }).first().boundingBox())!;
  expect(view.x, "View button left edge inside the card").toBeGreaterThanOrEqual(cardBox.x);
  expect(view.x + view.width, `View button right edge ${view.x + view.width} inside the card (${cardBox.x + cardBox.width})`).toBeLessThanOrEqual(cardBox.x + cardBox.width);
}

async function expectDialogFits(page: Page, name: string) {
  const box = await dialog(page, name).boundingBox();
  const width = page.viewportSize()!.width;
  expect(box, `${name} dialog is on screen`).not.toBeNull();
  expect(box!.x, `${name} dialog left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${name} dialog right edge`).toBeLessThanOrEqual(width);
}

test.describe("Actions Taken flow (E2E-01, E2E-02, RESP-03, RESP-04)", () => {
  test("E2E-01: staff create, edit, start, and complete an Action; the Requester sees it read-only", async ({ browser, makeUser, useSession }, testInfo) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Flow Staff");
    const requester = await makeUser("REQUESTER", "Lab4 Flow Requester");
    const ticket = await createTicket(requester, "Docking station not detected");
    await moveTicket(staff, ticket.id, ["OPEN", "IN_PROGRESS"]);
    await setOwner(staff, ticket.id, staff.id);

    const staffContext = await browser.newContext();
    await useSession(staffContext, staff);
    const page = await staffContext.newPage();
    await openStaffTicket(page, ticket.id, 0);
    await expect(card(page).getByText("Visible to the Requester")).toBeVisible();

    // Create
    await card(page).getByRole("button", { name: "Add Action" }).click();
    await expect(dialog(page, "Add Action")).toBeVisible();
    await dialog(page, "Add Action").getByLabel(/^Description/).fill("Check the docking station firmware version");
    await expectDialogFits(page, "Add Action");
    await expectNoHorizontalScroll(page, "Add Action dialog");
    await snap(page, testInfo, "actions-taken", "create", { fullPage: false }); // dialog open: the viewport, as the user sees it
    await dialog(page, "Add Action").getByRole("button", { name: "Save" }).click();
    await expect(dialog(page, "Add Action")).toBeHidden();
    await expect(card(page).getByRole("status")).toHaveText("Action added.");
    await expect(card(page).getByRole("heading", { name: "Actions Taken (1)" })).toBeVisible();
    await expect(row(page, "Check the docking station firmware version")).toContainText("Planned");
    await expectActionsLayout(page, testInfo.project.name);
    await expectActionsTableFits(page, testInfo.project.name);
    await expectNoHorizontalScroll(page, "Staff Ticket Detail with Actions");
    await snap(page, testInfo, "actions-taken", "list");

    // Edit
    await row(page, "Check the docking station firmware version").getByRole("button", { name: /View action from/ }).click();
    await dialog(page, "Action details").getByRole("button", { name: "Edit" }).click();
    const edit = dialog(page, "Edit Action");
    await edit.getByLabel(/^Description/).fill("Update the docking station firmware to 2.4");
    await expectDialogFits(page, "Edit Action");
    await snap(page, testInfo, "actions-taken", "edit", { fullPage: false }); // dialog open: the viewport, as the user sees it
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden();
    await expect(card(page).getByRole("status")).toHaveText("Action saved.");
    await expect(row(page, "Update the docking station firmware to 2.4")).toBeVisible();

    // Start, then complete with a Result
    await row(page, "Update the docking station firmware to 2.4").getByRole("button", { name: /View action from/ }).click();
    const details = dialog(page, "Action details");
    await details.getByRole("button", { name: "Start" }).click();
    await expect(details.locator("[data-status=\"IN_PROGRESS\"]")).toBeVisible();
    await details.getByRole("button", { name: "Mark completed" }).click();
    await details.getByLabel(/^Result/).fill("Firmware updated; the dock is detected again.");
    await details.getByRole("button", { name: "Confirm" }).click();
    await expect(details.getByText("Completed and cancelled actions cannot be changed.")).toBeVisible();
    await expect(details.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expectDialogFits(page, "Action details");
    await snap(page, testInfo, "actions-taken", "terminal", { fullPage: false }); // dialog open: the viewport, as the user sees it
    await details.getByText("Close", { exact: true }).click();
    await expect(row(page, "Update the docking station firmware to 2.4")).toContainText("Completed");

    // The Requester sees the same Action, read-only
    const requesterContext = await browser.newContext();
    await useSession(requesterContext, requester);
    const rpage = await requesterContext.newPage();
    await rpage.goto(`/tickets/${ticket.id}`);
    await expect(card(rpage).getByRole("heading", { name: "Actions Taken by IT Staff (1)" })).toBeVisible();
    await expect(card(rpage).getByRole("button", { name: "Add Action" })).toHaveCount(0);
    await expect(row(rpage, "Update the docking station firmware to 2.4")).toContainText("Completed");
    await row(rpage, "Update the docking station firmware to 2.4").getByRole("button", { name: /View action from/ }).click();
    const readOnly = dialog(rpage, "Action details");
    await expect(readOnly.getByText("Firmware updated; the dock is detected again.")).toBeVisible();
    for (const control of ["Edit", "Save", "Start", "Mark completed", "Cancel action"]) {
      await expect(readOnly.getByRole("button", { name: control, exact: true }), `Requester has no ${control}`).toHaveCount(0);
    }
    await expectDialogFits(rpage, "Action details");
    await readOnly.getByText("Close", { exact: true }).click();
    await expectActionsTableFits(rpage, testInfo.project.name);
    await row(rpage, "Update the docking station firmware to 2.4").getByRole("button", { name: /View action from/ }).click();
    await expect(readOnly).toBeVisible();
    await expectNoHorizontalScroll(rpage, "Requester Ticket Detail");
    await snap(rpage, testInfo, "actions-taken", "requester-readonly", { fullPage: false }); // dialog open: the viewport, as the user sees it

    await staffContext.close();
    await requesterContext.close();
  });

  test("E2E-02: follow-up needs a note; when two staff edit the same Action the second save shows the conflict and keeps the typed text", async ({ browser, makeUser, useSession }, testInfo) => {
    const staffA = await makeUser("IT_STAFF", "Lab4 Staff A");
    const staffB = await makeUser("IT_STAFF", "Lab4 Staff B");
    const requester = await makeUser("REQUESTER", "Lab4 Conflict Requester");
    const ticket = await createTicket(requester, "Shared drive is read-only");
    await moveTicket(staffA, ticket.id, ["OPEN"]);
    await createAction(staffA, ticket.id, { description: "Check the share permissions" });

    const contextA = await browser.newContext();
    await useSession(contextA, staffA);
    const pageA = await contextA.newPage();
    await openStaffTicket(pageA, ticket.id, 1);

    // Follow-up required without a note: the error sits under the field and nothing is sent
    await card(pageA).getByRole("button", { name: "Add Action" }).click();
    const add = dialog(pageA, "Add Action");
    await add.getByLabel(/^Description/).fill("Ask the vendor about the quota");
    await add.getByLabel("Follow-up required?").check();
    const posts: string[] = [];
    pageA.on("request", r => { if (r.method() === "POST" && r.url().includes("/actions")) posts.push(r.url()); });
    await add.getByRole("button", { name: "Save" }).click();
    const note = add.getByLabel(/^Follow-up Note/);
    await expect(note).toHaveAttribute("aria-invalid", "true");
    await expect(add.getByText("A follow-up note is required when follow-up is needed.")).toBeVisible();
    expect(posts, "no request is sent while the form is invalid").toEqual([]);
    await snap(pageA, testInfo, "actions-taken", "validation", { fullPage: false }); // dialog open: the viewport, as the user sees it
    await add.getByRole("button", { name: "Cancel" }).click();
    await pageA.getByRole("dialog", { name: "Discard changes?" }).getByRole("button", { name: "Discard changes" }).click();
    await expect(add).toBeHidden();

    // Both staff open the same Action for editing
    const contextB = await browser.newContext();
    await useSession(contextB, staffB);
    const pageB = await contextB.newPage();
    await openStaffTicket(pageB, ticket.id, 1);
    for (const p of [pageA, pageB]) {
      await row(p, "Check the share permissions").getByRole("button", { name: /View action from/ }).click();
      await dialog(p, "Action details").getByRole("button", { name: "Edit" }).click();
      await expect(dialog(p, "Edit Action")).toBeVisible();
    }

    await dialog(pageA, "Edit Action").getByLabel(/^Description/).fill("Check the share permissions and the group policy");
    await dialog(pageA, "Edit Action").getByRole("button", { name: "Save" }).click();
    await expect(card(pageA).getByRole("status")).toHaveText("Action saved.");

    const editB = dialog(pageB, "Edit Action");
    await editB.getByLabel(/^Description/).fill("Reset the share ACL to the department default");
    await editB.getByRole("button", { name: "Save" }).click();
    await expect(editB.getByRole("alert")).toContainText("Someone else changed this action");
    await expect(editB.getByRole("alert")).toContainText("Your changes were not saved.");
    await expect(editB.getByLabel(/^Description/)).toHaveValue("Reset the share ACL to the department default");
    await expect(editB.getByRole("button", { name: "Load latest version" })).toBeVisible();
    await expectDialogFits(pageB, "Edit Action");
    await snap(pageB, testInfo, "actions-taken", "conflict", { fullPage: false }); // dialog open: the viewport, as the user sees it

    await contextA.close();
    await contextB.close();
  });
});
