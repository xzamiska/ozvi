"use client";

import { Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { HERO_MOTION_KEY } from "@/lib/storage-keys";
import { cn } from "@/lib/utils";

/**
 * Hero backdrop: the brand mark's echo, at the scale of the page. A small ring with arcs
 * opening to the right (the "o" and its ozvena), the arcs widening and fading, and an accent
 * arc travelling outward every few seconds. It repeats, so it has a pause control (WCAG 2.2.2);
 * the choice is remembered per browser. Still under reduced motion.
 */

const R = [70, 118, 180, 258, 352, 466, 600, 756];
const SPAN = 58; // degrees either side of the horizontal
const KEY = HERO_MOTION_KEY;

function arc(r: number, span = SPAN) {
  const a = (span * Math.PI) / 180;
  const x = r * Math.cos(a);
  const y = r * Math.sin(a);
  return `M ${x.toFixed(1)} ${(-y).toFixed(1)} A ${r} ${r} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`;
}

export function Echo() {
  const t = useTranslations("landing");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "paused") setPaused(true); } catch { /* storage blocked */ }
  }, []);

  const toggle = () => {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem(KEY, next ? "paused" : "playing"); } catch { /* storage blocked */ }
  };

  return (
    <>
      <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0,black_160px,black_70%,transparent)]", paused && "oz-motion-paused")}>
        <svg viewBox="-900 -900 1800 1800" className="absolute top-[44%] left-[70%] h-[1800px] w-[1800px] -translate-x-1/2 -translate-y-1/2 max-lg:hidden">
          <circle r="30" fill="none" stroke="var(--oz-accent)" strokeWidth="16" opacity="0.22" />
          {R.map((r, i) => (
            <path key={r} d={arc(r)} fill="none" stroke="var(--oz-ink)" strokeWidth={i < 2 ? 10 : 1.25} strokeLinecap="round"
              opacity={i < 2 ? 0.16 - i * 0.05 : Math.max(0.05, 0.16 - i * 0.018)} />
          ))}
          <path d={arc(118)} fill="none" stroke="var(--oz-accent)" strokeWidth="2" strokeLinecap="round" className="oz-hero-wave" />
          <path d={arc(118)} fill="none" stroke="var(--oz-accent)" strokeWidth="2" strokeLinecap="round" className="oz-hero-wave [animation-delay:3.5s]" />
        </svg>
      </div>
      <button type="button" onClick={toggle} aria-pressed={paused}
        className="oz-motion-toggle absolute right-4 bottom-4 z-10 hidden size-9 place-items-center rounded-full border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:grid">
        {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
        <span className="sr-only">{paused ? t("hero.playMotion") : t("hero.pauseMotion")}</span>
      </button>
    </>
  );
}
