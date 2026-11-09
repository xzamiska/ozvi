import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { compareVersions } from "./version";

/**
 * Ozvi's own release notes: apps/web/releases/<version>.md with a small front matter
 * (date, breaking). The release workflow refuses a tag without its notes; ozvi.io serves them as
 * /releases (page) and /releases.json (feed for the self-host update check and ozvi-updater).
 */

export interface ReleaseNote { version: string; date: string | null; breaking: boolean; body: string }

const DIR = () => process.env.OZVI_RELEASES_DIR ?? join(process.cwd(), "releases");
const VERSION = /^(\d+\.\d+\.\d+(?:-[\w.]+)?)\.md$/;

export function parseNote(version: string, src: string): ReleaseNote {
  let date: string | null = null, breaking = false, body = src;
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (fm) {
    body = src.slice(fm[0].length);
    for (const line of fm[1]!.split(/\r?\n/)) {
      const m = /^(\w+):\s*(.*?)\s*$/.exec(line);
      if (!m) continue;
      if (m[1] === "date" && /^\d{4}-\d{2}-\d{2}$/.test(m[2]!)) date = m[2]!;
      if (m[1] === "breaking") breaking = m[2] === "true";
    }
  }
  return { version, date, breaking, body: body.trim() };
}

let cache: { at: number; notes: ReleaseNote[] } | null = null;

/** Newest first; pre-releases are left out of the public list. */
export async function releaseNotes(): Promise<ReleaseNote[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.notes;
  let files: string[] = [];
  try { files = await readdir(DIR()); } catch { /* no notes shipped */ }
  const notes: ReleaseNote[] = [];
  for (const f of files) {
    const m = VERSION.exec(f);
    if (!m || m[1]!.includes("-")) continue;
    notes.push(parseNote(m[1]!, await readFile(join(DIR(), f), "utf8")));
  }
  notes.sort((a, b) => compareVersions(b.version, a.version));
  cache = { at: Date.now(), notes };
  return notes;
}

export const releaseAnchor = (v: string) => `v${v.replace(/\./g, "-")}`;

export function releaseFeed(notes: ReleaseNote[], origin: string) {
  const item = (n: ReleaseNote) => ({ version: n.version, date: n.date ?? undefined, breaking: n.breaking, url: `${origin}/releases#${releaseAnchor(n.version)}` });
  return { latest: notes[0] ? item(notes[0]) : null, releases: notes.slice(0, 30).map(item) };
}
