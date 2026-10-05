import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState } from "../src/types";
import type { StateRepository } from "../src/data/repository";
import { ruleForDate } from "../src/domain/compliance";
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
