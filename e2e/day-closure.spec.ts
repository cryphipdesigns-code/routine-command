import { expect, test, type Page } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles", reducedMotion: "reduce" });

async function addAvoid(page: Page) {
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit", exact: true }).click();
  await page.getByLabel("Name").fill("No alcohol");
  await page.getByRole("radio", { name: /Avoid/ }).check();
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();
  await page.locator('[data-view="today"]:visible').first().click();
}

async function completeBuild(page: Page) {
  const open = page.locator('[data-habit-group="build"] .completion-button[aria-pressed="false"]');
  while (await open.count()) await open.first().click();
}

test("counts only Build actions in the badge and gives an acknowledged, persistent day finish", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-20T19:00:00Z") });
  await page.addInitScript(() => {
    const badge = { count: -1 };
    Object.defineProperty(window, "routineTestBadge", { value: badge });
    Object.defineProperty(navigator, "setAppBadge", { value: async (count: number) => { badge.count = count; } });
    Object.defineProperty(navigator, "clearAppBadge", { value: async () => { badge.count = 0; } });
    Object.defineProperty(window, "Notification", { value: { permission: "granted" } });
  });
  const badgeCount = () => page.evaluate(() => (window as unknown as { routineTestBadge: { count: number } }).routineTestBadge.count);
  await page.goto("/");
  const buildCount = await page.locator('[data-habit-group="build"] .completion-button').count();
  await addAvoid(page);
  await page.locator('[data-view="settings"]:visible').first().click();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect.poll(badgeCount).toBe(buildCount);
  await page.locator('[data-view="today"]:visible').first().click();
  await completeBuild(page);
  await expect.poll(badgeCount).toBe(0);
  await expect(page.locator("#dayProgressTitle")).toHaveText("Actions complete");
  await expect(page.locator(".day-progress-message")).toContainText("1 Avoid habit to confirm");
  await expect(page.getByRole("dialog", { name: "Day secured" })).toHaveCount(0);
  await page.getByRole("button", { name: "Review Avoid check-in", exact: true }).click();
  await expect(page.locator("#avoidCheckinHeading")).toBeFocused();
  // A real pointer/touch click must survive deferred rendering, not only .click() in JS.
  await page.getByRole("button", { name: "Stayed clear: No alcohol", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Day secured", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Ring closed. Day locked in.");
  await expect(dialog).toContainText("You kept your word today.");
  await expect(dialog).toContainText("Build actions completed");
  await expect(dialog).toContainText("Avoid boundaries held");
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  await expect(dialog.getByRole("button", { name: "Day well done", exact: true })).toBeFocused();
  await expect(page.locator(".app-main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Day well done", exact: true })).toBeFocused();
  await page.clock.fastForward(10_000);
  await expect(dialog).toBeVisible();
  await expect(page.locator(".toast")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Day well done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".app-main")).not.toHaveAttribute("inert");
  await expect(page.locator(".daily-progress")).toHaveClass(/is-secured/);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator("#dayProgressTitle")).toBeFocused();
  await page.reload();
  await expect(page.locator(".daily-progress")).toHaveClass(/is-secured/);
  await expect(dialog).toHaveCount(0);
  await expect.poll(badgeCount).toBe(0);
  await page.getByRole("button", { name: "View day receipt", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Undo stayed clear: No alcohol", exact: true }).click();
  await expect(page.locator(".daily-progress")).not.toHaveClass(/is-secured/);
  await expect(page.locator("#dayProgressTitle")).toHaveText("Actions complete");
  await expect.poll(badgeCount).toBe(0);
  await page.getByRole("button", { name: "Log slip: No alcohol", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".day-progress-message")).toContainText("A slip is not a secured day");
});

test("handles a final quantitative action without losing the finish during input blur", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-20T19:00:00Z"));
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit", exact: true }).click();
  await page.getByLabel("Name").fill("Movement minutes");
  await page.getByRole("radio", { name: /Number/ }).check();
  await page.getByLabel("Minimum / target", { exact: true }).fill("15");
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();
  await page.locator('[data-view="today"]:visible').first().click();
  await completeBuild(page);
  await page.getByLabel("Movement minutes value", { exact: true }).fill("15");
  await page.getByLabel("Movement minutes value", { exact: true }).dispatchEvent("change");
  const dialog = page.getByRole("dialog", { name: "Day secured", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Day well done", exact: true }).click();
  await expect(page.locator(".daily-progress")).toHaveClass(/is-secured/);
  await expect(page.getByLabel("Movement minutes value", { exact: true })).toHaveValue("15");
  await page.reload();
  await expect(page.locator(".daily-progress")).toHaveClass(/is-secured/);
});

test("fits the day receipt on a small phone and rolls into a fresh day without replaying it", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-21T06:59:30Z") });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await completeBuild(page);
  const dialog = page.getByRole("dialog", { name: "Day secured", exact: true });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await page.clock.fastForward(40_000);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Wednesday, October 21");
  await expect(page.locator(".daily-progress")).not.toHaveClass(/is-secured/);
  await expect(page.locator(".app-main")).not.toHaveAttribute("inert");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".daily-progress")).toHaveClass(/is-secured/);
});
