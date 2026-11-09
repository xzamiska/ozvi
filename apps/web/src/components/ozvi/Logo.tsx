import { cn } from "@/lib/utils";

/**
 * Ozvi's mark ("Ozvena"): the letter o and two arcs echoing out of it. The ring takes the accent,
 * the echoes take the text colour; `mono` draws everything in currentColor (on an accent tile, the
 * widget launcher, the favicon). Ozvi's own surfaces only; a host's board never shows it.
 */
export const MARK = {
  ring: { cx: 11, cy: 16, r: 6.25, w: 4.5 },
  near: "M18.69 7.45A11.5 11.5 0 0 1 18.69 24.55",
  far: "M23.02 3.98A17 17 0 0 1 23.02 28.02",
} as const;

export function OzviMark({ className, title, mono = false, animated = false }: { className?: string; title?: string; mono?: boolean; animated?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("size-6 shrink-0", animated && "oz-echo", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <circle cx={MARK.ring.cx} cy={MARK.ring.cy} r={MARK.ring.r} stroke={mono ? "currentColor" : "var(--color-primary)"} strokeWidth={MARK.ring.w} />
      <path className="oz-echo-near" d={MARK.near} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
      <path className="oz-echo-far" d={MARK.far} stroke="currentColor" strokeWidth={3} strokeLinecap="round" opacity={0.4} />
    </svg>
  );
}

/** Mark + lowercase wordmark in Geist (bundled with the app, see globals.css). */
export function OzviLogo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <OzviMark className={markClassName} />
      <span className="font-brand text-[20px] leading-none font-semibold tracking-[-0.05em]">ozvi</span>
    </span>
  );
}

