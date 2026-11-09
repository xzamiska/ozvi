/**
 * Pure decisions of the updater: which image line the operator follows, which release that line can
 * reach, whether an update may run now. No I/O here, so it is fully unit-tested.
 */

export type Mode = "notify" | "manual" | "auto";
export const MODES: readonly Mode[] = ["notify", "manual", "auto"];

export interface Release { version: string; date?: string; breaking?: boolean; url?: string }

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

export const isVersion = (v: unknown): v is string => typeof v === "string" && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v);
const major = (v: string) => Number.parseInt(v.split(".")[0] ?? "0", 10);
const minor = (v: string) => Number.parseInt(v.split(".")[1] ?? "0", 10);

/**
 * The image line from OZVI_IMAGE's tag. `docker compose pull` only ever moves within it:
 * `:1.4.2` never moves, `:1.4` gets patches, `:1` gets minor + patch, `:latest` gets everything.
 */
export type Line =
  | { kind: "pinned"; version: string }
  | { kind: "minor"; major: number; minor: number }
  | { kind: "major"; major: number }
  | { kind: "latest" };

export function parseImageRef(ref: string): { repo: string; tag: string; line: Line } {
  // The tag is after the last ":" that comes after the last "/" (a registry may have a port).
  const slash = ref.lastIndexOf("/");
  const colon = ref.lastIndexOf(":");
  const hasTag = colon > slash;
  const repo = (hasTag ? ref.slice(0, colon) : ref).split("@")[0]!;
  const tag = hasTag ? ref.slice(colon + 1) : "latest";
  let line: Line = { kind: "latest" };
  if (/^v?\d+\.\d+\.\d+(-[\w.]+)?$/.test(tag)) line = { kind: "pinned", version: tag.replace(/^v/, "") };
  else if (/^v?\d+\.\d+$/.test(tag)) { const [a, b] = tag.replace(/^v/, "").split("."); line = { kind: "minor", major: +a!, minor: +b! }; }
  else if (/^v?\d+$/.test(tag)) line = { kind: "major", major: +tag.replace(/^v/, "") };
  return { repo, tag, line };
}

export function inLine(v: string, line: Line): boolean {
  if (v.includes("-")) return false; // pre-releases are never pulled by a moving tag
  switch (line.kind) {
    case "pinned": return compareVersions(v, line.version) === 0;
    case "minor": return major(v) === line.major && minor(v) === line.minor;
    case "major": return major(v) === line.major;
    case "latest": return true;
  }
}

/** Newest release the configured image line can pull, if any. */
export function reachable(releases: Release[], line: Line): Release | null {
  let best: Release | null = null;
  for (const r of releases) if (isVersion(r.version) && inLine(r.version, line) && (!best || compareVersions(r.version, best.version) > 0)) best = r;
  return best;
}

export type Skip =
  | "dev"          // the running image has no release version
  | "upToDate"
  | "pinned"       // OZVI_IMAGE names an exact version; only the operator moves it
  | "outsideLine"  // a newer release exists but in another line (e.g. 2.0 while following :1)
  | "notifyOnly"   // mode "notify": the updater never changes anything
  | "notAuto"      // a scheduled run, but the mode is not "auto"
  | "breaking"     // automatic runs never take a release marked breaking or a new major
  | "outsideWindow";

export type Decision = { update: true; target: Release } | { update: false; reason: Skip; newer: Release | null };

export function decide(o: {
  current: string; releases: Release[]; ref: string; mode: Mode; trigger: "manual" | "scheduled";
}): Decision {
  const newest = o.releases.filter((r) => isVersion(r.version) && !r.version.includes("-"))
    .reduce<Release | null>((a, r) => (!a || compareVersions(r.version, a.version) > 0 ? r : a), null);
  const newer = newest && isVersion(o.current) && compareVersions(newest.version, o.current) > 0 ? newest : null;
  if (!isVersion(o.current)) return { update: false, reason: "dev", newer: null };

  const { line } = parseImageRef(o.ref);
  const target = reachable(o.releases, line);
  if (!target || compareVersions(target.version, o.current) <= 0) {
    if (!newer) return { update: false, reason: "upToDate", newer: null };
    return { update: false, reason: line.kind === "pinned" ? "pinned" : "outsideLine", newer };
  }
  if (o.mode === "notify") return { update: false, reason: "notifyOnly", newer: target };
  if (o.trigger === "scheduled") {
    if (o.mode !== "auto") return { update: false, reason: "notAuto", newer: target };
    if (target.breaking || major(target.version) !== major(o.current)) return { update: false, reason: "breaking", newer: target };
  }
  return { update: true, target };
}

/** "02:00-05:00" in the given IANA zone; a window may wrap midnight ("23:00-02:00"). */
export function inWindow(now: Date, window: string, timeZone = "UTC"): boolean {
  const m = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(window.trim());
  if (!m) return false;
  const from = +m[1]! * 60 + +m[2]!, to = +m[3]! * 60 + +m[4]!;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  } catch {
    return false; // unknown zone: never run unattended
  }
  const h = +(parts.find((p) => p.type === "hour")?.value ?? "0"), mi = +(parts.find((p) => p.type === "minute")?.value ?? "0");
  const t = h * 60 + mi;
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

/** Validates the public release list; anything malformed is dropped rather than trusted. */
export function parseFeed(body: unknown): Release[] {
  const b = body as { latest?: unknown; releases?: unknown } | null;
  const raw = [...(Array.isArray(b?.releases) ? b!.releases : []), ...(b?.latest ? [b.latest] : [])];
  const out = new Map<string, Release>();
  for (const r of raw as Partial<Release>[]) {
    if (!r || !isVersion(r.version)) continue;
    out.set(r.version, {
      version: r.version,
      date: typeof r.date === "string" ? r.date : undefined,
      breaking: r.breaking === true,
      url: typeof r.url === "string" && r.url.startsWith("https://") ? r.url : undefined,
    });
  }
  return [...out.values()].sort((a, b) => compareVersions(b.version, a.version));
}

/** Keep the newest `keep` backup files (names sort by their ISO timestamp). */
export function backupsToPrune(names: string[], keep = 5): string[] {
  return names.filter((n) => /^ozvi-.+\.dump$/.test(n)).sort().reverse().slice(keep);
}
