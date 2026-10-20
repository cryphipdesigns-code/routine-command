import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultState } from "../src/data/defaults";
import { dayProgress } from "../src/domain/day-progress";
import { isDaySecured, remainingRequiredToday } from "../src/domain/momentum";
import type { AppState, HabitLog } from "../src/types";

afterEach(() => vi.useRealTimers());
const date = "2026-10-20";

function setup(): AppState {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 12));
  const state = defaultState();
  const baseHabit = state.habits[0]!;
  const baseRule = state.rules[0]!;
  state.habits = [
    { ...baseHabit, id: "build", direction: "build", optional: false },
    { ...baseHabit, id: "avoid", direction: "avoid", optional: false },
    { ...baseHabit, id: "optional", direction: "build", optional: true },
  ];
  state.rules = state.habits.map(habit => ({ ...baseRule, id: `rule-${habit.id}`, habitId: habit.id, direction: habit.direction, effectiveFrom: "2026-10-01", weekdays: [0, 1, 2, 3, 4, 5, 6] }));
  state.logs = [];
  return state;
}

function log(habitId: string, booleanValue: boolean | null, numericValue: number | null = null): HabitLog {
  return { id: habitId, habitId, localDate: date, booleanValue, numericValue, source: "manual", note: "", updatedAt: "2026-10-21T04:00:00Z" };
}

describe("daily action counts and closure", () => {
  it("clears the action badge when Build is done but waits for Avoid confirmation to secure the day", () => {
    const state = setup();
    expect(remainingRequiredToday(state)).toBe(1);
    state.logs = [log("build", true)];
    expect(remainingRequiredToday(state)).toBe(0);
    expect(dayProgress(state, date)).toMatchObject({ buildRemaining: 0, avoidUnconfirmed: 1, completed: 1, total: 2, secured: false });
    expect(isDaySecured(state, date)).toBe(false);
    state.logs.push(log("avoid", true));
    expect(dayProgress(state, date)).toMatchObject({ secured: true, optionalCompleted: 0, avoidCompleted: 1 });
    expect(isDaySecured(state, date)).toBe(true);
  });

  it("does not reward a slip or pretend an unrecorded Avoid is successful", () => {
    const state = setup();
    state.logs = [log("build", true), log("avoid", false)];
    expect(dayProgress(state, date)).toMatchObject({ buildRemaining: 0, avoidOffTarget: 1, avoidUnconfirmed: 0, secured: false });
    expect(remainingRequiredToday(state)).toBe(0);
    state.logs.pop();
    expect(dayProgress(state, date)).toMatchObject({ avoidCompleted: 0, avoidUnconfirmed: 1, secured: false });
  });

  it("keeps skipped Build actions in the badge, and only treats recorded numeric Avoid values as confirmations", () => {
    const state = setup();
    state.rules[1] = { ...state.rules[1]!, inputType: "number", comparator: "lte", targetMax: 1 };
    state.logs = [log("build", false)];
    expect(remainingRequiredToday(state)).toBe(1);
    expect(dayProgress(state, date).avoidUnconfirmed).toBe(1);
    state.logs = [log("build", true), log("avoid", null, 0)];
    expect(dayProgress(state, date).secured).toBe(true);
    state.logs[1]!.numericValue = 2;
    expect(dayProgress(state, date)).toMatchObject({ avoidOffTarget: 1, secured: false });
  });

  it("ignores allowed days, exemptions, future starts, and optional entries for closure", () => {
    const state = setup();
    state.logs = [log("build", true), log("optional", true)];
    state.exceptions = [{ id: "allowed", habitId: "avoid", localDate: date, applicable: false, reason: "Holiday" }];
    expect(dayProgress(state, date)).toMatchObject({ total: 1, secured: true, optionalCompleted: 1, avoidTotal: 0 });
    state.exceptions = [];
    state.rules[1]!.effectiveFrom = "2026-10-25";
    expect(dayProgress(state, date).secured).toBe(true);
    state.rules[1]!.effectiveFrom = "2026-10-01";
    state.rules[1]!.weekdays = [0, 6];
    expect(dayProgress(state, date).secured).toBe(true);
    state.rules[0]!.weekdays = [];
    expect(dayProgress(state, date)).toMatchObject({ total: 0, secured: false });
  });

  it("uses the rule on the viewed date, not the habit's current direction", () => {
    const state = setup();
    state.habits[0]!.direction = "avoid";
    state.habits[1]!.direction = "build";
    expect(dayProgress(state, date)).toMatchObject({ buildTotal: 1, avoidTotal: 1, buildRemaining: 1 });
    state.habits[0]!.archivedAt = new Date().toISOString();
    expect(remainingRequiredToday(state)).toBe(0);
  });
});
