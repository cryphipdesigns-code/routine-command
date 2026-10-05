import { expect, test } from "@playwright/test";

test("logs a habit immediately and preserves it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scheduled today" })).toBeVisible();
  await page.getByRole("button", { name: "Complete Sunlight" }).click();
  await expect(page.locator(".progress-ring strong")).toHaveText("1");

  await page.reload();
  await expect(page.locator(".progress-ring strong")).toHaveText("1");
  await expect(page.getByRole("button", { name: "Undo Sunlight" })).toHaveAttribute("aria-pressed", "true");
});

test("adds and edits a scheduled habit", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByLabel("Name").fill("Meditate");
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();

  const habitCard = page.locator(".habit-manager-card", { hasText: "Meditate" });
  await expect(habitCard).toContainText("Every day");
  await habitCard.getByRole("button", { name: "Edit Meditate" }).click();
  await page.getByLabel("Name").fill("Meditate quietly");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".habit-manager-card", { hasText: "Meditate quietly" })).toBeVisible();
});

test("renders review periods and opens a day", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="review"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Habit by habit" })).toBeVisible();
  await expect(page.locator(".week-day-header")).toHaveCount(7);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Daily consistency" })).toBeVisible();
  await page.locator(".month-day").filter({ hasText: /^2/ }).first().click();
  await expect(page.getByRole("heading", { name: /Today|Friday|Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday/ })).toBeVisible();
});

test("keeps 15 min Read as yes/no and retains sleep times", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  const readCard = page.locator(".habit-manager-card", { hasText: "15 min Read" }).first();
  await readCard.getByRole("button", { name: "Edit 15 min Read" }).click();
  await expect(page.locator('#habitForm input[name="inputType"][value="boolean"]')).toBeChecked();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.getByRole("button", { name: "Complete 15 min Read", exact: true })).toBeVisible();

  await page.getByLabel("Wake up time").fill("06:30");
  await page.getByLabel("Wake up time").dispatchEvent("change");
  await page.getByLabel("Bedtime").fill("22:45");
  await page.getByLabel("Bedtime").dispatchEvent("change");
  await page.reload();
  await expect(page.getByLabel("Wake up time")).toHaveValue("06:30");
  await expect(page.getByLabel("Bedtime")).toHaveValue("22:45");
});

test("marks a habit optional without adding it to required progress", async ({ page }) => {
  await page.goto("/");
  const before = Number((await page.locator(".progress-ring span").textContent())?.replace("of ", ""));
  await page.locator('[data-view="habits"]:visible').first().click();
  const sunlightCard = page.locator(".habit-manager-card", { hasText: "Sunlight" });
  await sunlightCard.getByRole("button", { name: "Edit Sunlight" }).click();
  await page.getByRole("checkbox", { name: /Optional habit/ }).check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".habit-manager-card", { hasText: "Sunlight" }).locator(".optional-badge")).toBeVisible();
  await page.locator('[data-view="today"]:visible').first().click();
  const after = Number((await page.locator(".progress-ring span").textContent())?.replace("of ", ""));
  expect(after).toBe(before - 1);
});

test("keeps mobile navigation fixed and avoids horizontal overflow", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile layout check");
  await page.goto("/");
  const nav = page.locator(".bottom-nav");
  await expect(nav).toBeVisible();
  await expect(nav).toHaveCSS("position", "fixed");
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
});

test("keeps a long authentication session in first-party cookies", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { CookieAuthStorage } = await import("/src/data/cookie-auth-storage.ts");
    const storage = new CookieAuthStorage();
    const session = `session-${"x".repeat(7000)}-%-complete`;
    storage.setItem("routine-command-auth-test", session);
    const restored = storage.getItem("routine-command-auth-test");
    const localCopy = localStorage.getItem("routine-command-auth-test");
    storage.removeItem("routine-command-auth-test");
    return { matches: restored === session, localCopy };
  });

  expect(result).toEqual({ matches: true, localCopy: null });
});

test("offers a scanner-safe sign-in code fallback", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="settings"]:visible').first().click();
  await expect(page.locator("#syncCodeForm")).toBeVisible();
  await expect(page.locator('#syncCodeForm input[name="email"]')).toHaveAttribute(
    "autocomplete",
    "email",
  );
  await expect(page.locator('#syncCodeForm input[name="code"]')).toHaveAttribute(
    "autocomplete",
    "one-time-code",
  );
});
