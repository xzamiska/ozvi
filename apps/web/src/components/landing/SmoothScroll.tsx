"use client";

import { useEffect } from "react";

/**
 * Landing only: in-page links (href="#…") and the logo (data-scroll-top) glide instead of jumping.
 * A short eased animation (ease-in-out, length grows with the distance), honouring each target's
 * scroll-margin-top (the sticky header). The hash is updated without a jump and the target gets
 * focus for keyboard and screen-reader users. Reduced motion: an instant jump, as the browser would.
 */
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function glideTo(y: number, done?: () => void) {
  const from = window.scrollY;
  const to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - window.innerHeight));
  const dist = Math.abs(to - from);
  if (dist < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { window.scrollTo(0, to); done?.(); return; }
  const ms = Math.min(1300, 450 + dist * 0.35);
  const start = performance.now();
  let stop = false;
  const cancel = () => { stop = true; };
  // A wheel or touch by the visitor takes over at once.
  window.addEventListener("wheel", cancel, { once: true, passive: true });
  window.addEventListener("touchstart", cancel, { once: true, passive: true });
  const step = (now: number) => {
    if (stop) return;
    const p = Math.min(1, (now - start) / ms);
    window.scrollTo(0, from + (to - from) * ease(p));
    if (p < 1) requestAnimationFrame(step);
    else { window.removeEventListener("wheel", cancel); window.removeEventListener("touchstart", cancel); done?.(); }
  };
  requestAnimationFrame(step);
}

export function SmoothScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      if (a.hasAttribute("data-scroll-top")) {
        // The logo: on this page it glides back to the top instead of reloading.
        const url = new URL(a.href, location.href);
        if (url.pathname !== location.pathname) return;
        e.preventDefault();
        e.stopPropagation(); // before next/link, which would jump
        history.replaceState(null, "", location.pathname + location.search);
        glideTo(0, () => document.getElementById("main")?.focus({ preventScroll: true }));
        return;
      }
      const href = a.getAttribute("href");
      if (!href?.startsWith("#") || href.length < 2) return;
      const target = document.getElementById(decodeURIComponent(href.slice(1)));
      if (!target) return;
      e.preventDefault();
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      history.replaceState(null, "", href);
      glideTo(target.getBoundingClientRect().top + window.scrollY - margin, () => {
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      });
    };
    // Capture phase: runs before next/link's own click handling.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
