import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIX, STAGES, auditPalette, mixOklab, readablePalette, stageColor } from "./a11y";
import { contrast, parseTheme, presets, renderedPalettes, toCss } from "./index";

const pale = { accent: "#FFD84D", ink: "#9A9A9A", surface: "#FFFFFF", canvas: "#F5F5F5", border: "#EEEEEE" };
const murkyDark = { accent: "#3B2A8A", ink: "#666677", surface: "#1A1A22", canvas: "#111118", border: "#333333" };

describe("readability guarantee", () => {
  it("mixes like CSS color-mix(in oklab)", () => {
    expect(mixOklab("#000000", "#FFFFFF", 1)).toBe("#000000");
    expect(mixOklab("#000000", "#FFFFFF", 0)).toBe("#FFFFFF");
    // oklab midpoint of black and white is lighter than sRGB #808080
    expect(mixOklab("#000000", "#FFFFFF", 0.5)).toBe("#636363");
  });

  it("leaves every preset untouched", () => {
    for (const p of Object.values(presets)) {
      const r = renderedPalettes(parseTheme(p));
      expect(r.adjusted.light).toEqual([]);
      expect(r.adjusted.dark).toEqual([]);
    }
  });

  it("fixes a pale light palette so all text reaches 4.5:1", () => {
    expect(auditPalette(pale).length).toBeGreaterThan(0);
    const { palette, adjusted } = readablePalette(pale);
    expect(auditPalette(palette)).toEqual([]);
    expect(adjusted).toEqual(expect.arrayContaining(["ink", "accent"]));
    expect(palette.surface).toBe(pale.surface); // surfaces move only as a last resort
    expect(contrast(palette.ink, pale.surface)).toBeGreaterThan(contrast(pale.ink, pale.surface));
  });

  it("fixes a murky dark palette by lightening ink and accent", () => {
    const { palette } = readablePalette(murkyDark);
    expect(auditPalette(palette)).toEqual([]);
    expect(palette.surface).toBe(murkyDark.surface);
  });

  it("moves the surfaces when ink alone cannot get there", () => {
    const grey = { accent: "#888888", ink: "#000000", surface: "#777777", canvas: "#707070", border: "#666666" };
    const { palette, adjusted } = readablePalette(grey);
    expect(auditPalette(palette)).toEqual([]);
    expect(adjusted).toContain("surface");
  });

  it("bends stage colours toward ink only when the default mix is too faint", () => {
    const ozvi = presets.ozvi.colors;
    expect(stageColor("st-done", ozvi)).toBe(mixOklab(STAGES["st-done"].hue, ozvi.ink, STAGES["st-done"].share));
    for (const k of Object.keys(STAGES) as (keyof typeof STAGES)[]) {
      const c = stageColor(k, { ...ozvi, ...presets.grafit.dark });
      expect(contrast(c, presets.grafit.dark.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("toCss renders the fixed palette, not the raw one", () => {
    const t = parseTheme({ ...presets.ozvi, colors: pale, dark: undefined });
    const css = toCss(t);
    const fixed = readablePalette(pale).palette;
    expect(css).toContain(`--oz-ink:${fixed.ink}`);
    expect(css).toContain(`--oz-accent:${fixed.accent}`);
    expect(css).not.toContain(`--oz-ink:${pale.ink}`);
    expect(css).toMatch(/--oz-st-ack:#[0-9A-F]{6}/);
  });

  it("matches the derived-token formulas in globals.css", () => {
    const css = readFileSync(new URL("../../../apps/web/src/app/globals.css", import.meta.url), "utf8");
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    expect(css).toContain(`--oz-muted: color-mix(in oklab, var(--oz-ink) ${pct(MIX.muted)}, var(--oz-surface))`);
    expect(css).toContain(`--oz-accent-text: color-mix(in oklab, var(--oz-accent) ${pct(MIX.accentText)}, var(--oz-ink))`);
    expect(css).toContain(`--oz-st-ack: color-mix(in oklab, ${STAGES["st-ack"].hue.toLowerCase()} ${pct(STAGES["st-ack"].share)}, var(--oz-ink))`);
    expect(css).toContain(`--oz-st-done: color-mix(in oklab, ${STAGES["st-done"].hue.toLowerCase()} ${pct(STAGES["st-done"].share)}, var(--oz-ink))`);
    expect(css).toContain(`--oz-danger: color-mix(in oklab, ${STAGES.danger.hue.toLowerCase()} ${pct(STAGES.danger.share)}, var(--oz-ink))`);
  });
});
