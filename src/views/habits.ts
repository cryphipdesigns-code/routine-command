import type { AppState } from "../types";
import { escapeHtml, icon } from "../ui";
import { activeHabits, emptyState, habitMeta, pageIntro } from "./shared";

export function renderHabits(state: AppState): string {
  const habits = activeHabits(state);
  const archived = state.habits.filter((habit) => habit.archivedAt);
  return `
    <div class="view-stack habits-view">
      ${pageIntro({
        eyebrow: "Your system",
        title: "Habits",
        copy: "Keep the list short enough that checking in remains effortless.",
        action: `<button class="primary-button" data-action="add-habit">${icon("plus", 18)} Add habit</button>`,
      })}
      <section class="section-block">
        <div class="section-heading"><div><p class="eyebrow">Active</p><h2>Current plan</h2></div><span class="section-count">${habits.length}</span></div>
        <div class="habit-manager-list">
          ${
            habits.length
              ? renderManagerGroups(state, habits)
              : emptyState("Start with one habit", "Choose something small enough to repeat on your hardest day.")
          }
        </div>
      </section>
      ${
        archived.length
          ? `<details class="section-block archived-habits"><summary><span><strong>Archived</strong><small>${archived.length} habits</small></span>${icon("chevronRight", 18)}</summary><div class="habit-manager-list">${archived
              .map(
                (habit) => `<article class="habit-manager-card is-archived"><div class="habit-symbol">${icon(habit.icon, 20)}</div><div><h3>${escapeHtml(habit.name)}</h3><p>History preserved</p></div><div class="habit-actions"><button class="secondary-button small" data-action="restore-habit" data-habit-id="${habit.id}">Restore</button><button class="icon-button danger" data-action="delete-habit" data-habit-id="${habit.id}" aria-label="Permanently delete ${escapeHtml(habit.name)}">${icon("trash", 18)}</button></div></article>`,
              )
              .join("")}</div></details>`
          : ""
      }
    </div>
  `;
}

function renderManagerGroups(state: AppState, habits: AppState["habits"]): string {
  return (["build", "avoid"] as const)
    .map((direction) => {
      const directionHabits = habits.filter((habit) => habit.direction === direction);
      if (!directionHabits.length) return "";
      const required = directionHabits.filter((habit) => !habit.optional);
      const optional = directionHabits.filter((habit) => habit.optional);
      return `
        <div class="habit-group" data-habit-group="${direction}">
          <div class="habit-group-heading">
            <span>${icon(direction === "build" ? "plus" : "shield", 16)} ${direction === "build" ? "Build" : "Avoid"}</span>
            <small>${directionHabits.length}</small>
          </div>
          ${required.map((habit) => renderHabitManagerCard(state, habit)).join("")}
          ${
            optional.length
              ? `<div class="habit-subgroup-label"><span>Optional</span></div>${optional
                  .map((habit) => renderHabitManagerCard(state, habit))
                  .join("")}`
              : ""
          }
        </div>
      `;
    })
    .join("");
}

function renderHabitManagerCard(state: AppState, habit: AppState["habits"][number]): string {
  return `<article class="habit-manager-card" style="--habit-color:${habit.color}">
    <div class="habit-symbol">${icon(habit.icon, 21)}</div>
    <div><div class="habit-name-line"><h3>${escapeHtml(habit.name)}</h3>${habit.direction === "avoid" ? '<span class="direction-badge">Avoid</span>' : ""}${habit.optional ? '<span class="optional-badge">Optional</span>' : ""}</div><p>${escapeHtml(habitMeta(state, habit))}</p></div>
    <div class="habit-actions">
      <button class="icon-button" data-action="edit-habit" data-habit-id="${habit.id}" aria-label="Edit ${escapeHtml(habit.name)}">${icon("edit", 18)}</button>
      <button class="icon-button" data-action="archive-habit" data-habit-id="${habit.id}" aria-label="Archive ${escapeHtml(habit.name)}">${icon("archive", 18)}</button>
    </div>
  </article>`;
}
