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

test.describe.serial("TokTickIT Lab 3 - User Administration & Safety Protection (E2E-03)", () => {
  const screenshotDir = path.resolve(process.cwd(), "artifacts/lab-03/screenshots/user-management");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test("E2E-03: Administrator creates new user, self-deactivation & last-admin protection (AC-12, AC-13)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;
    const adminEmail = "admin@tiktockit.com";
    const pass = "ChangeMe123!";
    const newPass = "NewPassword123!";

    // Step 1: Login as Administrator
    await loginAndHandlePasswordChange(page, adminEmail, pass, newPass);

    // Step 2: Navigate to User Management (/admin/users)
    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: /User Management/i })).toBeVisible();

    // Screenshot: User Management screen
    await page.screenshot({
      path: path.join(screenshotDir, `user-management-${projectName}.png`),
      fullPage: true,
    });

    // Step 3: Create a new user successfully
    await page.locator("#create-user-btn").click();
    await expect(page.locator("h2:visible").filter({ hasText: /Create New User/i })).toBeVisible();

    const uniqueEmail = `e2e.user.${Date.now()}@tiktockit.com`;
    await page.locator("#user-form-name:visible").fill("E2E Test User");
    await page.locator("#user-form-email:visible").fill(uniqueEmail);
    await page.locator("#user-form-role:visible").selectOption("IT_STAFF");
    await page.locator("#user-form-password:visible").fill("Welcome123!");

    await page.locator("#user-form-submit-btn:visible").click();
    await expect(page.locator("#user-form-success:visible")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("table:visible, .card:visible, form:visible").filter({ hasText: uniqueEmail }).first()).toBeVisible({ timeout: 10000 });

    // Close Create User panel/modal before proceeding to edit another user.
    // On tablet/mobile, the Create panel renders as a full-screen fixed modal backdrop (inset: 0, zIndex: 1050).
    // Keeping it open blocks pointer events on the table/card list underneath.
    const closeBtn = page.locator("#close-panel-btn:visible");
    if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await closeBtn.click();
      await expect(page.locator("h2:visible").filter({ hasText: /Create New User/i })).not.toBeVisible({ timeout: 5000 });
    }

    // Step 4: Attempt Self-Deactivation protection (AC-13, BR-20)
    await page.locator("#user-search-input:visible").fill("admin@tiktockit.com");

    // Wait for the 300ms debounced search to finish filtering the table to only admin@tiktockit.com
    await page.waitForTimeout(500);
    const adminRow = page.locator("tbody tr:visible, .card:visible").filter({ hasText: "admin@tiktockit.com" }).first();
    await expect(adminRow).toBeVisible({ timeout: 10000 });

    const editBtn = adminRow.locator("button").filter({ hasText: /Edit/i }).first();
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    await expect(page.locator("h2:visible").filter({ hasText: /Edit User/i })).toBeVisible({ timeout: 10000 });

    // Uncheck Active switch for logged-in Admin
    const activeSwitch = page.locator("#user-form-active:visible");
    await activeSwitch.uncheck();

    // Verify inline warning text for self-deactivation
    await expect(page.locator("#user-form-active-warning:visible")).toBeVisible();
    await expect(page.locator("#user-form-active-warning:visible")).toContainText(/cannot deactivate your own account/i);

    // Submit form attempt
    await page.locator("#user-form-submit-btn:visible").click();
    await expect(page.locator("#user-form-error:visible")).toBeVisible();
    await expect(page.locator("#user-form-error:visible")).toContainText(/cannot deactivate your own account/i);
  });
});
