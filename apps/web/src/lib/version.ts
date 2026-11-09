import "server-only";

/**
 * Self-host update notice. The image carries its version (Dockerfile ARG OZVI_VERSION). Once a day
 * the admin page compares it with the public release list; nothing about the instance is sent
 * (a plain GET, no identifiers). Operators update themselves: `docker compose pull && up -d`,
 * migrations run on start. Off in cloud mode, in dev builds, or with OZVI_UPDATE_CHECK=0.
 */

export const OZVI_VERSION = process.env.OZVI_VERSION || "dev";
const RELEASES_URL = () => process.env.OZVI_RELEASES_URL || "https://ozvi.io/releases.json";
const DAY = 86_400_000;

export interface Release { version: string; url: string; date?: string; breaking?: boolean }
export interface UpdateInfo { current: string; latest: Release | null; newer: boolean; checkedAt: Date | null }

let cache: { at: number; latest: Release | null } | null = null;

/** "1.10.0" > "1.9.3"; pre-release suffixes sort before the release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core = "", pre] = v.replace(/^v/, "").split("-", 2);
    return { nums: core.split(".").map((n) => Number.parseInt(n, 10) || 0), pre };
  };
  const x = parse(a), y = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre && !y.pre) return -1;
  if (!x.pre && y.pre) return 1;
  return (x.pre ?? "").localeCompare(y.pre ?? "");
}

export function updateCheckEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.OZVI_MODE !== "cloud" && env.OZVI_UPDATE_CHECK !== "0" && (env.OZVI_VERSION ?? "dev") !== "dev";
}

export async function checkForUpdate(f: typeof fetch = fetch, now = Date.now()): Promise<UpdateInfo> {
  const base: UpdateInfo = { current: OZVI_VERSION, latest: null, newer: false, checkedAt: null };
  if (!updateCheckEnabled()) return base;
  if (!cache || now - cache.at > DAY) {
    let latest: Release | null = null;
    try {
      const res = await f(RELEASES_URL(), { signal: AbortSignal.timeout(5000), headers: { accept: "application/json" } });
      if (res.ok) {
        const body = (await res.json()) as { latest?: Partial<Release> };
        const l = body.latest;
        if (l && typeof l.version === "string" && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(l.version) && typeof l.url === "string" && l.url.startsWith("https://")) {
          latest = { version: l.version, url: l.url, date: typeof l.date === "string" ? l.date : undefined, breaking: l.breaking === true };
        }
      }
    } catch { /* offline or blocked: just no notice */ }
    cache = { at: now, latest };
  }
  const latest = cache.latest;
  return { current: OZVI_VERSION, latest, newer: !!latest && compareVersions(latest.version, OZVI_VERSION) > 0, checkedAt: new Date(cache.at) };
}
