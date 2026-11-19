import { createDb, type Db } from "@ozvi/db";
import { describe, expect, it } from "vitest";
import { importTick } from "./engine";

describe("import queue", () => {
  it("a dropped database connection while claiming a run does not stop later imports", async () => {
    await importTick(createDb()); // boots the queue (re-queues runs a restart left running)
    const broken = { transaction: async () => { throw Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }); } } as unknown as Db;
    await expect(importTick(broken)).rejects.toThrow("ECONNRESET");
    const state = (globalThis as { __ozviImports?: { active: Set<string> } }).__ozviImports!;
    expect([...state.active]).toEqual([]);
  });
});
