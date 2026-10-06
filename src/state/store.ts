import type {
  AppState,
  DailyCheckin,
  ExerciseDetails,
  Habit,
  HabitDraft,
  HabitDayException,
  HabitLog,
  HabitRule,
  ReviewMode,
  UserSettings,
  ViewId,
} from "../types";
import type { StateRepository } from "../data/repository";
import { defaultState } from "../data/defaults";
import { addDays, parseDateKey, toDateKey, todayKey } from "../domain/dates";
import { ruleForDate } from "../domain/compliance";

type Listener = (state: AppState) => void;
type CheckinMetric = "mood" | "productivity" | "energy";
type CheckinTime = "wakeTime" | "bedTime";
type ExerciseDetailField = keyof ExerciseDetails;

export class TrackerStore {
  private state: AppState = defaultState();
  private listeners = new Set<Listener>();
  private saveSequence = Promise.resolve();

  constructor(private readonly repository: StateRepository) {}

  async initialize(): Promise<void> {
    const saved = await this.repository.load();
    this.state = normalizeState(saved ?? defaultState());
    await this.repository.save(this.state);
  }

  get snapshot(): AppState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActiveView(activeView: ViewId): void {
    this.update({ ...this.state, activeView });
  }

  setSelectedDate(selectedDate: string): void {
    this.update({ ...this.state, selectedDate });
  }

  setReviewAnchor(reviewAnchor: string): void {
    this.update({ ...this.state, reviewAnchor });
  }

  setReviewMode(reviewMode: ReviewMode): void {
    this.update({ ...this.state, reviewMode });
  }

