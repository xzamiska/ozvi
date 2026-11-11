/**
 * Comparison pages on ozvi.io (cloud only): one URL per language, paired by hreflang. Slovak is the
 * default (x-default). The copy lives in components/compare/content; this module only knows paths,
 * so the proxy, the sitemap and <html lang> can use it without loading any page code.
 */

export type CompareLocale = "sk" | "en";
export type CompareId = "canny" | "featurebase" | "fider";

export const COMPARE_PATH: Record<CompareId, Record<CompareLocale, string>> = {
  canny: { sk: "/vs/canny", en: "/en/vs/canny" },
  featurebase: { sk: "/vs/featurebase", en: "/en/vs/featurebase" },
  fider: { sk: "/alternativa-k-fideru", en: "/en/fider-alternative" },
};

export const COMPARE_IDS = Object.keys(COMPARE_PATH) as CompareId[];

/** Every comparison URL, both languages. */
export const COMPARE_PATHS: string[] = COMPARE_IDS.flatMap((id) => [COMPARE_PATH[id].sk, COMPARE_PATH[id].en]);

/** First path segments the comparison pages take at the root (never a board slug). */
export const COMPARE_ROOTS = ["vs", "alternativa-k-fideru"] as const;

/** hreflang pair for one page: sk, en and x-default (sk). */
export function compareLanguages(id: CompareId): Record<string, string> {
  const p = COMPARE_PATH[id];
  return { sk: p.sk, en: p.en, "x-default": p.sk };
}

/** The language of a comparison URL, or null for any other path. */
export function compareLocale(path: string): CompareLocale | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const id of COMPARE_IDS) {
    if (COMPARE_PATH[id].sk === clean) return "sk";
    if (COMPARE_PATH[id].en === clean) return "en";
  }
  return null;
}
