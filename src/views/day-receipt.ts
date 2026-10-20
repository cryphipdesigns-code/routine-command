import type { AppState } from "../types";
import { dayProgress } from "../domain/day-progress";
import { formatDayHeading, isToday } from "../domain/dates";
import { escapeHtml, icon } from "../ui";

export function renderDayReceipt(state: AppState, message: string, rare: boolean): string {
  const day = dayProgress(state, state.selectedDate);
  return `<div class="day-secured-backdrop"></div>
    <section class="celebration day-secured-celebration ${rare ? "rare" : ""}" role="dialog" aria-modal="true" aria-labelledby="daySecuredTitle" aria-describedby="daySecuredMessage">
      <div class="day-seal" aria-hidden="true">
        <svg class="day-seal-ring" viewBox="0 0 112 112"><circle class="seal-track" cx="56" cy="56" r="49"/><circle class="seal-finish" cx="56" cy="56" r="49"/></svg>
        <span>${icon("shield", 43)}</span>
      </div>
      <p class="eyebrow">Ring closed. Day locked in.</p>
      <h2 id="daySecuredTitle">Day secured</h2>
      <p class="day-secured-date">${escapeHtml(formatDayHeading(state.selectedDate))}</p>
      <p class="day-secured-mantra">You kept your word ${isToday(state.selectedDate) ? "today" : "that day"}.</p>
      <div class="day-receipt-checks">
        ${day.buildTotal ? `<div>${icon("check", 18)}<span>Build actions completed</span><strong>${day.buildCompleted}/${day.buildTotal}</strong></div>` : ""}
        ${day.avoidTotal ? `<div>${icon("shield", 18)}<span>Avoid boundaries held</span><strong>${day.avoidCompleted}/${day.avoidTotal}</strong></div>` : ""}
        ${day.optionalCompleted ? `<div>${icon("sparkles", 18)}<span>Optional bonus wins</span><strong>+${day.optionalCompleted}</strong></div>` : ""}
      </div>
      <p id="daySecuredMessage" class="day-secured-message">${escapeHtml(message || "Every required box checked. Take the win. This day belongs on the board.")}</p>
      <button class="primary-button wide" data-action="dismiss-day-receipt">${icon("check", 19)} Day well done</button>
      <small class="day-secured-footnote">Saved with your check-ins. You can correct an entry later.</small>
      <i class="spark spark-one"></i><i class="spark spark-two"></i><i class="spark spark-three"></i><i class="spark spark-four"></i>
    </section>`;
}
