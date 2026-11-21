import { describe, expect, it } from "vitest";
import { pickWorkspace } from "./last-workspace";

const all = [{ id: "a", projects: [{ slug: "x" }] }, { id: "b", projects: [{ slug: "y" }] }];

describe("which workspace /app opens", () => {
  it("the one open last time, not always the first", () => {
    expect(pickWorkspace(all, { last: "b" })?.id).toBe("b");
  });
  it("the first when the remembered one is gone (left or deleted) or unknown", () => {
    expect(pickWorkspace(all, { last: "gone" })?.id).toBe("a");
    expect(pickWorkspace(all, {})?.id).toBe("a");
  });
  it("a just created project wins over the remembered workspace", () => {
    expect(pickWorkspace(all, { created: "x", last: "b" })?.id).toBe("a");
  });
});
