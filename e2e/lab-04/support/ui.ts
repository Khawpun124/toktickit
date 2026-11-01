import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";

// Browser-side helpers for the Lab 4 specs: login and logout through the screen, the browser's own
// confirm box, error collection, layout and focus checks, and screenshots.

/**
 * Signs in through the login screen. The caller states what must come next, so nothing is decided
 * from what happens to be on screen: "passwordChange" (first login) or a landing heading.
 */
export async function loginViaUi(page: Page, email: string, password: string, next: { passwordChange: true } | { landing: RegExp | string }) {
  await expect(page.getByRole("heading", { name: "TokTickIT Login" })).toBeVisible();
  await page.getByLabel(/Email address/i).fill(email);
  await page.getByLabel(/^Password$/i).fill(password);
  const login = page.waitForResponse(r => r.url().endsWith("/api/auth/login") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sign In" }).click();
  expect((await login).status(), "login answer").toBe(200);
  if ("passwordChange" in next) {
    await expect(page.getByRole("heading", { name: /Mandatory Password Change/i })).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { level: 1, name: next.landing })).toBeVisible();
  }
}

/** The mandatory password change through the screen. */
export async function changePasswordViaUi(page: Page, current: string, next: string, landing: RegExp | string) {
  await page.getByLabel(/Current \(Temporary\) Password/i).fill(current);
  await page.getByLabel(/^New Password$/i).fill(next);
  await page.getByLabel(/^Confirm New Password$/i).fill(next);
  const change = page.waitForResponse(r => r.url().endsWith("/api/auth/change-password"));
  await page.getByRole("button", { name: /Continue/i }).click();
  expect((await change).status(), "change-password answer").toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: landing })).toBeVisible();
}

export async function logoutViaUi(page: Page) {
  await page.getByRole("button", { name: "Logout" }).click();
  await expect(page.getByRole("heading", { name: "TokTickIT Login" })).toBeVisible();
}

/**
 * Answers the next window.confirm. Returns the message so the test can assert it and report it
 * (a native confirm box cannot be captured by a screenshot).
 */
export function answerNextConfirm(page: Page, accept: boolean): Promise<string> {
  return new Promise(resolve => {
    page.once("dialog", async dialog => {
      expect(dialog.type()).toBe("confirm");
      const message = dialog.message();
      if (accept) await dialog.accept();
      else await dialog.dismiss();
      resolve(message);
    });
  });
}

/** Console errors, page errors, and failed requests, in the order they happened. */
export function collectProblems(page: Page) {
  const problems: { kind: "console" | "pageerror" | "requestfailed"; text: string; url?: string }[] = [];
  page.on("console", msg => {
    if (msg.type() === "error") problems.push({ kind: "console", text: msg.text(), url: msg.location().url });
  });
  page.on("pageerror", err => problems.push({ kind: "pageerror", text: err.message }));
  page.on("requestfailed", req => problems.push({ kind: "requestfailed", text: req.failure()?.errorText ?? "failed", url: req.url() }));
  return problems;
}

/** RESP-04: the page never scrolls sideways. */
export async function expectNoHorizontalScroll(page: Page, where: string) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(size.scroll, `${where}: scrollWidth ${size.scroll} must not exceed clientWidth ${size.client}`).toBeLessThanOrEqual(size.client);
}

/** Focus is visible: the focused element is `locator` and its computed style shows an outline or a ring. */
export async function expectVisibleFocus(locator: Locator, what: string) {
  await expect(locator, `${what} has focus`).toBeFocused();
  const style = await locator.evaluate(el => {
    const s = getComputedStyle(el);
    return { outlineStyle: s.outlineStyle, outlineWidth: parseFloat(s.outlineWidth) || 0, boxShadow: s.boxShadow };
  });
  const outline = style.outlineStyle !== "none" && style.outlineWidth >= 2;
  const ring = style.boxShadow !== "none" && style.boxShadow !== "";
  expect(outline || ring, `${what}: visible focus (outline ${style.outlineStyle} ${style.outlineWidth}px, box-shadow ${style.boxShadow})`).toBe(true);
}

/** Elements whose text changes on every run (times, generated ticket numbers, e-mail addresses). */
export function dynamicMasks(page: Page): Locator[] {
  return [
    page.getByText(/\d{1,2}:\d{2}/),
    page.getByText(/TKT-\d{4}-\d{6}/),
    page.getByText(/@example\.com|@tiktockit\.com/),
    page.locator('input[type="datetime-local"]'),
  ];
}

/** Saves artifacts/lab-04/screenshots/<folder>/<state>-<project>.png with the dynamic parts masked. */
export async function snap(page: Page, testInfo: TestInfo, folder: string, state: string, extraMasks: Locator[] = []) {
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const file = path.resolve(__dirname, "../../../artifacts/lab-04/screenshots", folder, `${state}-${testInfo.project.name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled", caret: "hide", mask: [...dynamicMasks(page), ...extraMasks] });
}
