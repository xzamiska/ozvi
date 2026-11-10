"use client";

import { Bug, Lightbulb } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/* Landing: small live pieces (beams, incoming reports, an MCP session, a route). Every motion plays
   once (beams three times) and stops; reduced motion sees the finished state. Styles: globals.css oz-live-*. */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** True once the element has been on screen. */
export function useSeen<T extends Element>(margin = "0px 0px -15% 0px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced()) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, seen] as const;
}

/**
 * Beams from where reports come from, into Ozvi, out to where the team works. Paths are measured
 * from the rendered nodes, so the layout stays plain CSS grid; a bright segment travels each path
 * three times after the section comes into view.
 */
export function Beams({ left, right, hub, className }: { left: React.ReactNode[]; right: React.ReactNode[]; hub: React.ReactNode; className?: string }) {
  const [box, seen] = useSeen<HTMLDivElement>();
  const hubRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; side: "in" | "out" }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const root = box.current, h = hubRef.current;
    if (!root || !h) return;
    const measure = () => {
      const rb = root.getBoundingClientRect();
      const c = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.left - rb.left + r.width / 2, y: r.top - rb.top + r.height / 2, w: r.width }; };
      const hub = c(h);
      const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const mx = (a.x + b.x) / 2;
        return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
      };
      const ins = Array.from(root.querySelectorAll("[data-beam=in]")).map((n) => { const p = c(n); return { d: curve({ x: p.x + p.w / 2, y: p.y }, { x: hub.x - hub.w / 2, y: hub.y }), side: "in" as const }; });
      const outs = Array.from(root.querySelectorAll("[data-beam=out]")).map((n) => { const p = c(n); return { d: curve({ x: hub.x + hub.w / 2, y: hub.y }, { x: p.x - p.w / 2, y: p.y }), side: "out" as const }; });
      setSize({ w: rb.width, h: rb.height });
      setPaths([...ins, ...outs]);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [box]);

  return (
    <div ref={box} className={cn("relative grid grid-cols-[1fr_auto_1fr] items-center gap-6 sm:gap-16", className)}>
      <svg aria-hidden className="pointer-events-none absolute inset-0" width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} fill="none">
        <defs>
          <linearGradient id="oz-beam" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--oz-accent)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--oz-accent)" />
            <stop offset="1" stopColor="var(--oz-st-done)" />
          </linearGradient>
        </defs>
        {paths.map((p, i) => (
          <g key={i}>
            <path d={p.d} stroke="var(--oz-line-strong)" strokeWidth="1.5" />
            <path d={p.d} pathLength={100} stroke="url(#oz-beam)" strokeWidth="2.5" strokeLinecap="round"
              className={cn("oz-live-beam", seen && "oz-live-beam-on")} style={{ animationDelay: `${(p.side === "out" ? 900 : 0) + (i % 4) * 220}ms` }} />
          </g>
        ))}
      </svg>
      <ul className="relative grid gap-4 justify-self-end">{left.map((n, i) => <li key={i} data-beam="in">{n}</li>)}</ul>
      <div ref={hubRef} className="relative">{hub}</div>
      <ul className="relative grid gap-4 justify-self-start">{right.map((n, i) => <li key={i} data-beam="out">{n}</li>)}</ul>
    </div>
  );
}

/** Reports arriving one after another (once), newest on top. */
export function ReportStream({ items }: { items: { n: number; title: string; meta: string; tone: "bug" | "idea" }[] }) {
  const [ref, seen] = useSeen<HTMLUListElement>();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setShown(items.length); return; }
    let i = 0;
    const id = setInterval(() => { i++; setShown(i); if (i >= items.length) clearInterval(id); }, 650);
    return () => clearInterval(id);
  }, [seen, items.length]);
  const visible = items.slice(0, shown).reverse();
  return (
    <ul ref={ref} className="grid gap-2.5">
      {visible.map((r) => (
        <li key={r.n} className="oz-live-pop flex items-center gap-3 rounded-xl border bg-surface px-3.5 py-3 shadow-[0_8px_24px_-18px_rgb(13_12_20/0.35)]">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold", r.tone === "bug" ? "bg-destructive/10 text-destructive" : "bg-brand-soft text-brand-text")}>
            {r.tone === "bug" ? <Bug className="size-4" /> : <Lightbulb className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-medium">{r.title}</span>
            <span className="block truncate text-[12px] text-muted-foreground">{r.meta}</span>
          </span>
          <span data-num className="shrink-0 text-[13px] font-bold tabular-nums text-muted-foreground">#{r.n}</span>
        </li>
      ))}
    </ul>
  );
}

/** An MCP session typed out once. */
export function Terminal({ lines }: { lines: { who: "you" | "ai" | "tool"; text: string }[] }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const full = lines.map((l) => l.text);
  const [chars, setChars] = useState<number[]>(() => lines.map(() => 0));
  useEffect(() => {
    if (!seen) return;
    if (reduced()) { setChars(full.map((t) => t.length)); return; }
    let line = 0, c = 0;
    const id = setInterval(() => {
      if (line >= full.length) { clearInterval(id); return; }
      const step = lines[line]!.who === "you" ? 1 : 4;
      c = Math.min(full[line]!.length, c + step);
      const at = line, upto = c; // the updater runs later: capture, don't close over the counters
      setChars((prev) => prev.map((v, i) => (i === at ? upto : v)));
      if (c >= full[line]!.length) { line++; c = 0; }
    }, 28);
    return () => clearInterval(id);
  }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="grid gap-2 font-mono text-[12.5px] leading-relaxed">
      {lines.map((l, i) => chars[i]! > 0 && (
        <p key={i} className={cn(l.who === "you" ? "text-foreground" : l.who === "tool" ? "text-success" : "text-muted-foreground")}>
          <span aria-hidden className={cn("mr-2 inline-block w-2 select-none", l.who === "you" ? "text-foreground/50" : "")}>{l.who === "you" ? ">" : l.who === "tool" ? <span className="inline-block size-1.5 -translate-y-0.5 rounded-full bg-success" /> : ""}</span>
          {l.text.slice(0, chars[i])}
          {chars[i]! < l.text.length && <span className="oz-live-caret" />}
        </p>
      ))}
    </div>
  );
}

/** A route that fills stop by stop once in view. */
export function RouteFill({ stops }: { stops: string[] }) {
  const [ref, seen] = useSeen<HTMLOListElement>();
  return (
    <ol ref={ref} className="grid gap-0">
      {stops.map((s, i) => (
        <li key={s} className="relative flex items-center gap-3 pb-4 last:pb-0">
          {i < stops.length - 1 && <span className="absolute top-3 left-[7px] h-full w-0.5 bg-line"><span className={cn("oz-live-fill absolute inset-0 origin-top bg-st-done", seen && "oz-live-fill-on")} style={{ animationDelay: `${i * 450 + 200}ms` }} /></span>}
          <span className={cn("relative z-10 size-4 rounded-full border-2 border-line-strong bg-surface", seen && "oz-live-stop-on")} style={{ animationDelay: `${i * 450}ms` }} />
          <span className="text-[13.5px]">{s}</span>
        </li>
      ))}
    </ol>
  );
}
