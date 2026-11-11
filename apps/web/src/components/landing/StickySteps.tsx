"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Landing: sticky walk-through. Steps scroll past on the left; the step whose title is nearest the
 * middle of the screen picks the panel shown in the sticky frame on the right.
 * Phones get each panel under its step.
 */
export function StickySteps({ steps }: { steps: { title: string; text: string; panel: React.ReactNode }[] }) {
  const [at, setAt] = useState(0);
  const refs = useRef<(HTMLHeadingElement | null)[]>([]);
  useEffect(() => {
    // The step whose title is nearest the middle of the screen picks the panel (read once per frame).
    let raf = 0;
    const pick = () => {
      raf = 0;
      const mid = window.innerHeight / 2;
      let best = 0, dist = Infinity;
      refs.current.forEach((h, i) => {
        if (!h) return;
        const r = h.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < dist) { dist = d; best = i; }
      });
      setAt(best);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-14 lg:gap-0">
        {steps.map((s, i) => (
          <li key={s.title} className="min-w-0 lg:flex lg:min-h-[70vh] lg:flex-col lg:justify-center">
            <p className={cn("text-[13px] font-semibold transition-colors", at === i ? "text-brand-text" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</p>
            <h3 ref={(el) => { refs.current[i] = el; }} className={cn("mt-3 max-w-[18ch] text-[30px] leading-tight font-semibold tracking-[-0.035em] transition-opacity lg:text-[38px]", at !== i && "lg:opacity-35")}>{s.title}</h3>
            <p className={cn("mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground transition-opacity", at !== i && "lg:opacity-35")}>{s.text}</p>
            <div className="mt-6 min-w-0 lg:hidden">{s.panel}</div>
          </li>
        ))}
      </ol>
      <div className="relative hidden lg:block">
        <div className="sticky top-[15vh] h-[70vh]">
          {steps.map((s, i) => (
            <div key={s.title} aria-hidden={at !== i} className={cn("absolute inset-0 flex items-center transition-[opacity,transform] ease-out motion-reduce:transition-none",
                // The old panel leaves quickly; the new one comes in after it, so the two never show at once.
                at === i ? "opacity-100 delay-150 duration-500" : "pointer-events-none translate-y-3 opacity-0 duration-150")}>
              <div className="w-full">{s.panel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
