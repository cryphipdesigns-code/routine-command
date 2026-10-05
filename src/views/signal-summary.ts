import type { AppState, DailyCheckin } from "../types";
import { averageTime, formatSignalTime, isTimeAtOrBefore } from "../domain/signals";
import { escapeHtml, icon } from "../ui";

export function renderSignalSummary(
  state: AppState,
  start: string,
  end: string,
  title: string,
): string {
  const checkins = state.checkins.filter(
    (checkin) => checkin.localDate >= start && checkin.localDate <= end,
  );
  const wakeValues = checkins.map((checkin) => checkin.wakeTime).filter(isPresent);
  const bedValues = checkins.map((checkin) => checkin.bedTime).filter(isPresent);
  const calorieValues = checkins.map((checkin) => checkin.calories).filter(isNumber);
  const targets = state.settings.signalTargets;
  const wakeAverage = averageTime(wakeValues);
  const bedAverage = averageTime(bedValues, true);
  const calorieAverage = calorieValues.length
    ? Math.round(calorieValues.reduce((sum, value) => sum + value, 0) / calorieValues.length)
    : null;

  return `
    <section class="section-block signal-summary-card">
      <div class="section-heading">
        <div><p class="eyebrow">Daily signals</p><h2>${escapeHtml(title)}</h2></div>
        <span class="status-pill automatic">Not scored</span>
      </div>
      <div class="signal-summary-grid">
        ${summaryItem(
          "sun",
          "Wake time",
          wakeAverage ? formatSignalTime(wakeAverage) : "—",
          targetLine(
            wakeValues,
            targets.wakeTimeLatest,
            (value, target) => isTimeAtOrBefore(value, target),
            (target) => `By ${formatSignalTime(target)}`,
          ),
          wakeValues.length,
        )}
        ${summaryItem(
          "moon",
          "Bedtime",
          bedAverage ? formatSignalTime(bedAverage) : "—",
          targetLine(
            bedValues,
            targets.bedTimeLatest,
            (value, target) => isTimeAtOrBefore(value, target, true),
            (target) => `By ${formatSignalTime(target)}`,
          ),
          bedValues.length,
        )}
        ${summaryItem(
          "apple",
          "Calories",
          calorieAverage === null ? "—" : new Intl.NumberFormat().format(calorieAverage),
          calorieTargetLine(calorieValues, targets.caloriesMax),
          calorieValues.length,
          calorieAverage === null ? "" : "kcal avg",
        )}
      </div>
      <p class="signal-summary-note">Missing entries remain unknown and never reduce habit adherence.</p>
    </section>
  `;
}

function summaryItem(
  iconName: string,
  label: string,
  value: string,
  target: string,
  recorded: number,
  suffix = "average",
): string {
  return `<article class="signal-summary-item">
    <span class="signal-summary-icon">${icon(iconName, 18)}</span>
    <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(suffix)}</small></div>
    <p>${escapeHtml(target)}</p>
    <em>${recorded} ${recorded === 1 ? "day" : "days"} recorded</em>
  </article>`;
}

function targetLine(
  values: string[],
  target: string | null,
  matches: (value: string, target: string) => boolean,
  describe: (target: string) => string,
): string {
  if (!target) return "No target set";
  if (!values.length) return `${describe(target)} target · no data`;
  const hits = values.filter((value) => matches(value, target)).length;
  return `${hits}/${values.length} in range · ${describe(target)}`;
}

function calorieTargetLine(values: number[], target: number | null): string {
  if (target === null) return "No target set";
  if (!values.length) return `≤ ${new Intl.NumberFormat().format(target)} kcal target · no data`;
  const hits = values.filter((value) => value <= target).length;
  return `${hits}/${values.length} in range · ≤ ${new Intl.NumberFormat().format(target)} kcal`;
}

function isPresent(value: string | null): value is string {
  return Boolean(value);
}

function isNumber(value: DailyCheckin["calories"]): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
