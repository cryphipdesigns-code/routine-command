import type { AppState, ExerciseDetails, Habit } from "../types";
import { evaluateHabitDay, ruleForDate, targetLabel } from "../domain/compliance";
import { formatDayHeading, isFuture, isToday, parseDateKey } from "../domain/dates";
import { momentumSummary } from "../domain/momentum";
import { formatSignalTime, isTimeAtOrBefore } from "../domain/signals";
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
  const exempt = resting.filter(({ habit, evaluation }) => evaluation.rule && state.exceptions.some(
    (item) => item.habitId === habit.id && item.localDate === state.selectedDate && !item.applicable,
  ));
  const normalResting = resting.filter((item) => !exempt.includes(item));
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
        action: habits.length ? `<button class="secondary-button" data-action="day-exception">${icon("today", 18)} Exceptions</button>` : "",
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
              ? renderTodayHabitGroups(state, scheduled)
              : emptyState("A clear day", "Nothing is scheduled. Rest is part of a sustainable plan.")
          }
        </div>
      </section>

      ${exempt.length ? `<section class="section-block exempt-panel"><div class="section-heading"><div><p class="eyebrow">Adjusted plan</p><h2>Exempt / allowed today</h2></div><span class="section-count">${exempt.length}</span></div><div class="exempt-list">${exempt.map(({ habit, evaluation }) => {
        const exception = state.exceptions.find((item) => item.habitId === habit.id && item.localDate === state.selectedDate)!;
        return `<article class="exempt-habit" data-exempt-habit-id="${habit.id}"><div><strong>${escapeHtml(habit.name)}</strong><small>${evaluation.rule?.direction === "avoid" ? "Allowed day" : "Exempt day"}${exception.reason ? ` · ${escapeHtml(exception.reason)}` : ""} · Not scored</small></div><button class="secondary-button small" data-action="day-exception" data-habit-id="${habit.id}" aria-label="Edit exception: ${escapeHtml(habit.name)}">Edit</button></article>`;
      }).join("")}</div></section>` : ""}

      ${isToday(state.selectedDate) ? renderMomentum(state) : ""}

      ${renderSignals(state)}

      ${
        normalResting.length
          ? `<details class="surface resting-panel">
              <summary><span>${icon("moon", 18)} Not scheduled</span><span>${normalResting.length}</span></summary>
              <div class="resting-list">${normalResting
                .map(({ habit }) => `<button data-action="day-exception" data-habit-id="${habit.id}" aria-label="Day exception: ${escapeHtml(habit.name)}">${escapeHtml(habit.name)}</button>`)
                .join("")}</div>
            </details>`
          : ""
      }
    </div>
  `;
}

function renderTodayHabitGroups(
  state: AppState,
  items: Array<{ habit: Habit; evaluation: { status: string } }>,
): string {
  return (["build", "avoid"] as const)
    .map((direction) => {
      const directionItems = items.filter((item) => item.habit.direction === direction);
      if (!directionItems.length) return "";
      const required = directionItems.filter((item) => !item.habit.optional);
      const optional = directionItems.filter((item) => item.habit.optional);
      return `
        <div class="habit-group" data-habit-group="${direction}">
          <div class="habit-group-heading">
            <span>${icon(direction === "build" ? "plus" : "shield", 16)} ${direction === "build" ? "Build" : "Avoid"}</span>
            <small>${directionItems.length}</small>
          </div>
          ${required.map(({ habit, evaluation }) => renderHabitCheck(state, habit, evaluation.status)).join("")}
          ${
            optional.length
              ? `<div class="habit-subgroup-label"><span>Optional</span></div>${optional
                  .map(({ habit, evaluation }) => renderHabitCheck(state, habit, evaluation.status))
                  .join("")}`
              : ""
          }
        </div>
      `;
    })
    .join("");
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
  const exception = state.exceptions.find((item) => item.habitId === habit.id && item.localDate === state.selectedDate);

  return `
    <article class="habit-check habit-status-${status}" data-habit-card-id="${habit.id}" style="--habit-color: ${habit.color}">
      <div class="habit-symbol">${icon(habit.icon, 21)}</div>
      <div class="habit-check-copy">
        <div class="habit-name-line"><h3>${escapeHtml(habit.name)}</h3>${isAvoid ? '<span class="direction-badge">Avoid</span>' : ""}${habit.optional ? '<span class="optional-badge">Optional</span>' : ""}</div>
        <p>${escapeHtml(targetLabel(habit, rule))}</p>
        <div class="habit-day-meta"><span class="habit-state-label">${escapeHtml(!isAvoid && rule.inputType === "boolean" && isSlip ? "Skipped" : habitStatusText(isAvoid, status))}</span><button class="day-plan-button ${exception ? "has-exception" : ""}" data-action="day-exception" data-habit-id="${habit.id}" aria-label="Day exception: ${escapeHtml(habit.name)}">${exception ? `Added to this day${exception.reason ? ` · ${escapeHtml(exception.reason)}` : ""}` : "Day exception"}</button>${!isAvoid && rule.inputType === "boolean" && !isComplete ? `<button class="day-plan-button skip-plan-button" data-action="set-boolean" data-value="false" data-habit-id="${habit.id}" aria-label="${isSlip ? "Undo skip" : "Skip today"}: ${escapeHtml(habit.name)}" ${disabled ? "disabled" : ""}>${isSlip ? "Undo skip" : "Skip today"}</button>` : ""}</div>
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

