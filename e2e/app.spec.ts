import { expect, test } from "@playwright/test";

test("records an explicit Build skip with an original challenge and allows recovery", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Skip today: Sunlight", exact: true }).click();
  await expect(page.locator(".accountability-alert")).toContainText("Original challenge");
  await expect(page.locator(".accountability-alert")).toContainText("Skip recorded");
  await expect(page.locator(".progress-ring strong")).toHaveText("0");
  await page.getByRole("button", { name: "Dismiss challenge" }).click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Undo skip: Sunlight", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Complete Sunlight", exact: true }).click();
  await expect(page.locator(".progress-ring strong")).toHaveText("1");
});

test("retains notification preferences, shows quote sources, and fits the phone", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="settings"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Command notifications" })).toBeVisible();
  await page.getByLabel("Evening reminder time", { exact: true }).fill("19:45");
  await page.getByLabel("Evening reminder time", { exact: true }).blur();
  await page.locator('[data-notification-setting="tone"]').selectOption("direct");
  await page.locator('[data-notification-setting="showHabitNames"]').uncheck();
  await page.reload();
  await expect(page.getByLabel("Evening reminder time", { exact: true })).toHaveValue("19:45");
  await expect(page.locator('[data-notification-setting="tone"]')).toHaveValue("direct");
  await expect(page.locator('[data-notification-setting="showHabitNames"]')).not.toBeChecked();
  await page.locator(".quote-sources summary").click();
  await expect(page.locator(".quote-sources")).toContainText("Eric Thomas");
  await expect(page.locator(".quote-sources")).toContainText("Andrew Huberman");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("adds a neutral exemption, retains it after reload, and restores the entry", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Complete Sunlight" }).click();
  await page.getByRole("button", { name: "Day exception: Sunlight", exact: true }).click();
  await page.getByLabel("Plan for this date").selectOption("exempt");
  await page.getByLabel("Reason").fill("Work conference");
  await page.getByRole("button", { name: "Save exception", exact: true }).click();
  await expect(page.locator('[data-habit-card-id="habit-sunlight"]')).toHaveCount(0);
  await expect(page.locator('[data-exempt-habit-id="habit-sunlight"]')).toContainText("Work conference");
  await expect(page.locator(".progress-ring strong")).toHaveText("0");
  await page.reload();
  await expect(page.locator('[data-exempt-habit-id="habit-sunlight"]')).toContainText("Not scored");
  await page.locator('[data-view="review"]:visible').first().click();
  await expect(page.locator('.week-cell.is-exempt[title="Exempt / allowed · Work conference"]')).toHaveText("E");
  await page.locator('[data-view="today"]:visible').first().click();
  await page.getByRole("button", { name: "Edit exception: Sunlight", exact: true }).click();
  await page.getByLabel("Plan for this date").selectOption("normal");
  await page.getByRole("button", { name: "Save exception", exact: true }).click();
  await expect(page.getByRole("button", { name: "Undo Sunlight", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".progress-ring strong")).toHaveText("1");
});

test("shifts an alcohol allowance from Sat/Sun to Sun/Mon and fits mobile", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByLabel("Name").fill("No alcohol");
  await page.getByRole("radio", { name: /Avoid/ }).check();
  await page.getByRole("button", { name: "Weekdays", exact: true }).click();
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();
  await page.locator('[data-view="today"]:visible').first().click();
  const dates = await page.evaluate(() => {
    const saturday = new Date();
    saturday.setDate(saturday.getDate() + (6 - saturday.getDay() + 7) % 7);
    const monday = new Date(saturday);
    monday.setDate(monday.getDate() + 2);
    const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { saturday: key(saturday), monday: key(monday) };
  });
  await page.getByRole("button", { name: "Exceptions", exact: true }).click();
  await page.getByLabel("Habit", { exact: true }).selectOption({ label: "No alcohol" });
  await page.getByLabel("Exception date").fill(dates.monday);
  await page.getByLabel("Plan for this date").selectOption("exempt");
  await page.getByLabel("Reason").fill("Holiday");
  await page.getByRole("checkbox", { name: /Swap with another day/ }).check();
  await page.getByLabel("Swap date", { exact: true }).fill(dates.saturday);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Save exception", exact: true }).click();
  await page.locator('[data-view="review"]:visible').first().click();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.locator(`[data-action="open-date"][data-date="${dates.monday}"]`).click();
  await expect(page.locator(".exempt-habit", { hasText: "No alcohol" })).toContainText("Allowed day · Holiday");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".resting-panel")).toContainText("No alcohol");
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.locator(".habit-check", { hasText: "No alcohol" })).toContainText("Added to this day · Holiday");
  await page.reload();
  await expect(page.locator(".habit-check", { hasText: "No alcohol" })).toContainText("Added to this day · Holiday");
});

