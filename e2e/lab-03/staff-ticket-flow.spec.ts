import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

async function loginAndHandlePasswordChange(
  page: Page,
  email: string,
  currentPass: string,
  newPass: string
) {
  await page.goto("/");

  const logoutBtn = page.getByRole("button", { name: /Logout/i });
  if (await logoutBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await logoutBtn.click();
    await expect(page.getByRole("heading", { name: /TokTickIT Login/i })).toBeVisible();
  }

  const emailInput = page.locator("#email");
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailInput.fill(email);
    await page.locator("#password").fill(currentPass);
    await page.getByRole("button", { name: /Sign In/i }).click();

    const alertBox = page.locator('div[role="alert"]');
    const changePassHeading = page.getByRole("heading", { name: /Mandatory Password Change/i });

    await Promise.race([
      alertBox.waitFor({ state: "visible", timeout: 4000 }).catch(() => {}),
      changePassHeading.waitFor({ state: "visible", timeout: 4000 }).catch(() => {}),
      logoutBtn.waitFor({ state: "visible", timeout: 4000 }).catch(() => {}),
    ]);

    let isAlreadyChanged = false;
    if (await alertBox.isVisible().catch(() => false)) {
      const alertText = await alertBox.textContent();
      if (alertText?.includes("Invalid email or password")) {
        await page.locator("#password").fill(newPass);
        await page.getByRole("button", { name: /Sign In/i }).click();
        isAlreadyChanged = true;
      }
    }

    if (!isAlreadyChanged && (await changePassHeading.isVisible({ timeout: 2000 }).catch(() => false))) {
      await page.locator("#currentPassword").fill(currentPass);
      await page.locator("#newPassword").fill(newPass);
      await page.locator("#confirmPassword").fill(newPass);
      await page.getByRole("button", { name: /Continue/i }).click();
      await expect(changePassHeading).not.toBeVisible({ timeout: 10000 });
    }
  }

  await expect(page.getByRole("button", { name: /Logout/i })).toBeVisible({ timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// E2E-02: IT Staff Ticket Flow (runs on desktop project only)
//
// Rationale: `createdTicketSummary` is shared state across tests in this
// describe block. Playwright runs each *project* (desktop/tablet/mobile)
// as a separate worker with a fresh module scope, resetting `let` variables.
// Running the full claim/comment/note flow on desktop-only is the cleanest
// pattern; responsive screenshots for the same screens are captured by the
// dedicated responsive screenshot tests at the bottom of this file
// (those run on all three projects).
// ─────────────────────────────────────────────────────────────────────────────
test.describe.serial("TokTickIT Lab 3 - Staff Ticket Flow & Internal Note Visibility (E2E-02)", () => {
  const queueScreenshotDir = path.resolve(process.cwd(), "artifacts/lab-03/screenshots/staff-queue");
  const detailScreenshotDir = path.resolve(
    process.cwd(),
    "artifacts/lab-03/screenshots/staff-ticket-detail"
  );

  let createdTicketSummary = "";
  let createdTicketId = "";

  test.beforeAll(() => {
    [queueScreenshotDir, detailScreenshotDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  // Skip this entire describe block for non-desktop projects to avoid
  // shared-state issues (createdTicketSummary / createdTicketId reset between projects).
  // Responsive screenshots are captured in the separate describe below.
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name !== "desktop") {
      test.skip();
    }
  });

  test("E2E-02: IT Staff claims Ticket, posts Public Comment and Internal Note (AC-06, AC-09, AC-10)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;
    const requesterEmail = "jennifer.anderson@example.com";
    const staffEmail = "alex.staff@tiktockit.com";
    const pass = "ChangeMe123!";
    const newPass = "NewPassword123!";

    // Step 1: Requester creates a Ticket for IT Staff Queue flow
    await loginAndHandlePasswordChange(page, requesterEmail, pass, newPass);

    await page.goto("/tickets/new");
    await expect(page.getByRole("heading", { name: "Create Support Ticket" })).toBeVisible();

    const createdTicketSummary = `E2E Staff Flow Ticket - ${Date.now()}`;
    await page.getByLabel(/Summary/i).fill(createdTicketSummary);
    await page
      .getByLabel(/Description/i)
      .fill("Testing IT Staff Queue claim, public comments, and internal notes isolation.");
    await page.getByLabel(/Category/i).selectOption({ index: 0 });
    await page.getByLabel(/Related System/i).selectOption({ index: 0 });
    await page.getByLabel(/Requested Priority/i).selectOption("HIGH");

    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/tickets") && resp.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Submit Ticket" }).click();
    const createResp = await responsePromise;
    const createJson = await createResp.json();
    const createdTicketId = String(createJson.id);

    await expect(page.getByText(/Ticket Created Successfully/i)).toBeVisible();

    // Logout Requester
    await page.getByRole("button", { name: "Logout" }).click();

    // Step 2: Login as IT Staff
    await loginAndHandlePasswordChange(page, staffEmail, pass, newPass);

    // Step 3: Open Staff Queue Screen (/staff/tickets)
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /My Queue|IT Staff Ticket Queue/i })).toBeVisible();

    // Screenshot: Staff Queue screen (desktop)
    await page.screenshot({
      path: path.join(queueScreenshotDir, `staff-queue-${projectName}.png`),
      fullPage: true,
    });

    // Step 4: Open created ticket detail view (/staff/tickets/:id)
    await page.goto(`/staff/tickets/${createdTicketId}`);
    await expect(page.getByText(/Ticket Information|Ticket Details/i).first()).toBeVisible();

    // Step 5: Claim/Assign Ticket Owner to Alex Staff (AC-06)
    const ownerSelect = page.locator("#staff-owner-select");
    await expect(ownerSelect).toBeVisible();
    await ownerSelect.selectOption({ label: "Alex Staff (IT STAFF)" });
    await expect(page.getByText(/Owner set to Alex Staff/i)).toBeVisible();

    // Step 6: Post a Public Comment
    await page.locator("#tab-comments").click();
    const publicCommentText = `Public Comment E2E Test by Staff - ${Date.now()}`;
    await page.locator("#staff-public-comment-input").fill(publicCommentText);
    await page.locator("#staff-post-comment-btn").click();
    await expect(page.getByText(publicCommentText)).toBeVisible();

    // Step 7: Post an Internal Note
    await page.locator("#tab-notes").click();
    const internalNoteText = `CONFIDENTIAL_INTERNAL_NOTE_SECRET_${Date.now()}`;
    await page.locator("#staff-internal-note-input").fill(internalNoteText);
    await page.locator("#staff-post-note-btn").click();
    await expect(page.getByText(internalNoteText)).toBeVisible();

    // Screenshot: Staff Ticket Detail screen (showing amber/distinct internal note panel)
    await page.screenshot({
      path: path.join(detailScreenshotDir, `staff-ticket-detail-${projectName}.png`),
      fullPage: true,
    });

    // Logout IT Staff
    await page.getByRole("button", { name: "Logout" }).click();

    // Step 8: Login as Requester owner (AC-09, AC-10)
    await loginAndHandlePasswordChange(page, requesterEmail, pass, newPass);

    // Open Requester Ticket Detail
    await page.goto(`/tickets/${createdTicketId}`);
    await expect(page.getByText(createdTicketSummary)).toBeVisible();

    // Step 9: Verify Public Comment IS visible to Requester (AC-09)
    await expect(page.getByText(publicCommentText)).toBeVisible({ timeout: 10000 });

    // Step 10: Verify Internal Note is NOT present ANYWHERE in the DOM (AC-10)
    // This checks the actual page content — not just CSS visibility
    const pageBodyText = await page.locator("body").textContent();
    expect(pageBodyText).not.toContain(internalNoteText);
    expect(pageBodyText).not.toContain("CONFIDENTIAL_INTERNAL_NOTE_SECRET_");

    // Also assert Internal Notes tab / section is not rendered for Requester
    await expect(page.locator("#tab-notes")).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RESP-02: Responsive screenshots — Staff Queue & Staff Ticket Detail
