import { describe, expect, it } from "vitest";
import { compareVersions, updateCheckEnabled } from "./version";

describe("self-host versions", () => {
  it("compares semver including pre-releases", () => {
    expect(compareVersions("1.10.0", "1.9.3")).toBe(1);
    expect(compareVersions("1.4.2", "1.4.2")).toBe(0);
    expect(compareVersions("v2.0.0", "1.99.99")).toBe(1);
    expect(compareVersions("1.5.0-rc.1", "1.5.0")).toBe(-1);
  });
  it("checks only on released self-host images unless turned off", () => {
    expect(updateCheckEnabled({ OZVI_VERSION: "1.4.2" })).toBe(true);
    expect(updateCheckEnabled({ OZVI_VERSION: "1.4.2", OZVI_UPDATE_CHECK: "0" })).toBe(false);
    expect(updateCheckEnabled({ OZVI_VERSION: "1.4.2", OZVI_MODE: "cloud" })).toBe(false);
    expect(updateCheckEnabled({})).toBe(false);
  });
});
