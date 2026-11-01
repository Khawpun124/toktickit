import type { BrowserContext, Locator, Page, Response } from "@playwright/test";
import { test, expect, createTicket, createAction, moveTicket, setOwner } from "./support/fixtures";
import { API_URL, randomPassword } from "./support/env";
import { expectOk } from "./support/http";
import { changePasswordViaUi, collectProblems, loginViaUi } from "./support/ui";

// E2E-06 (console and link sweep through every role's primary flow) and E2E-07 (a representative
// Lab 1-3 flow, unchanged). Each test makes its own users and data. Console errors are counted
// without a filter. Before login the app asks /api/auth/me once and gets 401; that one error is
// proved to be exactly this response, and counting starts again after the login.

type Bad = { status: number; method: string; url: string };

function watchResponses(page: Page): Bad[] {
  const bad: Bad[] = [];
  page.on("response", (r: Response) => {
    if (r.status() >= 400) bad.push({ status: r.status(), method: r.request().method(), url: new URL(r.url()).pathname });
  });
  return bad;
}

// The dev server Playwright starts renders <App> inside React.StrictMode (client/src/main.tsx),
// which mounts AuthProvider twice in development, so the signed-out session check runs twice.
const SIGNED_OUT_SESSION_CHECKS = 2;

/** Opens the app signed out, proves every error is a 401 of /api/auth/me (one console error per response), then signs in through the screen. */
async function signInWatched(context: BrowserContext, email: string, password: string, landing: RegExp | string) {
  const page = await context.newPage();
  const problems = collectProblems(page);
  const bad = watchResponses(page);
  const meResponses: Response[] = [];
  page.on("response", r => { if (new URL(r.url()).pathname === "/api/auth/me") meResponses.push(r); });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "TokTickIT Login" })).toBeVisible();
  await expect.poll(() => meResponses.length, "signed out: session checks").toBe(SIGNED_OUT_SESSION_CHECKS);
  await expect.poll(() => problems.length, "signed out: one console error per session check").toBe(SIGNED_OUT_SESSION_CHECKS);
  expect(meResponses.map(r => r.status()), "signed out: /api/auth/me").toEqual(Array(SIGNED_OUT_SESSION_CHECKS).fill(401));
  expect(bad, "signed out: the only failed responses").toEqual(Array(SIGNED_OUT_SESSION_CHECKS).fill({ status: 401, method: "GET", url: "/api/auth/me" }));
  expect(problems.map(p => ({ kind: p.kind, url: p.url })), "signed out: every console error is one of those responses")
    .toEqual(meResponses.map(r => ({ kind: "console", url: r.url() })));

  await loginViaUi(page, email, password, { landing });
  problems.length = 0;
  bad.length = 0;
  return { page, problems, bad };
}

