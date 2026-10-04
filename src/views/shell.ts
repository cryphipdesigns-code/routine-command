import type { AppState, ViewId } from "../types";
import type { CloudSyncSnapshot } from "../data/cloud-sync";
import { icon } from "../ui";
import { renderHabits } from "./habits";
import { renderReview } from "./review";
import { renderSettings } from "./settings";
import { renderToday } from "./today";
import { renderTrends } from "./trends";

const navigation: Array<{ id: ViewId; label: string; kicker: string }> = [
  { id: "today", label: "Today", kicker: "Daily action" },
  { id: "review", label: "Review", kicker: "Week & month" },
  { id: "trends", label: "Trends", kicker: "Patterns" },
  { id: "habits", label: "Habits", kicker: "Your system" },
  { id: "settings", label: "Settings", kicker: "Preferences" },
];

export function renderShell(state: AppState, sync: CloudSyncSnapshot): string {
  const automaticCompact = state.habits.filter((habit) => !habit.archivedAt).length >= 6;
  return `
    <div class="app-frame ${automaticCompact ? "compact-mode" : ""}">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark"><i></i><i></i><i></i></span>
          <div><strong>Routine Command</strong><span>Build momentum</span></div>
        </div>
        <nav class="sidebar-nav" aria-label="Primary navigation">
          ${navigation
            .map(
              (item) => `<button data-view="${item.id}" class="${state.activeView === item.id ? "active" : ""}"><span class="nav-icon">${icon(item.id, 20)}</span><span><strong>${item.label}</strong><small>${item.kicker}</small></span></button>`,
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          ${renderSyncStatus(sync)}
        </div>
      </aside>
      <main class="app-main">
        <header class="mobile-header">
          <div class="brand compact"><span class="brand-mark"><i></i><i></i><i></i></span><strong>Routine Command</strong></div>
          <button class="icon-button" data-view="settings" aria-label="Settings">${icon("settings", 20)}</button>
        </header>
        <div class="view-container">${renderActiveView(state, sync)}</div>
      </main>
      <nav class="bottom-nav" aria-label="Primary navigation">
        ${navigation
          .filter((item) => item.id !== "settings")
          .map(
            (item) => `<button data-view="${item.id}" class="${state.activeView === item.id ? "active" : ""}">${icon(item.id, 21)}<span>${item.label}</span></button>`,
          )
          .join("")}
      </nav>
      <div id="modalRoot"></div>
      <div id="toastRoot" aria-live="polite"></div>
      <div class="offline-banner" hidden>${icon("wifiOff", 16)} Offline — changes stay on this device</div>
    </div>
  `;
}

function renderActiveView(state: AppState, sync: CloudSyncSnapshot): string {
  switch (state.activeView) {
    case "today":
      return renderToday(state);
    case "review":
      return renderReview(state);
    case "trends":
      return renderTrends(state);
    case "habits":
      return renderHabits(state);
    case "settings":
      return renderSettings(state, sync);
  }
}

function renderSyncStatus(sync: CloudSyncSnapshot): string {
  const syncing = sync.phase === "syncing" || sync.phase === "sending-link";
  const title = sync.phase === "synced" ? "Cloud synced" : syncing ? "Syncing" : "Saved locally";
  const detail = sync.phase === "synced" ? sync.email ?? "Private account" : "Offline-ready";
  const className = sync.phase === "error" ? " error" : syncing ? " syncing" : "";
  return `<span class="local-status${className}"><i></i><span><strong>${title}</strong><small>${detail}</small></span></span>`;
}
