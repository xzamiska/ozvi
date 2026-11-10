"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Landing: sticky walk-through. Steps scroll past on the left; the step crossing the
 * middle of the screen picks the panel shown in the sticky frame on the right (cross-fade).
 * Phones get each panel under its step.
 */
export function StickySteps({ steps }: { steps: { title: string; text: string; panel: React.ReactNode }[] }) {
  const [at, setAt] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setAt(Number((e.target as HTMLElement).dataset.i));
    }, { rootMargin: "-45% 0px -45% 0px" });
    refs.current.forEach((r) => r && io.observe(r));
    return () => io.disconnect();
  }, []);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-14 lg:gap-0">
        {steps.map((s, i) => (
          <li key={s.title} ref={(el) => { refs.current[i] = el; }} data-i={i} className="min-w-0 lg:flex lg:min-h-[70vh] lg:flex-col lg:justify-center">
            <p className={cn("text-[13px] font-semibold transition-colors", at === i ? "text-brand-text" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</p>
            <h3 className={cn("mt-3 max-w-[18ch] text-[30px] leading-tight font-semibold tracking-[-0.035em] transition-opacity lg:text-[38px]", at !== i && "lg:opacity-35")}>{s.title}</h3>
            <p className={cn("mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground transition-opacity", at !== i && "lg:opacity-35")}>{s.text}</p>
            <div className="mt-6 min-w-0 lg:hidden">{s.panel}</div>
          </li>
        ))}
      </ol>
      <div className="relative hidden lg:block">
        <div className="sticky top-[15vh] h-[70vh]">
          {steps.map((s, i) => (
            <div key={s.title} aria-hidden={at !== i} className={cn("absolute inset-0 flex items-center transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none", at === i ? "opacity-100" : "pointer-events-none translate-y-4 opacity-0")}>
              <div className="w-full">{s.panel}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