/** Follows one link or button and waits for the screen it opens. */
async function follow(page: Page, what: string, target: Locator, heading: RegExp | string) {
  await target.click();
  await expect(page.getByRole("heading", { level: 1, name: heading }), `${what} opens its screen`).toBeVisible();
  await expect(page.locator('[aria-busy="true"]'), `${what} finished loading`).toHaveCount(0);
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Main navigation" });

test.describe("Regression sweep (E2E-06, E2E-07)", () => {
  test("E2E-06: every Requester link opens a working screen with no console error or failed request", async ({ browser, makeUser }) => {
    const requester = await makeUser("REQUESTER", "Lab4 Sweep Requester");
    const staff = await makeUser("IT_STAFF", "Lab4 Sweep Staff");
    const ticket = await createTicket(requester, "Sweep: headset microphone muted");
    await moveTicket(staff, ticket.id, ["OPEN"]);
    await createAction(staff, ticket.id, { description: "Check the headset driver" });

    const context = await browser.newContext();
    const { page, problems, bad } = await signInWatched(context, requester.email, requester.password, "My Tickets");

    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome, /);
    for (const label of ["Open", "Waiting for you", "Resolved", "Closed"]) {
      await follow(page, `card ${label}`, page.getByRole("link", { name: new RegExp(`^${label} \\d+ View all$`) }), "My Tickets");
      await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome, /);
    }
    await follow(page, "Recently updated row", page.getByTestId("list-recently-updated").locator(".zg-dash-row").first(), "Sweep: headset microphone muted");
    await expect(page.getByText("Check the headset driver").filter({ visible: true })).toHaveCount(1);
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome, /);
    await follow(page, "quick action Create Ticket", page.getByRole("link", { name: /Create Ticket/ }), "Create Support Ticket");
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome, /);
    await follow(page, "quick action View My Tickets", page.getByRole("link", { name: /View My Tickets/ }), "My Tickets");
    await follow(page, "header + Create Ticket", nav(page).getByRole("button", { name: "+ Create Ticket" }), "Create Support Ticket");
    await follow(page, "header My Tickets", nav(page).getByRole("button", { name: "My Tickets" }), "My Tickets");

    expect(bad, "failed responses after login").toEqual([]);
    expect(problems, "console errors, page errors, failed requests after login").toEqual([]);
    await context.close();
  });

  test("E2E-06: every IT Staff link opens a working screen with no console error or failed request", async ({ browser, makeUser }) => {
    const staff = await makeUser("IT_STAFF", "Lab4 Sweep Staff Two");
    const requester = await makeUser("REQUESTER", "Lab4 Sweep Requester Two");
    const ticket = await createTicket(requester, "Sweep: docking station flickers");
    await moveTicket(staff, ticket.id, ["OPEN"]);
    await setOwner(staff, ticket.id, staff.id);
    await createAction(staff, ticket.id, { description: "Swap the docking cable", assigneeId: staff.id });

    const context = await browser.newContext();
    const { page, problems, bad } = await signInWatched(context, staff.email, staff.password, /^Welcome back, /);

    for (const label of ["Unassigned", "My Assigned", "New", "In Progress", "Waiting for Requester", "High IT Priority"]) {
      await follow(page, `card ${label}`, page.getByRole("link", { name: new RegExp(`^${label} \\d+ View all$`) }), "My Queue");
      await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    }
    await follow(page, "View all my tickets", page.getByRole("link", { name: "View all my tickets in the Queue" }), "My Queue");
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await follow(page, "View all urgent tickets", page.getByRole("link", { name: "View all urgent tickets in the Queue" }), "My Queue");
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await page.getByTestId("list-my-recent").locator(".zg-dash-row").first().click();
    await expect(page.getByTestId("actions-taken-card").getByRole("heading", { name: "Actions Taken (1)" })).toBeVisible();
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await page.getByTestId("list-my-actions").locator(".zg-dash-row").first().click();
    await expect(page.getByTestId("actions-taken-card").getByRole("heading", { name: "Actions Taken (1)" })).toBeVisible();
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await follow(page, "quick action Open My Queue", page.getByRole("link", { name: "Open My Queue" }), "My Queue");
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await follow(page, "quick action Search Tickets", page.getByRole("link", { name: "Search Tickets" }), "My Queue");
    await expect(page.getByLabel("Search")).toBeFocused();
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await follow(page, "quick action Create Ticket", page.getByRole("link", { name: "Create Ticket" }), "Create Support Ticket");
    await follow(page, "header My Queue", nav(page).getByRole("button", { name: "My Queue" }), "My Queue");
    await follow(page, "header + Create Ticket", nav(page).getByRole("button", { name: "+ Create Ticket" }), "Create Support Ticket");

    expect(bad, "failed responses after login").toEqual([]);
    expect(problems, "console errors, page errors, failed requests after login").toEqual([]);
    await context.close();
  });

  test("E2E-06: every Administrator link opens a working screen with no console error or failed request", async ({ browser, makeUser }) => {
    const admin = await makeUser("ADMINISTRATOR", "Lab4 Sweep Administrator");
    const context = await browser.newContext();
    const { page, problems, bad } = await signInWatched(context, admin.email, admin.password, /^Welcome back, /);

    await follow(page, "Users card", page.getByRole("link", { name: /^Users \d+ \d+ inactive View all$/ }), /User Management/);
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    for (const label of ["Unassigned", "High IT Priority"]) {
      await follow(page, `card ${label}`, page.getByRole("link", { name: new RegExp(`^${label} \\d+ View all$`) }), "My Queue");
      await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    }
    await follow(page, "quick action Open My Queue", page.getByRole("link", { name: "Open My Queue" }), "My Queue");
    await follow(page, "header Admin / User Management", nav(page).getByRole("button", { name: "Admin / User Management" }), /User Management/);
    await follow(page, "header My Queue", nav(page).getByRole("button", { name: "My Queue" }), "My Queue");
    await follow(page, "header Dashboard", nav(page).getByRole("button", { name: "Dashboard" }), /^Welcome back, /);
    await expect(page.getByRole("link", { name: "Create Ticket" }), "no Create Ticket quick action for an Administrator").toHaveCount(0);

    expect(bad, "failed responses after login").toEqual([]);
    expect(problems, "console errors, page errors, failed requests after login").toEqual([]);
    await context.close();
  });

  test("E2E-07: Lab 1-3 flow: first login with password change, Ticket with attachment, staff claim, private Internal Note, Administrator creates a user", async ({ browser, seed, makeUser, useSession }) => {
    // A Requester the Administrator creates; the first password change happens on the screen
    const email = `e2e4-lab3flow-${test.info().project.name}-r${test.info().repeatEachIndex}-${seed.runId}@example.com`;
    const initial = randomPassword();
    await expectOk("POST", "/api/admin/users", {
      cookie: seed.users.admin.cookie,
      body: { name: "Lab4 Regression Requester", email, role: "REQUESTER", isActive: true, initialPassword: initial },
    }, [201]);

    const requesterContext = await browser.newContext();
    const rpage = await requesterContext.newPage();
    await rpage.goto("/");
    await loginViaUi(rpage, email, initial, { passwordChange: true });
    await changePasswordViaUi(rpage, initial, randomPassword(), "My Tickets");

    // Create a Ticket with an attachment
    await rpage.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: "+ Create Ticket" }).click();
    await expect(rpage.getByRole("heading", { name: "Create Support Ticket" })).toBeVisible();
    await expect(rpage.locator("#categorySelect option").nth(1)).toBeAttached();
    await rpage.locator("#categorySelect").selectOption({ index: 1 });
    await rpage.locator("#relatedSystemSelect").selectOption({ index: 1 });
    await rpage.locator("#prioritySelect").selectOption("MEDIUM");
    await rpage.locator("#summaryInput").fill("Regression: printer jams on tray 2");
    await rpage.locator("#descriptionInput").fill("The printer on floor 3 jams whenever tray 2 is used.");
    await rpage.locator("#attachmentFileInput").setInputFiles({ name: "jam-report.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 jam report") });
    await rpage.getByRole("button", { name: "Submit Ticket" }).click();
    await expect(rpage.getByText("Ticket Created Successfully!")).toBeVisible();
    const ticketNumber = (await rpage.locator("strong.font-monospace").textContent())!.trim();
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);

    // Staff finds it in the Queue, claims it, and adds an Internal Note
    const staff = await makeUser("IT_STAFF", "Lab4 Regression Staff");
    const staffContext = await browser.newContext();
    await useSession(staffContext, staff);
    const spage = await staffContext.newPage();
    await spage.goto("/staff/tickets");
    await spage.getByLabel("Search").fill(ticketNumber);
    await spage.locator("tr:visible, .card:visible").filter({ hasText: ticketNumber }).first().getByText(ticketNumber).click();
    await expect(spage).toHaveURL(/\/staff\/tickets\/\d+$/);
    const ticketId = Number(spage.url().split("/").pop());
    await spage.locator("#staff-owner-select").selectOption(String(staff.id));
    await expect(spage.getByText(`Owner set to ${staff.name}`)).toBeVisible();
    await spage.locator("#tab-attachments").click();
    await expect(spage.getByText("jam-report.pdf")).toBeVisible();
    await spage.locator("#tab-notes").click();
    const note = "Private: the fuser unit is on back-order.";
    await spage.locator("#staff-internal-note-input").fill(note);
    await spage.locator("#staff-post-note-btn").click();
    await expect(spage.getByText(note)).toBeVisible();

    // The Requester sees the Ticket and the attachment, never the note (screen and API)
    await rpage.goto(`/tickets/${ticketId}`);
    await expect(rpage.getByText("Regression: printer jams on tray 2")).toBeVisible();
    await expect(rpage.getByText("jam-report.pdf")).toBeVisible();
    await expect(rpage.getByText(note)).toHaveCount(0);
    const notes = await rpage.request.get(`${API_URL}/api/tickets/${ticketId}/notes`); // an expected 403
    expect(notes.status()).toBe(403);
    expect(await notes.text()).not.toContain(note);

    // The Administrator creates another user through the screen
    const adminContext = await browser.newContext();
    await useSession(adminContext, seed.users.admin);
    const apage = await adminContext.newPage();
    await apage.goto("/admin/users");
    await apage.locator("#create-user-btn").click();
    const newEmail = `e2e4-created-${test.info().project.name}-r${test.info().repeatEachIndex}-${seed.runId}@example.com`;
    await apage.locator("#user-form-name:visible").fill("Lab4 Created By Admin");
    await apage.locator("#user-form-email:visible").fill(newEmail);
    await apage.locator("#user-form-role:visible").selectOption("IT_STAFF");
    await apage.locator("#user-form-password:visible").fill(randomPassword());
    await apage.locator("#user-form-submit-btn:visible").click();
    await expect(apage.locator("#user-form-success:visible")).toContainText("User created successfully.");
    const listed = await expectOk("GET", `/api/admin/users?search=${encodeURIComponent(newEmail)}`, { cookie: seed.users.admin.cookie });
    expect(listed.body.map((u: { email: string; role: string; mustChangePassword: boolean }) => [u.email, u.role, u.mustChangePassword])).toEqual([[newEmail, "IT_STAFF", true]]);

    await requesterContext.close();
    await staffContext.close();
    await adminContext.close();
  });
});
