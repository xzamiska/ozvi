import { describe, expect, it } from "vitest";
import { allow, LIMITS } from "./ratelimit";

describe("rate limit", () => {
  it("blocks after max and recovers after the window", () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.item.max; i++) expect(allow("item", "u1", t)).toBe(true);
    expect(allow("item", "u1", t)).toBe(false);
    expect(allow("item", "u2", t)).toBe(true);
    expect(allow("item", "u1", t + LIMITS.item.windowMs + 1)).toBe(true);
  });
});
