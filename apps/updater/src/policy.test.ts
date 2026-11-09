import { describe, expect, it } from "vitest";
import { backupsToPrune, compareVersions, decide, inWindow, parseFeed, parseImageRef, reachable } from "./policy";

const rel = (...v: string[]) => v.map((version) => ({ version }));

describe("parseImageRef", () => {
  it("reads the line from the tag", () => {
    expect(parseImageRef("ghcr.io/xzamiska/ozvi:1").line).toEqual({ kind: "major", major: 1 });
    expect(parseImageRef("ghcr.io/xzamiska/ozvi:1.4").line).toEqual({ kind: "minor", major: 1, minor: 4 });
    expect(parseImageRef("ghcr.io/xzamiska/ozvi:1.4.2").line).toEqual({ kind: "pinned", version: "1.4.2" });
    expect(parseImageRef("ghcr.io/xzamiska/ozvi").line).toEqual({ kind: "latest" });
    expect(parseImageRef("ghcr.io/xzamiska/ozvi:latest").line).toEqual({ kind: "latest" });
  });
  it("does not mistake a registry port for a tag", () => {
    expect(parseImageRef("localhost:5000/ozvi")).toMatchObject({ repo: "localhost:5000/ozvi", tag: "latest" });
    expect(parseImageRef("localhost:5000/ozvi:1")).toMatchObject({ repo: "localhost:5000/ozvi", tag: "1" });
  });
});

describe("reachable", () => {
  const all = rel("1.4.2", "1.4.3", "1.5.0", "2.0.0", "2.1.0-rc.1");
  it("stays in the line", () => {
    expect(reachable(all, parseImageRef("x:1.4").line)?.version).toBe("1.4.3");
    expect(reachable(all, parseImageRef("x:1").line)?.version).toBe("1.5.0");
    expect(reachable(all, parseImageRef("x:latest").line)?.version).toBe("2.0.0");
    expect(reachable(all, parseImageRef("x:1.4.2").line)?.version).toBe("1.4.2");
  });
});

describe("decide", () => {
  const releases = rel("1.4.2", "1.5.0", "2.0.0");
  const base = { current: "1.4.2", releases, ref: "ghcr.io/xzamiska/ozvi:1", mode: "manual" as const, trigger: "manual" as const };

  it("updates within the line on request", () => {
    expect(decide(base)).toEqual({ update: true, target: { version: "1.5.0" } });
  });
  it("never acts in notify mode", () => {
    expect(decide({ ...base, mode: "notify" })).toMatchObject({ update: false, reason: "notifyOnly" });
  });
  it("runs unattended only in auto mode", () => {
    expect(decide({ ...base, trigger: "scheduled" })).toMatchObject({ update: false, reason: "notAuto" });
    expect(decide({ ...base, mode: "auto", trigger: "scheduled" })).toMatchObject({ update: true });
  });
  it("never takes a new major or a breaking release unattended", () => {
    expect(decide({ ...base, ref: "x:latest", current: "1.5.0", mode: "auto", trigger: "scheduled" }))
      .toMatchObject({ update: false, reason: "breaking" });
    expect(decide({ ...base, releases: [{ version: "1.5.0", breaking: true }], mode: "auto", trigger: "scheduled" }))
      .toMatchObject({ update: false, reason: "breaking" });
    // …but the operator may take it with the button.
    expect(decide({ ...base, ref: "x:latest", current: "1.5.0" })).toMatchObject({ update: true, target: { version: "2.0.0" } });
  });
  it("explains why a newer release is out of reach", () => {
    expect(decide({ ...base, current: "1.5.0" })).toMatchObject({ update: false, reason: "outsideLine", newer: { version: "2.0.0" } });
    expect(decide({ ...base, ref: "x:1.4.2" })).toMatchObject({ update: false, reason: "pinned" });
    expect(decide({ ...base, current: "2.0.0" })).toMatchObject({ update: false, reason: "upToDate" });
    expect(decide({ ...base, current: "dev" })).toMatchObject({ update: false, reason: "dev" });
  });
});

describe("inWindow", () => {
  const at = (iso: string) => new Date(iso);
  it("respects the time zone", () => {
    // 01:30 UTC is 02:30 in Bratislava in winter.
    expect(inWindow(at("2026-11-09T01:30:00Z"), "02:00-05:00", "Europe/Bratislava")).toBe(true);
    expect(inWindow(at("2026-11-09T01:30:00Z"), "02:00-05:00", "UTC")).toBe(false);
  });
  it("wraps midnight and rejects garbage", () => {
    expect(inWindow(at("2026-11-09T23:30:00Z"), "23:00-02:00")).toBe(true);
    expect(inWindow(at("2026-11-09T12:00:00Z"), "23:00-02:00")).toBe(false);
    expect(inWindow(at("2026-11-09T03:00:00Z"), "nonsense")).toBe(false);
    expect(inWindow(at("2026-11-09T03:00:00Z"), "02:00-05:00", "Not/AZone")).toBe(false);
  });
});

describe("parseFeed", () => {
  it("keeps valid releases, newest first, and drops junk", () => {
    expect(parseFeed({
      latest: { version: "1.5.0", url: "https://ozvi.io/releases#1.5.0" },
      releases: [{ version: "1.4.2", breaking: true }, { version: "nope" }, { version: "1.5.0", url: "http://x" }],
    }).map((r) => r.version)).toEqual(["1.5.0", "1.4.2"]);
    expect(parseFeed(null)).toEqual([]);
  });
});

it("compareVersions orders pre-releases first", () => {
  expect(compareVersions("1.10.0", "1.9.3")).toBe(1);
  expect(compareVersions("1.5.0-rc.1", "1.5.0")).toBe(-1);
});

it("backupsToPrune keeps the newest", () => {
  const names = ["ozvi-2026-11-01T02-00-00Z-1.4.0.dump", "ozvi-2026-11-03T02-00-00Z-1.4.1.dump", "ozvi-2026-11-05T02-00-00Z-1.4.2.dump", "other.txt"];
  expect(backupsToPrune(names, 2)).toEqual(["ozvi-2026-11-01T02-00-00Z-1.4.0.dump"]);
});
