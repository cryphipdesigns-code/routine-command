import type { AppState, Habit } from "../types";
import { ruleForDate, targetLabel } from "../domain/compliance";
import { dayName, formatShortDate, todayKey } from "../domain/dates";
import { escapeHtml, icon } from "../ui";

export function activeHabits(state: AppState): Habit[] {
  return state.habits
    .filter((habit) => !habit.archivedAt)
    .sort((a, b) => {
      const direction = Number(a.direction === "avoid") - Number(b.direction === "avoid");
      if (direction) return direction;
      const optional = Number(a.optional) - Number(b.optional);
      return optional || a.sortOrder - b.sortOrder;
    });
}

export function pageIntro(params: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: string;
}): string {
  return `
    <header class="page-intro">
      <div>
        <p class="eyebrow">${escapeHtml(params.eyebrow)}</p>
        <h1>${escapeHtml(params.title)}</h1>
        <p class="page-copy">${escapeHtml(params.copy)}</p>
      </div>
      ${params.action ?? ""}
    </header>
  `;
}

export function emptyState(title: string, copy: string): string {
  return `
    <div class="empty-state">
      <span class="empty-icon">${icon("target", 28)}</span>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
    </div>
  `;
}

export function scheduleLabel(weekdays: number[]): string {
  const normalized = [...weekdays].sort();
  if (normalized.length === 7) return "Every day";
  if (normalized.join(",") === "1,2,3,4,5") return "Weekdays";
  if (normalized.join(",") === "0,6") return "Weekends";
  return normalized.map((day) => dayName(day, "short")).join(", ");
}

export function habitMeta(state: AppState, habit: Habit): string {
  const rule = ruleForDate(state.rules, habit.id, todayKey());
  if (!rule) {
    const upcoming = state.rules
      .filter((item) => item.habitId === habit.id && item.effectiveFrom > todayKey())
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    if (!upcoming) return "No active schedule";
    const direction = upcoming.direction === "avoid" ? "Avoid" : "Build";
    return `Starts ${formatShortDate(upcoming.effectiveFrom)} · ${direction} · ${scheduleLabel(upcoming.weekdays)}`;
  }
  const direction = rule.direction === "avoid" ? "Avoid" : "Build";
  return `${direction} · ${targetLabel(habit, rule)} · ${scheduleLabel(rule.weekdays)}`;
}

export function statusText(status: string): string {
  const values: Record<string, string> = {
    success: "Complete",
    "off-target": "Recorded · target not met",
    missed: "Missed",
    pending: "Still open",
    upcoming: "Upcoming",
    "not-scheduled": "Not scheduled",
  };
  return values[status] ?? status;
}
