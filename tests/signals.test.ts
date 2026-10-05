import { describe, expect, it } from "vitest";
import { averageTime, isTimeAtOrBefore } from "../src/domain/signals";

describe("daily signal targets", () => {
  it("treats after-midnight bedtimes as later than an evening target", () => {
    expect(isTimeAtOrBefore("22:30", "23:00", true)).toBe(true);
    expect(isTimeAtOrBefore("00:30", "23:00", true)).toBe(false);
  });

  it("averages bedtimes correctly across midnight", () => {
    expect(averageTime(["23:30", "00:30"], true)).toBe("00:00");
  });

  it("compares wake times normally", () => {
    expect(isTimeAtOrBefore("06:15", "06:30")).toBe(true);
    expect(isTimeAtOrBefore("07:00", "06:30")).toBe(false);
  });
});
