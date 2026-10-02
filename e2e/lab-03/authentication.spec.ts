import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

test.describe.serial("TokTickIT Lab 3 - Authentication & Password Change Flow (E2E-01)", () => {
  const screenshotDir = path.resolve(process.cwd(), "artifacts/lab-03/screenshots/authentication");

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test("E2E-01: Migrated User Login -> Mandatory Change Password -> Access Landing -> Logout & Protection (AC-01, AC-02, AC-15)", async ({
    page,
  }, testInfo) => {
    const projectName = testInfo.project.name;

    const testEmailMap: Record<string, string> = {
      desktop: "sarah.connor@example.com",
      tablet: "michael.brown@example.com",
      mobile: "david.miller@example.com",
    };
    const testEmail = testEmailMap[projectName] || "sarah.connor@example.com";
    const initialPassword = "ChangeMe123!";
    const newPassword = "NewPassword123!";

    // Step 1: Navigate to Login Screen
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /TokTickIT Login/i })).toBeVisible();

    // Screenshot: Login screen
    await page.screenshot({
      path: path.join(screenshotDir, `login-${projectName}.png`),
      fullPage: true,
    });

    // Step 2: Login with migrated user
    await page.locator("#email").fill(testEmail);
    await page.locator("#password").fill(initialPassword);
    await page.getByRole("button", { name: /Sign In/i }).click();

    const changePassHeading = page.getByRole("heading", { name: /Mandatory Password Change/i });

    // Step 3: Mandatory Password Change Screen redirect check (AC-02)
    await expect(changePassHeading).toBeVisible();
    await expect(page.getByText(/You must set a new secure password/i)).toBeVisible();

    // Screenshot: Change Password screen
    await page.screenshot({
      path: path.join(screenshotDir, `change-password-${projectName}.png`),
      fullPage: true,
    });

    // Step 4: Fill Change Password Form
    await page.locator("#currentPassword").fill(initialPassword);
    await page.locator("#newPassword").fill(newPassword);
    await page.locator("#confirmPassword").fill(newPassword);

    // Verify Password Rules checklist indicators
    await expect(page.getByText(/Minimum 8 characters/i)).toBeVisible();

    // Submit password change
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 5: Verification of successful redirect to role landing page
    await expect(page.getByRole("heading", { name: /Mandatory Password Change/i })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /My Tickets/i }).first()).toBeVisible();

    // Step 6: Logout (AC-15)
    await page.getByRole("button", { name: /Logout/i }).click();

    // Verify redirected back to Login Screen
    await expect(page.getByRole("heading", { name: /TokTickIT Login/i })).toBeVisible();

    // Step 7: Attempt direct access to protected route while logged out (AC-15)
    await page.goto("/tickets");
    await expect(page.getByRole("heading", { name: /TokTickIT Login/i })).toBeVisible();

    await page.goto("/staff/tickets");
    await expect(page.getByRole("heading", { name: /TokTickIT Login/i })).toBeVisible();
  });
});