  setBooleanLog(habitId: string, localDate: string, value: boolean): void {
    const existing = this.findLog(habitId, localDate);
    if (existing && existing.booleanValue === value) {
      if (hasExerciseDetails(existing.exerciseDetails) || existing.note) {
        this.replaceLog({
          ...existing,
          booleanValue: null,
          updatedAt: new Date().toISOString(),
        });
      } else {
        this.removeLog(habitId, localDate);
      }
      return;
    }
    const log: HabitLog = {
      id: existing?.id ?? crypto.randomUUID(),
      habitId,
      localDate,
      booleanValue: value,
      numericValue: null,
      source: "manual",
      note: existing?.note ?? "",
      exerciseDetails: existing?.exerciseDetails ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.replaceLog(log);
  }

  setNumericLog(habitId: string, localDate: string, value: number | null): void {
    if (value === null || !Number.isFinite(value)) {
      this.removeLog(habitId, localDate);
      return;
    }
    const existing = this.findLog(habitId, localDate);
    const log: HabitLog = {
      id: existing?.id ?? crypto.randomUUID(),
      habitId,
      localDate,
      booleanValue: null,
      numericValue: value,
      source: "manual",
      note: existing?.note ?? "",
      exerciseDetails: existing?.exerciseDetails ?? null,
      updatedAt: new Date().toISOString(),
    };
    this.replaceLog(log);
  }

  setExerciseDetail(
    habitId: string,
    localDate: string,
    field: ExerciseDetailField,
    value: string | number | null,
  ): void {
    const existing = this.findLog(habitId, localDate);
    const current = normalizeExerciseDetails(existing?.exerciseDetails);
    const exerciseDetails: ExerciseDetails = { ...current, [field]: value };
    const log: HabitLog = {
      id: existing?.id ?? crypto.randomUUID(),
      habitId,
      localDate,
      booleanValue: existing?.booleanValue ?? null,
      numericValue: existing?.numericValue ?? null,
      source: existing?.source ?? "manual",
      note: existing?.note ?? "",
      exerciseDetails,
      updatedAt: new Date().toISOString(),
    };
    this.replaceLog(log);
  }

  setCheckinMetric(localDate: string, metric: CheckinMetric, value: number | null): void {
    const existing = this.state.checkins.find((checkin) => checkin.localDate === localDate);
    const checkin: DailyCheckin = {
      id: existing?.id ?? crypto.randomUUID(),
      localDate,
      mood: existing?.mood ?? null,
      productivity: existing?.productivity ?? null,
      energy: existing?.energy ?? null,
      wakeTime: existing?.wakeTime ?? null,
      bedTime: existing?.bedTime ?? null,
      calories: existing?.calories ?? null,
      note: existing?.note ?? "",
      updatedAt: new Date().toISOString(),
      [metric]: existing?.[metric] === value ? null : value,
    };
    this.replaceCheckin(checkin);
  }

  setCheckinNote(localDate: string, note: string): void {
    const existing = this.state.checkins.find((checkin) => checkin.localDate === localDate);
    const checkin: DailyCheckin = {
      id: existing?.id ?? crypto.randomUUID(),
      localDate,
      mood: existing?.mood ?? null,
      productivity: existing?.productivity ?? null,
      energy: existing?.energy ?? null,
      wakeTime: existing?.wakeTime ?? null,
      bedTime: existing?.bedTime ?? null,
      calories: existing?.calories ?? null,
      note,
      updatedAt: new Date().toISOString(),
    };
    this.replaceCheckin(checkin);
  }

  setCheckinTime(localDate: string, field: CheckinTime, value: string | null): void {
    const existing = this.state.checkins.find((checkin) => checkin.localDate === localDate);
    const checkin: DailyCheckin = {
      id: existing?.id ?? crypto.randomUUID(),
      localDate,
      mood: existing?.mood ?? null,
      productivity: existing?.productivity ?? null,
      energy: existing?.energy ?? null,
      wakeTime: existing?.wakeTime ?? null,
      bedTime: existing?.bedTime ?? null,
      calories: existing?.calories ?? null,
      note: existing?.note ?? "",
      updatedAt: new Date().toISOString(),
      [field]: value,
    };
    this.replaceCheckin(checkin);
  }

  setCheckinCalories(localDate: string, value: number | null): void {
    const existing = this.state.checkins.find((checkin) => checkin.localDate === localDate);
    const checkin: DailyCheckin = {
      id: existing?.id ?? crypto.randomUUID(),
      localDate,
      mood: existing?.mood ?? null,
      productivity: existing?.productivity ?? null,
      energy: existing?.energy ?? null,
      wakeTime: existing?.wakeTime ?? null,
      bedTime: existing?.bedTime ?? null,
      calories: value !== null && Number.isFinite(value) && value >= 0 ? value : null,
      note: existing?.note ?? "",
      updatedAt: new Date().toISOString(),
    };
    this.replaceCheckin(checkin);
  }

  upsertHabit(draft: HabitDraft): void {
    const date = todayKey();
    const requestedStart = draft.startDate && draft.startDate > date ? draft.startDate : date;
    if (!draft.id) {
      const id = crypto.randomUUID();
      const habit: Habit = {
        id,
        name: draft.name.trim(),
        inputType: draft.inputType,
        unit: draft.inputType === "number" ? draft.unit.trim() : "",
        icon: draft.icon,
        color: draft.color,
        optional: draft.optional,
        direction: draft.direction,
        sortOrder: this.state.habits.length,
        createdAt: new Date().toISOString(),
        archivedAt: null,
      };
      const rule = ruleFromDraft(draft, id, requestedStart);
      this.update({
        ...this.state,
        habits: [...this.state.habits, habit],
        rules: [...this.state.rules, rule],
      });
      return;
    }

    const existingHabit = this.state.habits.find((habit) => habit.id === draft.id);
    if (!existingHabit) return;
    const habits = this.state.habits.map((habit) =>
      habit.id === draft.id
        ? {
            ...habit,
            name: draft.name.trim(),
            inputType: draft.inputType,
            unit: draft.inputType === "number" ? draft.unit.trim() : "",
            icon: draft.icon,
            color: draft.color,
            optional: draft.optional,
            direction: draft.direction,
          }
        : habit,
    );
    const currentRule = ruleForDate(this.state.rules, draft.id, date);
    const upcomingRule = this.state.rules
      .filter((rule) => rule.habitId === draft.id && rule.effectiveFrom > date)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    let rules = [...this.state.rules];
    if (requestedStart > date) {
      if (upcomingRule) {
        rules = rules.map((rule) =>
          rule.id === upcomingRule.id
            ? {
                ...ruleFromDraft(draft, draft.id!, requestedStart, upcomingRule.id),
                effectiveTo: upcomingRule.effectiveTo,
              }
            : rule,
        );
        if (currentRule) {
          rules = rules.map((rule) =>
            rule.id === currentRule.id ? { ...rule, effectiveTo: addDays(date, -1) } : rule,
          );
        }
      } else if (currentRule?.effectiveFrom === date) {
        rules = rules.map((rule) =>
          rule.id === currentRule.id
            ? ruleFromDraft(draft, draft.id!, requestedStart, currentRule.id)
            : rule,
        );
      } else {
        if (currentRule) {
          rules = rules.map((rule) =>
            rule.id === currentRule.id ? { ...rule, effectiveTo: addDays(date, -1) } : rule,
          );
        }
        rules.push(ruleFromDraft(draft, draft.id, requestedStart));
      }
    } else if (!currentRule || !rulesMatchDraft(currentRule, draft)) {
      if (!currentRule && upcomingRule) {
        rules = rules.map((rule) =>
          rule.id === upcomingRule.id
            ? ruleFromDraft(draft, draft.id!, date, upcomingRule.id)
            : rule,
        );
      } else if (currentRule?.effectiveFrom === date) {
        rules = rules.map((rule) =>
          rule.id === currentRule.id ? ruleFromDraft(draft, draft.id!, date, currentRule.id) : rule,
        );
      } else {
        rules = rules.map((rule) =>
          rule.id === currentRule?.id ? { ...rule, effectiveTo: addDays(date, -1) } : rule,
        );
        rules.push(ruleFromDraft(draft, draft.id, date));
      }
    }
    const changedRecordingMeaning =
      existingHabit.inputType !== draft.inputType || existingHabit.direction !== draft.direction;
    const logs = changedRecordingMeaning
      ? this.state.logs.filter(
          (log) => !(log.habitId === draft.id && log.localDate === date),
        )
      : this.state.logs;
    this.update({ ...this.state, habits, rules, logs });
  }

  setHabitArchived(habitId: string, archived: boolean): void {
    const date = todayKey();
    const habits = this.state.habits.map((habit) =>
      habit.id === habitId
        ? { ...habit, archivedAt: archived ? new Date().toISOString() : null }
        : habit,
    );
    let rules = [...this.state.rules];
    if (archived) {
      const currentRule = ruleForDate(rules, habitId, date);
      if (currentRule) {
        rules = rules.map((rule) =>
          rule.id === currentRule.id ? { ...rule, effectiveTo: date } : rule,
        );
      }
    } else {
      const lastRule = rules
        .filter((rule) => rule.habitId === habitId)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
      if (lastRule?.effectiveFrom === date) {
        rules = rules.map((rule) =>
          rule.id === lastRule.id ? { ...rule, effectiveTo: null } : rule,
        );
      } else if (lastRule) {
        rules = rules.map((rule) =>
          rule.id === lastRule.id && rule.effectiveTo === null
            ? { ...rule, effectiveTo: addDays(date, -1) }
            : rule,
        );
        rules.push({
          ...lastRule,
          id: crypto.randomUUID(),
          effectiveFrom: date,
          effectiveTo: null,
        });
      }
    }
    this.update({ ...this.state, habits, rules });
  }

  deleteHabit(habitId: string): void {
    this.update({
      ...this.state,
      habits: this.state.habits.filter((habit) => habit.id !== habitId),
      rules: this.state.rules.filter((rule) => rule.habitId !== habitId),
      logs: this.state.logs.filter((log) => log.habitId !== habitId),
      exceptions: this.state.exceptions.filter((item) => item.habitId !== habitId),
    });
  }

  setHabitDayExceptions(
    habitId: string,
    changes: Array<{ localDate: string; applicable: boolean | null; reason: string }>,
  ): boolean {
    const habit = this.state.habits.find((item) => item.id === habitId && !item.archivedAt);
    if (!habit || !changes.length || changes.some((change) =>
      !/^\d{4}-\d{2}-\d{2}$/.test(change.localDate) ||
      toDateKey(parseDateKey(change.localDate)) !== change.localDate ||
      !ruleForDate(this.state.rules, habitId, change.localDate)
    )) return false;

    let exceptions = [...this.state.exceptions];
    for (const change of changes) {
      const existing = exceptions.find((item) => item.habitId === habitId && item.localDate === change.localDate);
      exceptions = exceptions.filter((item) => !(item.habitId === habitId && item.localDate === change.localDate));
      if (change.applicable !== null) {
        const exception: HabitDayException = {
          id: existing?.id ?? crypto.randomUUID(),
          habitId,
          localDate: change.localDate,
          applicable: change.applicable,
          reason: change.reason.trim().slice(0, 120),
        };
        exceptions.push(exception);
      }
    }
    this.update({ ...this.state, exceptions });
    return true;
  }

  updateSettings(patch: Partial<UserSettings>): void {
    this.update({ ...this.state, settings: { ...this.state.settings, ...patch } });
  }

  async reset(): Promise<void> {
    await this.repository.clear();
    this.state = defaultState();
    await this.repository.save(this.state);
    this.emit();
  }

  importState(input: unknown): boolean {
    if (!input || typeof input !== "object") return false;
    const candidate = input as Partial<AppState>;
    if (!Array.isArray(candidate.habits) || !Array.isArray(candidate.rules)) return false;
    this.update(normalizeState(candidate as AppState));
    return true;
  }

  private findLog(habitId: string, localDate: string): HabitLog | undefined {
    return this.state.logs.find((log) => log.habitId === habitId && log.localDate === localDate);
  }

  private replaceLog(log: HabitLog): void {
    const logs = this.state.logs.filter(
      (item) => !(item.habitId === log.habitId && item.localDate === log.localDate),
    );
    logs.push(log);
    this.update({ ...this.state, logs });
  }

  private removeLog(habitId: string, localDate: string): void {
    this.update({
      ...this.state,
      logs: this.state.logs.filter(
        (log) => !(log.habitId === habitId && log.localDate === localDate),
      ),
    });
  }

  private replaceCheckin(checkin: DailyCheckin): void {
    const checkins = this.state.checkins.filter((item) => item.localDate !== checkin.localDate);
    checkins.push(checkin);
    this.update({ ...this.state, checkins });
  }

  private update(nextState: AppState): void {
    this.state = nextState;
    this.emit();
    const snapshot = structuredClone(this.state);
    this.saveSequence = this.saveSequence
      .then(() => this.repository.save(snapshot))
      .catch((error) => console.error("Could not save Routine Command data.", error));
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}

function ruleFromDraft(
  draft: HabitDraft,
  habitId: string,
  effectiveFrom: string,
  id: string = crypto.randomUUID(),
): HabitRule {
  return {
    id,
    habitId,
    effectiveFrom,
    effectiveTo: null,
    inputType: draft.inputType,
    unit: draft.inputType === "number" ? draft.unit.trim() : "",
    direction: draft.direction,
    weekdays: [...draft.weekdays].sort(),
    comparator: draft.inputType === "boolean" ? "checked" : draft.comparator,
    targetMin: draft.inputType === "boolean" ? null : draft.targetMin,
    targetMax: draft.inputType === "boolean" ? null : draft.targetMax,
  };
}

function rulesMatchDraft(rule: HabitRule, draft: HabitDraft): boolean {
  return (
    rule.inputType === draft.inputType &&
    rule.unit === (draft.inputType === "number" ? draft.unit.trim() : "") &&
    rule.direction === draft.direction &&
    rule.comparator === (draft.inputType === "boolean" ? "checked" : draft.comparator) &&
    rule.targetMin === (draft.inputType === "boolean" ? null : draft.targetMin) &&
    rule.targetMax === (draft.inputType === "boolean" ? null : draft.targetMax) &&
    [...rule.weekdays].sort().join(",") === [...draft.weekdays].sort().join(",")
  );
}

function normalizeState(state: AppState): AppState {
  const base = defaultState();
  const activeViews: ViewId[] = ["today", "review", "trends", "habits", "settings"];
  const savedVersion = Number((state as { schemaVersion?: number }).schemaVersion ?? 1);
  let habits: Habit[] = Array.isArray(state.habits)
    ? state.habits.map((habit) => ({
        ...habit,
        optional: Boolean(habit.optional),
        direction: habit.direction === "avoid" ? ("avoid" as const) : ("build" as const),
      }))
    : base.habits;
  let rules: HabitRule[] = Array.isArray(state.rules)
    ? state.rules.map((rule) => {
        const habit = habits.find((item) => item.id === rule.habitId);
        return {
          ...rule,
          inputType: rule.inputType ?? habit?.inputType ?? "boolean",
          unit: rule.unit ?? habit?.unit ?? "",
          direction:
            rule.direction === "avoid" ? ("avoid" as const) : habit?.direction ?? ("build" as const),
        };
      })
    : base.rules;
  let logs: HabitLog[] = Array.isArray(state.logs)
    ? state.logs.map((log) => ({
        ...log,
        exerciseDetails: log.exerciseDetails
          ? normalizeExerciseDetails(log.exerciseDetails)
          : null,
      }))
    : [];
  let checkins: DailyCheckin[] = Array.isArray(state.checkins)
    ? state.checkins.map((checkin) => ({
        ...checkin,
        wakeTime: checkin.wakeTime ?? null,
        bedTime: checkin.bedTime ?? null,
        calories:
          typeof checkin.calories === "number" && Number.isFinite(checkin.calories)
            ? checkin.calories
            : null,
      }))
    : [];

  if (savedVersion < 3) {
    const migrated = migrateStarterHabitsV3(habits, rules, logs, base);
    habits = migrated.habits;
    rules = migrated.rules;
    logs = migrated.logs;
  }

  let migratedCaloriesTarget: number | null = null;
  if (savedVersion < 6) {
    const migrated = migrateCaloriesSignalV6(habits, rules, logs, checkins);
    habits = migrated.habits;
    rules = migrated.rules;
    logs = migrated.logs;
    checkins = migrated.checkins;
    migratedCaloriesTarget = migrated.caloriesTarget;
  }

  const rawSignalTargets = state.settings?.signalTargets;

  return {
    ...base,
    ...state,
    schemaVersion: 6,
    activeView: activeViews.includes(state.activeView) ? state.activeView : "today",
    selectedDate: state.selectedDate || todayKey(),
    reviewAnchor: state.reviewAnchor || todayKey(),
    habits,
    rules,
    logs,
    exceptions: Array.isArray(state.exceptions) ? state.exceptions : [],
    checkins,
    settings: {
      weekStartsOn: state.settings?.weekStartsOn === 0 ? 0 : 1,
      timezone: state.settings?.timezone || base.settings.timezone,
      showEnergy: Boolean(state.settings?.showEnergy),
      appBadgeEnabled: Boolean(state.settings?.appBadgeEnabled),
      personalReward:
        typeof state.settings?.personalReward === "string"
          ? state.settings.personalReward.slice(0, 80)
          : "",
      rewardTarget:
        typeof state.settings?.rewardTarget === "number" &&
        state.settings.rewardTarget >= 0.5 &&
        state.settings.rewardTarget <= 1
          ? state.settings.rewardTarget
          : 0.8,
      signalTargets: {
        caloriesMax: nullableNonnegativeNumber(
          rawSignalTargets?.caloriesMax,
          migratedCaloriesTarget ?? base.settings.signalTargets.caloriesMax,
        ),
        wakeTimeLatest: nullableTime(
          rawSignalTargets?.wakeTimeLatest,
          base.settings.signalTargets.wakeTimeLatest,
        ),
        bedTimeLatest: nullableTime(
          rawSignalTargets?.bedTimeLatest,
          base.settings.signalTargets.bedTimeLatest,
        ),
      },
    },
  };
}

function migrateCaloriesSignalV6(
  habits: Habit[],
  rules: HabitRule[],
  logs: HabitLog[],
  checkins: DailyCheckin[],
): {
  habits: Habit[];
  rules: HabitRule[];
  logs: HabitLog[];
  checkins: DailyCheckin[];
  caloriesTarget: number | null;
} {
  const habitId = "habit-calories";
  const calorieRules = rules
    .filter((rule) => rule.habitId === habitId)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const latestRule = calorieRules[0];
  const caloriesTarget =
    latestRule?.comparator === "lte" || latestRule?.comparator === "between"
      ? latestRule.targetMax
      : latestRule?.targetMin ?? null;
  const nextCheckins = checkins.map((checkin) => ({ ...checkin }));

  logs
    .filter((log) => log.habitId === habitId && log.numericValue !== null)
    .forEach((log) => {
      const index = nextCheckins.findIndex((checkin) => checkin.localDate === log.localDate);
      if (index >= 0) {
        const existing = nextCheckins[index]!;
        if (existing.calories === null) {
          nextCheckins[index] = { ...existing, calories: log.numericValue };
        }
        return;
      }
      nextCheckins.push({
        id: crypto.randomUUID(),
        localDate: log.localDate,
        mood: null,
        productivity: null,
        energy: null,
        wakeTime: null,
        bedTime: null,
        calories: log.numericValue,
        note: log.note || "",
        updatedAt: log.updatedAt,
      });
    });

  return {
    habits: habits.filter((habit) => habit.id !== habitId),
    rules: rules.filter((rule) => rule.habitId !== habitId),
    logs: logs.filter((log) => log.habitId !== habitId),
    checkins: nextCheckins,
    caloriesTarget,
  };
}

function nullableNonnegativeNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function nullableTime(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
}

function normalizeExerciseDetails(details?: Partial<ExerciseDetails> | null): ExerciseDetails {
  return {
    activityType: typeof details?.activityType === "string" ? details.activityType : "",
    durationMinutes:
      typeof details?.durationMinutes === "number" && Number.isFinite(details.durationMinutes)
        ? details.durationMinutes
        : null,
    caloriesBurned:
      typeof details?.caloriesBurned === "number" && Number.isFinite(details.caloriesBurned)
        ? details.caloriesBurned
        : null,
    timeOfDay: typeof details?.timeOfDay === "string" && details.timeOfDay ? details.timeOfDay : null,
  };
}

function hasExerciseDetails(details?: ExerciseDetails | null): boolean {
  if (!details) return false;
  return Boolean(
    details.activityType ||
      details.durationMinutes !== null ||
      details.caloriesBurned !== null ||
      details.timeOfDay,
  );
}

function migrateStarterHabitsV3(
  habits: Habit[],
  rules: HabitRule[],
  logs: HabitLog[],
  base: AppState,
): { habits: Habit[]; rules: HabitRule[]; logs: HabitLog[] } {
  const today = todayKey();
  const starterIds = ["habit-read", "habit-read-bible", "habit-bom", "habit-cold"];
  const nextHabits = [...habits];
  const nextRules = [...rules];
  let changedReadType = false;

  starterIds.forEach((habitId) => {
    const starter = base.habits.find((habit) => habit.id === habitId);
    const starterRule = base.rules.find((rule) => rule.habitId === habitId);
    if (!starter || !starterRule) return;
    const index = nextHabits.findIndex((habit) => habit.id === habitId);
    if (index < 0) {
      nextHabits.push({ ...starter, sortOrder: nextHabits.length });
      nextRules.push({ ...starterRule });
      return;
    }
    if (habitId !== "habit-read") return;

    const existing = nextHabits[index]!;
    nextHabits[index] = {
      ...existing,
      name: starter.name,
      inputType: "boolean",
      unit: "",
      archivedAt: null,
    };
    const currentRule = ruleForDate(nextRules, habitId, today);
    if (currentRule?.inputType === "boolean") return;
    changedReadType = true;
    if (currentRule?.effectiveFrom === today) {
      const ruleIndex = nextRules.findIndex((rule) => rule.id === currentRule.id);
      if (ruleIndex >= 0) {
        nextRules[ruleIndex] = { ...starterRule, id: currentRule.id };
      }
      return;
    }
    if (currentRule) {
      const ruleIndex = nextRules.findIndex((rule) => rule.id === currentRule.id);
      if (ruleIndex >= 0) nextRules[ruleIndex] = { ...currentRule, effectiveTo: addDays(today, -1) };
    }
    nextRules.push({ ...starterRule, id: `rule-read-v3-${today}` });
  });

  return {
    habits: nextHabits,
    rules: nextRules,
    logs: changedReadType
      ? logs.filter((log) => !(log.habitId === "habit-read" && log.localDate === today))
      : logs,
  };
}
