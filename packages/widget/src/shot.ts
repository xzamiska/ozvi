import { domToBlob } from "modern-screenshot";

/**
 * Loaded on demand (~separate file) so the widget itself stays tiny.
 * Captures the visible viewport, with [data-ozvi-mask] elements and password fields blurred,
 * and the widget itself left out.
 */
async function capture(exclude: Element): Promise<Blob | null> {
  const style = document.createElement("style");
  // Strict CSP: the nonce widget.js was loaded with (see index.tsx).
  const nonce = (window as unknown as { __ozviP?: { nonce: string } }).__ozviP?.nonce ?? "";
  style.nonce = nonce;
  style.textContent = "[data-ozvi-mask],input[type=password]{filter:blur(10px)!important}";
  document.head.appendChild(style);
  try {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = Math.min(1, 1600 / w);
    return await domToBlob(document.documentElement, {
      width: w,
      height: h,
      scale,
      type: "image/jpeg",
      quality: 0.85,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#fff",
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
      filter: (node) => node !== exclude,
      // Embedding web fonts parses stylesheets in a scratch <style> the library can't give a nonce; under a
      // strict CSP that fails, so the screenshot uses fallback fonts instead.
      ...(nonce && { font: false as const }),
    });
  } catch (e) {
    // No screenshot is not fatal (the report goes without one); say why for the host app's developers.
    console.warn("[ozvi] screenshot failed", e);
    return null;
  } finally {
    style.remove();
  }
}

(window as unknown as { __ozviShot: typeof capture }).__ozviShot = capture;
