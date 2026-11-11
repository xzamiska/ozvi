import { createHash } from "node:crypto";
import { schema, withSystem, type Db } from "@ozvi/db";
import { sql } from "drizzle-orm";
import { OZVI_VERSION } from "./version";

/**
 * Anonymous usage statistics (ADR-0012). Self-hosted servers send nothing unless the operator sets
 * OZVI_TELEMETRY=1. Then once a day: a one-way instance id, the version and five counts. Never names,
 * e-mail addresses, URLs, project slugs or any content. The cloud keeps one row per instance.
 */

export const TELEMETRY_URL = (env: Record<string, string | undefined> = process.env) =>
  (env.OZVI_TELEMETRY_URL || "https://ozvi.io/api/telemetry").replace(/\/$/, "");

export const telemetryEnabled = (env: Record<string, string | undefined> = process.env) =>
  env.OZVI_MODE !== "cloud" && env.OZVI_TELEMETRY === "1" && (env.OZVI_VERSION ?? "dev") !== "dev";

/** Stable per server, not reversible: a hash of the instance's own secret, salted for this purpose. */
export function instanceId(secret = process.env.OZVI_SECRET_KEY ?? ""): string {
  return createHash("sha256").update(`ozvi-telemetry-v1:${secret}`).digest("hex").slice(0, 32);
}

export interface TelemetryReport {
  instance: string;
  version: string;
  projects: number;
  users: number;
  activeUsers30: number;
  items: number;
  items30: number;
}

export async function collectReport(db: Db): Promise<TelemetryReport> {
  const [r] = await withSystem(db, (tx) => tx.execute<{ projects: number; users: number; active: number; items: number; items30: number }>(sql`
    select (select count(*)::int from ${schema.projects}) projects,
      (select count(*)::int from ${schema.users}) users,
      (select count(*)::int from ${schema.users} where ${schema.users.lastSeenAt} >= now() - interval '30 days') active,
      (select count(*)::int from ${schema.items}) items,
      (select count(*)::int from ${schema.items} where ${schema.items.createdAt} >= now() - interval '30 days') items30`));
  return {
    instance: instanceId(), version: OZVI_VERSION,
    projects: Number(r?.projects ?? 0), users: Number(r?.users ?? 0), activeUsers30: Number(r?.active ?? 0),
    items: Number(r?.items ?? 0), items30: Number(r?.items30 ?? 0),
  };
}

/** The daily job: sends only when opted in; a failed send is simply tried again tomorrow. */
export async function telemetryTick(db: Db, f: typeof fetch = fetch): Promise<boolean> {
  if (!telemetryEnabled()) return false;
  const report = await collectReport(db);
  const res = await f(TELEMETRY_URL(), {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(report), signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res?.ok;
}

const COUNT = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000_000;

/** Validates a report from the wire: exactly the documented fields, nothing else is stored. */
export function parseReport(body: unknown): TelemetryReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.instance !== "string" || !/^[0-9a-f]{32}$/.test(b.instance)) return null;
  if (typeof b.version !== "string" || !/^[0-9A-Za-z.+-]{1,32}$/.test(b.version)) return null;
  for (const k of ["projects", "users", "activeUsers30", "items", "items30"]) if (!COUNT(b[k])) return null;
  return {
    instance: b.instance, version: b.version, projects: b.projects as number, users: b.users as number,
    activeUsers30: b.activeUsers30 as number, items: b.items as number, items30: b.items30 as number,
  };
}

/** Cloud side: one row per instance, the latest counts win. */
export async function storeReport(db: Db, r: TelemetryReport): Promise<void> {
  const t = schema.telemetryInstances;
  const values = { id: r.instance, version: r.version, projects: r.projects, users: r.users, activeUsers30: r.activeUsers30, items: r.items, items30: r.items30 };
  await db.insert(t).values(values).onConflictDoUpdate({
    target: t.id,
    set: { ...values, reports: sql`${t.reports} + 1`, lastSeen: sql`now()` },
  });
}
