"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Stage } from "./Stage";

/**
 * "One report, from click to reply". Desktop: the stage stays pinned while the four steps scroll
 * past; the step crossing the middle of the viewport drives the stage, and a rail fills with the
 * section's scroll progress. Phones: the stage plays through on a timer once it is on screen,
 * then the steps follow as a list.
 */
export function Story() {
  const t = useTranslations("landing");
  const steps = t.raw("story.steps") as { title: string; text: string; code: string }[];
  const root = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLSpanElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Desktop: the step in the middle of the viewport is the current one; the rail tracks progress.
  useEffect(() => {
    if (!desktop || !root.current) return;
    setStep((s) => Math.max(0, s));
    const steps = [...root.current.querySelectorAll<HTMLElement>("[data-step]")];
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
    }, { rootMargin: "-50% 0px -50% 0px" });
    steps.forEach((s) => io.observe(s));
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const list = root.current?.querySelector<HTMLElement>("[data-steps]");
        if (!list || !rail.current) return;
        const r = list.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (window.innerHeight / 2 - r.top) / r.height));
        if (r.top > window.innerHeight / 2) setStep(0); // above the first step: back to the start
        rail.current.style.transform = `scaleY(${p})`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [desktop]);

  // Phones: play once when the stage comes into view (or snap to the end with reduced motion).
  useEffect(() => {
    if (desktop !== false || !stage.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setStep(3); return; }
    setStep(-1);
    const timers: number[] = [];
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      [0, 1, 2, 3].forEach((s, i) => timers.push(window.setTimeout(() => setStep(s), 500 + i * 1300)));
    }, { threshold: 0.4 });
    io.observe(stage.current);
    return () => { io.disconnect(); timers.forEach(clearTimeout); };
  }, [desktop, run]);

  return (
    <div ref={root} className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <div className="relative lg:order-2">
        <div ref={stage} className="lg:sticky lg:top-[max(5.5rem,calc(50vh-270px))]">
          <Stage step={step} />
          {desktop === false && (
            <button type="button" onClick={() => setRun((n) => n + 1)} className="mt-3 inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground">
              <RotateCcw className="size-3.5" />{t("story.replay")}
            </button>
          )}
        </div>
      </div>

      <div className="relative lg:order-1">
        {/* progress rail (desktop) */}
        <span aria-hidden className="absolute top-0 bottom-0 left-[11px] hidden w-px bg-line lg:block">
          <span ref={rail} className="absolute inset-0 origin-top scale-y-0 bg-primary" />
        </span>
        <ol data-steps className="grid gap-8 lg:gap-0">
          {steps.map((s, i) => {
            const current = desktop && step === i;
            return (
              <li key={s.title} data-step={i}
                className={cn("relative grid grid-cols-[24px_1fr] gap-x-5 lg:min-h-[60vh] lg:content-center lg:first:min-h-[46vh] lg:first:content-start lg:first:pt-14",
                  )}>
                <span className={cn("relative z-10 grid size-6 place-items-center rounded-full border bg-background font-mono text-[11px] font-medium transition-colors",
                  (current || !desktop) && "border-primary bg-primary text-primary-foreground")}>{i + 1}</span>
                <div className="min-w-0">
                  {/* Steps off the stage step back in colour, never below 4.5:1 (no opacity dimming). */}
                  <h3 className={cn("text-[21px] leading-tight font-semibold tracking-[-0.025em] transition-colors duration-300 motion-reduce:transition-none lg:text-[26px]", desktop && !current && "text-muted-foreground")}>{s.title}</h3>
                  <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-muted-foreground">{s.text}</p>
                  <code className="mt-4 inline-block rounded-md border bg-surface px-2 py-1 font-mono text-[12px] text-foreground/80">{s.code}</code>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
