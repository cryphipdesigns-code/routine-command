const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function parseDateKey(key: string): Date {
  if (!DATE_KEY_PATTERN.test(key)) return new Date();
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

export function addDays(key: string, amount: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function startOfWeek(key: string, weekStartsOn: 0 | 1): string {
  const date = parseDateKey(key);
  const difference = (date.getDay() - weekStartsOn + 7) % 7;
  date.setDate(date.getDate() - difference);
  return toDateKey(date);
}

export function endOfWeek(key: string, weekStartsOn: 0 | 1): string {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

export function startOfMonth(key: string): string {
  const date = parseDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

export function endOfMonth(key: string): string {
  const date = parseDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
}

export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function formatDayHeading(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(parseDateKey(key));
}

export function formatShortDate(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(key));
}

export function formatMonth(key: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(parseDateKey(key));
}

export function formatWeekRange(start: string, end: string): string {
  const startDate = parseDateKey(start);
  const endDate = parseDateKey(end);
  const sameMonth = startDate.getMonth() === endDate.getMonth();
  const left = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(startDate);
  const right = new Intl.DateTimeFormat(undefined, {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: startDate.getFullYear() === endDate.getFullYear() ? undefined : "numeric",
  }).format(endDate);
  return `${left} – ${right}`;
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export function isFuture(key: string, today = todayKey()): boolean {
  return key > today;
}

export function isPast(key: string, today = todayKey()): boolean {
  return key < today;
}

export function daysAgo(amount: number, from = todayKey()): string {
  return addDays(from, -Math.abs(amount));
}

export function dayName(day: number, style: "long" | "short" | "narrow" = "short"): string {
  const base = new Date(2024, 0, 7 + day, 12);
  return new Intl.DateTimeFormat(undefined, { weekday: style }).format(base);
}
