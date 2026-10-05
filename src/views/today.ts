import type { AppState, ExerciseDetails, Habit } from "../types";
import { evaluateHabitDay, ruleForDate, targetLabel } from "../domain/compliance";
import { formatDayHeading, isFuture, isToday, parseDateKey } from "../domain/dates";
import { momentumSummary } from "../domain/momentum";
import { escapeHtml, formatPercent, icon } from "../ui";
import { activeHabits, emptyState, pageIntro, statusText } from "./shared";

export function renderToday(state: AppState): string {
  const habits = activeHabits(state);
  const evaluations = habits.map((habit) => ({
    habit,
    evaluation: evaluateHabitDay({
      habit,
      rules: state.rules,
      logs: state.logs,
      exceptions: state.exceptions,
      localDate: state.selectedDate,
    }),
  }));
  const scheduled = evaluations.filter((item) => item.evaluation.applicable);
  const resting = evaluations.filter((item) => !item.evaluation.applicable);
  const required = scheduled.filter((item) => !item.habit.optional);
  const complete = required.filter((item) => item.evaluation.successful).length;
  const progress = required.length ? complete / required.length : 0;
  const heading = isToday(state.selectedDate) ? "Today" : formatDayHeading(state.selectedDate);

  return `
    <div class="view-stack today-view">
      ${pageIntro({
        eyebrow: isToday(state.selectedDate) ? "Your day" : "Daily record",
        title: heading,
        copy: isToday(state.selectedDate)
          ? "One small check-in at a time."
          : "Review or update this day without changing the plan.",
      })}

      <section class="date-toolbar surface compact-surface" aria-label="Choose date">
        <button class="icon-button" data-action="shift-selected-date" data-amount="-1" aria-label="Previous day">${icon("chevronLeft")}</button>
        <button class="date-toolbar-label" data-action="selected-date-today">
          <strong>${escapeHtml(formatDayHeading(state.selectedDate))}</strong>
          <span>${isToday(state.selectedDate) ? "Today" : "Jump to today"}</span>
        </button>
        <button class="icon-button" data-action="shift-selected-date" data-amount="1" aria-label="Next day">${icon("chevronRight")}</button>
      </section>

      <section class="daily-progress surface">
        <div class="progress-ring" style="--progress: ${Math.round(progress * 360)}deg">
          <div><strong>${complete}</strong><span>of ${required.length}</span></div>
        </div>
        <div>
          <p class="eyebrow">Daily progress</p>
          <h2>${progress === 1 && required.length ? "Day secured" : required.length ? `${required.length - complete} left for this day` : "No required habits today"}</h2>
          <p>${scheduled.length ? "Optional habits never lower your adherence." : "No habits are scheduled for this day."}</p>
        </div>
      </section>

      <section class="section-block">
        <div class="section-heading">
          <div><p class="eyebrow">Habits</p><h2>Scheduled today</h2></div>
          <span class="section-count">${scheduled.length}</span>
        </div>
        <div class="habit-checklist">
          ${
            scheduled.length
              ? scheduled.map(({ habit, evaluation }) => renderHabitCheck(state, habit, evaluation.status)).join("")
              : emptyState("A clear day", "Nothing is scheduled. Rest is part of a sustainable plan.")
          }
        </div>
      </section>

      ${isToday(state.selectedDate) ? renderMomentum(state) : ""}

      ${renderCheckin(state)}

      ${
        resting.length
          ? `<details class="surface resting-panel">
              <summary><span>${icon("moon", 18)} Not scheduled</span><span>${resting.length}</span></summary>
              <div class="resting-list">${resting
                .map(({ habit }) => `<span>${escapeHtml(habit.name)}</span>`)
                .join("")}</div>
            </details>`
          : ""
      }
    </div>
  `;
}

