import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "../src/data/defaults";
import { addDays, todayKey } from "../src/domain/dates";
import { momentumSummary, remainingRequiredToday } from "../src/domain/momentum";

afterEach(() => vi.useRealTimers());

describe("momentum rewards", () => {
  it("unlocks a personal reward after five recorded successful days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const state = defaultState();
    state.habits = [
      {
        ...state.habits[0]!,
        id: "avoid-nicotine",
        name: "No nicotine",
        direction: "avoid",
      },
    ];
    state.rules = [
      {
        ...state.rules[0]!,
        id: "avoid-rule",
        habitId: "avoid-nicotine",
        effectiveFrom: addDays(todayKey(), -5),
        direction: "avoid",
      },
    ];
    state.settings.personalReward = "Movie night";
    state.settings.rewardTarget = 0.8;
    state.logs = Array.from({ length: 5 }, (_, index) => ({
      id: `log-${index}`,
      habitId: "avoid-nicotine",
      localDate: addDays(todayKey(), -index - 1),
      booleanValue: true,
      numericValue: null,
      source: "manual" as const,
      note: "",
      updatedAt: new Date().toISOString(),
    }));

    const result = momentumSummary(state);
    expect(result.recordedDays).toBe(5);
    expect(result.rewardUnlocked).toBe(true);
    expect(result.rank).toBe("Commanding");
  });

  it("counts only incomplete required habits in the app badge", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 5, 12));
    const state = defaultState();
    const before = remainingRequiredToday(state);
    const first = state.habits.find((habit) => habit.id === "habit-read")!;
    state.logs.push({
      id: "done",
      habitId: first.id,
      localDate: todayKey(),
      booleanValue: true,
      numericValue: null,
      source: "manual",
      note: "",
      updatedAt: new Date().toISOString(),
    });
    expect(remainingRequiredToday(state)).toBe(before - 1);
    first.optional = true;
    expect(remainingRequiredToday(state)).toBe(before - 1);
  });
});
