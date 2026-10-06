import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../src/types";
import type { StateRepository } from "../src/data/repository";
import { evaluateHabitDay, periodStats, ruleForDate } from "../src/domain/compliance";
import { TrackerStore } from "../src/state/store";

class MemoryRepository implements StateRepository {
  state: AppState | null = null;

  async load(): Promise<AppState | null> {
    return this.state;
  }

  async save(state: AppState): Promise<void> {
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("habit lifecycle", () => {
  it("swaps allowance dates atomically, preserves logs, and restores the normal plan", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    const repository = new MemoryRepository();
    const store = new TrackerStore(repository);
    await store.initialize();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const habit = store.snapshot.habits.find((item) => item.id === "habit-exercise")!;
    const rulesBefore = structuredClone(store.snapshot.rules);
    store.setBooleanLog(habit.id, "2026-10-05", true);
    const logsBefore = structuredClone(store.snapshot.logs);
    expect(store.setHabitDayExceptions(habit.id, [
      { localDate: "2026-10-05", applicable: false, reason: "Holiday" },
      { localDate: "2026-10-03", applicable: true, reason: "Holiday" },
    ])).toBe(true);
    const evaluate = (localDate: string) => evaluateHabitDay({ habit, rules: store.snapshot.rules, logs: store.snapshot.logs, exceptions: store.snapshot.exceptions, localDate, today: "2026-10-05" });
    expect(evaluate("2026-10-05").applicable).toBe(false);
    expect(evaluate("2026-10-05").successful).toBe(false);
    expect(evaluate("2026-10-03").status).toBe("missed");
    expect(evaluate("2026-10-04").applicable).toBe(false);
    expect(store.snapshot.rules).toEqual(rulesBefore);
    expect(store.snapshot.logs).toEqual(logsBefore);
    const stats = periodStats({ habit, rules: store.snapshot.rules, logs: store.snapshot.logs, exceptions: store.snapshot.exceptions, start: "2026-10-05", end: "2026-10-05", today: "2026-10-05" });
    expect(stats.applicable).toBe(0);
    expect(stats.successful).toBe(0);
    expect(stats.missed).toBe(0);
    expect(stats.adherence).toBeNull();
    await vi.waitFor(() => expect(repository.state?.exceptions).toHaveLength(2));
    const restored = new TrackerStore(repository);
    await restored.initialize();
    expect(restored.snapshot.exceptions).toEqual(store.snapshot.exceptions);
    expect(store.setHabitDayExceptions(habit.id, [{ localDate: "2026-10-05", applicable: null, reason: "" }])).toBe(true);
    expect(evaluate("2026-10-05").status).toBe("success");
    expect(store.snapshot.exceptions).toHaveLength(1);
  });

  it("rejects an invalid swap without saving its first exception", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();
    expect(store.setHabitDayExceptions("habit-exercise", [
      { localDate: "2026-10-05", applicable: false, reason: "Holiday" },
      { localDate: "2026-02-30", applicable: true, reason: "Holiday" },
    ])).toBe(false);
    expect(store.snapshot.exceptions).toHaveLength(0);
    expect(store.setHabitDayExceptions("habit-exercise", [
      { localDate: "2020-01-01", applicable: true, reason: "Before start" },
    ])).toBe(false);
    expect(store.snapshot.exceptions).toHaveLength(0);
  });

  it("upgrades legacy local data without replacing the user's records", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    const repository = new MemoryRepository();
    const seedStore = new TrackerStore(repository);
    await seedStore.initialize();
    seedStore.snapshot.habits = seedStore.snapshot.habits.filter(
      (habit) => !["habit-read-bible", "habit-bom", "habit-cold"].includes(habit.id),
    );
    seedStore.snapshot.rules = seedStore.snapshot.rules.filter(
      (rule) => !["habit-read-bible", "habit-bom", "habit-cold"].includes(rule.habitId),
    );
    (seedStore.snapshot as unknown as { schemaVersion: number }).schemaVersion = 2;
    seedStore.snapshot.habits[0]!.name = "Read";
    seedStore.snapshot.habits[0]!.inputType = "number";
    seedStore.snapshot.habits[0]!.unit = "min";
    seedStore.snapshot.habits.find((habit) => habit.id === "habit-sunlight")!.name = "My saved sunlight habit";
    delete (seedStore.snapshot.habits[0] as Partial<(typeof seedStore.snapshot.habits)[number]>).optional;
    seedStore.snapshot.rules[0]!.inputType = "number";
    seedStore.snapshot.rules[0]!.unit = "min";
    seedStore.snapshot.rules[0]!.comparator = "gte";
    seedStore.snapshot.rules[0]!.targetMin = 15;
    seedStore.snapshot.checkins = [
      {
        id: "legacy-checkin",
        localDate: "2026-10-01",
        mood: 4,
        productivity: 3,
        energy: null,
        note: "Kept",
        updatedAt: "2026-10-01T12:00:00.000Z",
      } as (typeof seedStore.snapshot.checkins)[number],
    ];
    repository.state = structuredClone(seedStore.snapshot);

    const upgradedStore = new TrackerStore(repository);
    await upgradedStore.initialize();

    expect(upgradedStore.snapshot.habits.find((habit) => habit.id === "habit-sunlight")?.name).toBe("My saved sunlight habit");
    expect(upgradedStore.snapshot.habits.find((habit) => habit.id === "habit-read")?.name).toBe("15 min Read");
    expect(upgradedStore.snapshot.habits[0]?.optional).toBe(false);
    expect(upgradedStore.snapshot.habits[0]?.direction).toBe("build");
    expect(upgradedStore.snapshot.settings.personalReward).toBe("");
    expect(upgradedStore.snapshot.settings.rewardTarget).toBe(0.8);
    expect(ruleForDate(upgradedStore.snapshot.rules, "habit-read", "2026-10-02")?.inputType).toBe("boolean");
    expect(upgradedStore.snapshot.habits.some((habit) => habit.id === "habit-read-bible")).toBe(true);
    expect(upgradedStore.snapshot.habits.some((habit) => habit.id === "habit-bom")).toBe(true);
    expect(upgradedStore.snapshot.habits.some((habit) => habit.id === "habit-cold")).toBe(true);
    expect(upgradedStore.snapshot.checkins[0]?.wakeTime).toBeNull();
    expect(upgradedStore.snapshot.checkins[0]?.note).toBe("Kept");
  });

