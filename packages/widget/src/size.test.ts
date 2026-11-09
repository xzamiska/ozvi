import { build } from "esbuild";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build config without types
import { BUDGET, common, sharedPreact } from "../build-config.mjs";

/** CI guard: the initial widget.js must stay within 20 kB gzip; new features belong in lazy chunks. */
describe("size budget", () => {
  it("widget.js ≤ 20 kB gzip, and lazy chunks don't bundle their own Preact", async () => {
    const out = async (entry: string, plugins: unknown[] = []) =>
      (await build({ ...common, entryPoints: [entry], write: false, plugins } as never)).outputFiles[0]!.contents;
    const main = gzipSync(await out("src/index.tsx")).length;
    console.log(`widget.js ${(main / 1024).toFixed(1)} kB gzip`);
    expect(main).toBeLessThanOrEqual(BUDGET);
    for (const chunk of ["src/ideas.tsx", "src/embeds.tsx"]) {
      const code = new TextDecoder().decode(await out(chunk, [sharedPreact]));
      expect(code).toContain("__ozviP");
      // Preact's own internals (its options hook names) would mean a second copy.
      expect(code).not.toContain("__H");
      expect(gzipSync(code).length).toBeLessThan(10 * 1024);
    }
  }, 30_000);
});
