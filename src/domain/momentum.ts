import type { AppState, Habit } from "../types";
import { evaluateHabitDay } from "./compliance";
import { addDays, dateRange, todayKey } from "./dates";

export type MomentumDayTone = "secured" | "partial" | "open" | "rest";

export interface MomentumDay {
  localDate: string;
  tone: MomentumDayTone;
}

export interface MomentumSummary {
  start: string;
  end: string;
  days: MomentumDay[];
  successful: number;
  decided: number;
  adherence: number | null;
  securedDays: number;
  recordedDays: number;
  rank: string;
  rankLevel: number;
  rewardUnlocked: boolean;
}

export function momentumSummary(state: AppState, end = todayKey()): MomentumSummary {
  const start = addDays(end, -6);
  const habits = activeRequiredHabits(state);
  let successful = 0;
  let decided = 0;

  const days = dateRange(start, end).map<MomentumDay>((localDate) => {
    const evaluations = habits
      .map((habit) =>
        evaluateHabitDay({
          habit,
          rules: state.rules,
          logs: state.logs,
          exceptions: state.exceptions,
          localDate,
        }),
      )
      .filter((evaluation) => evaluation.applicable && evaluation.status !== "upcoming");

    evaluations.forEach((evaluation) => {
      if (evaluation.successful) {
        successful += 1;
        decided += 1;
      } else if (evaluation.status === "missed" || evaluation.status === "off-target") {
        decided += 1;
      }
    });

    if (!evaluations.length) return { localDate, tone: "rest" };
    if (evaluations.every((evaluation) => evaluation.successful)) {
      return { localDate, tone: "secured" };
    }
    if (localDate === todayKey() && evaluations.some((evaluation) => evaluation.status === "pending")) {
      return { localDate, tone: "open" };
    }
    return { localDate, tone: "partial" };
  });

  const adherence = decided ? successful / decided : null;
  const recordedDays = days.filter((day) => day.tone === "secured" || day.tone === "partial").length;
  const { rank, rankLevel } = rankForAdherence(adherence, recordedDays);

  return {
    start,
    end,
    days,
    successful,
    decided,
    adherence,
    securedDays: days.filter((day) => day.tone === "secured").length,
    recordedDays,
    rank,
    rankLevel,
    rewardUnlocked:
      Boolean(state.settings.personalReward.trim()) &&
      recordedDays >= 5 &&
      adherence !== null &&
      adherence >= state.settings.rewardTarget,
  };
}

export function isDaySecured(state: AppState, localDate: string): boolean {
  const evaluations = activeRequiredHabits(state)
    .map((habit) =>
      evaluateHabitDay({
        habit,
        rules: state.rules,
        logs: state.logs,
        exceptions: state.exceptions,
        localDate,
      }),
    )
    .filter((evaluation) => evaluation.applicable);
  return evaluations.length > 0 && evaluations.every((evaluation) => evaluation.successful);
}

export function isRecoveryCompletion(state: AppState, habitId: string, localDate: string): boolean {
  const habit = state.habits.find((item) => item.id === habitId);
  if (!habit) return false;
  for (let offset = 1; offset <= 31; offset += 1) {
    const previousDate = addDays(localDate, -offset);
    const evaluation = evaluateHabitDay({
      habit,
      rules: state.rules,
      logs: state.logs,
      exceptions: state.exceptions,
      localDate: previousDate,
    });
    if (!evaluation.applicable) continue;
    return evaluation.status === "missed" || evaluation.status === "off-target";
  }
  return false;
}

export function remainingRequiredToday(state: AppState): number {
  return activeRequiredHabits(state)
    .map((habit) =>
      evaluateHabitDay({
        habit,
        rules: state.rules,
        logs: state.logs,
        exceptions: state.exceptions,
        localDate: todayKey(),
      }),
    )
    .filter((evaluation) => evaluation.applicable && !evaluation.successful).length;
}

function activeRequiredHabits(state: AppState): Habit[] {
  return state.habits.filter((habit) => !habit.archivedAt && !habit.optional);
}

function rankForAdherence(
  adherence: number | null,
  recordedDays: number,
): { rank: string; rankLevel: number } {
  if (adherence === null || recordedDays < 2 || adherence < 0.4) {
    return { rank: "Recalibrating", rankLevel: 0 };
  }
  if (adherence < 0.65) return { rank: "Establishing", rankLevel: 1 };
  if (recordedDays < 3) return { rank: "Establishing", rankLevel: 1 };
  if (adherence < 0.85) return { rank: "Steady", rankLevel: 2 };
  if (recordedDays < 5) return { rank: "Steady", rankLevel: 2 };
  if (adherence < 0.95) return { rank: "Locked In", rankLevel: 3 };
  return { rank: "Commanding", rankLevel: 4 };
}