  it("moves legacy calorie history and its target into unscored daily signals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const repository = new MemoryRepository();
    const legacy = defaultStateForLegacyCalories();
    repository.state = legacy;

    const store = new TrackerStore(repository);
    await store.initialize();

    expect(store.snapshot.schemaVersion).toBe(6);
    expect(store.snapshot.habits.some((habit) => habit.id === "habit-calories")).toBe(false);
    expect(store.snapshot.rules.some((rule) => rule.habitId === "habit-calories")).toBe(false);
    expect(store.snapshot.logs.some((log) => log.habitId === "habit-calories")).toBe(false);
    expect(store.snapshot.checkins.find((item) => item.localDate === "2026-10-04")?.calories).toBe(1875);
    expect(store.snapshot.settings.signalTargets.caloriesMax).toBe(1950);
  });

  it("versions a recording-type change without rewriting earlier rules", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();

    vi.setSystemTime(new Date(2026, 9, 4, 12));
    store.upsertHabit({
      id: "habit-read",
      name: "15 min Read",
      inputType: "number",
      unit: "min",
      icon: "book-open",
      color: "#3867d6",
      optional: false,
      direction: "build",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      comparator: "gte",
      targetMin: 15,
      targetMax: null,
    });

    expect(ruleForDate(store.snapshot.rules, "habit-read", "2026-10-03")?.inputType).toBe("boolean");
    expect(ruleForDate(store.snapshot.rules, "habit-read", "2026-10-04")?.inputType).toBe("number");
  });

  it("keeps a new habit out of compliance until its optional start date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();

    store.upsertHabit({
      startDate: "2026-10-25",
      name: "Nicotine avoid",
      inputType: "boolean",
      unit: "",
      icon: "shield",
      color: "#64748b",
      optional: false,
      direction: "avoid",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      comparator: "checked",
      targetMin: null,
      targetMax: null,
    });

    const habit = store.snapshot.habits.find((item) => item.name === "Nicotine avoid");
    expect(habit).toBeDefined();
    expect(ruleForDate(store.snapshot.rules, habit!.id, "2026-10-24")).toBeNull();
    expect(ruleForDate(store.snapshot.rules, habit!.id, "2026-10-25")?.direction).toBe("avoid");
  });

  it("reschedules an active habit without rewriting its earlier history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();

    vi.setSystemTime(new Date(2026, 9, 10, 12));
    store.upsertHabit({
      id: "habit-cold",
      startDate: "2026-10-25",
      name: "Cold",
      inputType: "boolean",
      unit: "",
      icon: "snowflake",
      color: "#2485a8",
      optional: false,
      direction: "build",
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      comparator: "checked",
      targetMin: null,
      targetMax: null,
    });

    expect(ruleForDate(store.snapshot.rules, "habit-cold", "2026-10-09")).not.toBeNull();
    expect(ruleForDate(store.snapshot.rules, "habit-cold", "2026-10-10")).toBeNull();
    expect(ruleForDate(store.snapshot.rules, "habit-cold", "2026-10-24")).toBeNull();
    expect(ruleForDate(store.snapshot.rules, "habit-cold", "2026-10-25")?.effectiveFrom).toBe("2026-10-25");
    expect(store.snapshot.habits.find((habit) => habit.id === "habit-cold")?.icon).toBe("snowflake");
  });

  it("keeps archived gaps out of the active schedule when a habit is restored", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();

    store.setHabitArchived("habit-exercise", true);
    expect(ruleForDate(store.snapshot.rules, "habit-exercise", "2026-10-02")).not.toBeNull();
    expect(ruleForDate(store.snapshot.rules, "habit-exercise", "2026-10-03")).toBeNull();

    vi.setSystemTime(new Date(2026, 9, 4, 12));
    store.setHabitArchived("habit-exercise", false);
    expect(ruleForDate(store.snapshot.rules, "habit-exercise", "2026-10-03")).toBeNull();
    expect(ruleForDate(store.snapshot.rules, "habit-exercise", "2026-10-04")).not.toBeNull();
  });

  it("retains optional workout details when completion is toggled", async () => {
    const store = new TrackerStore(new MemoryRepository());
    await store.initialize();
    const date = store.snapshot.selectedDate;

    store.setExerciseDetail("habit-exercise", date, "activityType", "Strength");
    store.setExerciseDetail("habit-exercise", date, "durationMinutes", 45);
    store.setExerciseDetail("habit-exercise", date, "caloriesBurned", 320);
    store.setExerciseDetail("habit-exercise", date, "timeOfDay", "07:30");
    store.setBooleanLog("habit-exercise", date, true);
    store.setBooleanLog("habit-exercise", date, true);

    const log = store.snapshot.logs.find(
      (item) => item.habitId === "habit-exercise" && item.localDate === date,
    );
    expect(log?.booleanValue).toBeNull();
    expect(log?.exerciseDetails).toEqual({
      activityType: "Strength",
      durationMinutes: 45,
      caloriesBurned: 320,
      timeOfDay: "07:30",
    });
  });
});

function defaultStateForLegacyCalories(): AppState {
  const state = new TrackerStore(new MemoryRepository()).snapshot;
  (state as unknown as { schemaVersion: number }).schemaVersion = 5;
  delete (state.settings as Partial<typeof state.settings>).signalTargets;
  state.habits.push({
    id: "habit-calories",
    name: "Calories",
    inputType: "number",
    unit: "kcal",
    icon: "flame",
    color: "#db5c5c",
    optional: false,
    direction: "build",
    sortOrder: state.habits.length,
    createdAt: "2026-10-01T12:00:00.000Z",
    archivedAt: null,
  });
  state.rules.push({
    id: "rule-calories",
    habitId: "habit-calories",
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
    inputType: "number",
    unit: "kcal",
    direction: "build",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    comparator: "lte",
    targetMin: null,
    targetMax: 1950,
  });
  state.logs.push({
    id: "calorie-log",
    habitId: "habit-calories",
    localDate: "2026-10-04",
    booleanValue: null,
    numericValue: 1875,
    source: "manual",
    note: "",
    updatedAt: "2026-10-04T20:00:00.000Z",
  });
  return state;
}
