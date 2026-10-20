import type { AppState } from "../types.ts";
import { evaluateHabitDay } from "./compliance.ts";

/** Action counts and end-of-day confirmation are deliberately separate. */
export function dayProgress(state: AppState, localDate: string) {
  const scheduled = state.habits
    .filter(habit => !habit.archivedAt)
    .map(habit => ({
      habit,
      evaluation: evaluateHabitDay({
        habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions,
        localDate, today: localDate,
      }),
    }))
    .filter(item => item.evaluation.applicable);
  const required = scheduled.filter(item => !item.habit.optional);
  const build = required.filter(item => item.evaluation.rule?.direction === "build");
  const avoid = required.filter(item => item.evaluation.rule?.direction === "avoid");
  const completed = required.filter(item => item.evaluation.successful).length;
  const buildCompleted = build.filter(item => item.evaluation.successful).length;
  const avoidCompleted = avoid.filter(item => item.evaluation.successful).length;
  return {
    total: required.length,
    completed,
    buildTotal: build.length,
    buildCompleted,
    buildRemaining: build.length - buildCompleted,
    avoidTotal: avoid.length,
    avoidCompleted,
    avoidUnconfirmed: avoid.filter(item => !item.evaluation.successful && item.evaluation.status !== "off-target").length,
    avoidOffTarget: avoid.filter(item => item.evaluation.status === "off-target").length,
    optionalCompleted: scheduled.filter(item => item.habit.optional && item.evaluation.successful).length,
    secured: required.length > 0 && completed === required.length,
  };
}
