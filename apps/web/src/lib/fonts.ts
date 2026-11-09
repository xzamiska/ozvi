import { FONT_WEIGHTS } from "@ozvi/theme";

/**
 * First-party web fonts (pure part, no I/O). Visitors' browsers must never contact Google (GDPR: their IP
 * would reach Google), so Ozvi fetches Google Fonts server-side, rewrites the CSS to its own /fonts/file/…
 * URLs and serves everything from its origin. I/O and caching live in fonts-store.ts.
 */

export const MAX_FAMILIES = 4;
export const MAX_CSS_BYTES = 256 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Same alphabet as the theme's font names (letters, digits, spaces, hyphens). */
const FAMILY = /^[A-Za-z0-9][A-Za-z0-9 \-]{0,59}$/;
/** A gstatic woff2 path as Google's css2 API emits it, e.g. s/inter/v20/UcC73Fwr….woff2. Nothing else is fetched. */
export const FILE_PATH = /^s\/[a-z0-9]{1,64}\/v\d{1,4}\/[A-Za-z0-9_-]{1,200}\.woff2$/;

export interface FontQuery { families: string[]; weights: number[] }

/**
 * Parses /fonts/css?family=Inter&family=Funnel+Display&wght=400,500,600,700.
 * Returns null for anything outside the allow-list or malformed; families are deduplicated, weights sorted.
 */
export function parseFontQuery(params: URLSearchParams, allowed: (family: string) => boolean): FontQuery | null {
  const raw = params.getAll("family");
  if (!raw.length || raw.length > MAX_FAMILIES) return null;
  const families: string[] = [];
  for (const r of raw) {
    const f = r.trim();
    if (!FAMILY.test(f) || !allowed(f)) return null;
    if (!families.includes(f)) families.push(f);
  }
  const w = params.get("wght");
  let weights: number[] = [...FONT_WEIGHTS];
  if (w !== null) {
    const parts = w.split(/[,;]/);
    if (parts.length > 9) return null;
    const nums = parts.map((p) => (/^[1-9]00$/.test(p) ? Number(p) : NaN));
    if (nums.some(Number.isNaN)) return null;
    weights = [...new Set(nums)].sort((a, b) => a - b);
  }
  return { families, weights };
}

/** Google's css2 URL for one family (the store caches per family, so any combination can be composed offline). */
export function upstreamCssUrl(family: string, weights: number[] | null): string {
  const f = encodeURIComponent(family).replace(/%20/g, "+");
  return `https://fonts.googleapis.com/css2?family=${f}${weights ? `:wght@${weights.join(";")}` : ""}&display=swap`;
}

export function upstreamFileUrl(path: string): string {
  return `https://fonts.gstatic.com/${path}`;
}

/** Cache key / file name for one family + weight set. */
export function familyKey(family: string, weights: number[]): string {
  return `${family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}_${weights.join("-")}`;
}

/**
 * Rewrites Google's CSS so every font file comes from Ozvi: url(https://fonts.gstatic.com/s/…) → url(file/s/…),
 * relative to /fonts/css, so it works on custom domains and inside the widget on a foreign site.
 * Returns null when the CSS contains anything unexpected (another host, @import, an odd path) — never pass it on.
 */
export function rewriteCss(css: string): { css: string; files: string[] } | null {
  if (css.length > MAX_CSS_BYTES || /@import|expression\(|<\//i.test(css)) return null;
  const files: string[] = [];
  let bad = false;
  const out = css.replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (_, _q, url: string) => {
    const m = /^https:\/\/fonts\.gstatic\.com\/(.+)$/.exec(url);
    if (!m || !FILE_PATH.test(m[1]!)) { bad = true; return "url()"; }
    if (!files.includes(m[1]!)) files.push(m[1]!);
    return `url(file/${m[1]})`;
  });
  if (bad || !files.length || !/@font-face/.test(out)) return null;
  return { css: out, files };
}

/** Font files referenced by an already rewritten stylesheet (used to rebuild the allow-list from the disk cache). */
export function filesInCss(css: string): string[] {
  return [...css.matchAll(/url\(file\/([^)]+)\)/g)].map((m) => m[1]!).filter((p) => FILE_PATH.test(p));
}

/** woff2 files start with the "wOF2" signature. */
export function isWoff2(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32;
}

/** Served when fonts are unavailable: the theme's font stack already ends in system fonts, so nothing breaks. */
export const FALLBACK_CSS = "/* Ozvi: web font unavailable, the system font stack is used. */\n";
