import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { childScript, idleMinutes, runsSeparately } from "./local-embeddings";

describe("where the local model runs", () => {
  it("finds the bundled script from the standalone server's apps/web folder", () => {
    const root = mkdtempSync(path.join(tmpdir(), "oz-emb-"));
    mkdirSync(path.join(root, "apps/web"), { recursive: true });
    writeFileSync(path.join(root, "ozvi-embeddings.mjs"), "");
    expect(childScript(path.join(root, "apps/web"))).toEqual({ file: path.join(root, "ozvi-embeddings.mjs"), execArgv: [], cwd: root });
  });

  it("runs the TypeScript source through tsx in a checkout, and nothing when there is neither", () => {
    expect(childScript(path.resolve(__dirname, "../../../apps/web"))?.execArgv).toEqual(["--import", "tsx"]);
    expect(childScript(mkdtempSync(path.join(tmpdir(), "oz-emb-")))).toBeNull();
  });

  it("separate when the server asks for it, inline in the CLI, in tests and in the model's own process", () => {
    expect(runsSeparately({ OZVI_EMBEDDINGS_PROCESS: "separate" })).toBe(true);
    expect(runsSeparately({})).toBe(false);
    expect(runsSeparately({ OZVI_EMBEDDINGS_PROCESS: "inline" })).toBe(false);
    expect(runsSeparately({ OZVI_EMBEDDINGS_PROCESS: "separate", OZVI_EMBEDDINGS_CHILD: "1" })).toBe(false);
  });

  it("keeps the model unless idle minutes are set", () => {
    expect(idleMinutes({})).toBe(0);
    expect(idleMinutes({ OZVI_EMBEDDINGS_IDLE_MINUTES: "15" })).toBe(15);
    expect(idleMinutes({ OZVI_EMBEDDINGS_IDLE_MINUTES: "-3" })).toBe(0);
    expect(idleMinutes({ OZVI_EMBEDDINGS_IDLE_MINUTES: "abc" })).toBe(0);
  });
});
