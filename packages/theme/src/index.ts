import { z } from "zod";
import { readablePalette, stageColor } from "./a11y";

export { auditPalette, derivedText, MIX, mixOklab, readablePalette, stageColor, type ContrastIssue, type Palette } from "./a11y";

/**
 * theme.json — the single contract that makes a board look like the host product.
 * The same object styles the hosted board, the widget (shadow DOM) and e-mails.
 * Only tokens are exposed, never raw CSS, so themes stay safe and upgradeable.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #3044F5");

/** Font family names only — no quotes, braces or angle brackets, since the CSS is inlined into <style>. */
const fontName = z.string().regex(/^[A-Za-z0-9 \-]{1,80}$/, "Use a plain font family name, e.g. Inter");

const palette = z.object({
  accent: hex,
  ink: hex,
  surface: hex,
  canvas: hex,
  border: hex,
});

export const themeSchema = z.object({
  name: z.string().min(1).max(60),
  colors: palette,
  dark: palette.partial().optional(),
  font: z.object({
    body: fontName,
    heading: fontName.optional(),
    /** "google": any Google Fonts family, served by Ozvi from its own origin (/fonts, visitors never contact Google); "custom": hosted by the owner. */
    source: z.enum(["google", "system", "custom"]).default("google"),
  }),
  radius: z.number().int().min(0).max(24),
  density: z.enum(["compact", "comfortable"]).default("comfortable"),
  voting: z.object({
    style: z.enum(["upvote", "importance"]).default("upvote"),
    /** Optional monthly vote budget per user; null = unlimited. */
    budget: z.number().int().min(1).max(100).nullable().default(null),
  }).default({ style: "upvote", budget: null }),
  logoUrl: z.url().optional(),
});

export type Theme = z.infer<typeof themeSchema>;
export type ThemeInput = z.input<typeof themeSchema>;

/** Generic starting points shown to every installation. Product-specific themes live in each project's DB row, never here. */
export const presets = {
  ozvi: {
    name: "Ozvi",
    colors: { accent: "#5A3FE6", ink: "#0D0C14", surface: "#FFFFFF", canvas: "#F7F7F9", border: "#E6E5EC" },
    dark: { accent: "#9D8CFF", ink: "#EDECF5", surface: "#121119", canvas: "#0A0A0F", border: "#25232F" },
    font: { body: "Geist", source: "google" },
    radius: 8,
  },
  grafit: {
    name: "Grafit",
    colors: { accent: "#334155", ink: "#0F172A", surface: "#FFFFFF", canvas: "#F4F5F7", border: "#E2E5EA" },
    dark: { accent: "#94A3B8", ink: "#E2E8F0", surface: "#1E2430", canvas: "#141922", border: "#2C3442" },
    font: { body: "IBM Plex Sans", source: "google" },
    radius: 6,
  },
  les: {
    name: "Les",
    colors: { accent: "#1F7A55", ink: "#13241C", surface: "#FFFFFF", canvas: "#F5F7F4", border: "#DFE6DF" },
    font: { body: "Figtree", source: "google" },
    radius: 10,
  },
  slivka: {
    name: "Slivka",
    colors: { accent: "#8E3B8E", ink: "#2A1730", surface: "#FFFFFF", canvas: "#F7F3F8", border: "#E8DDEA" },
    font: { body: "Nunito Sans", source: "google" },
    radius: 16,
  },
} satisfies Record<string, ThemeInput>;

export function parseTheme(input: unknown): Theme {
  return themeSchema.parse(input);
}

