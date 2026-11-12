import { domToBlob } from "modern-screenshot";
import { maskScreenshot, type ShotMask } from "./shot-mask";

/**
 * Loaded on demand (~separate file) so the widget itself stays tiny.
 * Captures the visible viewport without the widget. Privacy (shot-mask.ts) is applied to the copy of
 * the page the image is drawn from: form values, e-mails, phone numbers, IBANs, card numbers, tokens
 * and [data-ozvi-mask] are covered by solid boxes; the page the person sees is never touched.
 */
async function capture(exclude: Element): Promise<Blob | null> {
  // Strict CSP: the nonce widget.js was loaded with (see index.tsx).
  const nonce = (window as unknown as { __ozviP?: { nonce: string } }).__ozviP?.nonce ?? "";
  const mode: ShotMask = (window as unknown as { OzviConfig?: { mask?: ShotMask } }).OzviConfig?.mask === "all" ? "all" : "auto";
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
      // The clone, before it is drawn: cover everything private (throws → no screenshot, never an unmasked one).
      onCloneNode: (clone) => { if ((clone as Element).querySelectorAll) maskScreenshot(clone as Element, mode); },
      // Embedding web fonts parses stylesheets in a scratch <style> the library can't give a nonce; under a
      // strict CSP that fails, so the screenshot uses fallback fonts instead.
      ...(nonce && { font: false as const }),
    });
  } catch (e) {
    // No screenshot is not fatal (the report goes without one); say why for the host app's developers.
    console.warn("[ozvi] screenshot failed", e);
    return null;
  }
}

(window as unknown as { __ozviShot: typeof capture }).__ozviShot = capture;
