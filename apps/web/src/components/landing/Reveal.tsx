"use client";

import { animate, set, stagger } from "animejs";
import { useEffect, useRef } from "react";

/**
 * Plays a section's entrance once, when it scrolls into view: `[data-r]` children rise in order,
 * `[data-draw]` bars fill from the left, `[data-pop]` marks spring in. Content is visible at rest:
 * sections already on screen at load, and visitors who prefer reduced motion, never animate.
 */
export function Reveal({ children, className, as: As = "div", id, ...rest }: {
  children: React.ReactNode; className?: string; as?: "div" | "section"; id?: string; "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already seen
    const rise = el.querySelectorAll("[data-r]");
    const draw = el.querySelectorAll("[data-draw]");
    const pop = el.querySelectorAll("[data-pop]");
    set(rise, { opacity: 0, y: 18 });
    set(draw, { scaleX: 0 });
    set(pop, { scale: 0 });
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      animate(rise, { opacity: 1, y: 0, delay: stagger(90), duration: 700, ease: "outExpo" });
      animate(draw, { scaleX: 1, delay: stagger(250, { start: 200 }), duration: 1100, ease: "inOutCubic" });
      animate(pop, { scale: 1, delay: stagger(250, { start: 450 }), duration: 500, ease: "outBack(2)" });
    }, { threshold: 0, rootMargin: "0px 0px -12% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return <As ref={ref as React.Ref<HTMLDivElement>} id={id} className={className} {...rest}>{children}</As>;
}
