import { expect, test } from "@playwright/test";

test("keeps Exceptions at the bottom of Today and opens the same editor", async ({ page }) => {
  await page.goto("/");
  const exceptions = page.getByRole("button", { name: "Exceptions", exact: true });
  await expect(page.locator('.page-intro [data-action="day-exception"]')).toHaveCount(0);
  await expect(page.locator(".today-view > :last-child")).toHaveClass("today-plan-footer");
  await expect(page.locator(".today-plan-footer").getByRole("button", { name: "Exceptions", exact: true })).toHaveCount(1);
  await exceptions.click();
  await expect(page.getByLabel("Exception date", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save exception", exact: true })).toBeVisible();
});

test("matches Avoid and Build circle sizes before and after recording results", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByLabel("Name").fill("No alcohol");
  await page.getByRole("radio", { name: /Avoid/ }).check();
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();
  await page.locator('[data-view="today"]:visible').first().click();
  const card = page.locator(".habit-check", { hasText: "No alcohol" });
  const checkSizes = async () => {
    const build = await page.locator('[data-habit-card-id="habit-sunlight"] .completion-button').boundingBox();
    const expected = { width: build!.width, height: build!.height };
    expect(expected.width).toBeGreaterThanOrEqual(44);
    // A completion pulse briefly scales the check; compare after it settles.
    await expect.poll(() => card.locator(".avoid-actions > button").evaluateAll(elements => elements.map(element => {
      const { width, height } = element.getBoundingClientRect();
      return { width, height };
    }))).toEqual([expected, expected]);
  };
  await checkSizes();
  await card.getByRole("button", { name: "Stayed clear: No alcohol", exact: true }).click();
  await expect(card.getByRole("button", { name: "Undo stayed clear: No alcohol", exact: true })).toHaveAttribute("aria-pressed", "true");
  await checkSizes();
  await card.getByRole("button", { name: "Log slip: No alcohol", exact: true }).click();
  await expect(card.getByRole("button", { name: "Undo slip: No alcohol", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dismiss challenge" }).click();
  await checkSizes();
  await page.setViewportSize({ width: 320, height: 720 });
  await checkSizes();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("keeps every Settings time field aligned, usable, and inside narrow phone cards", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="settings"]:visible').first().click();
  const times = page.locator('.settings-view input[type="time"]');
  await expect(times).toHaveCount(6);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const layouts = await times.evaluateAll(inputs => inputs.map(input => {
      const rect = input.getBoundingClientRect();
      const field = input.closest(".time-control-field")!;
      const container = field.getBoundingClientRect();
      const label = field.querySelector("label")!.getBoundingClientRect();
      const reset = field.querySelector(".time-reset-button")!.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        left: rect.left, right: rect.right, width: rect.width, height: rect.height,
        containerLeft: container.left, containerRight: container.right,
        labelRight: label.right, resetLeft: reset.left,
        headingBottom: Math.max(label.bottom, reset.bottom), top: rect.top,
        fontSize: style.fontSize, appearance: style.appearance, textAlign: style.textAlign,
      };
    }));
    for (const layout of layouts) {
      expect(layout.height).toBe(44);
      expect(layout.width).toBeGreaterThanOrEqual(200);
      expect(layout.fontSize).toBe("16px");
      expect(layout.appearance).toBe("none");
      expect(layout.textAlign).toBe("left");
      expect(layout.left).toBeGreaterThanOrEqual(layout.containerLeft);
      expect(layout.right).toBeLessThanOrEqual(layout.containerRight);
      expect(layout.labelRight).toBeLessThanOrEqual(layout.resetLeft);
      expect(layout.top).toBeGreaterThan(layout.headingBottom);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByLabel("Evening reminder time", { exact: true }).fill("19:45");
  await page.getByLabel("Quiet hours start", { exact: true }).fill("23:00");
  await page.getByLabel("Wake by", { exact: true }).fill("06:30");
  await page.reload();
  await expect(page.getByLabel("Evening reminder time", { exact: true })).toHaveValue("19:45");
  await expect(page.getByLabel("Quiet hours start", { exact: true })).toHaveValue("23:00");
  await expect(page.getByLabel("Wake by", { exact: true })).toHaveValue("06:30");
  await page.getByRole("button", { name: "Reset Evening reminder time", exact: true }).click();
  await expect(page.getByLabel("Evening reminder time", { exact: true })).toHaveValue("20:30");
});
