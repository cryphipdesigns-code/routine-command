import type { AppState, Habit, NotificationSettings } from "../types.ts";
import { evaluateHabitDay } from "./compliance.ts";
import { addDays } from "./dates.ts";

export type NoticeKind = "evening" | "slip" | "skip" | "trend";
export interface CoachQuote { id: string; text: string; author: string; source: string; weight: number }
export interface AccountabilityNotice {
  key: string;
  kind: NoticeKind;
  localDate: string;
  habitId?: string;
  eventAt?: string;
  title: string;
  body: string;
  challenge: string;
  quote: CoachQuote | null;
  remaining: number;
  badgeEnabled?: boolean;
}

export const defaultNotifications: NotificationSettings = {
  enabled: false, enabledAt: null, evening: true, eveningTime: "20:30",
  slips: true, skips: true, trends: true, trendTime: "09:00",
  quietStart: "22:00", quietEnd: "07:00", tone: "relentless",
  quotes: true, showHabitNames: true,
};

// Short, sourced excerpts only. Original challenges below are never attributed to these people.
export const coachQuotes: CoachQuote[] = [
  { id: "et-breathe", text: "When you want to succeed as bad as you want to breathe, then you'll be successful.", author: "Eric Thomas", source: "https://ericthomas.com/home", weight: 4 },
  { id: "jocko-discipline", text: "Discipline equals freedom.", author: "Jocko Willink", source: "https://jocko.com/books/", weight: 1 },
  { id: "goggins-hard", text: "If you care about them, don’t ever give ‘em a pass! Stay hard!", author: "David Goggins", source: "https://link.me/davidgoggins", weight: 1 },
  { id: "rogan-hero", text: "Be the hero of your own movie.", author: "Joe Rogan", source: "https://www.youtube.com/watch?v=YTuElM6T50w", weight: 1 },
  { id: "honnold-mastery", text: "I didn't want to be a lucky climber. I wanted to be a great climber.", author: "Alex Honnold", source: "https://www.northcountrypublicradio.org/news/npr/774089221/alex-honnold-how-much-can-preparation-mitigate-risk", weight: 1 },
  { id: "huberman-action", text: "It's verbs. It's all verbs.", author: "Andrew Huberman", source: "https://www.hubermanlab.com/episode/david-goggins-how-to-build-immense-inner-strength", weight: 1 },
];

export function normalizeNotifications(input?: Partial<NotificationSettings>): NotificationSettings {
  const base = { ...defaultNotifications, ...input };
  for (const key of ["enabled", "evening", "slips", "skips", "trends", "quotes", "showHabitNames"] as const) {
    base[key] = typeof input?.[key] === "boolean" ? input[key] : defaultNotifications[key];
  }
  for (const key of ["eveningTime", "trendTime", "quietStart", "quietEnd"] as const) {
    base[key] = /^([01]\d|2[0-3]):[0-5]\d$/.test(input?.[key] ?? "") ? input![key]! : defaultNotifications[key];
  }
  base.tone = input?.tone === "direct" ? "direct" : "relentless";
  base.enabledAt = input?.enabledAt && Number.isFinite(Date.parse(input.enabledAt)) ? input.enabledAt : null;
  return base;
}

