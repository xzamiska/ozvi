/**
 * Readability guarantee for boards. Owners may pick any palette (we warn, never block), but a visitor
 * must always be able to read the board: before the palette becomes CSS, every text token the UI
 * derives from it is checked against WCAG 2.2 AA and the palette is nudged just enough to pass.
 *
 * The derived tokens mirror apps/web/src/app/globals.css (`:root, .oz-scope`), which mixes them
 * `in oklab`; keep the two in sync (a test pins the formulas).
 */

export interface Palette { accent: string; ink: string; surface: string; canvas: string; border: string }

// --- sRGB <-> OKLab -------------------------------------------------------------

type Lab = [number, number, number];
const toLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const fromLin = (v: number) => { const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, c)) * 255); };

function hexToLab(hex: string): Lab {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [toLin((n >> 16) & 255), toLin((n >> 8) & 255), toLin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function labToHex([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  return `#${rgb.map((v) => fromLin(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** CSS `color-mix(in oklab, a p, b)`, p in 0..1. */
export function mixOklab(a: string, b: string, p: number): string {
  const x = hexToLab(a), y = hexToLab(b);
  return labToHex([x[0] * p + y[0] * (1 - p), x[1] * p + y[1] * (1 - p), x[2] * p + y[2] * (1 - p)]);
}

// --- WCAG ----------------------------------------------------------------------

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * toLin((n >> 16) & 255) + 0.7152 * toLin((n >> 8) & 255) + 0.0722 * toLin(n & 255);
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
const onAccentOf = (accent: string) => (ratio(accent, "#FFFFFF") >= ratio(accent, "#000000") ? "#FFFFFF" : "#000000");

/** Fixed route-stage hues and their default share in the mix with ink (globals.css). */
export const STAGES = {
  "st-ack": { hue: "#C27C0E", share: 0.88 },
  "st-done": { hue: "#138A4B", share: 0.9 },
  danger: { hue: "#C8322A", share: 0.92 },
} as const;
/** Share of the first colour in the derived text mixes (globals.css). */
export const MIX = { muted: 0.62, accentText: 0.82 } as const;

/**
 * A stage hue as text on this palette: the globals.css default mix when it reads at 4.5:1, otherwise
 * the hue pulled further toward ink until it does (stage colours are Ozvi's, so they bend first).
 */
export function stageColor(stage: keyof typeof STAGES, p: Palette): string {
  const { hue, share } = STAGES[stage];
  let c = mixOklab(hue, p.ink, share);
  for (let s: number = share; s > 0 && (ratio(c, p.surface) < 4.5 || ratio(c, p.canvas) < 4.5); s = Math.max(0, s - 0.02)) c = mixOklab(hue, p.ink, s);
  return c;
}

/** Text tokens a board renders on surface/canvas, computed like globals.css does. */
export function derivedText(p: Palette): Record<string, string> {
  return {
    ink: p.ink,
    muted: mixOklab(p.ink, p.surface, MIX.muted),
    "accent-text": mixOklab(p.accent, p.ink, MIX.accentText),
    "st-ack": stageColor("st-ack", p),
    "st-done": stageColor("st-done", p),
    danger: stageColor("danger", p),
  };
}

export interface ContrastIssue { token: string; on: "surface" | "canvas" | "faint" | "wash" | "accent"; ratio: number; min: number }

/** Every pair the board relies on: text 4.5:1 (1.4.3), accent as focus ring / boundary 3:1 (1.4.11). */
export function auditPalette(p: Palette): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  const add = (token: string, fg: string, bg: string, on: ContrastIssue["on"], min: number) => {
    const r = ratio(fg, bg);
    if (r < min) out.push({ token, on, ratio: Math.round(r * 100) / 100, min });
  };
  for (const [token, fg] of Object.entries(derivedText(p))) {
    add(token, fg, p.surface, "surface", 4.5);
    add(token, fg, p.canvas, "canvas", 4.5);
  }
  // Secondary text also sits on the tinted wells: --oz-faint (tabs, chips) and --oz-wash (hover, drop zones).
  const muted = mixOklab(p.ink, p.surface, MIX.muted);
  add("muted", muted, mixOklab(p.ink, p.surface, 0.05), "faint", 4.5);
  add("muted", muted, mixOklab(p.ink, p.canvas, 0.03), "wash", 4.5);
  add("on-accent", onAccentOf(p.accent), p.accent, "accent", 4.5);
  add("accent", p.accent, p.surface, "surface", 3);
  return out;
}

/** Move `c` toward `target` in OKLab, step by step, until `ok` holds (or it gets there). */
function nudge(c: string, target: string, ok: (c: string) => boolean): string {
  if (ok(c)) return c;
  for (let i = 1; i <= 40; i++) {
    const next = mixOklab(target, c, i / 40);
    if (ok(next)) return next;
  }
  return target;
}

/**
 * The palette a board actually renders: unchanged when it already passes, otherwise the ink is pushed
 * away from the surface (darker on light boards, lighter on dark ones) and then the accent, just far
 * enough for every derived text token to reach 4.5:1 and the accent 3:1. Surfaces move only as a last resort.
 */
export function readablePalette(input: Palette): { palette: Palette; adjusted: (keyof Palette)[] } {
  const p = { ...input };
  const lightSurface = luminance(p.surface) > 0.18;
  const away = lightSurface ? "#000000" : "#FFFFFF";
  const ACCENT = ["accent-text", "on-accent", "accent"];
  const textOk = (q: Palette) => !auditPalette(q).some((i) => !ACCENT.includes(i.token));

  p.ink = nudge(p.ink, away, (ink) => textOk({ ...p, ink }));
  if (!textOk(p)) {
    // Ink is already at black/white: brighten (or darken) the surfaces instead.
    const toward = lightSurface ? "#FFFFFF" : "#000000";
    for (let i = 1; i <= 40 && !textOk(p); i++) {
      p.surface = mixOklab(toward, input.surface, i / 40);
      p.canvas = mixOklab(toward, input.canvas, i / 40);
    }
  }
  const accentOk = (accent: string) => !auditPalette({ ...p, accent }).some((i) => ACCENT.includes(i.token));
  // Darker accents on light boards, lighter on dark ones: both raise contrast with the surface and with the button text.
  p.accent = nudge(p.accent, away, accentOk);

  const adjusted = (Object.keys(p) as (keyof Palette)[]).filter((k) => p[k].toUpperCase() !== input[k].toUpperCase());
  return { palette: p, adjusted };
}
