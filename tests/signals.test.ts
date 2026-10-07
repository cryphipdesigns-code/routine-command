import { describe, expect, it } from "vitest";
import { averageTime, isTimeAtOrBefore, timeSignalStatus } from "../src/domain/signals";

describe("daily signal targets", () => {
  it("treats after-midnight bedtimes as later than an evening target", () => {
    expect(isTimeAtOrBefore("22:30", "23:00", true)).toBe(true);
    expect(isTimeAtOrBefore("00:30", "23:00", true)).toBe(false);
  });

  it.each([
    ["20:59", "21:00", true],
    ["21:00", "21:00", true],
    ["21:01", "21:00", false],
    ["23:59", "21:00", false],
    ["00:00", "21:00", false],
    ["01:00", "21:00", false],
    ["11:59", "21:00", false],
    ["23:30", "01:00", true],
    ["00:30", "01:00", true],
    ["01:00", "01:00", true],
    ["01:01", "01:00", false],
  ])("compares bedtime %s with target %s across midnight", (value, target, inRange) => {
    expect(isTimeAtOrBefore(value, target, true)).toBe(inRange);
    expect(timeSignalStatus("bedTime", value, target)).toEqual(inRange
      ? { tone: "in-range", label: "In range" }
      : { tone: "outside", label: "Outside target" });
  });

  it("keeps wake-time comparisons and missing entries distinct from overnight bedtimes", () => {
    expect(timeSignalStatus("wakeTime", "01:00", "21:00")).toEqual({ tone: "in-range", label: "In range" });
    expect(timeSignalStatus("bedTime", null, "21:00")).toEqual({ tone: "empty", label: "Not recorded" });
    expect(timeSignalStatus("bedTime", "01:00", null)).toEqual({ tone: "recorded", label: "Recorded" });
  });

  it("averages bedtimes correctly across midnight", () => {
    expect(averageTime(["23:30", "00:30"], true)).toBe("00:00");
    expect(averageTime(["23:30", "01:00"], true)).toBe("00:15");
  });

  it("compares wake times normally", () => {
    expect(isTimeAtOrBefore("06:15", "06:30")).toBe(true);
    expect(isTimeAtOrBefore("07:00", "06:30")).toBe(false);
  });
});
