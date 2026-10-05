import type { AppState, DayStatus, Habit } from "../types";
import { combinedPeriodStats, evaluateHabitDay, periodStats } from "../domain/compliance";
import {
  addDays,
  dateRange,
  endOfMonth,
  endOfWeek,
  formatMonth,
  formatWeekRange,
  parseDateKey,
  startOfMonth,
  startOfWeek,
  todayKey,
} from "../domain/dates";
import { escapeHtml, formatPercent, formatValue, icon } from "../ui";
import { activeHabits, emptyState, pageIntro } from "./shared";
import { renderSignalSummary } from "./signal-summary";

export function renderReview(state: AppState): string {
  const habits = activeHabits(state);
  const isWeek = state.reviewMode === "week";
  const start = isWeek
    ? startOfWeek(state.reviewAnchor, state.settings.weekStartsOn)
    : startOfMonth(state.reviewAnchor);
  const end = isWeek ? endOfWeek(state.reviewAnchor, state.settings.weekStartsOn) : endOfMonth(state.reviewAnchor);
  const summary = combinedPeriodStats({
    habits,
    rules: state.rules,
    logs: state.logs,
    exceptions: state.exceptions,
    start,
    end,
  });

  return `
    <div class="view-stack review-view">
      ${pageIntro({
        eyebrow: "Review",
        title: "See the pattern",
        copy: "Rest days stay neutral. Only elapsed, scheduled opportunities affect adherence.",
      })}

      <section class="review-toolbar surface compact-surface">
        <div class="segmented-control" role="group" aria-label="Review period">
          <button data-action="review-mode" data-mode="week" class="${isWeek ? "active" : ""}">Week</button>
          <button data-action="review-mode" data-mode="month" class="${!isWeek ? "active" : ""}">Month</button>
        </div>
        <div class="period-navigator">
          <button class="icon-button" data-action="shift-review" data-amount="-1" aria-label="Previous period">${icon("chevronLeft")}</button>
          <button class="period-label" data-action="review-today">
            <strong>${isWeek ? escapeHtml(formatWeekRange(start, end)) : escapeHtml(formatMonth(start))}</strong>
            <span>Return to current</span>
          </button>
          <button class="icon-button" data-action="shift-review" data-amount="1" aria-label="Next period">${icon("chevronRight")}</button>
        </div>
      </section>

      <section class="metric-strip review-metrics">
        <article><span>Adherence</span><strong>${formatPercent(summary.adherence)}</strong><small>decided days</small></article>
        <article><span>Completed</span><strong>${summary.successful}</strong><small>scheduled checks</small></article>
        <article><span>Missed</span><strong>${summary.missed}</strong><small>elapsed checks</small></article>
        <article><span>Still open</span><strong>${summary.pending}</strong><small>today only</small></article>
      </section>

      ${
        habits.length
          ? isWeek
            ? renderWeek(state, habits, start, end)
            : renderMonth(state, habits, start, end)
          : emptyState("No habits yet", "Create a habit to begin building a review history.")
      }

      ${renderSignalSummary(state, start, end, isWeek ? "Weekly signal averages" : "Monthly signal averages")}
    </div>
  `;
}

