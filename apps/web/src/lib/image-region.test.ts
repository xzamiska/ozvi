import { describe, expect, it } from "vitest";
import { contentRegion } from "./image-region";

/** An RGBA bitmap filled with a background colour, with optional rectangles of another colour. */
function bitmap(w: number, h: number, rects: [number, number, number, number][] = [], bg = 240) {
  const d = new Uint8ClampedArray(w * h * 4).fill(bg);
  for (const [x0, y0, rw, rh] of rects) for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) {
    const i = (y * w + x) * 4; d[i] = 20; d[i + 1] = 20; d[i + 2] = 20;
  }
  return d;
}

describe("gallery: screenshot content region", () => {
  it("zooms to content in the top-left of a mostly empty screenshot", () => {
    const r = contentRegion(bitmap(160, 100, [[5, 5, 50, 30]]), 160, 100)!;
    expect(r).not.toBeNull();
    expect(r.x).toBe(0);
    expect(r.y).toBeCloseTo(0.01, 5);
    expect(r.w).toBeLessThan(0.5);
    // The frame keeps at least 4:3 in pixels.
    expect((r.w * 160) / (r.h * 100)).toBeGreaterThanOrEqual(4 / 3 - 1e-9);
  });
  it("shows the whole image when content fills most of it, or there is none", () => {
    expect(contentRegion(bitmap(160, 100, [[5, 5, 150, 90]]), 160, 100)).toBeNull();
    expect(contentRegion(bitmap(160, 100), 160, 100)).toBeNull();
  });
  it("ignores slight JPEG noise around the background", () => {
    const d = bitmap(160, 100, [[100, 60, 20, 10]]);
    d[(50 * 160 + 10) * 4] = 250; // +10 on one channel
    const r = contentRegion(d, 160, 100)!;
    expect(r.x).toBeGreaterThan(0.4);
  });
  it("widens a very tall content strip and stays inside the image", () => {
    const r = contentRegion(bitmap(160, 100, [[150, 0, 4, 40]]), 160, 100)!;
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9);
    expect((r.w * 160) / (r.h * 100)).toBeCloseTo(4 / 3, 5);
  });
});
