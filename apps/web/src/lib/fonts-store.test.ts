import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const CSS = `@font-face{font-family:'Inter';src:url(https://fonts.gstatic.com/s/inter/v20/abc.woff2) format('woff2');}`;
const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]);

async function fresh(env: Record<string, string>) {
  vi.resetModules();
  delete (globalThis as { ozviFonts?: unknown }).ozviFonts;
  const dir = mkdtempSync(path.join(tmpdir(), "ozvi-fonts-"));
  Object.assign(process.env, { OZVI_FONTS_DIR: dir, ...env });
  return { dir, store: await import("./fonts-store") };
}

describe("fonts store", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.OZVI_FONTS_REMOTE; delete process.env.OZVI_FONTS_DIR; });

  it("fetches from Google once, rewrites, caches on disk and serves only files it referenced", async () => {
    const { dir, store } = await fresh({});
    fetchMock.mockImplementation(async (url: string) =>
      url.startsWith("https://fonts.googleapis.com/") ? new Response(CSS) : new Response(WOFF2));
    const q = { families: ["Inter"], weights: [400, 700] };
    const a = await store.fontCss(q);
    expect(a).toEqual({ css: expect.stringContaining("url(file/s/inter/v20/abc.woff2)"), complete: true });
    expect(readFileSync(path.join(dir, "css", "inter_400-700.css"), "utf8")).not.toContain("gstatic");
    await store.fontCss(q);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(await store.fontFile("s/inter/v20/abc.woff2")).toEqual(WOFF2);
    expect(await store.fontFile("s/inter/v20/other.woff2")).toBeNull(); // never referenced → not fetched
    expect(await store.fontFile("../../etc/passwd")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to system fonts when Google is unreachable or remote fetching is off", async () => {
    let { store } = await fresh({});
    fetchMock.mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await store.fontCss({ families: ["Inter"], weights: [400] })).toEqual({ css: expect.stringContaining("system font"), complete: false });

    ({ store } = await fresh({ OZVI_FONTS_REMOTE: "0" }));
    fetchMock.mockReset();
    expect((await store.fontCss({ families: ["Inter"], weights: [400] })).complete).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
