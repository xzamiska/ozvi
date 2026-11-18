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

/**
 * Widget token from an e-mail verification in the widget (ADR-0014), per Ozvi host and project. Keep the prefix in
 * sync with WIDGET_TOKEN_PREFIX in apps/web/src/lib/storage-keys.ts (privacy kit; a test checks it).
 */
export const TOKEN_PREFIX = "ozvi:wt:";
export const tokenKey = (host: string, project: string) => `${TOKEN_PREFIX}${host}/${project}`;

export function readToken(store: Pick<Storage, "getItem"> | null, key: string): string | null {
  try { return store?.getItem(key) || null; } catch { return null; }
}

/** Saves the token, or removes it with null (the server no longer accepts it). */
export function writeToken(store: Pick<Storage, "setItem" | "removeItem"> | null, key: string, token: string | null): void {
  try { if (token) store?.setItem(key, token); else store?.removeItem(key); } catch { /* private mode, blocked storage */ }
}

/** Ozvi.logout(): every widget token on this page's origin goes with the person who signed out. */
export function forgetTokens(store: Storage | null): void {
  try { for (const k of Object.keys(store ?? {})) if (k.startsWith(TOKEN_PREFIX)) store!.removeItem(k); } catch { /* storage off */ }
}
