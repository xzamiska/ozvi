import { createDb } from "@ozvi/db";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
const { heartbeatTick, heartbeatUrl, stuckEmails } = await import("./heartbeat");
const db = createDb();

describe("heartbeat", () => {
  it("is off without OZVI_HEARTBEAT_URL", async () => {
    expect(heartbeatUrl({})).toBeNull();
    expect(heartbeatUrl({ OZVI_HEARTBEAT_URL: " https://errors.example/api/0/heartbeat/x/ " })).toBe("https://errors.example/api/0/heartbeat/x/");
    let called = false;
    expect(await heartbeatTick(db, { url: null, fetch: (async () => { called = true; return new Response(null); }) as typeof fetch })).toBe("off");
    expect(called).toBe(false);
  });

  it("beats when healthy, stays silent while e-mails are stuck, and survives an unreachable monitor", async () => {
    const calls: string[] = [];
    const ok = (async (u: string | URL | Request) => { calls.push(String(u)); return new Response(null, { status: 200 }); }) as typeof fetch;
    expect(await heartbeatTick(db, { url: "https://hb.example/1", fetch: ok, stuck: async () => 0 })).toBe("sent");
    expect(calls).toEqual(["https://hb.example/1"]);
    expect(await heartbeatTick(db, { url: "https://hb.example/1", fetch: ok, stuck: async () => 3 })).toBe("stuck");
    expect(calls).toHaveLength(1);
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    expect(await heartbeatTick(db, { url: "https://hb.example/1", fetch: down, stuck: async () => 0 })).toBe("failed");
  });

  it("counts stuck e-mails from the database", async () => {
    expect(await stuckEmails(db)).toBeGreaterThanOrEqual(0);
  });
});
