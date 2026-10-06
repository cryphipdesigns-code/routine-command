import type {
  DayEvaluation,
  Habit,
  HabitDayException,
  HabitLog,
  HabitRule,
  PeriodStats,
} from "../types.ts";
import { dateRange, isFuture, isPast, parseDateKey, todayKey } from "./dates.ts";

export function ruleForDate(
  rules: HabitRule[],
  habitId: string,
  localDate: string,
): HabitRule | null {
  return (
    rules
      .filter(
        (rule) =>
          rule.habitId === habitId &&
          rule.effectiveFrom <= localDate &&
          (rule.effectiveTo === null || rule.effectiveTo >= localDate),
      )
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  );
}

export function isRuleScheduled(rule: HabitRule, localDate: string): boolean {
  return rule.weekdays.includes(parseDateKey(localDate).getDay());
}

export function logForDate(
  logs: HabitLog[],
  habitId: string,
  localDate: string,
): HabitLog | null {
  return logs.find((log) => log.habitId === habitId && log.localDate === localDate) ?? null;
}

export function isSuccessful(_habit: Habit, rule: HabitRule, log: HabitLog): boolean {
  if (rule.inputType === "boolean") return log.booleanValue === true;
  if (log.numericValue === null || !Number.isFinite(log.numericValue)) return false;
  const value = log.numericValue;

  switch (rule.comparator) {
    case "gte":
      return rule.targetMin !== null && value >= rule.targetMin;
    case "lte":
      return rule.targetMax !== null && value <= rule.targetMax;
    case "between":
      return (
        rule.targetMin !== null &&
        rule.targetMax !== null &&
        value >= rule.targetMin &&
        value <= rule.targetMax
      );
    case "exact":
      return rule.targetMin !== null && value === rule.targetMin;
    case "checked":
      return value > 0;
  }
}

export function evaluateHabitDay(params: {
  habit: Habit;
  rules: HabitRule[];
  logs: HabitLog[];
  exceptions?: HabitDayException[];
  localDate: string;
  today?: string;
}): DayEvaluation {
  const { habit, rules, logs, localDate } = params;
  const currentToday = params.today ?? todayKey();
  const exception = params.exceptions?.find(
    (item) => item.habitId === habit.id && item.localDate === localDate,
  );
  const rule = ruleForDate(rules, habit.id, localDate);
  const log = logForDate(logs, habit.id, localDate);
  const applicable = exception ? exception.applicable : Boolean(rule && isRuleScheduled(rule, localDate));

  if (!rule || !applicable) {
    return { status: "not-scheduled", applicable: false, successful: false, rule, log };
  }

  const hasRecordedValue =
    rule.inputType === "boolean"
      ? log?.booleanValue !== null && log?.booleanValue !== undefined
      : log?.numericValue !== null && log?.numericValue !== undefined;

  if (log && hasRecordedValue) {
    const successful = isSuccessful(habit, rule, log);
    return {
      status: successful ? "success" : "off-target",
      applicable: true,
      successful,
      rule,
      log,
    };
  }

  if (isFuture(localDate, currentToday)) {
    return { status: "upcoming", applicable: true, successful: false, rule, log };
  }

  if (isPast(localDate, currentToday)) {
    return { status: "missed", applicable: true, successful: false, rule, log };
  }

  return { status: "pending", applicable: true, successful: false, rule, log };
}

export function periodStats(params: {
  habit: Habit;
  rules: HabitRule[];
  logs: HabitLog[];
  exceptions?: HabitDayException[];
  start: string;
  end: string;
  today?: string;
}): PeriodStats {
  const currentToday = params.today ?? todayKey();
  const result: PeriodStats = {
    applicable: 0,
    successful: 0,
    missed: 0,
    pending: 0,
    adherence: null,
  };

  dateRange(params.start, params.end).forEach((localDate) => {
    const evaluation = evaluateHabitDay({
      habit: params.habit,
      rules: params.rules,
      logs: params.logs,
      exceptions: params.exceptions,
      localDate,
      today: currentToday,
    });
    if (!evaluation.applicable || evaluation.status === "upcoming") return;
    result.applicable += 1;
    if (evaluation.successful) result.successful += 1;
    else if (evaluation.status === "pending") result.pending += 1;
    else result.missed += 1;
  });

  const decided = result.successful + result.missed;
  result.adherence = decided > 0 ? result.successful / decided : null;
  return result;
}

export function combinedPeriodStats(params: {
  habits: Habit[];
  rules: HabitRule[];
  logs: HabitLog[];
  exceptions?: HabitDayException[];
  start: string;
  end: string;
  today?: string;
}): PeriodStats {
  return params.habits.filter((habit) => !habit.optional).reduce<PeriodStats>(
    (total, habit) => {
      const stats = periodStats({ ...params, habit });
      total.applicable += stats.applicable;
      total.successful += stats.successful;
      total.missed += stats.missed;
      total.pending += stats.pending;
      const decided = total.successful + total.missed;
      total.adherence = decided > 0 ? total.successful / decided : null;
      return total;
    },
    { applicable: 0, successful: 0, missed: 0, pending: 0, adherence: null },
  );
}

export function targetLabel(_habit: Habit, rule: HabitRule): string {
  if (rule.inputType === "boolean") return rule.direction === "avoid" ? "Avoid today" : "Complete";
  const unit = rule.unit ? ` ${rule.unit}` : "";
  switch (rule.comparator) {
    case "gte":
      return `At least ${formatNumber(rule.targetMin)}${unit}`;
    case "lte":
      return `At most ${formatNumber(rule.targetMax)}${unit}`;
    case "between":
      return `${formatNumber(rule.targetMin)}–${formatNumber(rule.targetMax)}${unit}`;
    case "exact":
      return `${formatNumber(rule.targetMin)}${unit}`;
    case "checked":
      return `Record ${unit.trim() || "value"}`;
  }
}

function formatNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}
