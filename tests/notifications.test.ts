import { describe, expect, it } from "vitest";
import { defaultState } from "../src/data/defaults";
import { buildAccountabilityNotice, defaultNotifications, isQuietTime, notificationCandidates, notificationClock, normalizeNotifications, pickCoachQuote } from "../src/domain/notifications";
import type { AppState, HabitLog } from "../src/types";

const evening = new Date("2026-10-06T03:30:00Z"); // Oct 5, 20:30 in Los Angeles
const morning = new Date("2026-10-05T16:00:00Z");

function state(): AppState {
  const result = defaultState();
  result.habits = [result.habits[0]!];
  result.rules = result.rules.filter((rule) => rule.habitId === result.habits[0]!.id).map((rule) => ({ ...rule, effectiveFrom: "2026-09-01" }));
  result.settings.timezone = "America/Los_Angeles";
  result.settings.notifications = { ...defaultNotifications, enabled: true, enabledAt: "2026-10-01T07:00:00Z" };
  return result;
}

function log(localDate: string, value: boolean, updatedAt = "2026-10-06T03:20:00Z"): HabitLog {
  return { id: localDate, habitId: "habit-read", localDate, booleanValue: value, numericValue: null, updatedAt, source: "manual", note: "" };
}

describe("push accountability rules", () => {
  it("uses the user's local date across UTC midnight and DST boundaries", () => {
    expect(notificationClock(evening, "America/Los_Angeles")).toEqual({ localDate: "2026-10-05", minutes: 1230 });
    expect(notificationClock(new Date("2026-11-02T04:30:00Z"), "America/Los_Angeles")).toEqual({ localDate: "2026-11-01", minutes: 1230 });
  });

  it("reminds for unconfirmed Build habits and suppresses completed, optional, and exempt days", () => {
    const data = state();
    expect(notificationCandidates(data, evening).map((notice) => notice.kind)).toEqual(["evening"]);
    expect(notificationCandidates(data, evening)[0]!.body).toContain("unconfirmed");
    data.logs = [log("2026-10-05", true)];
    expect(notificationCandidates(data, evening)).toHaveLength(0);
    data.logs = [];
    data.habits[0]!.optional = true;
    expect(notificationCandidates(data, evening)).toHaveLength(0);
    data.habits[0]!.optional = false;
    data.exceptions = [{ id: "holiday", habitId: "habit-read", localDate: "2026-10-05", applicable: false, reason: "Holiday" }];
    expect(notificationCandidates(data, evening)).toHaveLength(0);
  });

  it("does not send evening Build reminders for Avoid habits or inactive start dates", () => {
    const data = state();
    data.rules[0]!.direction = "avoid";
    expect(notificationCandidates(data, evening)).toHaveLength(0);
    data.rules[0]!.direction = "build";
    data.rules[0]!.effectiveFrom = "2026-10-25";
    expect(notificationCandidates(data, evening)).toHaveLength(0);
  });

  it("separates explicit skips and Avoid slips and stops alerts after undo or completion", () => {
    const data = state();
    data.logs = [log("2026-10-05", false)];
    expect(notificationCandidates(data, evening).map((notice) => notice.kind)).toEqual(["skip"]);
    data.rules[0]!.direction = "avoid";
    expect(notificationCandidates(data, evening).map((notice) => notice.kind)).toEqual(["slip"]);
    data.logs[0]!.booleanValue = true;
    expect(notificationCandidates(data, evening)).toHaveLength(0);
    data.logs = [];
    expect(notificationCandidates(data, evening)).toHaveLength(0);
  });

  it("defers nighttime slips until morning and avoids retroactive or paused alerts", () => {
    const data = state();
    data.rules[0]!.direction = "avoid";
    data.logs = [log("2026-10-05", false, "2026-10-06T05:30:00Z")];
    expect(notificationCandidates(data, new Date("2026-10-06T05:35:00Z"))).toHaveLength(0);
    expect(notificationCandidates(data, new Date("2026-10-06T14:00:00Z"))[0]!.kind).toBe("slip");
    data.settings.notifications.enabledAt = "2026-10-06T15:00:00Z";
    expect(notificationCandidates(data, new Date("2026-10-06T16:00:00Z"))).toHaveLength(0);
    data.settings.notifications.enabled = false;
    expect(notificationCandidates(data, evening)).toHaveLength(0);
  });

  it("distinguishes trend evidence, ignores exemptions, and requires three eligible misses", () => {
    const data = state();
    data.rules[0]!.effectiveFrom = "2026-10-02";
    data.logs = [log("2026-10-02", false, "2026-10-03T00:00:00Z")];
    const trend = notificationCandidates(data, morning)[0]!;
    expect(trend.kind).toBe("trend");
    expect(trend.body).toContain("1 skipped / off-target, 2 unconfirmed of 3 scheduled days");
    data.exceptions = [{ id: "holiday", habitId: "habit-read", localDate: "2026-10-04", applicable: false, reason: "Holiday" }];
    expect(notificationCandidates(data, morning)).toHaveLength(0);
  });

  it("does not nag again all evening and uses stable deduplication keys", () => {
    const data = state();
    const first = notificationCandidates(data, evening)[0]!;
    expect(notificationCandidates(data, new Date("2026-10-06T04:00:00Z"))[0]!.key).toBe(first.key);
    expect(notificationCandidates(data, new Date("2026-10-06T04:31:00Z"))).toHaveLength(0);
  });

  it("hides habit names, respects category switches, and keeps originals separate from quotes", () => {
    const data = state();
    data.settings.notifications.showHabitNames = false;
    const notice = buildAccountabilityNotice(data, "slip", "2026-10-05", data.habits[0]);
    expect(notice.body).not.toContain("15 min Read");
    expect(notice.challenge).not.toContain(notice.quote!.author);
    data.settings.notifications.quotes = false;
    expect(buildAccountabilityNotice(data, "skip", "2026-10-05", data.habits[0]).quote).toBeNull();
    data.settings.notifications.evening = false;
    expect(notificationCandidates(data, evening)).toHaveLength(0);
  });

  it("normalizes malformed imported settings and handles quiet hours through midnight", () => {
    const settings = normalizeNotifications({ eveningTime: "invalid", quietStart: "22:00", quietEnd: "07:00" });
    expect(settings.eveningTime).toBe("20:30");
    expect(settings.enabled).toBe(false);
    expect(isQuietTime(23 * 60, settings)).toBe(true);
    expect(isQuietTime(6 * 60, settings)).toBe(true);
    expect(isQuietTime(9 * 60, settings)).toBe(false);
    expect(isQuietTime(0, { ...settings, quietStart: "00:00", quietEnd: "00:00" })).toBe(false);
    expect(pickCoachQuote("same-key")).toEqual(pickCoachQuote("same-key"));
  });
});