// These run on ALL three projects (desktop/tablet/mobile) independently.
// They login as IT Staff and navigate to the screens, capturing screenshots.
// ─────────────────────────────────────────────────────────────────────────────
test.describe("RESP-02: Responsive Screenshots — Staff Queue & Staff Ticket Detail", () => {
  const queueScreenshotDir = path.resolve(process.cwd(), "artifacts/lab-03/screenshots/staff-queue");
  const detailScreenshotDir = path.resolve(
    process.cwd(),
    "artifacts/lab-03/screenshots/staff-ticket-detail"
  );

  test.beforeAll(() => {
    [queueScreenshotDir, detailScreenshotDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  test("RESP-02a: Staff Queue responsive screenshot", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    // Skip desktop — already captured in E2E-02 flow above
    if (projectName === "desktop") {
      test.skip();
    }

    const staffEmail = "alex.staff@tiktockit.com";
    const pass = "ChangeMe123!";
    const newPass = "NewPassword123!";

    await loginAndHandlePasswordChange(page, staffEmail, pass, newPass);
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /My Queue|IT Staff Ticket Queue/i })).toBeVisible();

    await page.screenshot({
      path: path.join(queueScreenshotDir, `staff-queue-${projectName}.png`),
      fullPage: true,
    });
  });

  test("RESP-02b: Staff Ticket Detail responsive screenshot", async ({ page }, testInfo) => {
    const projectName = testInfo.project.name;
    // Skip desktop — already captured in E2E-02 flow above
    if (projectName === "desktop") {
      test.skip();
    }

    const requesterEmail = "jennifer.anderson@example.com";
    const staffEmail = "alex.staff@tiktockit.com";
    const pass = "ChangeMe123!";
    const newPass = "NewPassword123!";

    // Ensure a ticket exists in queue for responsive screenshot
    await loginAndHandlePasswordChange(page, requesterEmail, pass, newPass);
    await page.goto("/tickets/new");
    await expect(page.getByRole("heading", { name: "Create Support Ticket" })).toBeVisible();

    const createdTicketSummary = `RESP Ticket Detail - ${projectName} - ${Date.now()}`;
    await page.getByLabel(/Summary/i).fill(createdTicketSummary);
    await page
      .getByLabel(/Description/i)
      .fill("Testing staff ticket detail responsive layout screenshot.");
    await page.getByLabel(/Category/i).selectOption({ index: 0 });
    await page.getByLabel(/Related System/i).selectOption({ index: 0 });
    await page.getByRole("button", { name: "Submit Ticket" }).click();
    await expect(page.getByText(/Ticket Created Successfully/i)).toBeVisible();

    await page.getByRole("button", { name: "Logout" }).click();

    // Login as IT Staff and navigate to Queue
    await loginAndHandlePasswordChange(page, staffEmail, pass, newPass);
    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /My Queue|IT Staff Ticket Queue/i })).toBeVisible();

    // Layout-aware locator:
    // - Table view (desktop/tablet >= 768px): tbody tr:visible .btn-outline-primary or tbody tr:visible
    // - Mobile card view (< 768px): .d-md-none .card:visible (specifically ticket cards inside mobile list, NOT top filter card)
    const firstTicket = page.locator("tbody tr:visible .btn-outline-primary, tbody tr:visible, .d-md-none .card:visible").first();
    await expect(firstTicket).toBeVisible({ timeout: 10000 });
    await firstTicket.click();

    await expect(page.getByText("Ticket Information").first()).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: path.join(detailScreenshotDir, `staff-ticket-detail-${projectName}.png`),
      fullPage: true,
    });
  });
});

