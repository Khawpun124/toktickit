import { test, expect, Page } from "@playwright/test";
import path from "path";
import fs from "fs";

async function selectRequester(page: Page, optionLabel: string) {
  const selectHeading = page.getByText(/Select Development Requester/i);
  if (await selectHeading.isVisible()) {
    await expect(page.getByText(/Loading requesters/i)).not.toBeVisible({ timeout: 10000 });
    const select = page.locator("#requesterSelect");
    await select.waitFor({ state: "visible" });
    await select.selectOption({ label: optionLabel });
    await page.getByRole("button", { name: /Continue/i }).click();
  }
}

function getTicketElement(page: Page, ticketNumber: string, projectName: string) {
  if (projectName === "mobile") {
    return page.locator(".d-md-none").filter({ hasText: ticketNumber }).first();
  }
  return page.locator(".d-md-block td").filter({ hasText: ticketNumber }).first();
}

test.describe.serial("TokTickIT Lab 2 - Requester Ticket Flow & Visual Verification", () => {
  let createdTicketNumber = "";
  let createdTicketId: number | null = null;

  test.beforeAll(() => {
    // Ensure screenshot directories exist
    const dirs = [
      path.resolve(process.cwd(), "artifacts/lab-02/screenshots/create-ticket"),
      path.resolve(process.cwd(), "artifacts/lab-02/screenshots/my-tickets"),
      path.resolve(process.cwd(), "artifacts/lab-02/screenshots/ticket-detail"),
    ];

    dirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  });

  test("E2E-01: Select Requester -> Create Ticket -> Find in My Tickets (AC-01, AC-13)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    await page.goto("/");

    // Step 1: Select Development Requester
    await selectRequester(page, "Jennifer Anderson (jennifer.anderson@example.com)");

    // Step 2: Navigate to Create Ticket
    await page.getByRole("button", { name: /\+ Create Ticket/i }).first().click();

    // Take Create Ticket Screenshot
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/create-ticket/create-ticket-${projectName}.png`,
      fullPage: true,
    });

    // Step 3: Fill Create Ticket Form
    const uniqueSummary = `E2E Test Ticket - ${Date.now()}`;
    await page.locator("#summaryInput").fill(uniqueSummary);
    await page
      .locator("#descriptionInput")
      .fill("This is an automated Playwright E2E test description for verifying ticket creation.");
    await page.locator("#categorySelect").selectOption({ index: 0 });
    await page.locator("#relatedSystemSelect").selectOption({ index: 0 });
    await page.locator("#prioritySelect").selectOption("HIGH");

    // Submit Form & catch response to extract created ticket ID
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/tickets") && resp.request().method() === "POST"
    );
    await page.getByRole("button", { name: /Submit Ticket/i }).click();
    const createResp = await responsePromise;
    const createJson = await createResp.json();
    createdTicketId = createJson.id;

    // Verify Success alert containing Ticket Number (e.g. TKT-2026-XXXXXX)
    const successAlert = page.getByText(/Ticket Created Successfully/i);
    await expect(successAlert).toBeVisible();

    const ticketNumberElement = page.locator(".font-monospace").first();
    createdTicketNumber = (await ticketNumberElement.textContent())?.trim() || "";
    expect(createdTicketNumber).toMatch(/TKT-\d{4}-\d{6}/);

    // Step 4: Navigate to My Tickets Screen
    await page.getByRole("button", { name: /My Tickets/i }).first().click();

    // Take My Tickets Screenshot
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/my-tickets/my-tickets-${projectName}.png`,
      fullPage: true,
    });

    // Verify created ticket appears in My Tickets list
    const ticketElem = getTicketElement(page, createdTicketNumber, projectName);
    await expect(ticketElem).toBeVisible();
  });

  test("E2E-02: Switch Requester identity -> Verify ticket access separation (AC-03, BR-10)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;
    await page.goto("/");

    // Ensure Requester 1 is active initially
    await selectRequester(page, "Jennifer Anderson (jennifer.anderson@example.com)");

    // Click Change Requester
    await page.getByRole("button", { name: /Change Requester/i }).click();
    await expect(page.getByText(/Select Development Requester/i)).toBeVisible();

    // Select Requester 2 (Michael Brown)
    await selectRequester(page, "Michael Brown (michael.brown@example.com)");

    // My Tickets should reload for Requester 2
    await page.waitForTimeout(500);

    // Verify Requester 1's created ticket number is NOT visible under Requester 2
    if (createdTicketNumber) {
      const ticketElem = getTicketElement(page, createdTicketNumber, projectName);
      await expect(ticketElem).not.toBeVisible();
    }
  });

  test("E2E-02 (Direct URL Access): Attempt direct URL access to another Requester's Ticket Detail (AC-03, BR-10)", async ({
    page,
  }) => {
    await page.goto("/");

    // Select Requester 2 (Michael Brown - id 2)
    if (await page.getByText(/Select Development Requester/i).isVisible()) {
      await selectRequester(page, "Michael Brown (michael.brown@example.com)");
    } else {
      await page.getByRole("button", { name: /Change Requester/i }).click();
      await selectRequester(page, "Michael Brown (michael.brown@example.com)");
    }

    const ticketIdToTest = createdTicketId || 1;

    // Direct backend API check for Requester 2 (header x-requester-id: 2)
    const apiRes = await page.request.get(`http://localhost:3000/api/tickets/${ticketIdToTest}`, {
      headers: { "x-requester-id": "2" },
    });
    expect(apiRes.status()).toBe(404);
    const apiJson = await apiRes.json();
    expect(apiJson.error).toMatch(/Ticket not found|not found/i);

    // Direct browser URL access attempt on Frontend App (/tickets/:id)
    await page.goto(`/tickets/${ticketIdToTest}`);

    // Verify Route-Level Access Denied / Ticket Not Found UI is rendered on screen (AC-03, BR-10)
    await expect(page.getByText("Ticket Not Found", { exact: true })).toBeVisible();
  });

  test("E2E-03: Open Ticket Detail -> Add Attachment -> Soft-remove Attachment with Reason (AC-05, AC-08)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    await page.goto("/");

    // Switch back to Requester 1 (Jennifer Anderson)
    if (await page.getByText(/Select Development Requester/i).isVisible()) {
      await selectRequester(page, "Jennifer Anderson (jennifer.anderson@example.com)");
    } else {
      const currentRequester = await page.locator("header").textContent();
      if (!currentRequester?.includes("Jennifer Anderson")) {
        await page.getByRole("button", { name: /Change Requester/i }).click();
        await selectRequester(page, "Jennifer Anderson (jennifer.anderson@example.com)");
      }
    }

    // Go to My Tickets list
    await page.getByRole("button", { name: /My Tickets/i }).first().click();

    // Open created ticket detail by clicking responsive element
    const ticketElem = getTicketElement(page, createdTicketNumber, projectName);
    await expect(ticketElem).toBeVisible();
    await ticketElem.click();

    // Verify Ticket Detail view is rendered
    await expect(page.getByText(/Attachments/i).first()).toBeVisible();

    // Prepare temporary test image file
    const testFilePath = path.resolve(process.cwd(), "e2e/test-sample.jpg");
    fs.writeFileSync(testFilePath, Buffer.from("fake-jpg-image-data"));

    // Upload attachment
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFilePath);

    // Verify Attachment appears as active (exact match on file name div)
    await expect(page.getByText("test-sample.jpg", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Download test-sample.jpg/i })).toBeVisible();

    // Take Ticket Detail Screenshot with attachment
    await page.screenshot({
      path: `artifacts/lab-02/screenshots/ticket-detail/ticket-detail-${projectName}.png`,
      fullPage: true,
    });

    // Soft-remove Attachment
    await page.getByRole("button", { name: /Remove/i }).first().click();

    // Modal should appear
    await expect(page.getByText(/Remove Attachment/i)).toBeVisible();
    await page
      .locator("#removeReasonInput")
      .fill("E2E test soft removal with reason");
    await page.getByRole("button", { name: /Confirm Removal/i }).click();

    // Verify metadata reflects soft removal and download button is disabled/removed
    await expect(page.getByText(/E2E test soft removal with reason/i).first()).toBeVisible();
    await expect(page.getByText("Removed").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Download test-sample.jpg/i })).not.toBeVisible();

    // Cleanup temp test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });
});