function renderHabitCheck(state: AppState, habit: Habit, status: string): string {
  const evaluation = evaluateHabitDay({
    habit,
    rules: state.rules,
    logs: state.logs,
    exceptions: state.exceptions,
    localDate: state.selectedDate,
  });
  const rule = ruleForDate(state.rules, habit.id, state.selectedDate);
  if (!rule) return "";
  const disabled = isFuture(state.selectedDate);
  const isComplete = status === "success";
  const numericValue = evaluation.log?.numericValue;
  const exerciseDetails = evaluation.log?.exerciseDetails ?? null;
  const supportsExerciseDetails = habit.id === "habit-exercise";
  const isAvoid = rule.direction === "avoid";
  const isSlip = evaluation.log?.booleanValue === false;

  return `
    <article class="habit-check habit-status-${status}" data-habit-card-id="${habit.id}" style="--habit-color: ${habit.color}">
      <div class="habit-symbol">${icon(habit.icon, 21)}</div>
      <div class="habit-check-copy">
        <div class="habit-name-line"><h3>${escapeHtml(habit.name)}</h3>${isAvoid ? '<span class="direction-badge">Avoid</span>' : ""}${habit.optional ? '<span class="optional-badge">Optional</span>' : ""}</div>
        <p>${escapeHtml(targetLabel(habit, rule))}</p>
        <span class="habit-state-label">${escapeHtml(habitStatusText(isAvoid, status))}</span>
      </div>
      ${
        rule.inputType === "boolean"
          ? isAvoid
            ? `<div class="avoid-actions" role="group" aria-label="${escapeHtml(habit.name)} result">
                <button
                  class="completion-button avoid-success ${isComplete ? "is-complete" : ""}"
                  data-action="set-boolean"
                  data-value="true"
                  data-habit-id="${habit.id}"
                  aria-label="${isComplete ? "Undo stayed clear" : "Stayed clear"}: ${escapeHtml(habit.name)}"
                  aria-pressed="${isComplete}"
                  ${disabled ? "disabled" : ""}
                >${icon("check", 22)}</button>
                <button
                  class="slip-button ${isSlip ? "is-slip" : ""}"
                  data-action="set-boolean"
                  data-value="false"
                  data-habit-id="${habit.id}"
                  aria-label="${isSlip ? "Undo slip" : "Log slip"}: ${escapeHtml(habit.name)}"
                  aria-pressed="${isSlip}"
                  ${disabled ? "disabled" : ""}
                >${icon("close", 15)}</button>
              </div>`
            : `<button
                class="completion-button ${isComplete ? "is-complete" : ""}"
                data-action="set-boolean"
                data-value="true"
                data-habit-id="${habit.id}"
                aria-label="${isComplete ? "Undo" : "Complete"} ${escapeHtml(habit.name)}"
                aria-pressed="${isComplete}"
                ${disabled ? "disabled" : ""}
              >${icon("check", 24)}</button>`
          : `<label class="number-entry">
              <span class="sr-only">${escapeHtml(habit.name)} value</span>
              <input
                inputmode="decimal"
                type="number"
                step="any"
                min="0"
                data-numeric-log="${habit.id}"
                value="${numericValue === null || numericValue === undefined ? "" : numericValue}"
                placeholder="—"
                ${disabled ? "disabled" : ""}
              />
              <span>${escapeHtml(rule.unit)}</span>
            </label>`
      }
      ${supportsExerciseDetails ? renderExerciseDetails(habit, exerciseDetails, disabled) : ""}
    </article>
  `;
}

function renderMomentum(state: AppState): string {
  const momentum = momentumSummary(state);
  const reward = state.settings.personalReward.trim();
  return `
    <section class="momentum-card surface">
      <div class="momentum-copy">
        <p class="eyebrow">Seven-day momentum</p>
        <div class="rank-line"><h2>${escapeHtml(momentum.rank)}</h2><span>Command rank</span></div>
        <p>${momentum.adherence === null ? "Complete a few check-ins to establish your rhythm." : `${formatPercent(momentum.adherence)} adherence · ${momentum.securedDays} secured ${momentum.securedDays === 1 ? "day" : "days"}`}</p>
      </div>
      <div class="momentum-trail" aria-label="Seven-day momentum">
        ${momentum.days
          .map((day) => {
            const label = new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(parseDateKey(day.localDate));
            return `<span class="momentum-day ${day.tone}" title="${day.tone}"><i>${day.tone === "secured" ? icon("check", 14) : ""}</i><small>${label}</small></span>`;
          })
          .join("")}
      </div>
      ${
        reward
          ? `<div class="reward-vault ${momentum.rewardUnlocked ? "unlocked" : ""}">
              <span>${icon(momentum.rewardUnlocked ? "sparkles" : "target", 18)}</span>
              <div><strong>${momentum.rewardUnlocked ? "Reward unlocked" : "Reward vault"}</strong><small>${escapeHtml(reward)} · ${Math.round(state.settings.rewardTarget * 100)}% target</small></div>
            </div>`
          : ""
      }
    </section>
  `;
}

function habitStatusText(isAvoid: boolean, status: string): string {
  if (!isAvoid) return statusText(status);
  const values: Record<string, string> = {
    success: "Stayed clear",
    "off-target": "Slip logged",
    missed: "Not confirmed",
    pending: "Still open",
    upcoming: "Upcoming",
    "not-scheduled": "Not scheduled",
  };
  return values[status] ?? status;
}

