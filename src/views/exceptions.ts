import type { AppState } from "../types";
import { isRuleScheduled, ruleForDate } from "../domain/compliance";
import { formatDayHeading } from "../domain/dates";
import { escapeHtml, icon } from "../ui";
import { activeHabits } from "./shared";

export function exceptionScheduleText(state: AppState, habitId: string, localDate: string): string {
  const rule = ruleForDate(state.rules, habitId, localDate);
  if (!rule) return "This habit is not active on this date. Choose a date after it starts and before it is archived.";
  const scheduled = isRuleScheduled(rule, localDate);
  const plan = rule.direction === "avoid"
    ? scheduled ? "an Avoid day" : "an allowed day"
    : scheduled ? "scheduled" : "a rest day";
  return `${formatDayHeading(localDate)} · Normally ${plan}`;
}

export function renderExceptionModal(state: AppState, habitId: string, localDate: string): string {
  const habits = activeHabits(state);
  const exception = state.exceptions.find((item) => item.habitId === habitId && item.localDate === localDate);
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <section class="modal-card exception-modal" role="dialog" aria-modal="true" aria-labelledby="exceptionModalTitle">
      <header><div><p class="eyebrow">Plan around life</p><h2 id="exceptionModalTitle">Day exception</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 20)}</button></header>
      <form id="exceptionForm">
        <div class="field"><label for="exceptionHabit">Habit</label><select id="exceptionHabit" name="habitId">${habits.map((habit) => `<option value="${escapeHtml(habit.id)}" ${habit.id === habitId ? "selected" : ""}>${escapeHtml(habit.name)}</option>`).join("")}</select></div>
        <label class="field"><span>Exception date</span><input type="date" name="localDate" value="${localDate}" required /></label>
        <p class="version-note" id="exceptionSchedule">${escapeHtml(exceptionScheduleText(state, habitId, localDate))}</p>
        <label class="field"><span>Plan for this date</span><select name="applicable">
          <option value="normal" ${!exception ? "selected" : ""}>Use normal schedule</option>
          <option value="exempt" ${exception?.applicable === false ? "selected" : ""}>Exempt / allowed day</option>
          <option value="require" ${exception?.applicable === true ? "selected" : ""}>Apply habit on this day</option>
        </select></label>
        <label class="field"><span>Reason <small>Optional</small></span><input name="reason" value="${escapeHtml(exception?.reason ?? "")}" placeholder="Holiday, work party, conference…" maxlength="120" /></label>
        <div class="exception-swap" ${!exception ? "hidden" : ""}>
          <label class="exception-swap-toggle"><input type="checkbox" name="swap" /><span><strong>Swap with another day</strong><small>The other date gets the opposite setting.</small></span></label>
          <div class="field exception-swap-date" hidden><label for="exceptionSwapDate">Swap date</label><input id="exceptionSwapDate" type="date" name="swapDate" aria-describedby="exceptionSwapHint" /><small class="field-hint" id="exceptionSwapHint">For a Sun / Mon allowance, exempt Monday and swap with Saturday. Sunday keeps its normal allowance.</small></div>
        </div>
        <p class="version-note">Exemptions are neutral: no missed check and no completion credit. Your regular schedule and saved entries are preserved. Choose “Use normal schedule” to remove an exception.</p>
        <footer><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">Save exception</button></footer>
      </form>
    </section>
  `;
}
