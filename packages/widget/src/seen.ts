/**
 * "What's new" badge: which changelog entries this person has not seen yet. Kept in localStorage only
 * (per Ozvi host, project and person: identify({id}) or the id inside the SSO token, else "anon"); nothing
 * is sent to Ozvi. Pure apart from the Storage passed in, so it is unit-tested.
 */

/** Keep in sync with WIDGET_SEEN_PREFIX in apps/web/src/lib/storage-keys.ts (privacy kit; a test checks it). */
export const SEEN_PREFIX = "ozvi:seen:";
export const seenKey = (host: string, project: string, uid: string) => `${SEEN_PREFIX}${host}|${project}|${uid || "anon"}`;

/** ISO date of the newest entry the person has seen, or null (never looked). Storage may be blocked. */
export function readSeen(store: Pick<Storage, "getItem"> | null, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}

export function writeSeen(store: Pick<Storage, "setItem"> | null, key: string, entries: { publishedAt: string }[]): void {
  const newest = entries.map((e) => e.publishedAt).sort().at(-1);
  if (!newest) return;
  try { store?.setItem(key, newest); } catch { /* private mode, blocked storage */ }
}

/** Entries published after the last one seen; on a first visit all of the listed ones are new. */
export function isUnseen(entry: { publishedAt: string }, seen: string | null): boolean {
  return !seen || entry.publishedAt > seen;
}

export const unseenCount = (entries: { publishedAt: string }[], seen: string | null) => entries.filter((e) => isUnseen(e, seen)).length;