function renderExerciseDetails(
  habit: Habit,
  details: ExerciseDetails | null,
  disabled: boolean,
): string {
  const types = ["", "Strength", "Run", "Walk", "Cycle", "HIIT", "Sports", "Mobility", "Other"];
  const summary = [
    details?.activityType,
    details?.durationMinutes !== null && details?.durationMinutes !== undefined
      ? `${details.durationMinutes} min`
      : "",
    details?.caloriesBurned !== null && details?.caloriesBurned !== undefined
      ? `${details.caloriesBurned} kcal`
      : "",
    details?.timeOfDay,
  ]
    .filter(Boolean)
    .join(" · ");
  const field = (name: keyof ExerciseDetails) =>
    `data-exercise-detail="${name}" data-habit-id="${habit.id}" ${disabled ? "disabled" : ""}`;

  return `
    <details class="exercise-details" data-exercise-details="${habit.id}">
      <summary>
        <span>${icon("activity", 17)} <strong>Workout details</strong></span>
        <span>${summary ? escapeHtml(summary) : "Optional"}</span>
      </summary>
      <div class="exercise-detail-grid">
        <label class="field"><span>Type</span><select ${field("activityType")}>
          ${types.map((type) => `<option value="${type}" ${details?.activityType === type ? "selected" : ""}>${type || "Choose type"}</option>`).join("")}
        </select></label>
        <label class="field"><span>Duration</span><span class="exercise-number"><input type="number" inputmode="numeric" min="0" step="1" value="${details?.durationMinutes ?? ""}" placeholder="0" ${field("durationMinutes")} /><small>min</small></span></label>
        <label class="field"><span>Calories burned</span><span class="exercise-number"><input type="number" inputmode="numeric" min="0" step="1" value="${details?.caloriesBurned ?? ""}" placeholder="0" ${field("caloriesBurned")} /><small>kcal</small></span></label>
        <label class="field"><span>Time of day</span><input type="time" value="${escapeHtml(details?.timeOfDay ?? "")}" ${field("timeOfDay")} /></label>
      </div>
    </details>
  `;
}

function renderCheckin(state: AppState): string {
  const checkin = state.checkins.find((item) => item.localDate === state.selectedDate);
  return `
    <section class="section-block daily-checkin">
      <div class="section-heading">
        <div><p class="eyebrow">Daily check-in</p><h2>How did the day feel?</h2></div>
        <span class="section-icon">${icon("heart", 19)}</span>
      </div>
      <div class="checkin-grid">
        ${renderScale("Mood", "mood", checkin?.mood ?? null)}
        ${renderScale("Productivity", "productivity", checkin?.productivity ?? null)}
        ${state.settings.showEnergy ? renderScale("Energy", "energy", checkin?.energy ?? null) : ""}
      </div>
      <div class="sleep-time-grid">
        <label class="time-field">
          <span class="time-icon wake">${icon("sun", 18)}</span>
          <span><strong>Wake up</strong><small>For this day</small></span>
          <input type="time" data-checkin-time="wakeTime" value="${escapeHtml(checkin?.wakeTime ?? "")}" aria-label="Wake up time" />
        </label>
        <label class="time-field">
          <span class="time-icon bed">${icon("moon", 18)}</span>
          <span><strong>Bedtime</strong><small>For this day</small></span>
          <input type="time" data-checkin-time="bedTime" value="${escapeHtml(checkin?.bedTime ?? "")}" aria-label="Bedtime" />
        </label>
      </div>
      <label class="note-field">
        <span>One-line note <small>optional</small></span>
        <textarea data-checkin-note rows="2" maxlength="240" placeholder="What shaped the day?">${escapeHtml(checkin?.note ?? "")}</textarea>
      </label>
    </section>
  `;
}

function renderScale(label: string, metric: string, value: number | null): string {
  const words = ["Low", "Rough", "Okay", "Good", "Great"];
  return `
    <div class="rating-row">
      <div class="rating-label"><strong>${label}</strong><span>${value ? words[value - 1] : "Not recorded"}</span></div>
      <div class="rating-scale" role="group" aria-label="${label} rating">
        ${[1, 2, 3, 4, 5]
          .map(
            (score) => `<button
              class="rating-button ${value === score ? "selected" : ""}"
              data-action="set-checkin"
              data-metric="${metric}"
              data-value="${score}"
              aria-pressed="${value === score}"
            >${score}</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}
