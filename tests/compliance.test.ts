import { describe, expect, it } from "vitest";
import type { Habit, HabitLog, HabitRule } from "../src/types";
import {
  combinedPeriodStats,
  evaluateHabitDay,
  isSuccessful,
  periodStats,
  ruleForDate,
} from "../src/domain/compliance";

const booleanHabit: Habit = {
  id: "exercise",
  name: "Exercise",
  inputType: "boolean",
  unit: "",
  icon: "activity",
  color: "#000000",
  optional: false,
  direction: "build",
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
};

const numberHabit: Habit = {
  ...booleanHabit,
  id: "read",
  name: "Read",
  inputType: "number",
  unit: "min",
};

function rule(overrides: Partial<HabitRule> = {}): HabitRule {
  return {
    id: "rule-1",
    habitId: booleanHabit.id,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    inputType: "boolean",
    unit: "",
    direction: "build",
    weekdays: [1, 2, 3, 4, 5],
    comparator: "checked",
    targetMin: null,
    targetMax: null,
    ...overrides,
  };
}

function log(overrides: Partial<HabitLog> = {}): HabitLog {
  return {
    id: "log-1",
    habitId: booleanHabit.id,
    localDate: "2026-10-02",
    booleanValue: true,
    numericValue: null,
    source: "manual",
    note: "",
    updatedAt: "2026-10-02T12:00:00.000Z",
    ...overrides,
  };
}

describe("daily evaluation", () => {
  it("greys out unscheduled weekends", () => {
    const result = evaluateHabitDay({
      habit: booleanHabit,
      rules: [rule()],
      logs: [],
      localDate: "2026-10-03",
      today: "2026-10-03",
    });
    expect(result.status).toBe("not-scheduled");
    expect(result.applicable).toBe(false);
  });

  it("distinguishes missed, pending, and upcoming scheduled days", () => {
    const rules = [rule({ weekdays: [0, 1, 2, 3, 4, 5, 6] })];
    expect(evaluateHabitDay({ habit: booleanHabit, rules, logs: [], localDate: "2026-10-01", today: "2026-10-02" }).status).toBe("missed");
    expect(evaluateHabitDay({ habit: booleanHabit, rules, logs: [], localDate: "2026-10-02", today: "2026-10-02" }).status).toBe("pending");
    expect(evaluateHabitDay({ habit: booleanHabit, rules, logs: [], localDate: "2026-10-03", today: "2026-10-02" }).status).toBe("upcoming");
  });

  it("evaluates boolean completion", () => {
    const result = evaluateHabitDay({
      habit: booleanHabit,
      rules: [rule()],
      logs: [log()],
      localDate: "2026-10-02",
      today: "2026-10-02",
    });
    expect(result.status).toBe("success");
    expect(result.successful).toBe(true);
  });

  it("treats an avoid confirmation as success and a logged slip as off-target", () => {
    const avoidHabit: Habit = { ...booleanHabit, direction: "avoid", name: "No nicotine" };
    const avoidRule = rule({ direction: "avoid" });
    const stayedClear = evaluateHabitDay({
      habit: avoidHabit,
      rules: [avoidRule],
      logs: [log({ booleanValue: true })],
      localDate: "2026-10-02",
      today: "2026-10-02",
    });
    const slip = evaluateHabitDay({
      habit: avoidHabit,
      rules: [avoidRule],
      logs: [log({ booleanValue: false })],
      localDate: "2026-10-02",
      today: "2026-10-02",
    });
    expect(stayedClear.status).toBe("success");
    expect(slip.status).toBe("off-target");
  });

  it("keeps auxiliary-only boolean logs pending", () => {
    const result = evaluateHabitDay({
      habit: booleanHabit,
      rules: [rule()],
      logs: [
        log({
          booleanValue: null,
          exerciseDetails: {
            activityType: "Strength",
            durationMinutes: 30,
            caloriesBurned: null,
            timeOfDay: null,
          },
        }),
      ],
      localDate: "2026-10-02",
      today: "2026-10-02",
    });
    expect(result.status).toBe("pending");
  });
});

describe("numeric targets", () => {
  it.each([
    ["gte", 15, null, 15, true],
    ["gte", 15, null, 14, false],
    ["lte", null, 2200, 2100, true],
    ["lte", null, 2200, 2300, false],
    ["between", 1800, 2200, 2000, true],
    ["between", 1800, 2200, 1700, false],
    ["exact", 8, null, 8, true],
  ] as const)("handles %s rules", (comparator, minimum, maximum, value, expected) => {
    const numericRule = rule({
      habitId: numberHabit.id,
      inputType: "number",
      unit: "min",
      comparator,
      targetMin: minimum,
      targetMax: maximum,
    });
    const numericLog = log({
      habitId: numberHabit.id,
      booleanValue: null,
      numericValue: value,
    });
    expect(isSuccessful(numberHabit, numericRule, numericLog)).toBe(expected);
  });
});

describe("historical schedules", () => {
  it("selects the rule version effective on the requested day", () => {
    const rules = [
      rule({ id: "old", effectiveFrom: "2026-01-01", effectiveTo: "2026-09-30" }),
      rule({ id: "new", effectiveFrom: "2026-10-01", effectiveTo: null, weekdays: [0, 6] }),
    ];
    expect(ruleForDate(rules, booleanHabit.id, "2026-09-30")?.id).toBe("old");
    expect(ruleForDate(rules, booleanHabit.id, "2026-10-01")?.id).toBe("new");
  });
});

describe("period adherence", () => {
  it("keeps optional habits out of combined adherence", () => {
    const optionalHabit = { ...booleanHabit, optional: true };
    const stats = combinedPeriodStats({
      habits: [optionalHabit],
      rules: [rule()],
      logs: [],
      start: "2026-10-01",
      end: "2026-10-02",
      today: "2026-10-02",
    });
    expect(stats.applicable).toBe(0);
    expect(stats.missed).toBe(0);
    expect(stats.adherence).toBeNull();
  });

  it("excludes unscheduled and future days from the denominator", () => {
    const stats = periodStats({
      habit: booleanHabit,
      rules: [rule()],
      logs: [log()],
      start: "2026-09-28",
      end: "2026-10-04",
      today: "2026-10-02",
    });
    expect(stats.successful).toBe(1);
    expect(stats.missed).toBe(4);
    expect(stats.pending).toBe(0);
    expect(stats.applicable).toBe(5);
    expect(stats.adherence).toBe(0.2);
  });

  it("keeps today's pending item out of decided adherence", () => {
    const stats = periodStats({
      habit: booleanHabit,
      rules: [rule({ weekdays: [5] })],
      logs: [],
      start: "2026-10-02",
      end: "2026-10-02",
      today: "2026-10-02",
    });
    expect(stats.applicable).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.adherence).toBeNull();
  });
});