test("logs a habit immediately and preserves it after reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scheduled today" })).toBeVisible();
  await page.getByRole("button", { name: "Complete Sunlight" }).click();
  await expect(page.locator(".progress-ring strong")).toHaveText("1");
  await expect(page.locator('[data-habit-card-id="habit-sunlight"]')).toHaveClass(/just-completed/);

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

test("schedules a future avoid habit and groups habit types", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByLabel("Name").fill("Nicotine avoid");
  await page.getByRole("radio", { name: /Avoid/ }).check();
  const future = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 20);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });
  await page.locator('input[name="startDate"]').fill(future);
  await page.getByRole("radio", { name: "Shield" }).check();
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();

  const groups = page.locator(".habit-manager-list > .habit-group");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAttribute("data-habit-group", "build");
  await expect(groups.nth(1)).toHaveAttribute("data-habit-group", "avoid");
  await expect(groups.nth(1).locator(".habit-manager-card", { hasText: "Nicotine avoid" })).toContainText("Starts");

  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.locator(".habit-check", { hasText: "Nicotine avoid" })).toHaveCount(0);
  await expect(page.locator(".resting-panel", { hasText: "Nicotine avoid" })).toBeVisible();
});

test("tracks an avoid habit without rewarding a logged slip", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByLabel("Name").fill("No alcohol");
  await page.getByRole("radio", { name: /Avoid/ }).check();
  await page.locator("#habitForm").getByRole("button", { name: "Add habit", exact: true }).click();

  await page.locator('[data-view="today"]:visible').first().click();
  const todayGroups = page.locator(".habit-checklist > .habit-group");
  await expect(todayGroups).toHaveCount(2);
  await expect(todayGroups.nth(0)).toHaveAttribute("data-habit-group", "build");
  await expect(todayGroups.nth(1)).toHaveAttribute("data-habit-group", "avoid");
  const avoidCard = page.locator(".habit-check", { hasText: "No alcohol" });
  await expect(avoidCard.locator(".direction-badge")).toHaveText("Avoid");
  await avoidCard.getByRole("button", { name: "Stayed clear: No alcohol" }).click();
  await expect(avoidCard).toContainText("Stayed clear");
  await expect(avoidCard).toHaveClass(/just-completed/);

  await avoidCard.getByRole("button", { name: "Log slip: No alcohol" }).click();
  await expect(avoidCard).toContainText("Slip logged");
  await expect(avoidCard.getByRole("button", { name: "Undo slip: No alcohol" })).toHaveAttribute("aria-pressed", "true");
});

test("celebrates when every required objective is secured", async ({ page }) => {
  await page.goto("/");
  let openButtons = page.locator('.habit-check .completion-button[aria-pressed="false"]');
  while ((await openButtons.count()) > 0) {
    await openButtons.first().evaluate((button: HTMLButtonElement) => button.click());
    openButtons = page.locator('.habit-check .completion-button[aria-pressed="false"]');
  }
  await expect(page.locator(".celebration")).toContainText(/Day secured|Perfect alignment/);
  const total = ((await page.locator(".progress-ring span").textContent()) ?? "").replace("of ", "");
  await expect(page.locator(".progress-ring strong")).toHaveText(total);
});

