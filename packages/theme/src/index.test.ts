import { describe, expect, it } from "vitest";
import { checkContrast, contrast, fontsHref, onAccent, parseTheme, presets, toCss } from "./index";

describe("theme", () => {
  it("parses every preset", () => {
    for (const p of Object.values(presets)) expect(() => parseTheme(p)).not.toThrow();
  });

  it("rejects short hex and raw CSS injection", () => {
    expect(() => parseTheme({ ...presets.ozvi, colors: { ...presets.ozvi.colors, accent: "#fff" } })).toThrow();
    expect(() => parseTheme({ ...presets.ozvi, colors: { ...presets.ozvi.colors, accent: "red;}body{x:1" } })).toThrow();
  });

  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(onAccent("#1F4BD8")).toBe("#FFFFFF");
    expect(onAccent("#FFC93C")).toBe("#000000");
  });

  it("presets are readable", () => {
    for (const p of Object.values(presets)) expect(checkContrast(parseTheme(p))).toEqual([]);
  });

  it("warns on unreadable accent", () => {
    const t = parseTheme({ ...presets.ozvi, colors: { ...presets.ozvi.colors, accent: "#F3F4F8" } });
    expect(checkContrast(t).map((w) => w.token)).toContain("accent on surface");
  });

  it("emits scoped CSS variables with dark mode", () => {
    const css = toCss(parseTheme(presets.ozvi), ":host");
    expect(css).toMatch(/^:host\{--oz-accent:#5A3FE6;--oz-on-accent:#FFFFFF/);
    expect(css).toContain("--oz-radius:8px");
    expect(css).toContain("@media (prefers-color-scheme:dark){:host{--oz-accent:#9D8CFF;--oz-on-accent:#000000;--oz-ink:#EDECF5");
  });

  it("rejects font names that could break out of <style>", () => {
    expect(() => parseTheme({ ...presets.ozvi, font: { body: "x</style><script>" } })).toThrow();
    const t = parseTheme({ ...presets.ozvi, font: { body: "My Brand Sans", source: "custom" } });
    expect(toCss(t)).toContain('"My Brand Sans"');
    expect(fontsHref(t)).toBeNull();
  });

  it("builds a first-party font URL (never Google)", () => {
    expect(fontsHref(parseTheme(presets.grafit))).toBe("/fonts/css?family=IBM+Plex+Sans&wght=400,500,600,700");
    const two = parseTheme({ ...presets.ozvi, font: { body: "Inter", heading: "Funnel Display" } });
    expect(fontsHref(two)).toBe("/fonts/css?family=Inter&family=Funnel+Display&wght=400,500,600,700");
    expect(fontsHref(parseTheme(presets.ozvi))).toBe("/fonts/css?family=Geist&wght=400,500,600,700");
    expect(fontsHref(parseTheme(presets.ozvi), { skipBundled: true })).toBeNull();
    expect(fontsHref(parseTheme({ ...presets.ozvi, font: { body: "Inter", source: "system" } }))).toBeNull();
  });
});
