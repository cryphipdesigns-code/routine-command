import type { AppState } from "../types";
import type { CloudSyncSnapshot } from "../data/cloud-sync";
import { escapeHtml, icon } from "../ui";
import { pageIntro } from "./shared";
import { renderNotificationSettings } from "./notifications";
import { renderTimeField } from "./time-fields";

export function renderSettings(state: AppState, sync: CloudSyncSnapshot): string {
  return `
    <div class="view-stack settings-view">
      ${pageIntro({
        eyebrow: "Preferences",
        title: "Settings",
        copy: sync.phase === "synced" ? "Your records are protected and synced across your devices." : "Your records stay on this device until you sign in to sync.",
      })}
      <section class="settings-grid">
        ${renderCloudSync(sync)}
        ${renderNotificationSettings(state)}
        <div class="section-block settings-card">
          <div class="section-heading"><div><p class="eyebrow">App</p><h2>Refresh Routine Command</h2></div></div>
          <p class="settings-note">On the Home Screen app, pull down from the top of any page. You can also refresh manually here.</p>
          <button class="secondary-button wide" data-action="refresh-app">${icon("refreshCw", 18)} Refresh app</button>
        </div>
        <div class="section-block settings-card">
          <div class="section-heading"><div><p class="eyebrow">Calendar</p><h2>Week and time</h2></div></div>
          <div class="setting-row"><div><strong>Week starts on</strong><span>Used by weekly review</span></div><div class="segmented-control small"><button data-action="week-start" data-value="1" class="${state.settings.weekStartsOn === 1 ? "active" : ""}">Monday</button><button data-action="week-start" data-value="0" class="${state.settings.weekStartsOn === 0 ? "active" : ""}">Sunday</button></div></div>
          <div class="setting-row"><div><strong>Local timezone</strong><span>Daily boundaries follow this device</span></div><span class="setting-value">${escapeHtml(state.settings.timezone)}</span></div>
        </div>

        <div class="section-block settings-card signal-target-settings">
          <div class="section-heading"><div><p class="eyebrow">Daily signals</p><h2>Optional targets</h2></div><span class="status-pill automatic">Not scored</span></div>
          <p class="settings-note">Targets add context to trends. Missing or outside-range data never lowers habit adherence.</p>
          <div class="signal-target-grid">
            <label class="field"><span>Calories at or below</span><input type="number" inputmode="numeric" min="0" step="1" data-signal-target="caloriesMax" value="${state.settings.signalTargets.caloriesMax ?? ""}" placeholder="No target" /></label>
            ${renderTimeField({ id: "target-wake", label: "Wake by", value: state.settings.signalTargets.wakeTimeLatest, attributes: 'data-signal-target="wakeTimeLatest"' })}
            ${renderTimeField({ id: "target-bed", label: "Bed by", value: state.settings.signalTargets.bedTimeLatest, attributes: 'data-signal-target="bedTimeLatest"' })}
          </div>
          <p class="settings-note">Bedtime targets cross midnight: 1 a.m. is later than a 9 p.m. target.</p>
        </div>

        <div class="section-block settings-card motivation-settings">
          <div class="section-heading"><div><p class="eyebrow">Motivation</p><h2>Reward vault</h2></div><span class="status-pill automatic">Rolling 7 days</span></div>
          <label class="field"><span>Personal reward</span><input type="text" data-setting="personalReward" value="${escapeHtml(state.settings.personalReward)}" maxlength="80" placeholder="e.g. Guilt-free movie night" /></label>
          <label class="field reward-target-field"><span>Unlock target</span><select data-setting="rewardTarget">
            ${[0.7, 0.8, 0.9, 1].map((target) => `<option value="${target}" ${state.settings.rewardTarget === target ? "selected" : ""}>${Math.round(target * 100)}% adherence</option>`).join("")}
          </select></label>
          <p class="settings-note">Unlocks after at least five eligible days in the last seven. Recovery counts; perfection is not required.</p>
          <div class="setting-row home-cue-row"><div><strong>Home Screen count</strong><span>Badge the app icon with required habits remaining</span></div>${state.settings.appBadgeEnabled ? '<button class="secondary-button small" data-action="disable-app-badge">Disable</button>' : '<button class="secondary-button small" data-action="enable-app-badge">Enable</button>'}</div>
          <p class="settings-note">Free widget alternative. On iPhone, enable this from the installed Home Screen app; Apple requires notification permission for icon badges.</p>
        </div>

        <div class="section-block settings-card">
          <div class="section-heading"><div><p class="eyebrow">Check-in</p><h2>Daily signals</h2></div></div>
          <label class="setting-row toggle-row"><div><strong>Track energy</strong><span>Add a third 1–5 daily rating</span></div><input type="checkbox" data-setting="showEnergy" ${state.settings.showEnergy ? "checked" : ""}/><i></i></label>
          <div class="setting-row"><div><strong>Habit card density</strong><span>Compact on phones and when your list grows</span></div><span class="status-pill automatic">Automatic</span></div>
        </div>

        <div class="section-block settings-card">
          <div class="section-heading"><div><p class="eyebrow">Data</p><h2>Backup and restore</h2></div></div>
          <div class="button-stack">
            <button class="secondary-button wide" data-action="export-data">${icon("download", 18)} Export JSON backup</button>
            <button class="secondary-button wide" data-action="import-data">${icon("upload", 18)} Import backup</button>
            <input id="importFile" type="file" accept="application/json" hidden />
          </div>
          <p class="settings-note">Imports replace the local Routine Command dataset after validation.</p>
        </div>

        <div class="section-block settings-card integration-card">
          <div class="section-heading"><div><p class="eyebrow">Coming later</p><h2>Connected health</h2></div><span class="status-pill">Planned</span></div>
          <p>Apple Health and Health Connect will remain optional. Imported values will always show their source.</p>
          <div class="integration-preview"><span>${icon("heart", 20)} Apple Health</span><span>${icon("activity", 20)} Health Connect</span></div>
        </div>
      </section>

      <section class="danger-zone surface">
        <div><strong>Reset Routine Command</strong><span>Erase local records and restore the example habits.</span></div>
        <button class="danger-button" data-action="reset-data">Reset local data</button>
      </section>
    </div>
  `;
}

