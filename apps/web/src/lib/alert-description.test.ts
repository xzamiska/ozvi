import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : []);

describe("AlertDescription", () => {
  // It is a CSS grid: rich text (text + link) placed straight into it splits into one row per piece.
  it("never holds rich text directly, only inside one element", () => {
    const bad = files(SRC).flatMap((f) => {
      const src = readFileSync(f, "utf8");
      return [...src.matchAll(/<AlertDescription[^>]*>\s*\{[^}]*?\.rich\(/g)].map(() => f.slice(SRC.length));
    });
    expect(bad).toEqual([]);
  });
});
