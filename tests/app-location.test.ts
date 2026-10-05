import { describe, expect, it } from "vitest";
import { appDirectoryPath, appDirectoryUrl } from "../src/data/app-location";

describe("application callback location", () => {
  it("preserves the GitHub Pages project path", () => {
    const callback = "https://cryphipdesigns-code.github.io/routine-command/?code=abc#session";
    expect(appDirectoryUrl(callback)).toBe(
      "https://cryphipdesigns-code.github.io/routine-command/",
    );
    expect(appDirectoryPath(callback)).toBe("/routine-command/");
  });

  it("keeps local development at the origin root", () => {
    expect(appDirectoryUrl("http://127.0.0.1:4175/?code=abc")).toBe(
      "http://127.0.0.1:4175/",
    );
    expect(appDirectoryPath("http://127.0.0.1:4175/")).toBe("/");
  });
});
