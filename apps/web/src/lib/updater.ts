import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Client for the optional ozvi-updater sidecar (apps/updater, docs/SELFHOST.md → Aktualizácie).
 * Configured with OZVI_UPDATER_URL + OZVI_UPDATER_TOKEN; without them the admin shows the manual command.
 */

export type UpdaterMode = "notify" | "manual" | "auto";
export const UPDATER_MODES: readonly UpdaterMode[] = ["notify", "manual", "auto"];

export type Skip = "dev" | "upToDate" | "pinned" | "outsideLine" | "notifyOnly" | "notAuto" | "breaking" | "outsideWindow";

export interface UpdaterRelease { version: string; date?: string; breaking?: boolean; url?: string }
export interface UpdaterHistory {
  at: string; trigger: "manual" | "scheduled"; from: string; to: string | null;
  result: "updated" | "rolledBack" | "failed" | "noChange"; message?: string; backup?: string;
}
export interface UpdaterStatus {
  mode: UpdaterMode;
  window: string;
  timeZone: string;
  current: string | null;
  ref: string | null;
  decision: { update: true; target: UpdaterRelease } | { update: false; reason: Skip; newer: UpdaterRelease | null } | null;
  releases: UpdaterRelease[];
  feedAt: string | null;
  running: boolean;
  phase: string | null;
  history: UpdaterHistory[];
}

export function updaterConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return env.OZVI_MODE !== "cloud" && !!env.OZVI_UPDATER_URL && (env.OZVI_UPDATER_TOKEN ?? "").length >= 24;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const base = (process.env.OZVI_UPDATER_URL ?? "").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${process.env.OZVI_UPDATER_TOKEN}`, "content-type": "application/json" },
  });
}

/** null = configured but unreachable (the sidecar is down or the token does not match). */
export async function updaterStatus(): Promise<UpdaterStatus | null> {
  if (!updaterConfigured()) return null;
  try {
    const res = await call("/status");
    return res.ok ? ((await res.json()) as UpdaterStatus) : null;
  } catch {
    return null;
  }
}

export async function updaterSetMode(mode: UpdaterMode): Promise<boolean> {
  if (!updaterConfigured() || !UPDATER_MODES.includes(mode)) return false;
  try { return (await call("/mode", { method: "PUT", body: JSON.stringify({ mode }) })).ok; } catch { return false; }
}

export async function updaterStart(): Promise<"started" | "busy" | "notifyOnly" | "unreachable"> {
  if (!updaterConfigured()) return "unreachable";
  try {
    const res = await call("/update", { method: "POST" });
    if (res.ok) return "started";
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return body.error === "notifyOnly" ? "notifyOnly" : body.error === "busy" ? "busy" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function updaterCheck(): Promise<boolean> {
  if (!updaterConfigured()) return false;
  try { return (await call("/check", { method: "POST" })).ok; } catch { return false; }
}

/** The sidecar calls back with the same shared token. */
export function updaterTokenOk(header: string | null, token = process.env.OZVI_UPDATER_TOKEN ?? ""): boolean {
  if (token.length < 24 || !header) return false;
  const got = Buffer.from(header.replace(/^Bearer /, ""));
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
