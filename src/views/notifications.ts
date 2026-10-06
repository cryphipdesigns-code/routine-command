import type { AppState } from "../types";
import { coachQuotes, defaultNotifications } from "../domain/notifications";
import { escapeHtml, icon } from "../ui";
import { renderTimeField } from "./time-fields";

export function renderNotificationSettings(state: AppState): string {
  const settings = state.settings.notifications;
  return `<div class="section-block settings-card notification-settings">
    <div class="section-heading"><div><p class="eyebrow">Accountability</p><h2>Command notifications</h2></div><span class="status-pill ${settings.enabled ? "synced" : ""}">${settings.enabled ? "On" : "Off"}</span></div>
    <p class="settings-note">Direct challenges, honest receipts, and a next action. Optional habits, exemptions, and Daily Signals are excluded.</p>
    <p class="push-device-status" data-push-device-status>Checking this device…</p>
    <div class="button-stack"><button class="primary-button wide" data-action="enable-push">${icon("today", 18)} ${settings.enabled ? "Enable this device" : "Enable push notifications"}</button><button class="secondary-button wide" data-action="test-push" ${!settings.enabled ? "disabled" : ""}>Send test notification</button>${settings.enabled ? '<button class="secondary-button wide" data-action="disable-push">Turn off push notifications</button>' : ""}</div>
    <div class="notification-options">
      ${toggle("evening", "Evening Build check-in", "Only when required Build habits are still unconfirmed", settings.evening)}
      ${notificationTime("eveningTime", "Evening reminder time", settings.eveningTime)}
      ${toggle("slips", "Avoid slip response", "After an applicable Avoid habit is explicitly logged as a slip", settings.slips)}
      ${toggle("skips", "Build skip response", "After you explicitly mark a Build habit skipped", settings.skips)}
      ${toggle("trends", "Pattern intervention", "3+ skipped, off-target, or unconfirmed scheduled days in the last 7", settings.trends)}
      ${notificationTime("trendTime", "Pattern reminder time", settings.trendTime)}
      <label class="field"><span>Coaching intensity</span><select data-notification-setting="tone"><option value="relentless" ${settings.tone === "relentless" ? "selected" : ""}>Relentless — blunt challenges and roasts</option><option value="direct" ${settings.tone === "direct" ? "selected" : ""}>Direct — firm accountability</option></select></label>
      ${toggle("quotes", "Sourced motivational quotes", "Eric Thomas gets extra weight; original challenges are labeled separately", settings.quotes)}
      ${toggle("showHabitNames", "Show habit names on Lock Screen", "Turn off for more private notification previews", settings.showHabitNames)}
      <div class="notification-time-grid">${notificationTime("quietStart", "Quiet hours start", settings.quietStart)}${notificationTime("quietEnd", "Quiet hours end", settings.quietEnd)}</div>
    </div>
    <p class="settings-note">Uses ${escapeHtml(state.settings.timezone)}. Up to 4 pushes per device per day. Scheduled checks run every 5 minutes. Missing data is called “unconfirmed”; logged skips and slips are called out directly. Quiet-hour slips can wait until morning.</p>
    <details class="quote-sources"><summary>Quotes and sources</summary><p class="settings-note">Challenges and roasts are original Routine Command copy. Quotes are short verified excerpts, with no suggestion that these speakers endorse the app.</p>${coachQuotes.map((quote) => `<blockquote><p>“${escapeHtml(quote.text)}”</p><cite>${escapeHtml(quote.author)} · <a href="${escapeHtml(quote.source)}" target="_blank" rel="noopener noreferrer">Source</a></cite></blockquote>`).join("")}</details>
  </div>`;
}

function notificationTime(key: "eveningTime" | "trendTime" | "quietStart" | "quietEnd", label: string, value: string): string {
  return renderTimeField({ id: `notification-${key}`, label, value, attributes: `data-notification-setting="${key}"`, defaultValue: defaultNotifications[key] });
}

function toggle(key: string, title: string, description: string, checked: boolean): string {
  return `<label class="setting-row toggle-row"><div><strong>${title}</strong><span>${description}</span></div><input type="checkbox" data-notification-setting="${key}" ${checked ? "checked" : ""} /><i></i></label>`;
}
