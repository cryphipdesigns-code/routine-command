import type { AppState, Habit } from "../types";
import { combinedPeriodStats, evaluateHabitDay, periodStats } from "../domain/compliance";
import { addDays, dateRange, dayName, todayKey } from "../domain/dates";
import { escapeHtml, formatPercent, icon } from "../ui";
import { activeHabits, emptyState, pageIntro } from "./shared";
import { renderSignalSummary } from "./signal-summary";

export function renderTrends(state: AppState): string {
  const habits = activeHabits(state);
  const end = todayKey();
  const start = addDays(end, -29);
  const overall = combinedPeriodStats({
    habits,
    rules: state.rules,
    logs: state.logs,
    exceptions: state.exceptions,
    start,
    end,
  });
  const checkins = state.checkins.filter((item) => item.localDate >= start && item.localDate <= end);
  const moodAverage = average(checkins.map((item) => item.mood));
  const productivityAverage = average(checkins.map((item) => item.productivity));
  const perfectDays = dateRange(start, end).filter((localDate) => {
    const values = habits
      .filter((habit) => !habit.optional)
      .map((habit) => evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate }))
      .filter((item) => item.applicable && item.status !== "pending");
    return values.length > 0 && values.every((item) => item.successful);
  }).length;

  return `
    <div class="view-stack trends-view">
      ${pageIntro({
        eyebrow: "Last 30 days",
        title: "Momentum, not perfection",
        copy: "Use the pattern to adjust the plan—not to judge the day.",
      })}

      <section class="metric-strip trend-metrics">
        <article><span>Adherence</span><strong>${formatPercent(overall.adherence)}</strong><small>${overall.successful} habits met</small></article>
        <article><span>Perfect days</span><strong>${perfectDays}</strong><small>all scheduled habits</small></article>
        <article><span>Avg. mood</span><strong>${moodAverage ?? "—"}</strong><small>out of 5</small></article>
        <article><span>Avg. productivity</span><strong>${productivityAverage ?? "—"}</strong><small>out of 5</small></article>
      </section>

      ${habits.length ? renderHabitTrends(state, habits, start, end) : emptyState("Nothing to chart", "Your trends will appear after you add habits.")}

      ${renderSignalSummary(state, start, end, "30-day signal averages")}

      <div class="trend-lower-grid">
        ${renderCheckinChart(state, start, end)}
        ${renderObservations(state, habits, start, end)}
      </div>
    </div>
  `;
}

function renderHabitTrends(state: AppState, habits: Habit[], start: string, end: string): string {
  return `
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">Consistency</p><h2>Habit adherence</h2></div><span class="section-icon">${icon("trends", 19)}</span></div>
      <div class="trend-bars">
        ${habits
          .map((habit) => {
            const stats = periodStats({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, start, end });
            const percent = Math.round((stats.adherence ?? 0) * 100);
            return `<article style="--habit-color:${habit.color}"><div class="trend-bar-label"><span><i></i>${escapeHtml(habit.name)}${habit.optional ? '<em class="inline-optional">Optional</em>' : ""}</span><strong>${habit.optional ? "Optional" : formatPercent(stats.adherence)}</strong></div><div class="trend-track"><i style="width:${percent}%"></i></div><small>${stats.successful} met · ${stats.missed} missed${stats.pending ? ` · ${stats.pending} open` : ""}</small></article>`;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderCheckinChart(state: AppState, start: string, end: string): string {
  const dates = dateRange(start, end);
  const points = dates
    .map((date, index) => {
      const checkin = state.checkins.find((item) => item.localDate === date);
      if (checkin?.mood === null || checkin?.mood === undefined) return null;
      return { x: (index / (dates.length - 1)) * 280 + 10, y: 90 - ((checkin.mood - 1) / 4) * 70 };
    })
    .filter((point): point is { x: number; y: number } => point !== null);
  const pointString = points.map((point) => `${point.x},${point.y}`).join(" ");
  return `
    <section class="section-block checkin-chart-card">
      <div class="section-heading"><div><p class="eyebrow">Wellbeing</p><h2>Mood check-ins</h2></div></div>
      ${
        points.length > 1
          ? `<svg class="line-chart" viewBox="0 0 300 105" role="img" aria-label="Mood trend over thirty days"><path d="M10 20H290M10 55H290M10 90H290" class="chart-grid"/><polyline points="${pointString}"/><g>${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3"/>`).join("")}</g></svg><div class="chart-axis"><span>30 days ago</span><span>Today</span></div>`
          : `<div class="mini-empty"><p>Record mood on at least two days to see a line.</p></div>`
      }
    </section>
  `;
}

function renderObservations(state: AppState, habits: Habit[], start: string, end: string): string {
  const stats = habits.filter((habit) => !habit.optional).map((habit) => ({
    habit,
    stats: periodStats({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, start, end }),
  }));
  const withData = stats.filter((item) => item.stats.adherence !== null);
  const strongest = [...withData].sort((a, b) => (b.stats.adherence ?? 0) - (a.stats.adherence ?? 0))[0];
  const support = [...withData].sort((a, b) => (a.stats.adherence ?? 0) - (b.stats.adherence ?? 0))[0];
  const weekday = bestWeekday(state, habits, start, end);
  const observations = [
    strongest ? `<strong>${escapeHtml(strongest.habit.name)}</strong> is your steadiest habit at ${formatPercent(strongest.stats.adherence)}.` : "Log a few days to reveal your steadiest habit.",
    support && support.habit.id !== strongest?.habit.id ? `<strong>${escapeHtml(support.habit.name)}</strong> may need a smaller target or a better cue.` : "Your habits are moving together so far.",
    weekday ? `<strong>${weekday.name}</strong> is currently your strongest day at ${formatPercent(weekday.adherence)}.` : "More history will reveal weekday patterns.",
  ];
  return `
    <section class="section-block observations-card">
      <div class="section-heading"><div><p class="eyebrow">Early signals</p><h2>What stands out</h2></div><span class="section-icon">${icon("sparkles", 19)}</span></div>
      <div class="observation-list">${observations.map((item) => `<p>${icon("check", 16)}<span>${item}</span></p>`).join("")}</div>
      <small class="disclaimer">Descriptive patterns only. They do not establish cause and effect.</small>
    </section>
  `;
}

function bestWeekday(state: AppState, habits: Habit[], start: string, end: string): { name: string; adherence: number } | null {
  const buckets = Array.from({ length: 7 }, () => ({ success: 0, decided: 0 }));
  dateRange(start, end).forEach((localDate) => {
    const weekday = new Date(`${localDate}T12:00:00`).getDay();
    habits.forEach((habit) => {
      const result = evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate });
      if (!result.applicable || result.status === "pending" || result.status === "upcoming") return;
      const bucket = buckets[weekday];
      if (!bucket) return;
      bucket.decided += 1;
      if (result.successful) bucket.success += 1;
    });
  });
  const result = buckets
    .map((bucket, day) => ({ day, adherence: bucket.decided ? bucket.success / bucket.decided : null }))
    .filter((item): item is { day: number; adherence: number } => item.adherence !== null)
    .sort((a, b) => b.adherence - a.adherence)[0];
  return result ? { name: dayName(result.day, "long"), adherence: result.adherence } : null;
}

function average(values: Array<number | null>): string | null {
  const valid = values.filter((value): value is number => value !== null);
  if (!valid.length) return null;
  return (valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(1);
}
