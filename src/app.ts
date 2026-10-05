import type { AppState, Comparator, ExerciseDetails, HabitDraft, InputType } from "./types";
import { CloudSyncController, type CloudSyncSnapshot } from "./data/cloud-sync";
import { ruleForDate } from "./domain/compliance";
import { addDays, dayName, todayKey } from "./domain/dates";
import { TrackerStore } from "./state/store";
import { escapeHtml, icon } from "./ui";
import { renderCloudSync } from "./views/settings";
import { renderShell, renderSyncStatus } from "./views/shell";

const HABIT_COLORS = ["#3867d6", "#0f9f82", "#d97706", "#db5c5c", "#7c5ce0", "#2485a8"];
const HABIT_ICONS = ["target", "book-open", "sun", "activity", "flame", "droplet", "moon", "heart"];

export class TrackerApp {
  private modalHabitId: string | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: TrackerStore,
    private readonly cloudSync: CloudSyncController,
  ) {}

  start(): void {
    this.store.subscribe(() => this.render());
    this.cloudSync.subscribe((snapshot) => this.updateCloudSync(snapshot));
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("change", (event) => this.handleChange(event));
    this.root.addEventListener("submit", (event) => this.handleSubmit(event));
    window.addEventListener("online", () => this.updateOnlineStatus());
    window.addEventListener("offline", () => this.updateOnlineStatus());
    this.render();
  }

  private render(): void {
    const openExerciseDetails = new Set(
      Array.from(this.root.querySelectorAll<HTMLDetailsElement>("[data-exercise-details][open]"))
        .map((details) => details.dataset.exerciseDetails)
        .filter((id): id is string => Boolean(id)),
    );
    this.root.innerHTML = renderShell(this.store.snapshot, this.cloudSync.snapshot);
    openExerciseDetails.forEach((habitId) => {
      const details = this.root.querySelector<HTMLDetailsElement>(
        `[data-exercise-details="${CSS.escape(habitId)}"]`,
      );
      if (details) details.open = true;
    });
    this.updateOnlineStatus();
    if (this.modalHabitId !== null) this.showHabitModal(this.modalHabitId || undefined);
  }

  private handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    const viewButton = target.closest<HTMLElement>("[data-view]");
    if (viewButton?.dataset.view) {
      this.modalHabitId = null;
      this.store.setActiveView(viewButton.dataset.view as AppState["activeView"]);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    const button = target.closest<HTMLElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;

    switch (action) {
      case "shift-selected-date":
        this.store.setSelectedDate(addDays(this.store.snapshot.selectedDate, Number(button.dataset.amount)));
        break;
      case "selected-date-today":
        this.store.setSelectedDate(todayKey());
        break;
      case "toggle-boolean":
        if (button.dataset.habitId) {
          this.store.setBooleanLog(button.dataset.habitId, this.store.snapshot.selectedDate, true);
          this.toast("Habit updated");
        }
        break;
      case "set-checkin":
        if (button.dataset.metric && button.dataset.value) {
          this.store.setCheckinMetric(
            this.store.snapshot.selectedDate,
            button.dataset.metric as "mood" | "productivity" | "energy",
            Number(button.dataset.value),
          );
        }
        break;
      case "review-mode":
        this.store.setReviewMode(button.dataset.mode === "month" ? "month" : "week");
        break;
      case "shift-review": {
        const amount = Number(button.dataset.amount);
        const days = this.store.snapshot.reviewMode === "week" ? amount * 7 : 0;
        if (days) {
          this.store.setReviewAnchor(addDays(this.store.snapshot.reviewAnchor, days));
        } else {
          const date = new Date(`${this.store.snapshot.reviewAnchor}T12:00:00`);
          date.setMonth(date.getMonth() + amount);
          this.store.setReviewAnchor(toLocalKey(date));
        }
        break;
      }
      case "review-today":
        this.store.setReviewAnchor(todayKey());
        break;
      case "open-date":
        if (button.dataset.date) {
          this.store.setSelectedDate(button.dataset.date);
          this.store.setActiveView("today");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        break;
      case "add-habit":
        this.openHabitModal();
        break;
      case "edit-habit":
        this.openHabitModal(button.dataset.habitId);
        break;
      case "archive-habit":
        if (button.dataset.habitId) {
          this.store.setHabitArchived(button.dataset.habitId, true);
          this.toast("Habit archived — history preserved");
        }
        break;
      case "restore-habit":
        if (button.dataset.habitId) {
          this.store.setHabitArchived(button.dataset.habitId, false);
          this.toast("Habit restored");
        }
        break;
      case "delete-habit":
        if (
          button.dataset.habitId &&
          window.confirm("Permanently delete this habit and all of its history? This cannot be undone.")
        ) {
          this.store.deleteHabit(button.dataset.habitId);
          this.toast("Habit permanently deleted");
        }
        break;
      case "close-modal":
        this.closeModal();
        break;
      case "all-weekdays":
        this.setModalWeekdays([1, 2, 3, 4, 5]);
        break;
      case "every-day":
        this.setModalWeekdays([0, 1, 2, 3, 4, 5, 6]);
        break;
      case "export-data":
        this.exportData();
        break;
      case "import-data":
        this.root.querySelector<HTMLInputElement>("#importFile")?.click();
        break;
      case "week-start":
        this.store.updateSettings({ weekStartsOn: button.dataset.value === "0" ? 0 : 1 });
        break;
      case "reset-data":
        if (window.confirm("Erase all Routine Command history and restore the example habits?")) {
          void this.store.reset().then(() => this.toast("Routine Command reset"));
        }
        break;
      case "sign-out":
        void this.cloudSync.signOut().then(() => this.toast("Signed out"));
        break;
      case "sync-now":
        void this.cloudSync.syncNow().then(() => this.toast("Sync checked"));
        break;
    }
  }

  private handleChange(event: Event): void {
    const input = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (input.matches("[data-numeric-log]")) {
      const habitId = input.getAttribute("data-numeric-log");
      if (habitId) {
        const value = input.value.trim() === "" ? null : Number(input.value);
        this.store.setNumericLog(habitId, this.store.snapshot.selectedDate, value);
        this.toast(value === null ? "Entry cleared" : "Value saved");
      }
      return;
    }
    if (input.matches("[data-exercise-detail]")) {
      const habitId = input.getAttribute("data-habit-id");
      const field = input.getAttribute("data-exercise-detail") as keyof ExerciseDetails | null;
      if (habitId && field) {
        const value =
          field === "durationMinutes" || field === "caloriesBurned"
            ? numberOrNull(input.value)
            : field === "timeOfDay"
              ? input.value || null
              : input.value;
        this.store.setExerciseDetail(habitId, this.store.snapshot.selectedDate, field, value);
      }
      return;
    }
    if (input.matches("[data-checkin-note]")) {
      this.store.setCheckinNote(this.store.snapshot.selectedDate, input.value.trim());
      return;
    }
    if (input.matches("[data-setting]")) {
      const setting = input.getAttribute("data-setting");
      if (setting === "showEnergy") {
        this.store.updateSettings({ [setting]: (input as HTMLInputElement).checked });
      }
      return;
    }
    if (input.matches("[data-checkin-time]")) {
      const field = input.getAttribute("data-checkin-time");
      if (field === "wakeTime" || field === "bedTime") {
        this.store.setCheckinTime(
          this.store.snapshot.selectedDate,
          field,
          input.value || null,
        );
      }
      return;
    }
    if (input.id === "importFile" && input instanceof HTMLInputElement) {
      const file = input.files?.[0];
      if (file) void this.importData(file);
      return;
    }
    if (input.name === "inputType") this.syncHabitFormType(input.value as InputType);
  }

  private handleSubmit(event: SubmitEvent): void {
    const form = event.target as HTMLFormElement;
    if (form.matches("#syncForm")) {
      event.preventDefault();
      const email = String(new FormData(form).get("email") ?? "").trim();
      if (!email) {
        this.toast("Enter your email address");
        return;
      }
      void this.cloudSync
        .sendSignInLink(email)
        .then((sent) => this.toast(sent ? "Sign-in email sent" : "Email could not be sent"));
      return;
    }
    if (form.matches("#syncCodeForm")) {
      event.preventDefault();
      const data = new FormData(form);
      const email = String(data.get("email") ?? "").trim();
      const code = String(data.get("code") ?? "").trim();
      if (!email || !code) {
        this.toast("Enter your email and sign-in code");
        return;
      }
      void this.cloudSync
        .verifyCode(email, code)
        .then((verified) => this.toast(verified ? "Signed in and synced" : "Code could not be verified"));
      return;
    }
    if (!form.matches("#habitForm")) return;
    event.preventDefault();
    const data = new FormData(form);
    const weekdays = data.getAll("weekdays").map(Number);
    const inputType = data.get("inputType") === "number" ? "number" : "boolean";
    const comparator = String(data.get("comparator") ?? "gte") as Comparator;
    const minimum = numberOrNull(data.get("targetMin"));
    const maximum = numberOrNull(data.get("targetMax"));
    const name = String(data.get("name") ?? "").trim();

    if (!name) {
      this.toast("Give the habit a name");
      return;
    }
    if (!weekdays.length) {
      this.toast("Choose at least one scheduled day");
      return;
    }
    if (inputType === "number" && !isTargetValid(comparator, minimum, maximum)) {
      this.toast("Add the target value needed for this rule");
      return;
    }

    const draft: HabitDraft = {
      id: this.modalHabitId || undefined,
      name,
      inputType,
      unit: String(data.get("unit") ?? ""),
      icon: String(data.get("icon") ?? "target"),
      color: String(data.get("color") ?? HABIT_COLORS[0]),
      optional: data.get("optional") === "on",
      weekdays,
      comparator,
      targetMin: minimum,
      targetMax: maximum,
    };
    this.modalHabitId = null;
    this.store.upsertHabit(draft);
    this.toast(draft.id ? "Habit updated from today forward" : "Habit added");
  }

  private openHabitModal(habitId?: string): void {
    this.modalHabitId = habitId ?? "";
    this.showHabitModal(habitId);
  }

  private closeModal(): void {
    this.modalHabitId = null;
    const root = this.root.querySelector<HTMLElement>("#modalRoot");
    if (root) root.innerHTML = "";
  }

  private showHabitModal(habitId?: string): void {
    const state = this.store.snapshot;
    const habit = habitId ? state.habits.find((item) => item.id === habitId) : undefined;
    const rule = habit ? ruleForDate(state.rules, habit.id, todayKey()) : null;
    const inputType = rule?.inputType ?? habit?.inputType ?? "boolean";
    const unit = rule?.unit ?? habit?.unit ?? "";
    const weekdays = rule?.weekdays ?? [0, 1, 2, 3, 4, 5, 6];
    const root = this.root.querySelector<HTMLElement>("#modalRoot");
    if (!root) return;
    root.innerHTML = `
      <div class="modal-backdrop" data-action="close-modal"></div>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="habitModalTitle">
        <header><div><p class="eyebrow">${habit ? "Edit habit" : "New habit"}</p><h2 id="habitModalTitle">${habit ? escapeHtml(habit.name) : "Build a repeatable cue"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">${icon("close", 20)}</button></header>
        <form id="habitForm">
          <label class="field"><span>Name</span><input name="name" value="${escapeHtml(habit?.name ?? "")}" placeholder="e.g. Read" maxlength="50" autofocus required /></label>
          <fieldset class="form-group"><legend>How will you record it?</legend><div class="choice-cards"><label><input type="radio" name="inputType" value="boolean" ${inputType === "boolean" ? "checked" : ""}/><span>${icon("check", 20)}<strong>Yes / no</strong><small>One tap to complete</small></span></label><label><input type="radio" name="inputType" value="number" ${inputType === "number" ? "checked" : ""}/><span><b>#</b><strong>Number</strong><small>Minutes, calories, count</small></span></label></div></fieldset>
          <div class="numeric-fields" ${inputType === "boolean" ? "hidden" : ""}>
            <label class="field"><span>Unit</span><input name="unit" value="${escapeHtml(unit)}" placeholder="min, kcal, steps" maxlength="16" /></label>
            <label class="field"><span>Success means</span><select name="comparator"><option value="gte" ${rule?.comparator === "gte" ? "selected" : ""}>At least</option><option value="lte" ${rule?.comparator === "lte" ? "selected" : ""}>At most</option><option value="between" ${rule?.comparator === "between" ? "selected" : ""}>Between</option><option value="exact" ${rule?.comparator === "exact" ? "selected" : ""}>Exactly</option></select></label>
            <div class="target-fields"><label class="field"><span>Minimum / target</span><input type="number" step="any" min="0" name="targetMin" value="${rule?.targetMin ?? ""}" placeholder="15" /></label><label class="field"><span>Maximum</span><input type="number" step="any" min="0" name="targetMax" value="${rule?.targetMax ?? ""}" placeholder="2200" /></label></div>
          </div>
          <fieldset class="form-group"><div class="legend-row"><legend>Scheduled days</legend><span><button type="button" data-action="all-weekdays">Weekdays</button><button type="button" data-action="every-day">Every day</button></span></div><div class="weekday-picker">${[0, 1, 2, 3, 4, 5, 6].map((day) => `<label><input type="checkbox" name="weekdays" value="${day}" ${weekdays.includes(day) ? "checked" : ""}/><span>${dayName(day, "narrow")}</span></label>`).join("")}</div></fieldset>
          <label class="optional-toggle" style="--habit-preview:${habit?.color ?? HABIT_COLORS[0]}"><span><strong>Optional habit</strong><small>Track it without lowering adherence when it is missed.</small></span><input type="checkbox" name="optional" ${habit?.optional ? "checked" : ""}/><i></i></label>
          <fieldset class="form-group"><legend>Style</legend><div class="style-picker"><div class="color-picker">${HABIT_COLORS.map((color) => `<label style="--choice:${color}"><input type="radio" name="color" value="${color}" ${color === (habit?.color ?? HABIT_COLORS[0]) ? "checked" : ""}/><span></span></label>`).join("")}</div><div class="icon-picker">${HABIT_ICONS.map((item) => `<label><input type="radio" name="icon" value="${item}" ${item === (habit?.icon ?? "target") ? "checked" : ""}/><span>${icon(item, 19)}</span></label>`).join("")}</div></div></fieldset>
          ${habit ? '<p class="version-note">Schedule, target, and recording changes take effect today. Earlier records keep their original rules.</p>' : ""}
          <footer><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button type="submit" class="primary-button">${habit ? "Save changes" : "Add habit"}</button></footer>
        </form>
      </section>
    `;
    queueMicrotask(() => root.querySelector<HTMLInputElement>('input[name="name"]')?.focus());
  }

  private syncHabitFormType(inputType: InputType): void {
    const numericFields = this.root.querySelector<HTMLElement>(".numeric-fields");
    if (numericFields) numericFields.hidden = inputType === "boolean";
  }

  private setModalWeekdays(days: number[]): void {
    this.root.querySelectorAll<HTMLInputElement>('input[name="weekdays"]').forEach((input) => {
      input.checked = days.includes(Number(input.value));
    });
  }

  private exportData(): void {
    const payload = JSON.stringify(this.store.snapshot, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `routine-command-backup-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.toast("Backup downloaded");
  }

  private async importData(file: File): Promise<void> {
    try {
      const data = JSON.parse(await file.text()) as unknown;
      if (!window.confirm("Replace all local Routine Command data with this backup?")) return;
      if (!this.store.importState(data)) throw new Error("Invalid Routine Command backup");
      this.toast("Backup imported");
    } catch {
      this.toast("That file is not a valid Routine Command backup");
    }
  }

  private toast(message: string): void {
    const root = this.root.querySelector<HTMLElement>("#toastRoot");
    if (!root) return;
    root.innerHTML = `<div class="toast">${icon("check", 17)} ${escapeHtml(message)}</div>`;
    window.setTimeout(() => {
      if (root.isConnected) root.innerHTML = "";
    }, 2400);
  }

  private updateOnlineStatus(): void {
    const banner = this.root.querySelector<HTMLElement>(".offline-banner");
    if (banner) banner.hidden = navigator.onLine;
  }

  private updateCloudSync(snapshot: CloudSyncSnapshot): void {
    const sidebarStatus = this.root.querySelector<HTMLElement>("[data-sync-status]");
    if (sidebarStatus) sidebarStatus.innerHTML = renderSyncStatus(snapshot);
    const syncCard = this.root.querySelector<HTMLElement>("[data-cloud-sync-card]");
    if (syncCard) syncCard.outerHTML = renderCloudSync(snapshot);
  }
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTargetValid(comparator: Comparator, minimum: number | null, maximum: number | null): boolean {
  if (comparator === "lte") return maximum !== null;
  if (comparator === "between") return minimum !== null && maximum !== null && minimum <= maximum;
  return minimum !== null;
}

function toLocalKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