test("stores a personal reward and exposes the free Home Screen badge control", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="settings"]:visible').first().click();
  await page.getByLabel("Personal reward").fill("Movie night");
  await page.getByLabel("Personal reward").blur();
  await page.getByLabel("Unlock target").selectOption("0.9");
  await expect(page.getByRole("button", { name: "Enable", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Personal reward")).toHaveValue("Movie night");
  await expect(page.getByLabel("Unlock target")).toHaveValue("0.9");
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

test("contains the weekly review grid inside the mobile viewport", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile layout check");
  await page.goto("/");
  await page.locator('[data-view="review"]:visible').first().click();
  const layout = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".weekly-grid-scroller")!;
    const label = document.querySelector<HTMLElement>(".week-habit-label")!;
    scroller.scrollLeft = 110;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      scrollerWidth: scroller.clientWidth,
      tableWidth: scroller.scrollWidth,
      scrollerLeft: scroller.getBoundingClientRect().left,
      labelLeft: label.getBoundingClientRect().left,
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.scrollerWidth).toBeLessThan(layout.tableWidth);
  expect(Math.abs(layout.scrollerLeft - layout.labelLeft)).toBeLessThanOrEqual(1);
});

test("refreshes the installed app with a pull-down gesture", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Touch gesture check");
  await page.goto("/");
  await page.evaluate(() => {
    const target = document.body;
    const touch = (clientY: number) =>
      new Touch({ identifier: 1, target, clientX: 190, clientY, pageX: 190, pageY: clientY });
    target.dispatchEvent(
      new TouchEvent("touchstart", { bubbles: true, touches: [touch(70)], changedTouches: [touch(70)] }),
    );
    target.dispatchEvent(
      new TouchEvent("touchmove", { bubbles: true, touches: [touch(230)], changedTouches: [touch(230)] }),
    );
  });
  await expect(page.locator("#pullRefresh")).toHaveClass(/is-ready/);
  await expect(page.locator("#pullRefresh strong")).toHaveText("Release to refresh");
  await page.evaluate(() => sessionStorage.setItem("pull-refresh-test", "retained"));
  const loaded = page.waitForEvent("load");
  await page.evaluate(() => document.body.dispatchEvent(new TouchEvent("touchend", { bubbles: true })));
  await loaded;
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("pull-refresh-test"))).toBe("retained");
});

test("offers a manual refresh inside the installed app", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="settings"]:visible').first().click();
  const loaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Refresh app" }).click();
  await loaded;
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("keeps 15 min Read as yes/no and retains daily signals", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-view="habits"]:visible').first().click();
  const readCard = page.locator(".habit-manager-card", { hasText: "15 min Read" }).first();
  await readCard.getByRole("button", { name: "Edit 15 min Read" }).click();
  await expect(page.locator('#habitForm input[name="inputType"][value="boolean"]')).toBeChecked();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator('[data-view="today"]:visible').first().click();
  await expect(page.getByRole("button", { name: "Complete 15 min Read", exact: true })).toBeVisible();

  await page.getByLabel("Wake time", { exact: true }).fill("06:30");
  await page.getByLabel("Wake time", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Bedtime", { exact: true }).fill("22:45");
  await page.getByLabel("Bedtime", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Calories consumed").fill("2050");
  await page.getByLabel("Calories consumed").dispatchEvent("change");
  await page.reload();
  await expect(page.getByLabel("Wake time", { exact: true })).toHaveValue("06:30");
  await expect(page.getByLabel("Bedtime", { exact: true })).toHaveValue("22:45");
  await expect(page.getByLabel("Calories consumed")).toHaveValue("2050");
  await expect(page.locator('[data-habit-card-id="habit-calories"]')).toHaveCount(0);
});

