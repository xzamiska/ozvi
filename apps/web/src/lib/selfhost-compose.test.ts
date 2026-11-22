import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * deploy/docker-compose.yml lists the variables passed into the container one by one: a setting documented in
 * SELFHOST.md but missing there never reaches Ozvi, whatever the operator writes into .env.
 */
const root = path.resolve(__dirname, "../../../..");
const compose = readFileSync(path.join(root, "deploy/docker-compose.yml"), "utf8");
/** Passed into the container, or read by compose itself (OZVI_IMAGE, OZVI_BIND: \${…} in the file). */
const passed = new Set([...compose.matchAll(/^\s+(OZVI_[A-Z0-9_]+):|\$\{(OZVI_[A-Z0-9_]+)/gm)].map((m) => m[1] ?? m[2]));
/** Named in the guide, but not settings an operator puts into .env. */
const NOT_SETTINGS = new Set([
  "OZVI_DEV_LOGIN", // only with pnpm dev, refused in the image
  "OZVI_TELEMETRY_URL", // where statistics go (ours), not a setting
  "OZVI_UPDATE_CHECK", // explained, not set
  "OZVI_GITHUB_APP_", // the OZVI_GITHUB_APP_* family, each passed by name
]);

describe("self-host compose", () => {
  for (const file of ["docs/SELFHOST.md", "docs/SELFHOST.sk.md"]) {
    it(`passes every variable ${file} tells operators to set`, () => {
      const named = new Set([...readFileSync(path.join(root, file), "utf8").matchAll(/`(OZVI_[A-Z0-9_]+)/g)].map((m) => m[1]!));
      const missing = [...named].filter((v) => !passed.has(v) && !NOT_SETTINGS.has(v));
      expect(missing).toEqual([]);
    });
  }
});
