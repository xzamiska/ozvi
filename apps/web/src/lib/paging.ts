/**
 * "Načítať ďalšie" paging: the URL carries how many pages are shown (?p=3 → the first 150 rows), so a
 * reload, a shared link or the back button lands on the same list with filters, sort and search intact.
 * We fetch one row more than shown to know whether there is a next page.
 */

export const PAGE_SIZE = 50;
/** Upper bound for ?p, so a crafted URL cannot ask for an unbounded list. */
export const MAX_PAGES = 40;

export function pageParam(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGES) : 1;
}

/** Rows to ask the database for: everything shown plus one probe row. */
export const fetchLimit = (page: number, size = PAGE_SIZE) => page * size + 1;

export function takePage<T>(rows: T[], page: number, size = PAGE_SIZE): { rows: T[]; hasMore: boolean } {
  const shown = page * size;
  // At MAX_PAGES we stop offering more even if rows remain (the count still tells the truth).
  return { rows: rows.slice(0, shown), hasMore: rows.length > shown && page < MAX_PAGES };
}

/** Query string for the next page, keeping every other parameter. */
export function nextPageHref(params: Record<string, string | undefined>, page: number, key = "p"): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  sp.set(key, String(page + 1));
  return `?${sp}`;
}
