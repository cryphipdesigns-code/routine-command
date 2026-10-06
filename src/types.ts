export type ViewId = "today" | "review" | "trends" | "habits" | "settings";
export type ReviewMode = "week" | "month";
export type InputType = "boolean" | "number";
export type HabitDirection = "build" | "avoid";
export type Comparator = "checked" | "gte" | "lte" | "between" | "exact";
export type LogSource = "manual" | "apple-health" | "health-connect" | "import";

export interface ExerciseDetails {
  activityType: string;
  durationMinutes: number | null;
  caloriesBurned: number | null;
  timeOfDay: string | null;
}

export interface Habit {
  id: string;
  name: string;
  inputType: InputType;
  unit: string;
  icon: string;
  color: string;
  optional: boolean;
  direction: HabitDirection;
  sortOrder: number;
  createdAt: string;
  archivedAt: string | null;
}

export interface HabitRule {
  id: string;
  habitId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  inputType: InputType;
  unit: string;
  direction: HabitDirection;
  weekdays: number[];
  comparator: Comparator;
  targetMin: number | null;
  targetMax: number | null;
}

export interface HabitLog {
  id: string;
  habitId: string;
  localDate: string;
  booleanValue: boolean | null;
  numericValue: number | null;
  source: LogSource;
  note: string;
  exerciseDetails?: ExerciseDetails | null;
  updatedAt: string;
}

export interface HabitDayException {
  id: string;
  habitId: string;
  localDate: string;
  applicable: boolean;
  reason: string;
}

export interface DailyCheckin {
  id: string;
  localDate: string;
  mood: number | null;
  productivity: number | null;
  energy: number | null;
  wakeTime: string | null;
  bedTime: string | null;
  calories: number | null;
  note: string;
  updatedAt: string;
}

export interface SignalTargets {
  caloriesMax: number | null;
  wakeTimeLatest: string | null;
  bedTimeLatest: string | null;
}

export interface UserSettings {
  weekStartsOn: 0 | 1;
  timezone: string;
  showEnergy: boolean;
  appBadgeEnabled: boolean;
  personalReward: string;
  rewardTarget: number;
  signalTargets: SignalTargets;
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  enabled: boolean;
  enabledAt: string | null;
  evening: boolean;
  eveningTime: string;
  slips: boolean;
  skips: boolean;
  trends: boolean;
  trendTime: string;
  quietStart: string;
  quietEnd: string;
  tone: "direct" | "relentless";
  quotes: boolean;
  showHabitNames: boolean;
}

export interface AppState {
  schemaVersion: 6;
  activeView: ViewId;
  selectedDate: string;
  reviewAnchor: string;
  reviewMode: ReviewMode;
  habits: Habit[];
  rules: HabitRule[];
  logs: HabitLog[];
  exceptions: HabitDayException[];
  checkins: DailyCheckin[];
  settings: UserSettings;
}

export type DayStatus =
  | "success"
  | "off-target"
  | "missed"
  | "pending"
  | "upcoming"
  | "not-scheduled";

export interface DayEvaluation {
  status: DayStatus;
  applicable: boolean;
  successful: boolean;
  rule: HabitRule | null;
  log: HabitLog | null;
}

export interface PeriodStats {
  applicable: number;
  successful: number;
  missed: number;
  pending: number;
  adherence: number | null;
}

export interface HabitDraft {
  id?: string;
  startDate?: string | null;
  name: string;
  inputType: InputType;
  unit: string;
  icon: string;
  color: string;
  optional: boolean;
  direction: HabitDirection;
  weekdays: number[];
  comparator: Comparator;
  targetMin: number | null;
  targetMax: number | null;
}