function renderWeek(state: AppState, habits: Habit[], start: string, end: string): string {
  const dates = dateRange(start, end);
  return `
    <section class="section-block review-grid-card">
      <div class="section-heading"><div><p class="eyebrow">Weekly grid</p><h2>Habit by habit</h2></div><span class="legend-inline"><i class="legend-success"></i> Met <i class="legend-missed"></i> Missed</span></div>
      <div class="weekly-grid-scroller">
        <div class="weekly-grid" style="--day-count: ${dates.length}">
          <div class="week-corner">Habit</div>
          ${dates.map(renderDayHeader).join("")}
          ${habits.map((habit) => renderHabitWeekRow(state, habit, dates)).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderDayHeader(localDate: string): string {
  const date = parseDateKey(localDate);
  const isCurrent = localDate === todayKey();
  return `<div class="week-day-header ${isCurrent ? "is-today" : ""}"><span>${new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(date)}</span><strong>${date.getDate()}</strong></div>`;
}

function renderHabitWeekRow(state: AppState, habit: Habit, dates: string[]): string {
  const stats = periodStats({
    habit,
    rules: state.rules,
    logs: state.logs,
    exceptions: state.exceptions,
    start: dates[0]!,
    end: dates[dates.length - 1]!,
  });
  return `
    <div class="week-habit-label" style="--habit-color: ${habit.color}">
      <i></i><span>${escapeHtml(habit.name)}${habit.optional ? '<em class="inline-optional">Optional</em>' : ""}</span><small>${habit.optional ? "Optional" : formatPercent(stats.adherence)}</small>
    </div>
    ${dates
      .map((localDate) => {
        const evaluation = evaluateHabitDay({
          habit,
          rules: state.rules,
          logs: state.logs,
          exceptions: state.exceptions,
          localDate,
        });
        return renderWeekCell(localDate, evaluation.status, evaluation.log?.numericValue ?? null, evaluation.rule?.unit ?? habit.unit);
      })
      .join("")}
  `;
}

function renderWeekCell(localDate: string, status: DayStatus, numericValue: number | null, unit: string): string {
  const symbols: Record<DayStatus, string> = {
    success: icon("check", 18),
    "off-target": "!",
    missed: "×",
    pending: "·",
    upcoming: "",
    "not-scheduled": "",
  };
  const value = numericValue !== null ? `<small>${formatValue(numericValue)}${unit ? ` ${escapeHtml(unit)}` : ""}</small>` : "";
  return `<button class="week-cell status-${status}" data-action="open-date" data-date="${localDate}" title="${status.replace("-", " ")}"><span>${symbols[status]}</span>${value}</button>`;
}

function renderMonth(state: AppState, habits: Habit[], start: string, end: string): string {
  const gridStart = startOfWeek(start, state.settings.weekStartsOn);
  const gridEnd = endOfWeek(end, state.settings.weekStartsOn);
  const dates = dateRange(gridStart, gridEnd);
  const weekdayOrder = dateRange(gridStart, addDays(gridStart, 6));
  return `
    <div class="month-layout">
      <section class="section-block month-calendar-card">
        <div class="section-heading"><div><p class="eyebrow">Month map</p><h2>Daily consistency</h2></div></div>
        <div class="month-calendar">
          ${weekdayOrder
            .map((date) => `<span class="month-weekday">${new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(parseDateKey(date))}</span>`)
            .join("")}
          ${dates.map((date) => renderMonthDay(state, habits, date, start)).join("")}
        </div>
      </section>
      <section class="section-block month-ranking">
        <div class="section-heading"><div><p class="eyebrow">By habit</p><h2>Monthly adherence</h2></div></div>
        <div class="habit-progress-list">
          ${habits
            .map((habit) => {
              const stats = periodStats({
                habit,
                rules: state.rules,
                logs: state.logs,
                exceptions: state.exceptions,
                start,
                end,
              });
              const percent = Math.round((stats.adherence ?? 0) * 100);
              return `<article style="--habit-color:${habit.color}"><div><strong>${escapeHtml(habit.name)}${habit.optional ? '<em class="inline-optional">Optional</em>' : ""}</strong><span>${stats.successful} of ${stats.successful + stats.missed} met</span></div><b>${habit.optional ? "Optional" : formatPercent(stats.adherence)}</b><div class="progress-track"><i style="width:${percent}%"></i></div></article>`;
            })
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderMonthDay(state: AppState, habits: Habit[], localDate: string, monthStart: string): string {
  const evaluations = habits.filter((habit) => !habit.optional).map((habit) =>
    evaluateHabitDay({
      habit,
      rules: state.rules,
      logs: state.logs,
      exceptions: state.exceptions,
      localDate,
    }),
  );
  const applicable = evaluations.filter(
    (item) => item.applicable && item.status !== "upcoming" && item.status !== "pending",
  );
  const successes = applicable.filter((item) => item.successful).length;
  const ratio = applicable.length ? successes / applicable.length : null;
  const tone = ratio === null ? "empty" : ratio === 1 ? "perfect" : ratio >= 0.5 ? "partial" : "low";
  const outside = localDate.slice(0, 7) !== monthStart.slice(0, 7);
  return `<button class="month-day ${tone} ${outside ? "outside" : ""} ${localDate === todayKey() ? "is-today" : ""}" data-action="open-date" data-date="${localDate}"><strong>${parseDateKey(localDate).getDate()}</strong><span>${ratio === null ? "" : `${successes}/${applicable.length}`}</span></button>`;
}
