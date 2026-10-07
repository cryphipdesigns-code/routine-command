/** One overnight window: afternoon/evening, then midnight through the next morning. */
const BEDTIME_DAY_BOUNDARY = 12 * 60;

export function isTimeAtOrBefore(
  value: string,
  target: string,
  bedtime = false,
): boolean {
  const valueMinutes = timeToMinutes(value, bedtime);
  const targetMinutes = timeToMinutes(target, bedtime);
  return valueMinutes !== null && targetMinutes !== null && valueMinutes <= targetMinutes;
}

export function averageTime(values: Array<string | null>, bedtime = false): string | null {
  const minutes = values
    .map((value) => (value ? timeToMinutes(value, bedtime) : null))
    .filter((value): value is number => value !== null);
  if (!minutes.length) return null;
  const average = Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length);
  const normalized = ((average % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatSignalTime(value: string | null): string {
  const minutes = value ? timeToMinutes(value, false) : null;
  if (minutes === null) return "—";
  const date = new Date(2024, 0, 1, Math.floor(minutes / 60), minutes % 60);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function timeToMinutes(value: string, bedtime: boolean): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined || hour > 23 || minute > 59) return null;
  let result = hour * 60 + minute;
  if (bedtime && result < BEDTIME_DAY_BOUNDARY) result += 24 * 60;
  return result;
}

export function timeSignalStatus(
  field: "wakeTime" | "bedTime",
  value: string | null,
  target: string | null,
): { tone: "empty" | "recorded" | "in-range" | "outside"; label: string } {
  if (!value) return { tone: "empty", label: "Not recorded" };
  if (!target) return { tone: "recorded", label: "Recorded" };
  return isTimeAtOrBefore(value, target, field === "bedTime")
    ? { tone: "in-range", label: "In range" }
    : { tone: "outside", label: "Outside target" };
}