export function renderCloudSync(sync: CloudSyncSnapshot): string {
  const isSignedIn = sync.phase === "synced" || sync.phase === "syncing" || (sync.phase === "error" && Boolean(sync.email));
  const pillLabel = sync.phase === "synced" ? "Synced" : sync.phase === "syncing" ? "Syncing" : sync.phase === "error" ? "Needs attention" : "Local only";
  const pillClass = sync.phase === "synced" ? " synced" : sync.phase === "error" ? " error" : "";
  const controls = isSignedIn
    ? `<div class="button-stack"><button class="secondary-button wide" data-action="sync-now">${icon("activity", 18)} Sync now</button><button class="secondary-button wide" data-action="sign-out">Sign out</button></div>`
    : sync.phase === "unconfigured"
      ? `<p class="settings-note">Cloud sync will activate in the deployed build.</p>`
      : `<form id="syncForm" class="sync-form"><label class="field"><span>Email</span><input type="email" name="email" value="${escapeHtml(sync.email ?? "")}" autocomplete="email" placeholder="you@example.com" required /></label><button class="primary-button" type="submit">Email me a sign-in link</button></form><div class="auth-divider"><span>Already have a code?</span></div><form id="syncCodeForm" class="sync-form sync-code-form"><label class="field"><span>Email</span><input type="email" name="email" value="${escapeHtml(sync.email ?? "")}" autocomplete="email" placeholder="you@example.com" required /></label><label class="field"><span>Code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8" placeholder="12345678" required /></label><button class="secondary-button" type="submit">Verify code</button></form>`;
  return `
    <div class="section-block settings-card sync-card" data-cloud-sync-card>
      <div class="section-heading"><div><p class="eyebrow">Private cloud</p><h2>Device sync</h2></div><span class="status-pill${pillClass}">${pillLabel}</span></div>
      <p class="sync-message">${escapeHtml(sync.message)}</p>
      ${sync.email && isSignedIn ? `<p class="sync-account">${escapeHtml(sync.email)}</p>` : ""}
      ${controls}
    </div>
  `;
}
