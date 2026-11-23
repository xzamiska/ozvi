import { describe, expect, it } from "vitest";
import { isPace, summaryAt, SUMMARY_KINDS } from "./pace";

const at = (iso: string) => summaryAt("daily", new Date(iso))!.toISOString();

describe("team mail summaries", () => {
  it("right away = no summary; hourly = an hour after the first mail", () => {
    expect(summaryAt("instant", new Date())).toBeNull();
    expect(summaryAt(undefined, new Date())).toBeNull();
    expect(summaryAt("hourly", new Date("2026-11-20T10:15:00Z"))!.toISOString()).toBe("2026-11-20T11:15:00.000Z");
  });
  it("daily = the next 8:00 in Bratislava, in winter and in summer time", () => {
    expect(at("2026-11-20T05:00:00Z")).toBe("2026-11-20T07:00:00.000Z"); // 6:00 CET → today 8:00
    expect(at("2026-11-20T07:00:00Z")).toBe("2026-11-21T07:00:00.000Z"); // exactly 8:00 → tomorrow
    expect(at("2026-11-20T22:30:00Z")).toBe("2026-11-21T07:00:00.000Z"); // 23:30 CET
    expect(at("2026-07-01T12:00:00Z")).toBe("2026-07-02T06:00:00.000Z"); // CEST
  });
  it("daily across the night summer time ends or starts", () => {
    expect(at("2026-10-24T20:00:00Z")).toBe("2026-10-25T07:00:00.000Z"); // Sat 22:00 CEST → Sun 8:00 CET
    expect(at("2027-03-27T20:00:00Z")).toBe("2027-03-28T06:00:00.000Z"); // Sat 21:00 CET → Sun 8:00 CEST
  });
  it("only activity reports wait; digests, drafts and sign-in never", () => {
    for (const k of ["new_bug", "new_idea", "comment", "assigned"]) expect(SUMMARY_KINDS.has(k)).toBe(true);
    for (const k of ["team_digest", "release_draft", "login", "invite", "changelog", "digest"]) expect(SUMMARY_KINDS.has(k)).toBe(false);
    expect(isPace("hourly")).toBe(true);
    expect(isPace("weekly")).toBe(false);
  });
});