// --- colour maths (WCAG 2.x) -------------------------------------------------

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(color: string): number {
  const n = Number.parseInt(color.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text colour that sits on the accent (buttons, vote counts). */
export function onAccent(accent: string): string {
  return contrast(accent, "#FFFFFF") >= contrast(accent, "#000000") ? "#FFFFFF" : "#000000";
}

export interface ThemeWarning {
  token: string;
  ratio: number;
  message: string;
}

/** Owners can pick any colour; we warn (never block) when text would be hard to read. */
export function checkContrast(theme: Theme): ThemeWarning[] {
  const out: ThemeWarning[] = [];
  const check = (token: string, fg: string, bg: string, min: number) => {
    const ratio = contrast(fg, bg);
    if (ratio < min) {
      out.push({ token, ratio: Math.round(ratio * 100) / 100, message: `${token}: contrast ${ratio.toFixed(2)}:1 is below ${min}:1` });
    }
  };
  const c = theme.colors;
  check("ink on surface", c.ink, c.surface, 4.5);
  check("ink on canvas", c.ink, c.canvas, 4.5);
  check("button text on accent", onAccent(c.accent), c.accent, 4.5);
  check("accent on surface", c.accent, c.surface, 3);
  return out;
}

// --- CSS output ----------------------------------------------------------------

function vars(p: Theme["colors"]): string[] {
  return [
    `--oz-accent:${p.accent}`, `--oz-on-accent:${onAccent(p.accent)}`, `--oz-ink:${p.ink}`,
    `--oz-surface:${p.surface}`, `--oz-canvas:${p.canvas}`, `--oz-border:${p.border}`,
    // Stage colours as text, bent toward ink when the default mix would read below 4.5:1 on this palette.
    `--oz-st-ack:${stageColor("st-ack", p)}`, `--oz-st-done:${stageColor("st-done", p)}`, `--oz-danger:${stageColor("danger", p)}`,
  ];
}

const quote = (family: string) => `"${family}"`;

/**
 * The palettes a board renders (light, and dark when the theme has one), after the readability
 * guarantee: colours that would make text fail WCAG AA are nudged just enough to pass (see a11y.ts).
 */
export function renderedPalettes(theme: Theme): { light: Theme["colors"]; dark: Theme["colors"] | null; adjusted: { light: string[]; dark: string[] } } {
  const light = readablePalette(theme.colors);
  const dark = theme.dark && Object.keys(theme.dark).length ? readablePalette({ ...theme.colors, ...theme.dark }) : null;
  return { light: light.palette, dark: dark?.palette ?? null, adjusted: { light: light.adjusted, dark: dark?.adjusted ?? [] } };
}

/**
 * Turns a theme into CSS custom properties.
 * `selector` is `:root` for the hosted board and `:host` inside the widget's shadow DOM.
 * Colours always pass the readability guarantee (`renderedPalettes`); owners are warned in the editor.
 */
export function toCss(theme: Theme, selector = ":root"): string {
  const body = `${quote(theme.font.body)}, ui-sans-serif, system-ui, sans-serif`;
  const heading = theme.font.heading ? `${quote(theme.font.heading)}, ${body}` : body;
  const { light, dark } = renderedPalettes(theme);
  const base = [
    ...vars(light),
    `--oz-font-body:${body}`,
    `--oz-font-heading:${heading}`,
    `--oz-radius:${theme.radius}px`,
    `--oz-space:${theme.density === "compact" ? "0.75rem" : "1rem"}`,
  ];
  let css = `${selector}{${base.join(";")}}`;
  if (dark) css += `@media (prefers-color-scheme:dark){${selector}{${vars(dark).join(";")}}}`;
  return css;
}

// --- fonts ---------------------------------------------------------------------
//
// Visitors' browsers never talk to Google: Ozvi fetches Google Fonts server-side once, caches them and
// serves CSS + woff2 from its own origin under /fonts (GDPR: the visitor's IP must not reach Google).

/** Weights every theme font is loaded in. */
export const FONT_WEIGHTS = [400, 500, 600, 700] as const;

/**
 * Google Fonts families Ozvi serves from its own origin. The font route also serves families saved in a
 * project's theme (so an owner can pick any Google family), but nothing else — it is not an open proxy.
 */
export const FONT_CATALOGUE = [
  "Albert Sans", "Archivo", "Barlow", "Be Vietnam Pro", "Bricolage Grotesque", "DM Sans", "Figtree", "Fira Sans",
  "Fraunces", "Funnel Display", "Funnel Sans", "Geist", "Hanken Grotesk", "IBM Plex Mono", "IBM Plex Sans", "IBM Plex Serif",
  "Instrument Sans", "Inter", "JetBrains Mono", "Karla", "Lexend", "Libre Franklin", "Lora", "Manrope", "Merriweather",
  "Montserrat", "Mulish", "Noto Sans", "Noto Serif", "Nunito", "Nunito Sans", "Onest", "Open Sans", "Outfit",
  "Playfair Display", "Plus Jakarta Sans", "Poppins", "Public Sans", "Raleway", "Red Hat Display", "Red Hat Text",
  "Roboto", "Roboto Mono", "Rubik", "Schibsted Grotesk", "Sora", "Source Sans 3", "Source Serif 4", "Space Grotesk",
  "Urbanist", "Work Sans",
] as const;

/** Families bundled with the Ozvi app itself (globals.css @font-face), so pages served by Ozvi need no font request for them. */
export const BUNDLED_FONTS = ["Geist", "Geist Mono"] as const;

/** Google families a theme needs (body + heading), deduplicated. Empty when the owner hosts or skips web fonts. */
export function themeFontFamilies(theme: Theme): string[] {
  if (theme.font.source !== "google") return [];
  return [...new Set([theme.font.body, theme.font.heading].filter(Boolean) as string[])];
}

/**
 * First-party stylesheet URL for the theme's fonts, relative to the Ozvi origin (`/fonts/css?…`).
 * `skipBundled` drops families the app already ships (use it on pages rendered by Ozvi, not in the widget).
 */
export function fontsHref(theme: Theme, opts: { skipBundled?: boolean } = {}): string | null {
  const bundled: readonly string[] = BUNDLED_FONTS;
  const families = themeFontFamilies(theme).filter((f) => !(opts.skipBundled && bundled.includes(f)));
  if (!families.length) return null;
  const q = families.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}`).join("&");
  return `/fonts/css?${q}&wght=${FONT_WEIGHTS.join(",")}`;
}
