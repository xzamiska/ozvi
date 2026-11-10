import { describe, expect, it } from "vitest";
import { parseNote, published, releaseFeed } from "./releases";
import { updaterConfigured, updaterTokenOk } from "./updater";
import { updaterMail } from "./updater-mail";

const TOKEN = "t".repeat(32);

describe("updater wiring", () => {
  it("is configured only in self mode with a long token", () => {
    expect(updaterConfigured({ OZVI_UPDATER_URL: "http://updater:8787", OZVI_UPDATER_TOKEN: TOKEN })).toBe(true);
    expect(updaterConfigured({ OZVI_UPDATER_URL: "http://updater:8787", OZVI_UPDATER_TOKEN: "short" })).toBe(false);
    expect(updaterConfigured({ OZVI_UPDATER_URL: "http://updater:8787", OZVI_UPDATER_TOKEN: TOKEN, OZVI_MODE: "cloud" })).toBe(false);
    expect(updaterConfigured({ OZVI_UPDATER_TOKEN: TOKEN })).toBe(false);
  });
  it("checks the callback token exactly", () => {
    expect(updaterTokenOk(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(updaterTokenOk(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(updaterTokenOk(null, TOKEN)).toBe(false);
    expect(updaterTokenOk(`Bearer ${"x".repeat(10)}`, "x".repeat(10))).toBe(false); // too short to be trusted
  });
});

describe("updater e-mails", () => {
  const ctx = { server: "https://feedback.example.com", settingsUrl: "https://feedback.example.com/app1/admin" };
  it("never mails a new version or a successful update", () => {
    expect(updaterMail({ type: "available", from: "1.4.2", to: "1.5.0", reason: "auto" }, ctx, "sk")).toBeNull();
    expect(updaterMail({ type: "updated", from: "1.4.2", to: "1.5.0", backup: "x.dump" }, ctx, "sk")).toBeNull();
  });
  it("reports a rollback with the reason, and ignores 'started'", () => {
    const m = updaterMail({ type: "rolledBack", from: "1.4.2", to: "1.5.0", message: "health\ncheck   timed out" }, ctx, "sk")!;
    expect(m.subject).toContain("1.5.0");
    expect(m.paragraphs).toContain("Dôvod: health check timed out");
    expect(updaterMail({ type: "started" }, ctx, "sk")).toBeNull();
  });
});

describe("release notes", () => {
  it("leaves out notes newer than the published release on a build of main", () => {
    expect(published("1.0.5", "1.0.4")).toBe(false);
    expect(published("1.0.4", "1.0.4")).toBe(true);
    expect(published("1.0.5", "")).toBe(true);
    expect(published("1.0.5", undefined)).toBe(true);
  });
  it("reads the front matter", () => {
    expect(parseNote("1.5.0", "---\ndate: 2026-11-20\nbreaking: true\n---\n### Nové\n- x\n"))
      .toEqual({ version: "1.5.0", date: "2026-11-20", breaking: true, body: "### Nové\n- x" });
    expect(parseNote("1.5.1", "Len text")).toEqual({ version: "1.5.1", date: null, breaking: false, body: "Len text" });
  });
  it("builds the feed the updater and the update check read", () => {
    const f = releaseFeed([parseNote("1.5.0", "a"), parseNote("1.4.2", "b")], "https://ozvi.io");
    expect(f.latest).toEqual({ version: "1.5.0", date: undefined, breaking: false, url: "https://ozvi.io/releases#v1-5-0" });
    expect(f.releases.map((r) => r.version)).toEqual(["1.5.0", "1.4.2"]);
  });
});
