import { expect, type Page } from "@playwright/test";
import { ADMIN_PASSCODE, PLAYER } from "./fixtures";

/** Collects uncaught page errors and console errors, so a test can assert a page loaded cleanly. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** The page must fit the viewport: nothing may push it into sideways scrolling. */
export async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
  expect(scroll, "page is wider than the viewport").toBeLessThanOrEqual(width);
}

export async function signInAsPlayer(page: Page, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Your first name").fill(PLAYER.username);
  await page.getByLabel("Password").fill(PLAYER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export async function signInAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Admin password").fill(ADMIN_PASSCODE);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
}
