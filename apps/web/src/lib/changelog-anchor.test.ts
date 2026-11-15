import { describe, expect, it } from "vitest";
import { changelogEntryUrl, entryAnchor } from "./changelog-anchor";

describe("changelog entry links", () => {
  it("point at the id the changelog page renders", () => {
    expect(entryAnchor("abc")).toBe("e-abc");
    expect(changelogEntryUrl("https://x.test/b", "abc")).toBe("https://x.test/b/changelog#e-abc");
  });
});
