import { describe, expect, it } from "vitest";
import { pickWorkspace, workspaceInPath } from "./last-workspace";

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

describe("the workspace a console path opens", () => {
  const id = "c8a19309-8d19-4102-99ed-ad338b0ff289";
  it("is read from /app/w/<id> and its subpages", () => {
    expect(workspaceInPath(`/app/w/${id}`)).toBe(id);
    expect(workspaceInPath(`/app/w/${id}/billing`)).toBe(id);
    expect(workspaceInPath(`/app/w/${id.toUpperCase()}`)).toBe(id);
  });
  it("nothing for other paths or something that is not an id", () => {
    expect(workspaceInPath("/app")).toBeNull();
    expect(workspaceInPath("/app/w/new")).toBeNull();
    expect(workspaceInPath(`/app/w/${id}x`)).toBeNull();
    expect(workspaceInPath(`/billiwo/app/w/${id}`)).toBeNull();
  });
});
