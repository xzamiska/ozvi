"use client";

import { Check, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { StatusMark } from "@/components/ozvi/route";
import { TeamDesk } from "@/components/landing/TeamDesk";
import { cn } from "@/lib/utils";

/**
 * Landing: one bug report, #128, followed the whole way, on copies of the real screens: the widget in
 * the customer's app, the team's queue in Ozvi, the fix and the reply, the e-mail Ozvi sends. Steps
 * scroll past on the left; the frame on the right shows the scene of the step at the middle of the
 * screen, and how far that step has scrolled moves the scene along. Scroll back and it plays back;
 * nothing runs on a timer. Reduced motion and phones see the scenes finished (phones only `phonePanels`).
 * Themes: `.look-host` is the customer's app, `.look-ozvi` is Ozvi's own (the widget, the console, the e-mail).
 */
type Step = { title: string; text: string };
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none";
const from = (p: number, at: number) => (p >= at ? "opacity-100 translate-y-0" : "pointer-events-none translate-y-1.5 opacity-0");

export function ScrollStory({ phonePanels = [1, 2] }: { phonePanels?: number[] }) {
  const t = useTranslations("landing");
  const steps = t.raw("steps") as Step[];
  const where = t.raw("hero.loop.where") as string[];
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

  const scenes = [AppScene, ReportScene, FixScene, MailScene];
  const label = (i: number) => where[i === 0 ? 0 : i === 3 ? 2 : 1];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] lg:gap-14">
      <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-14 lg:gap-0">
        {steps.map((s, i) => {
          const Scene = scenes[i]!;
          return (
            <li key={s.title} ref={(el) => { refs.current[i] = el; }} className="min-w-0 lg:flex lg:min-h-[85vh] lg:flex-col lg:justify-center">
              <p className={cn("text-[13px] font-semibold transition-colors", at === i ? "text-brand-text" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</p>
              <h3 className={cn("mt-3 max-w-[18ch] text-[30px] leading-tight font-extrabold tracking-[-0.035em] transition-opacity lg:text-[38px]", at !== i && "lg:opacity-35")}>{s.title}</h3>
              <p className={cn("mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground transition-opacity", at !== i && "lg:opacity-35")}>{s.text}</p>
              {phonePanels.includes(i) && (
                <div inert className="mt-6 grid min-w-0 gap-2 select-none lg:hidden">
                  <p className="text-[13px] font-medium text-muted-foreground">{label(i)}</p>
                  <Scene p={1} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="relative hidden lg:block">
        <div className="sticky top-[calc(50vh-290px)] grid gap-2">
          <p className="relative h-6 text-[13px] font-medium text-muted-foreground">
            {scenes.map((_, i) => <span key={i} className={cn("absolute inset-0 transition-opacity duration-300", at === i ? "opacity-100" : "opacity-0")}>{label(i)}</span>)}
          </p>
          <div inert className="relative h-[540px] select-none">
            {scenes.map((Scene, i) => (
              <div key={i} aria-hidden className={cn("absolute inset-0 transition-[opacity,transform] ease-out motion-reduce:transition-none",
                at === i ? "opacity-100 delay-100 duration-500" : cn("opacity-0 duration-200", i < at ? "-translate-y-3" : "translate-y-3"))}>
                <Scene p={still ? 1 : at === i ? p : i < at ? 1 : 0} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The Ozvi widget's bug form, as the real one draws it (packages/widget: .panel, labels, the screenshot
 * with its two buttons, the request-log checkbox, the full-width submit). `typed` is how much of the
 * report is written (0..1); `shot` adds the screenshot; `sent` presses the button.
 */
export function WidgetForm({ typed, shot, sent, compact, className }: { typed: number; shot: boolean; sent: boolean; compact?: boolean; className?: string }) {
  const t = useTranslations("landing");
  const w = (k: string) => t(`scene.widget.${k}`);
  const report = t("story.stage.report");
  const k = clamp(typed);
  const text = report.slice(0, Math.round(report.length * k));
  const field = "w-full rounded-lg border border-line-strong bg-surface px-[11px] py-[9px] text-[14px]";
  return (
    <div className={cn("look-ozvi oz-scope w-[340px] max-w-full rounded-xl border bg-surface p-4 font-sans text-[13px] text-foreground shadow-[0_18px_50px_rgba(0,0,0,.22)]", className)}>
      <div className="flex items-center justify-between"><p className="text-[16px] font-bold">{w("bug")}</p><X className="size-4 text-muted-foreground" aria-hidden /></div>
      <p className="mt-3 mb-1 font-semibold">{w("what")}</p>
      <p className={cn(field, "min-h-[40px]", k > 0 && k < 1 && "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--oz-accent)_25%,transparent)]")}>
        {text}{k > 0 && k < 1 && <span aria-hidden className="ml-px inline-block h-4 w-px translate-y-[3px] bg-foreground" />}
      </p>
      {!compact && <>
        <p className="mt-2.5 mb-1 font-semibold">{w("how")} <span className="font-normal text-muted-foreground">{w("opt")}</span></p>
        <p className={cn(field, "h-[48px]")} />
      </>}
      <div className={cn("relative mt-2.5 overflow-hidden rounded-lg border", ease, shot ? "h-[112px] opacity-100" : "h-0 border-0 opacity-0")}>
        <MiniApp className="pointer-events-none w-[200%] origin-top-left scale-50" masked />
        <div className="absolute top-1.5 right-1.5 flex gap-1.5 text-[11px] font-semibold text-white">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1"><Pencil className="size-3" aria-hidden />{w("ann")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1"><Trash2 className="size-3" aria-hidden />{w("shotDel")}</span>
        </div>
      </div>
      <p className={cn("mt-3 grid grid-cols-[auto_1fr] gap-x-2 font-semibold", compact && "hidden")}><span className="mt-0.5 grid size-4 place-items-center rounded-[4px] bg-primary text-primary-foreground"><Check className="size-3" strokeWidth={3} aria-hidden /></span>{w("tech")}</p>
      <p className={cn("mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-[11px] font-semibold text-primary-foreground transition-[filter]", sent && "brightness-90")}>
        {sent && <Check className="size-4" aria-hidden />}{w("bug")}
      </p>
    </div>
  );
}

/** The customer's app (a booking calendar), in the customer's own look. `masked`: as the screenshot sends it. */
export function MiniApp({ masked, className }: { masked?: boolean; className?: string }) {
  const t = useTranslations("landing");
  const lines = t.raw("story.stage.lines") as [string, string][];
  return (
    <div className={cn("look-host oz-scope grid content-start gap-3 bg-background p-5 font-sans text-[13.5px] text-foreground", className)}>
      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <p className="font-semibold">{t("story.stage.app")}</p>
        <span className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground">{t("story.stage.download")}</span>
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t("story.stage.invoice")}</p>
      {lines.map(([what, when]) => (
        <p key={what} className="flex justify-between gap-3 rounded-md border bg-surface px-3 py-2.5">
          <span className={cn("truncate", masked && "rounded bg-foreground/15 text-transparent blur-[3px]")}>{what}</span><span className="tabular-nums">{when}</span>
        </p>
      ))}
    </div>
  );
}

/** 1. In the customer's app: the launcher opens the widget, the report is written, the screenshot taken, sent. */
function AppScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const open = p >= 0.1, shot = p >= 0.58, sent = p >= 0.8;
  return (
    <div className="relative h-[540px] overflow-hidden rounded-xl border max-lg:h-[520px]">
      <MiniApp className={cn("h-full", shot && !sent && "oz-shot")} />
      <span className={cn("look-ozvi oz-scope absolute right-4 bottom-4 inline-flex h-11 items-center gap-2 rounded-full bg-primary pr-[18px] pl-3.5 text-[14px] font-semibold text-primary-foreground shadow-[0_10px_28px_-8px_rgba(0,0,0,.35)]", ease, open ? "scale-95 opacity-0" : "opacity-100")}>
        <MessageSquare className="size-4" aria-hidden />{t("scene.widget.fb")}
      </span>
      <div className={cn("absolute right-3 bottom-3 left-3 flex justify-end origin-bottom-right", ease, open ? "scale-100 opacity-100" : "scale-95 opacity-0")}>
        <WidgetForm typed={(p - 0.14) / 0.36} shot={shot} sent={sent} />
      </div>
    </div>
  );
}

/** 2. In Ozvi: #128 lands on top of the queue, then what came with it. */
function ReportScene({ p }: { p: number }) {
  return (
    <div className="look-ozvi oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground">
      <TeamDesk play={{ landed: p >= 0.08, reveal: clamp((p - 0.08) / 0.75), status: "new", pr: false, sent: false }} />
    </div>
  );
}

/** 3. Still in Ozvi: the pull request is merged, the report moves to "Fixed in 2.15" and the author is told. */
function FixScene({ p }: { p: number }) {
  const status = p < 0.15 ? "confirmed" : p < 0.4 ? "in_progress" : "fixed";
  return (
    <div className="look-ozvi oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground">
      <TeamDesk play={{ landed: true, reveal: 1, status, pr: p >= 0.25, sent: p >= 0.62 }} />
    </div>
  );
}

/** 4. The customer's inbox: the e-mail Ozvi sends (lib/email/render.ts), the customer confirms, #128 is verified. */
function MailScene({ p }: { p: number }) {
  const t = useTranslations("landing");
  const e = useTranslations("email");
  const title = t("story.stage.report"), app = t("story.stage.app");
  const yes = p >= 0.5;
  return (
    <div className="look-ozvi oz-scope grid h-[540px] content-start gap-4 overflow-hidden rounded-xl border bg-background p-5 font-sans text-foreground max-lg:h-auto">
      <div className={cn("grid gap-4", ease, from(p, 0.06))}>
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 border-b pb-3 text-[13px]"><b className="font-semibold">{app}</b><span className="min-w-0 truncate text-muted-foreground">{e("bugFixedSubject", { title })}</span></p>
        <div className="flex items-center gap-2.5"><span className="grid size-7 place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">{app.slice(0, 1)}</span><b className="text-[16px]">{app}</b></div>
        <div className="rounded-xl border bg-surface px-6 py-6 text-[14.5px] leading-relaxed">
          <p className="text-[20px] leading-snug font-bold tracking-[-0.01em]">{e("bugFixedHeading")}</p>
          <p className="mt-3">{e("bugFixedBodyVersion", { title, version: "2.15" })}</p>
          <p className="mt-2">{e("bugFixedAsk")}</p>
          <p className="mt-5"><span className={cn("inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-3 text-[15px] font-semibold text-primary-foreground transition-[filter]", yes && "brightness-90")}>{yes && <Check className="size-4" aria-hidden />}{e("confirmFix")}</span></p>
        </div>
      </div>
      <p className={cn("inline-flex w-fit items-center gap-2 rounded-lg border-2 border-foreground bg-surface px-4 py-3 text-[14px] font-semibold", ease, from(p, 0.62))}>
        <span className="font-extrabold tabular-nums">#128</span><StatusMark kind="bug" status="verified" />{(t.raw("story.stage.stops") as string[])[4]}
      </p>
    </div>
  );
}
