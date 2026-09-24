// The things people do on the site, end to end on a phone. These change the test database, so they run in order.
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, signInAsAdmin, signInAsPlayer, watchErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

test("bottom navigation and the More sheet", async ({ page }) => {
  await page.goto("/survivor-50");
  const tabs = page.getByRole("navigation", { name: "Season sections" }).last();
  await expect(tabs.getByRole("link", { name: "Standings" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "More sections" }).click();
  const sheet = page.getByRole("dialog", { name: "More sections" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "More sections" }).click();
  await sheet.getByRole("link", { name: "Rules" }).click();
  await expect(page).toHaveURL(/\/survivor-50\/rules$/);
  await expect(sheet).toBeHidden();
});

test("switching season from the header", async ({ page }) => {
  await page.goto("/survivor-50/teams");
  await page.getByRole("button", { name: /Switch season/ }).click();
  await page.getByRole("link", { name: /Demo Season/ }).click();
  await expect(page).toHaveURL(/\/demo-active$/);
});

test("filtering who's available", async ({ page }) => {
  await page.goto("/demo-active/this-week");
  const rows = page.locator('ul[aria-live="polite"] > li');
  const all = await rows.count();
  await page.getByRole("button", { name: /^Selectable/ }).click();
  await expect(page).toHaveURL(/show=open/);
  const selectable = await rows.count();
  expect(selectable).toBeGreaterThan(0);
  expect(selectable).toBeLessThan(all);
  await expect(rows.getByText("Eliminated")).toHaveCount(0);
  await page.getByPlaceholder("Search castaway or tribe").fill("zzz-nobody");
  await expect(page.getByText("No castaways match.")).toBeVisible();
});

test("filtering the castaway directory", async ({ page }) => {
  await page.goto("/survivor-50/castaways");
  const cards = page.locator("main ul.grid > li");
  const all = await cards.count();
  await page.getByRole("button", { name: "Eliminated" }).click();
  const out = await cards.count();
  expect(out).toBeGreaterThan(0);
  expect(out).toBeLessThan(all);
});

test("a player makes a replacement pick", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAsPlayer(page, "/demo-active/my");
  await page.goto("/demo-active/my");
  await expect(page.getByText("You're up")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const pick = page.getByRole("button", { name: "Pick", exact: true }).first();
  const castaway = (await pick.locator("xpath=ancestor::li[1]").innerText()).split("\n")[0].trim();
  page.once("dialog", (d) => d.accept());
  await pick.click();
  // Its only open slot is filled, so the turn ends: the castaway joins the roster and the picker goes away.
  await expect(page.getByRole("listitem").filter({ hasText: castaway }).filter({ hasText: "slot" }).first()).toBeVisible();
  await expect(page.getByText("You're up")).toBeHidden();

  // The pick shows up publicly straight away.
  await page.goto("/demo-active/this-week");
  const activity = page.locator("section", { has: page.getByRole("heading", { name: "Activity" }) });
  await expect(activity.getByText(castaway, { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("signing out from the account menu", async ({ page }) => {
  await signInAsPlayer(page, "/demo-active");
  await page.goto("/demo-active");
  await page.getByRole("button", { name: /^Account:/ }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/");
  await page.goto("/demo-active");
  await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
});

test("commissioner pages load on a phone", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAsAdmin(page);
  for (const path of ["/admin", "/admin/users", "/admin/demo-active", "/admin/demo-active/setup", "/admin/demo-active/members", "/admin/demo-active/audit", "/admin/demo-active/draft", "/admin/demo-active/score/8", "/admin/survivor-51/setup"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test("the commissioner scores an episode on a phone", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAsAdmin(page);
  await page.goto("/admin/demo-active/score/8");
  await expectNoHorizontalOverflow(page);

  // By rule: one rule down the whole cast, the quick way to enter a tribe-wide result.
  await page.getByRole("button", { name: "By rule" }).click();
  const rule = page.getByLabel("Rule", { exact: true });
  const option = rule.locator("option", { hasText: /immunity/i }).first();
  const value = (await option.getAttribute("value"))!;
  const ruleName = (await option.textContent())!.replace(/\s*\(.*\)$/, "").trim();
  await rule.selectOption(value);
  const box = page.getByRole("checkbox", { name: new RegExp(`^${ruleName} for `) }).first();
  const label = (await box.getAttribute("aria-label"))!;
  await box.check();
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Progress saved" })).toBeVisible();

  // Saved scoring survives a reload, and shows in the per-castaway view too.
  await page.reload();
  await page.getByRole("button", { name: "By rule" }).click();
  await page.getByLabel("Rule", { exact: true }).selectOption(value);
  await expect(page.getByRole("checkbox", { name: label, exact: true }).first()).toBeChecked();
  expect(errors).toEqual([]);
});

test("the slot builder says how many castaways each team will draft", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/survivor-51/setup");
  // Survivor 51 starts from Survivor 50's three tribes and has no cast yet, so every tribe counts.
  const perTribe = page.getByLabel("Picks from each tribe");
  await perTribe.fill("2");
  await page.getByLabel("Wild picks (any tribe)").fill("1");
  await expect(page.getByRole("status").filter({ hasText: "this builds 7 slots" })).toContainText("each team drafts 7 castaways");
  await expect(page.getByRole("button", { name: "Build 7 slots" })).toBeVisible();
  await perTribe.fill("1");
  await expect(page.getByRole("button", { name: "Build 4 slots" })).toBeVisible();
});

test("the commissioner can undo a draft back to setup", async ({ page }) => {
  const errors = watchErrors(page);
  await signInAsAdmin(page);
  await page.goto("/admin/draft-demo");
  await expect(page.getByRole("heading", { name: "Undo the draft" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Undo the draft and go back to setup" }).click();
  await page.waitForURL("**/admin/draft-demo/setup");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Season setup");
  // Back in setup: the rosters are empty again and the draft can be launched afresh from Overview.
  await page.goto("/admin/draft-demo");
  await expect(page.getByRole("button", { name: "Launch to draft phase" })).toBeVisible();
  await expect(page.getByText("Each team drafts 4 castaways")).toBeVisible();
  expect(errors).toEqual([]);
});
