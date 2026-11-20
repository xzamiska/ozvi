import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITEMAP_PAGES } from "./indexing";
import { MCP_TOOLS } from "./mcp-tools";

const src = readFileSync(fileURLToPath(new URL("../../../../packages/mcp/src/index.ts", import.meta.url)), "utf8");

describe("/docs/mcp", () => {
  it("lists exactly the tools the MCP server registers", () => {
    const registered = [...src.matchAll(/registerTool\("([a-z_]+)"/g)].map((m) => m[1]).sort();
    expect(registered.length).toBeGreaterThan(10);
    expect(MCP_TOOLS.map(([name]) => name).sort()).toEqual(registered);
  });

  it("names the scope each tool checks", () => {
    for (const [name, scope] of MCP_TOOLS) {
      const start = src.indexOf(`registerTool("${name}"`);
      const next = src.indexOf("registerTool(", start + 1);
      const body = src.slice(start, next < 0 ? undefined : next);
      // Tools whose scope depends on an argument guard with a ternary; the documented scope is the base one.
      expect(body.match(/guard\((?:[^?()]+\? "triage" : )?"(\w+)"/)?.[1], name).toBe(scope);
    }
  });

  it("is in the sitemap with the other docs", () => {
    expect(SITEMAP_PAGES).toContain("/docs/mcp");
  });
});
