"use client";

import { Camera, Check, CircleDot, Lock, MonitorSmartphone, Tag, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { cn } from "@/lib/utils";

/**
 * Landing: one bug report, #128, followed the whole way. The steps scroll past on the left; the frame
 * on the right shows the scene of the step at the middle of the screen, and how far that step has
 * scrolled moves the scene along (the text types, the screenshot is taken, the report lands, the route
 * fills, the customer answers). Scroll back and it plays back; nothing runs on a timer.
 * Reduced motion and phones see every scene finished (phones only the ones in `phonePanels`).
 */
type Step = { title: string; text: string };
const STATUS = ["new", "confirmed", "in_progress", "fixed"] as const;
const host = "look-host oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground";
const chip = "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 text-[11.5px] text-muted-foreground";
/** Shown from `at` of the step's progress on (CSS fades it; the threshold is what scroll decides). */
const from = (p: number, at: number) => (p >= at ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-1.5 opacity-0");
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export function ScrollStory({ phonePanels = [1, 2] }: { phonePanels?: number[] }) {
  const t = useTranslations("landing");
  const steps = t.raw("steps") as Step[];
  const [at, setAt] = useState(0);
  const [p, setP] = useState(0);
  const [still, setStill] = useState(false);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    let raf = 0;
    const pick = () => {
      raf = 0;
      // The step under the middle of the screen is the scene; how far the middle is through it is the progress.
      const mid = window.innerHeight / 2;
      let best = 0, dist = Infinity, prog = 0;
      refs.current.forEach((li, i) => {
        if (!li) return;
        const r = li.getBoundingClientRect();
        const d = mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0;
        if (d < dist) { dist = d; best = i; prog = clamp((mid - r.top) / r.height); }
      });
      setAt(best);
      setP(Math.round(prog * 100) / 100);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(pick); };
    pick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const scenes = [AppScene, DeskScene, GithubScene, MailScene];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
      <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-14 lg:gap-0">
        {steps.map((s, i) => {
          const Scene = scenes[i]!;
          return (
            <li key={s.title} ref={(el) => { refs.current[i] = el; }} className="min-w-0 lg:flex lg:min-h-[80vh] lg:flex-col lg:justify-center">
              <p className={cn("text-[13px] font-semibold transition-colors", at === i ? "text-brand-text" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</p>
              <h3 className={cn("mt-3 max-w-[18ch] text-[30px] leading-tight font-extrabold tracking-[-0.035em] transition-opacity lg:text-[38px]", at !== i && "lg:opacity-35")}>{s.title}</h3>
              <p className={cn("mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground transition-opacity", at !== i && "lg:opacity-35")}>{s.text}</p>
              {phonePanels.includes(i) && <div inert className="mt-6 min-w-0 select-none lg:hidden"><Frame scene={i}><Scene p={1} /></Frame></div>}
            </li>
          );
        })}
      </ol>
      <div className="relative hidden lg:block">
        <div className="sticky top-[15vh] flex h-[70vh] items-center">
          <div inert className="relative h-[400px] w-full select-none">
            {scenes.map((Scene, i) => (
              <div key={i} aria-hidden className={cn("absolute inset-0 transition-[opacity,transform] ease-out motion-reduce:transition-none",
                at === i ? "opacity-100 delay-100 duration-500" : cn("opacity-0 duration-200", i < at ? "-translate-y-3" : "translate-y-3"))}>
                <Frame scene={i}><Scene p={still ? 1 : at === i ? p : i < at ? 1 : 0} /></Frame>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The window the scene plays in; the bar says whose screen it is. */
function Frame({ scene, children }: { scene: number; children: React.ReactNode }) {
  const t = useTranslations("landing");
  const where = [t("story.stage.url"), t("product.team.title"), "acme/app", "jana@firma.sk"][scene];
  return (
    <div className={cn(host, "flex h-full flex-col text-[13.5px] max-lg:h-auto")}>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-surface px-4">
        <span aria-hidden className="flex gap-1.5"><i className="size-2 rounded-full bg-line-strong" /><i className="size-2 rounded-full bg-line-strong" /></span>
        <span className="truncate font-mono text-[11.5px] text-muted-foreground">{where}</span>
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

const fade = "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none";

/** 1. The customer's app: the widget opens, the report types itself, the screenshot is taken, it is sent. */
function AppScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const report = t("story.stage.report");
  const typed = report.slice(0, Math.round(report.length * clamp((p - 0.12) / 0.38)));
  const shot = p >= 0.58, sent = p >= 0.8;
  const lines = t.raw("story.stage.lines") as [string, string][];
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] max-lg:gap-5">
      {/* the app behind the widget: Saturday has bookings on desktop, the bug is the empty phone view */}
      <div className={cn("grid content-start gap-2 rounded-lg border bg-surface p-4", shot && !sent && "oz-shot")}>
        <p className="font-semibold">{t("story.stage.app")}</p>
        <p className="text-[12.5px] text-muted-foreground">{t("story.stage.invoice")}</p>
        {lines.map(([what, when]) => (
          <p key={what} className="flex justify-between gap-3 rounded-md border bg-background px-3 py-2 text-[12.5px]"><span className={cn("truncate", shot && "rounded bg-foreground/15 text-transparent blur-[3px]")}>{what}</span><span className="tabular-nums">{when}</span></p>
        ))}
      </div>
      <div className={cn("grid content-start gap-3 rounded-lg border-2 border-foreground bg-background p-4", fade, from(p, 0.04))}>
        <p className="font-semibold">{t("hero.loop.widgetTitle")}</p>
        <p className="min-h-[64px] rounded-md border bg-surface px-3 py-2">{typed}{!sent && typed.length < report.length && <span aria-hidden className="ml-px inline-block h-4 w-[2px] translate-y-[3px] bg-foreground" />}</p>
        <p className={cn("inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground", fade, from(p, 0.58))}><Camera className="size-3.5" aria-hidden />{t("product.team.shot")}</p>
        <span className={cn("inline-flex w-fit items-center gap-1.5 justify-self-end rounded-md px-3 py-1.5 text-[12.5px] font-semibold bg-primary text-primary-foreground")}>
          {sent && <Check className="size-3.5" aria-hidden />}{t("hero.loop.widgetSend")}
        </span>
      </div>
    </div>
  );
}

/** 2. The team's queue: #128 lands on top, then what came with it. */
function DeskScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const queue = t.raw("product.team.queue") as string[];
  const landed = p >= 0.1;
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)]">
      <ul className="hidden border-r bg-surface sm:block">
        <li className={cn("grid gap-1 border-b border-l-2 border-l-primary bg-background px-4 py-3", fade, landed ? "opacity-100" : "-translate-y-2 opacity-0")}>
          <span className="flex items-center justify-between font-bold tabular-nums">#128<StatusMark kind="bug" status="new" /></span>
          <span className="line-clamp-2 text-[12.5px]">{t("story.stage.report")}</span>
        </li>
        {[[127, queue[2]!], [126, queue[0]!]].map(([n, title]) => (
          <li key={n} className={cn("grid gap-1 border-b px-4 py-3 text-muted-foreground", fade, landed ? "translate-y-0" : "-translate-y-[68px]")}>
            <span className="font-bold tabular-nums">#{n}</span><span className="line-clamp-2 text-[12.5px]">{title}</span>
          </li>
        ))}
      </ul>
      <div className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 p-4 sm:p-5", fade, from(p, 0.22))}>
        <p className="text-[16px] font-semibold"><span className="mr-2 font-extrabold tabular-nums">#128</span>{t("story.stage.report")}</p>
        <p className="text-[12.5px] text-muted-foreground">{(t.raw("product.team.reporters") as string[])[1]}</p>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn(chip, fade, from(p, 0.34))}><Camera className="size-3" aria-hidden />{t("product.team.shot")}</span>
          <span className={cn(chip, "font-mono", fade, from(p, 0.4))}>v2.14.0</span>
          <span className={cn(chip, fade, from(p, 0.46))}><MonitorSmartphone className="size-3" aria-hidden />Chrome 141 · macOS</span>
          <span className={cn(chip, "font-mono", fade, from(p, 0.52))}>/kalendar/2026-11-14</span>
        </div>
        <p className={cn("flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[12px]", fade, from(p, 0.6))}><TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden /><span className="truncate">{t("product.team.console")}</span></p>
        <p className={cn("inline-flex items-center gap-1.5 text-[12px] text-muted-foreground", fade, from(p, 0.7))}><Lock className="size-3" aria-hidden />{t("product.team.private")}</p>
      </div>
    </div>
  );
}

/** 3. GitHub: an issue from #128, a release closes it, and the route fills to "Fixed" on its own. */
function GithubScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const stops = t.raw("features.tiles.route.stops") as string[];
  const filled = p < 0.5 ? 2 : p < 0.62 ? 3 : 4; // stops reached; the release lands at 0.5
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 sm:p-5">
      <div className={cn("grid gap-3 rounded-lg border p-4", fade, from(p, 0.08))}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
          <CircleDot className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div className="min-w-0"><p className="font-semibold">{t("story.stage.report")}</p><p className="mt-0.5 text-[12.5px] text-muted-foreground">#482 · {t("ghPanel.from")}</p></div>
        </div>
        <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 border-t pt-3", fade, from(p, 0.5))}>
          <Tag className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <p>{t("ghPanel.closed")}</p>
        </div>
      </div>
      <div className={cn("rounded-lg border-2 border-foreground bg-surface p-4", fade, from(p, 0.2))}>
        <p className="flex items-baseline gap-3"><span className="text-[22px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">#128</span><span className="min-w-0 font-semibold">{t("story.stage.report")}</span></p>
        <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12.5px]">
          {stops.map((s, k) => (
            <li key={s} className="inline-flex items-center gap-1.5">
              {k > 0 && <span aria-hidden className={cn("h-[3px] w-3 rounded-full transition-colors duration-300 sm:w-4", k < filled ? "bg-st-done" : "bg-line")} />}
              <span className={cn("transition-opacity duration-300", k < filled ? "opacity-100" : "opacity-30")}><StatusMark kind="bug" status={STATUS[k]!} /></span>
              <span className={cn(k === filled - 1 ? "font-semibold" : "text-muted-foreground")}>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** 4. The customer's inbox: the e-mail arrives, the customer says it works, the report is verified. */
function MailScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const yes = p >= 0.55;
  return (
    <div className="grid h-full grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 sm:p-5">
      <div className={cn("grid gap-1.5 rounded-lg border p-5", fade, from(p, 0.1))}>
        <p className="text-[12.5px] text-muted-foreground">{t("story.stage.app")} → jana@firma.sk</p>
        <p className="mt-1 text-[17px] font-semibold">{t("hero.loop.mailSubject")}</p>
        <p className="leading-relaxed">{t("hero.loop.mailBody")}</p>
        <div className="mt-3 flex gap-2 text-[13px] font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-primary-foreground">{yes && <Check className="size-3.5" aria-hidden />}{t("hero.loop.yes")}</span>
          <span className={cn("rounded-md border border-line-strong px-3 py-1.5 transition-opacity", yes && "opacity-40")}>{t("hero.loop.no")}</span>
        </div>
      </div>
      <p className={cn("inline-flex items-center gap-2 rounded-lg border-2 border-foreground bg-surface px-4 py-3 font-semibold", fade, from(p, 0.68))}>
        <span className="font-extrabold tabular-nums">#128</span><StatusMark kind="bug" status="verified" />{(t.raw("story.stage.stops") as string[])[4]}
      </p>
    </div>
  );
}
