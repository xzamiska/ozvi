import { createDb, schema } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgres://ozvi:ozvi@localhost:5446/ozvi";
const { instanceId, parseReport, storeReport, telemetryEnabled, telemetryTick } = await import("./telemetry");
const db = createDb();

describe("telemetry (opt-in)", () => {
  it("is off unless the operator opts in, and never in the cloud or a dev build", () => {
    expect(telemetryEnabled({ OZVI_MODE: "self", OZVI_VERSION: "1.2.0" })).toBe(false);
    expect(telemetryEnabled({ OZVI_MODE: "self", OZVI_VERSION: "1.2.0", OZVI_TELEMETRY: "1" })).toBe(true);
    expect(telemetryEnabled({ OZVI_MODE: "cloud", OZVI_VERSION: "1.2.0", OZVI_TELEMETRY: "1" })).toBe(false);
    expect(telemetryEnabled({ OZVI_MODE: "self", OZVI_VERSION: "dev", OZVI_TELEMETRY: "1" })).toBe(false);
  });

  it("sends nothing when not opted in", async () => {
    const saved = process.env.OZVI_TELEMETRY;
    delete process.env.OZVI_TELEMETRY;
    let called = false;
    expect(await telemetryTick(db, (async () => { called = true; return new Response(null); }) as typeof fetch)).toBe(false);
    expect(called).toBe(false);
    if (saved !== undefined) process.env.OZVI_TELEMETRY = saved;
  });

  it("derives a stable instance id that does not reveal the secret", () => {
    const a = instanceId("secret-one-0123456789abcdef0123456789");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(instanceId("secret-one-0123456789abcdef0123456789")).toBe(a);
    expect(instanceId("secret-two-0123456789abcdef0123456789")).not.toBe(a);
    expect(a).not.toContain("secret");
  });

  it("accepts exactly the documented fields and keeps one row per instance", async () => {
    const id = instanceId(`t-${Date.now()}`);
    const ok = { instance: id, version: "1.2.0", projects: 2, users: 40, activeUsers30: 12, items: 300, items30: 25 };
    expect(parseReport({ ...ok, email: "x@y.z" })).toEqual(ok);
    expect(parseReport({ ...ok, instance: "not-hex" })).toBeNull();
    expect(parseReport({ ...ok, users: -1 })).toBeNull();
    expect(parseReport({ ...ok, items: 1.5 })).toBeNull();
    expect(parseReport({ ...ok, version: "<script>" })).toBeNull();
    await storeReport(db, parseReport(ok)!);
    await storeReport(db, { ...ok, users: 41 });
    const row = await db.query.telemetryInstances.findFirst({ where: eq(schema.telemetryInstances.id, id) });
    expect([row?.users, row?.reports]).toEqual([41, 2]);
    await db.delete(schema.telemetryInstances).where(eq(schema.telemetryInstances.id, id));
  });
});