function renderSignals(state: AppState): string {
  const checkin = state.checkins.find((item) => item.localDate === state.selectedDate);
  const targets = state.settings.signalTargets;
  return `
    <section class="section-block daily-checkin daily-signals">
      <div class="section-heading">
        <div><p class="eyebrow">Daily signals</p><h2>Observe the pattern</h2></div>
        <span class="status-pill automatic">Not scored</span>
      </div>
      <p class="signal-intro">Record what happened when it is useful. Missing data never counts against the day.</p>
      <div class="signal-entry-grid">
        ${renderTimeSignal(
          "wakeTime",
          "Wake time",
          "Today",
          "sun",
          checkin?.wakeTime ?? null,
          targets.wakeTimeLatest,
          false,
        )}
        ${renderTimeSignal(
          "bedTime",
          "Bedtime",
          "Last night",
          "moon",
          checkin?.bedTime ?? null,
          targets.bedTimeLatest,
          true,
        )}
        ${renderCaloriesSignal(checkin?.calories ?? null, targets.caloriesMax)}
      </div>
      <div class="checkin-grid signal-rating-grid">
        ${renderScale("Mood", "mood", checkin?.mood ?? null)}
        ${renderScale("Productivity", "productivity", checkin?.productivity ?? null)}
        ${state.settings.showEnergy ? renderScale("Energy", "energy", checkin?.energy ?? null) : ""}
      </div>
      <label class="note-field">
        <span>One-line note <small>optional</small></span>
        <textarea data-checkin-note rows="2" maxlength="240" placeholder="What shaped the day?">${escapeHtml(checkin?.note ?? "")}</textarea>
      </label>
    </section>
  `;
}

function renderTimeSignal(
  field: "wakeTime" | "bedTime",
  label: string,
  context: string,
  iconName: string,
  value: string | null,
  target: string | null,
  bedtime: boolean,
): string {
  const status = !value
    ? { tone: "empty", label: "Not recorded" }
    : !target
      ? { tone: "recorded", label: "Recorded" }
      : isTimeAtOrBefore(value, target, bedtime)
        ? { tone: "in-range", label: "In range" }
        : { tone: "outside", label: "Outside target" };
  return `<label class="signal-entry-card">
    <span class="signal-entry-heading"><i class="time-icon ${field === "wakeTime" ? "wake" : "bed"}">${icon(iconName, 18)}</i><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(context)}</small></span></span>
    <input type="time" data-checkin-time="${field}" value="${escapeHtml(value ?? "")}" aria-label="${escapeHtml(label)}" />
    <span class="signal-entry-meta"><em class="signal-reading-status ${status.tone}">${status.label}</em><small>${target ? `Target by ${escapeHtml(formatSignalTime(target))}` : "No target"}</small></span>
  </label>`;
}

function renderCaloriesSignal(value: number | null, target: number | null): string {
  const status = value === null
    ? { tone: "empty", label: "Not recorded" }
    : target === null
      ? { tone: "recorded", label: "Recorded" }
      : value <= target
        ? { tone: "in-range", label: "In range" }
        : { tone: "outside", label: "Above target" };
  return `<label class="signal-entry-card">
    <span class="signal-entry-heading"><i class="time-icon calories">${icon("apple", 18)}</i><span><strong>Calories</strong><small>Daily total</small></span></span>
    <span class="signal-number-input"><input type="number" inputmode="numeric" min="0" step="1" data-checkin-calories value="${value ?? ""}" aria-label="Calories consumed" placeholder="—"/><small>kcal</small></span>
    <span class="signal-entry-meta"><em class="signal-reading-status ${status.tone}">${status.label}</em><small>${target === null ? "No target" : `Target ≤ ${new Intl.NumberFormat().format(target)}`}</small></span>
  </label>`;
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
