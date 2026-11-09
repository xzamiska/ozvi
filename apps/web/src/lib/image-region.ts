/* Pure helper for the gallery (components/Gallery.tsx): where a screenshot has content. */

/** Part of an image (fractions 0–1) that holds content, i.e. differs from the background in its corner. */
export interface Region { x: number; y: number; w: number; h: number }

/**
 * Finds the content of a screenshot on a small canvas: pixels that differ from the top-left corner colour.
 * Pads it, keeps a sensible frame (between 4:3 and 3:1) and returns null when there is little to gain.
 */
export function contentRegion(data: Uint8ClampedArray, width: number, height: number): Region | null {
  const at = (x: number, y: number) => (y * width + x) * 4;
  const [r0, g0, b0] = [data[0]!, data[1]!, data[2]!];
  let x1 = width, y1 = height, x2 = -1, y2 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = at(x, y);
    if (Math.abs(data[i]! - r0) + Math.abs(data[i + 1]! - g0) + Math.abs(data[i + 2]! - b0) > 36) {
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
    }
  }
  if (x2 < 0) return null;
  const pad = 0.04;
  let x = Math.max(0, x1 / width - pad), y = Math.max(0, y1 / height - pad);
  let w = Math.min(1, (x2 + 1) / width + pad) - x, h = Math.min(1, (y2 + 1) / height + pad) - y;
  if (w * h > 0.6) return null;
  // Frame proportions in pixels: grow the shorter side around the content, inside the image.
  const ratio = (w * width) / (h * height);
  if (ratio < 4 / 3) { const nw = Math.min(1, (h * height * 4 / 3) / width); x = Math.max(0, Math.min(1 - nw, x - (nw - w) / 2)); w = nw; }
  else if (ratio > 3) { const nh = Math.min(1, (w * width / 3) / height); y = Math.max(0, Math.min(1 - nh, y - (nh - h) / 2)); h = nh; }
  return w * h > 0.6 ? null : { x, y, w, h };
}
