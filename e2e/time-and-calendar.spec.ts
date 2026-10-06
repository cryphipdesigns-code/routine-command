import { expect, test } from "@playwright/test";

test.use({ timezoneId: "America/Los_Angeles" });

test("keeps time inputs connected and focused across incremental picker changes", async ({ page }) => {
  await page.goto("/");
  const wake = page.getByLabel("Wake time", { exact: true });
  await wake.focus();
  const original = await wake.elementHandle();
  for (const value of ["06:00", "06:15", "06:45"]) {
    await wake.fill(value);
    await wake.dispatchEvent("change");
    expect(await original!.evaluate((input) => input.isConnected && document.activeElement === input)).toBe(true);
    await expect(wake.locator("..").locator(".signal-reading-status")).toHaveText("Recorded");
  }
  await page.getByLabel("Bedtime", { exact: true }).fill("22:45");
  // Leaving the input by tapping navigation must not swallow that tap.
  await page.locator('[data-view="settings"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  for (const label of ["Wake by", "Bed by", "Evening reminder time", "Quiet hours start"]) {
    const input = page.getByLabel(label, { exact: true });
    await input.focus();
    const element = await input.elementHandle();
    for (const value of ["07:00", "07:30"]) {
      await input.fill(value);
      await input.dispatchEvent("change");
      expect(await element!.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
    }
  }
  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("06:45");
  await page.reload();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("06:45");
  await expect(page.getByLabel("Bedtime", { exact: true })).toHaveValue("22:45");
});

test("clears recorded times and targets and restores notification defaults", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Wake time", { exact: true }).fill("06:30");
  await page.getByLabel("Bedtime", { exact: true }).fill("22:45");
  await page.getByRole("button", { name: "Clear Wake time", exact: true }).click();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Clear Bedtime", exact: true }).click();
  await page.locator('[data-view="settings"]:visible').first().click();
  await page.getByLabel("Wake by", { exact: true }).fill("07:00");
  await page.getByLabel("Bed by", { exact: true }).fill("23:00");
  await page.getByRole("button", { name: "Clear Wake by", exact: true }).click();
  await page.getByRole("button", { name: "Clear Bed by", exact: true }).click();
  await page.getByLabel("Evening reminder time", { exact: true }).fill("19:45");
  await page.getByRole("button", { name: "Reset Evening reminder time", exact: true }).click();
  await expect(page.getByLabel("Evening reminder time", { exact: true })).toHaveValue("20:30");
  await page.reload();
  await expect(page.getByLabel("Wake by", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Bed by", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Evening reminder time", { exact: true })).toHaveValue("20:30");
  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Bedtime", { exact: true })).toHaveValue("");
});

test("saves native time-reset input events even without a change event", async ({ page }) => {
  await page.goto("/");
  const wake = page.getByLabel("Wake time", { exact: true });
  await wake.fill("06:30");
  await wake.evaluate((input: HTMLInputElement) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.reload();
  await expect(wake).toHaveValue("");
});

test("finishes a time edit when an action button does not take focus", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Wake time", { exact: true }).fill("06:30");
  const skip = page.getByRole("button", { name: "Skip today: Sunlight", exact: true });
  await skip.evaluate((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
  await skip.click();
  await expect(page.locator(".accountability-alert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo skip: Sunlight", exact: true })).toBeVisible();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("06:30");
});

test("preserves keyboard focus when leaving a time field for its Clear button", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Wake time", { exact: true }).fill("06:30");
  const clear = page.getByRole("button", { name: "Clear Wake time", exact: true });
  await clear.focus();
  await expect(clear).toBeFocused();
  await clear.press("Enter");
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("");
});

test("allows repeated exercise-time edits and clearing without undoing completion", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-06T19:00:00Z"));
  await page.goto("/");
  const card = page.locator('[data-habit-card-id="habit-exercise"]');
  await page.getByRole("button", { name: "Complete Exercise", exact: true }).click();
  await card.locator(".exercise-details summary").click();
  const time = card.getByLabel("Time of day", { exact: true });
  await time.focus();
  const original = await time.elementHandle();
  for (const value of ["07:00", "07:20", "07:35"]) {
    await time.fill(value);
    await time.dispatchEvent("change");
    expect(await original!.evaluate((node) => node.isConnected && document.activeElement === node)).toBe(true);
  }
  await card.getByRole("button", { name: "Clear Time of day", exact: true }).click();
  await expect(time).toHaveValue("");
  await expect(page.getByRole("button", { name: "Undo Exercise", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await card.locator(".exercise-details summary").click();
  await expect(time).toHaveValue("");
  await expect(page.getByRole("button", { name: "Undo Exercise", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("advances Monday to Tuesday at midnight and keeps Monday's completions", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T06:59:30Z") });
  await page.goto("/");
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Monday, October 5");
  await page.getByRole("button", { name: "Complete Sunlight", exact: true }).click();
  await page.clock.fastForward(40_000);
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Tuesday, October 6");
  await expect(page.locator(".progress-ring strong")).toHaveText("0");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".progress-ring strong")).toHaveText("1");
  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Tuesday, October 6");
});

test("refreshes Today's date on resume and an overnight reopen", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-05T19:00:00Z"));
  await page.goto("/");
  await page.getByRole("button", { name: "Complete Sunlight", exact: true }).click();
  await page.clock.setFixedTime(new Date("2026-10-06T15:00:00Z"));
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Tuesday, October 6");
  await expect(page.locator(".progress-ring strong")).toHaveText("0");
  await page.clock.setFixedTime(new Date("2026-10-07T15:00:00Z"));
  await page.reload();
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Wednesday, October 7");
  await expect(page.locator(".progress-ring strong")).toHaveText("0");
});

test("keeps a before-midnight time edit attached to its original day", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-06T06:59:30Z") });
  await page.goto("/");
  const wake = page.getByLabel("Wake time", { exact: true });
  await wake.fill("06:30");
  await page.clock.fastForward(40_000);
  await wake.fill("06:45");
  await wake.blur();
  await expect(page.locator(".date-toolbar-label strong")).toHaveText("Tuesday, October 6");
  await expect(wake).toHaveValue("");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(wake).toHaveValue("06:45");
});