test("applies optional signal targets without changing habit progress", async ({ page }) => {
  await page.goto("/");
  const requiredBefore = await page.locator(".progress-ring span").textContent();
  await page.locator('[data-view="settings"]:visible').first().click();
  await page.getByLabel("Calories at or below").fill("2100");
  await page.getByLabel("Calories at or below").dispatchEvent("change");
  await page.getByLabel("Wake by", { exact: true }).fill("06:30");
  await page.getByLabel("Wake by", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Bed by", { exact: true }).fill("22:30");
  await page.getByLabel("Bed by", { exact: true }).dispatchEvent("change");

  await page.locator('[data-view="today"]:visible').first().click();
  await page.getByLabel("Wake time", { exact: true }).fill("06:15");
  await page.getByLabel("Wake time", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Bedtime", { exact: true }).fill("23:15");
  await page.getByLabel("Bedtime", { exact: true }).dispatchEvent("change");
  await page.getByLabel("Calories consumed").fill("2000");
  await page.getByLabel("Calories consumed").dispatchEvent("change");

  await expect(page.locator(".signal-entry-card", { hasText: "Wake time" })).toContainText("In range");
  await expect(page.locator(".signal-entry-card", { hasText: "Bedtime" })).toContainText("Outside target");
  await expect(page.locator(".signal-entry-card", { hasText: "Calories" })).toContainText("In range");
  await expect(page.locator(".progress-ring span")).toHaveText(requiredBefore ?? "");

  await page.locator('[data-view="review"]:visible').first().click();
  await expect(page.getByRole("heading", { name: "Weekly signal averages" })).toBeVisible();
  await expect(page.locator(".signal-summary-card")).toContainText("1 day recorded");
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
  await expect(page.locator('[data-habit-group="build"] .habit-subgroup-label')).toHaveText("Optional");
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
    navBottom: document.querySelector(".bottom-nav")?.getBoundingClientRect().bottom,
    viewportHeight: window.innerHeight,
    viewAnimation: getComputedStyle(document.querySelector(".view-stack")!).animationName,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.navBottom).toBe(dimensions.viewportHeight);
  expect(dimensions.viewAnimation).toBe("none");
});

test("captures optional exercise details and preserves them after reload", async ({ page }) => {
  await page.goto("/");
  const exercise = page.locator(".habit-check", { hasText: "Exercise" });
  await exercise.getByText("Workout details").click();
  await exercise.locator('select[data-exercise-detail="activityType"]').selectOption("Strength");
  await exercise.locator('input[data-exercise-detail="durationMinutes"]').fill("45");
  await exercise.locator('input[data-exercise-detail="durationMinutes"]').dispatchEvent("change");
  await exercise.locator('input[data-exercise-detail="caloriesBurned"]').fill("320");
  await exercise.locator('input[data-exercise-detail="caloriesBurned"]').dispatchEvent("change");
  await exercise.locator('input[data-exercise-detail="timeOfDay"]').fill("07:30");
  await exercise.locator('input[data-exercise-detail="timeOfDay"]').dispatchEvent("change");

  await page.reload();
  const restoredExercise = page.locator(".habit-check", { hasText: "Exercise" });
  await restoredExercise.getByText("Workout details").click();
  await expect(restoredExercise.locator('select[data-exercise-detail="activityType"]')).toHaveValue("Strength");
  await expect(restoredExercise.locator('input[data-exercise-detail="durationMinutes"]')).toHaveValue("45");
  await expect(restoredExercise.locator('input[data-exercise-detail="caloriesBurned"]')).toHaveValue("320");
  await expect(restoredExercise.locator('input[data-exercise-detail="timeOfDay"]')).toHaveValue("07:30");
});

test("keeps the exercise time control inside its mobile column", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile layout check");
  await page.goto("/");
  const exercise = page.locator(".habit-check", { hasText: "Exercise" });
  await exercise.getByText("Workout details").click();
  const bounds = await exercise.locator('input[data-exercise-detail="timeOfDay"]').evaluate((input) => {
    const inputBox = input.getBoundingClientRect();
    const fieldBox = input.closest(".field")!.getBoundingClientRect();
    const cardBox = input.closest("article")!.getBoundingClientRect();
    return {
      inputLeft: inputBox.left,
      inputRight: inputBox.right,
      fieldLeft: fieldBox.left,
      fieldRight: fieldBox.right,
      cardRight: cardBox.right,
    };
  });
  expect(bounds.inputLeft).toBeGreaterThanOrEqual(bounds.fieldLeft);
  expect(bounds.inputRight).toBeLessThanOrEqual(bounds.fieldRight + 1);
  expect(bounds.inputRight).toBeLessThan(bounds.cardRight);
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
