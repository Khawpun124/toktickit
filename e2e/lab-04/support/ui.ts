import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import path from "node:path";
import { standInsFor } from "./standins";

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

/**
 * Replaces, in the page itself, the text that changes from run to run with fixed text, and returns
 * how many replacements it made. The originals are kept on `window` so `restoreRunText` can put
 * them back. Nothing is masked: a mask is drawn over the whole page and would also cover an open
 * dialog.
 *
 * - the names and e-mail addresses of the users the test created: readable stand-ins from
 *   `standins.ts` ("Casey Requester", casey.requester@example.test);
 * - any other created address (`e2e4-…@example.com`, it holds the run id): alex.user@example.test;
 * - generated Ticket numbers `TKT-yyyy-nnnnnn`: `TKT-0000-000000`;
 * - dates and times in every format the screens use ("Nov 1, 2026, 11:46 AM", "11/1/2026, 11:46:44 AM",
 *   "Updated 11:46"): the same format at midnight on Jan 1, 2026;
 * - the value of every `datetime-local` field: `2026-01-01T00:00`.
 */
async function fixRunText(page: Page, people: { from: string; to: string }[]): Promise<number> {
  return page.evaluate(people => {
    const sp = "[\\s\\u202f]";
    const months = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
    const time = `(\\d{1,2}):(\\d{2})(:\\d{2})?(${sp}?[AP]M)?`;
    const fixTime = (_h: string, _m: string, sec?: string, ampm?: string) =>
      (ampm ? "12:00" : "00:00") + (sec ? ":00" : "") + (ampm ? ampm.replace(/[AP]M/, "AM") : "");
    const rules: [RegExp, (...m: string[]) => string][] = [
      [/e2e4-[^\s@]+@example\.com/g, () => "alex.user@example.test"],
      [/TKT-\d{4}-\d{6}/g, () => "TKT-0000-000000"],
      [new RegExp(`${months}\\.?${sp}\\d{1,2},${sp}\\d{4}(,?${sp}(?:at${sp})?${time})?`, "g"),
        (_all, withTime, h, m, sec, ampm) => "Jan 1, 2026" + (withTime ? ", " + fixTime(h, m, sec, ampm) : "")],
      [new RegExp(`\\d{1,2}/\\d{1,2}/\\d{4}(,${sp}${time})?`, "g"),
        (_all, withTime, h, m, sec, ampm) => "1/1/2026" + (withTime ? ", " + fixTime(h, m, sec, ampm) : "")],
      [new RegExp(`\\b${time}`, "g"), (_all, h, m, sec, ampm) => fixTime(h, m, sec, ampm)],
    ];
    const saved: { node: Text; before: string; after: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
      const before = n.data;
      let after = before;
      for (const p of people) after = after.split(p.from).join(p.to);
      for (const [re, to] of rules) after = after.replace(re, to as (...a: string[]) => string);
      if (after !== before) { saved.push({ node: n, before, after }); n.data = after; }
    }
    const inputs: { el: HTMLInputElement; before: string }[] = [];
    document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]').forEach(el => {
      if (el.value) { inputs.push({ el, before: el.value }); el.value = "2026-01-01T00:00"; }
    });
    (window as unknown as { __lab4Saved: unknown }).__lab4Saved = { saved, inputs };
    return saved.length + inputs.length;
  }, people);
}

/** Puts back the text `fixRunText` replaced (only where the app has not re-rendered it since). */
async function restoreRunText(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lab4Saved?: { saved: { node: Text; before: string; after: string }[]; inputs: { el: HTMLInputElement; before: string }[] } };
    if (!w.__lab4Saved) return;
    for (const s of w.__lab4Saved.saved) if (s.node.data === s.after) s.node.data = s.before;
    for (const i of w.__lab4Saved.inputs) if (i.el.value === "2026-01-01T00:00") i.el.value = i.before;
    delete w.__lab4Saved;
  });
}

/**
 * Saves artifacts/lab-04/screenshots/<folder>/<state>-<project>.png. As the last step of the state,
 * the text that changes between runs is replaced with fixed text, the page is captured, and the
 * original text is put back, so the assertions after the screenshot see the real page.
 *
 * The whole page is captured, except with `{ fullPage: false }`: states with an open dialog or a
 * sticky message are captured as the viewport shows them, since a full-page capture draws fixed
 * and sticky elements at a place the user never sees them. The scroll position is recorded as an
 * annotation ("snap").
 */
export async function snap(page: Page, testInfo: TestInfo, folder: string, state: string, options: { fullPage?: boolean } = {}) {
  const fullPage = options.fullPage ?? true;
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const file = path.resolve(__dirname, "../../../artifacts/lab-04/screenshots", folder, `${state}-${testInfo.project.name}.png`);
  await fixRunText(page, standInsFor(testInfo.testId));
  try {
    const at = await page.evaluate(() => ({ scrollY: Math.round(window.scrollY), height: document.documentElement.scrollHeight, viewport: window.innerHeight }));
    testInfo.annotations.push({ type: "snap", description: `${folder}/${state}: ${fullPage ? "full page" : "viewport"}, scrollY ${at.scrollY} of ${at.height - at.viewport} (page ${at.height} px, viewport ${at.viewport} px)` });
    await page.screenshot({ path: file, fullPage, animations: "disabled", caret: "hide" });
  } finally {
    await restoreRunText(page);
  }
}