export function notificationClock(now: Date, timezone: string): { localDate: string; minutes: number } {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  catch { formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); }
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  return { localDate: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isQuietTime(minutes: number, settings: NotificationSettings): boolean {
  const start = timeMinutes(settings.quietStart), end = timeMinutes(settings.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function pickCoachQuote(key: string): CoachQuote {
  const weighted = coachQuotes.flatMap((quote) => Array<CoachQuote>(quote.weight).fill(quote));
  return weighted[stableHash(key) % weighted.length]!;
}

export function buildAccountabilityNotice(
  state: AppState, kind: NoticeKind, localDate: string, habit?: Habit, details = "", eventAt?: string,
): AccountabilityNotice {
  const settings = normalizeNotifications(state.settings.notifications);
  const name = settings.showHabitNames ? habit?.name ?? "Your Build habits" : kind === "slip" ? "An Avoid habit" : "A Build habit";
  const key = `${kind}:${localDate}:${habit?.id ?? "all"}`;
  const relentless = settings.tone === "relentless";
  const challenges: Record<NoticeKind, string[]> = {
    evening: ["The day is still yours. Finish one habit, then check it in.", "Your plan did not say ‘whenever I feel like it.’ Stop negotiating. Pick one and start."],
    slip: ["Slip logged. Own the choice, identify the trigger, and make the next decision count.", "The excuse got its turn. Now it’s your turn. Own the slip and shut down the next one."],
    skip: ["Skip recorded. If you can still do this safely today, reopen the decision and get started.", "You scheduled it. You skipped it. That is the receipt. If it’s safe to do today, quit bargaining and start."],
    trend: ["The pattern needs your attention. Set a specific time for the next scheduled opportunity.", "Your excuses are building a streak. Is that really the habit you came here to train? Set a time and show up."],
  };
  const variants: Record<NoticeKind, string[]> = {
    evening: ["Your future self is waiting. Apparently your excuses wanted a meeting first. Meeting over. Start one habit.", "Watching motivation is not doing the work. Close the pep-talk tab and put a check on the board."],
    slip: ["That choice went against your plan. Don’t dress it up. Find the trigger, change the setup, and win the next choice.", "You gave the old pattern another vote. Stop campaigning for it. Make the next choice match the life you asked for."],
    skip: ["A plan on a screen does not count as effort. You marked a skip. Can you safely turn that into action today?", "Tomorrow has heard this sales pitch before. If you can do it safely today, give today some actual work."],
    trend: ["The pattern has receipts. Another inspirational speech won’t erase them. Put the next action on the calendar.", "You keep renewing the same excuse. Cancel the subscription. Choose the next scheduled action and a real start time."],
  };
  const hash = stableHash(key);
  const challenge = relentless && hash % 2 ? variants[kind][Math.floor(hash / 2) % variants[kind].length]! : challenges[kind][relentless ? 1 : 0]!;
  const quote = settings.quotes ? pickCoachQuote(key) : null;
  const titles: Record<NoticeKind, string> = { evening: "Your day is still open", slip: "Own the slip. Reset the next choice.", skip: "Skip recorded. Own the decision.", trend: "The pattern has receipts" };
  const context = details || `${name}: ${kind === "slip" ? "slip logged" : kind === "skip" ? "skipped" : "needs a check-in"}.`;
  const remaining = state.habits.filter((item) => !item.archivedAt && !item.optional).filter((item) => {
    const day = evaluateHabitDay({ habit: item, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate, today: localDate });
    return day.applicable && !day.successful;
  }).length;
  return { key, kind, localDate, habitId: habit?.id, eventAt, title: titles[kind], body: `${context}\n${challenge}${quote ? `\n“${quote.text}” — ${quote.author}` : ""}`, challenge, quote, remaining, badgeEnabled: state.settings.appBadgeEnabled };
}

export function notificationCandidates(state: AppState, now = new Date()): AccountabilityNotice[] {
  const settings = normalizeNotifications(state.settings.notifications);
  if (!settings.enabled || !settings.enabledAt) return [];
  const { localDate, minutes } = notificationClock(now, state.settings.timezone);
  if (isQuietTime(minutes, settings)) return [];
  const habits = state.habits.filter((habit) => !habit.archivedAt && !habit.optional);
  const notices: AccountabilityNotice[] = [];
  for (const log of [...state.logs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    const eventTime = Date.parse(log.updatedAt);
    if (log.booleanValue !== false || eventTime < Date.parse(settings.enabledAt) || !Number.isFinite(eventTime) || eventTime > now.getTime() || now.getTime() - eventTime > 18 * 60 * 60 * 1000 || log.localDate > localDate || log.localDate < addDays(localDate, -1)) continue;
    const habit = habits.find((item) => item.id === log.habitId);
    if (!habit) continue;
    const day = evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate: log.localDate, today: localDate });
    if (!day.applicable || day.rule?.inputType !== "boolean") continue;
    const kind = day.rule.direction === "avoid" ? "slip" : "skip";
    if (kind === "slip" ? settings.slips : settings.skips) notices.push(buildAccountabilityNotice(state, kind, log.localDate, habit, "", log.updatedAt));
  }
  const build = habits.filter((habit) => {
    const day = evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate, today: localDate });
    return day.applicable && day.rule?.direction === "build";
  });
  if (settings.trends && dueSoonAfter(minutes, settings.trendTime)) {
    const trends = build.map((habit) => {
      let skipped = 0, unconfirmed = 0, eligible = 0;
      for (let offset = 1; offset <= 7; offset++) {
        const day = evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate: addDays(localDate, -offset), today: localDate });
        if (!day.applicable || day.rule?.direction !== "build") continue;
        eligible++;
        if (day.status === "missed") unconfirmed++;
        else if (day.status === "off-target") skipped++;
      }
      return { habit, skipped, unconfirmed, eligible };
    }).filter((item) => item.skipped + item.unconfirmed >= 3).sort((a, b) => b.skipped + b.unconfirmed - a.skipped - a.unconfirmed);
    const trend = trends[0];
    if (trend) {
      const name = settings.showHabitNames ? trend.habit.name : "A Build habit";
      const evidence = [trend.skipped ? `${trend.skipped} skipped / off-target` : "", trend.unconfirmed ? `${trend.unconfirmed} unconfirmed` : ""].filter(Boolean).join(", ");
      notices.push(buildAccountabilityNotice(state, "trend", localDate, trend.habit, `${name}: ${evidence} of ${trend.eligible} scheduled days in the last 7 days.`));
    }
  }
  if (settings.evening && dueSoonAfter(minutes, settings.eveningTime)) {
    const open = build.filter((habit) => {
      const day = evaluateHabitDay({ habit, rules: state.rules, logs: state.logs, exceptions: state.exceptions, localDate, today: localDate });
      return !day.successful && day.log?.booleanValue !== false;
    });
    if (open.length) {
      const names = settings.showHabitNames ? ` ${open.slice(0, 2).map((habit) => habit.name).join(", ")}${open.length > 2 ? ` + ${open.length - 2} more` : ""}.` : "";
      notices.push(buildAccountabilityNotice(state, "evening", localDate, undefined, `${open.length} Build ${open.length === 1 ? "habit still unconfirmed" : "habits still unconfirmed"}.${names}`));
    }
  }
  return notices;
}

function dueSoonAfter(minutes: number, time: string): boolean { const since = minutes - timeMinutes(time); return since >= 0 && since < 60; }
function timeMinutes(value: string): number { const [hour, minute] = value.split(":").map(Number); return hour! * 60 + minute!; }
function stableHash(value: string): number { let hash = 2166136261; for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619); return hash >>> 0; }
