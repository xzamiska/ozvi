"use client";

import { Camera, Check, GitPullRequestArrow } from "lucide-react";
import { useTranslations } from "next-intl";
import { OzviMark } from "@/components/ozvi/Logo";
import { cn } from "@/lib/utils";

type T = ReturnType<typeof useTranslations<"landing">>;

/**
 * One bug report, told twice: the host app the user sees (in the host's own light brand) and
 * Ozvi's event log (always dark, a terminal). `step` (-1…3) is driven by the scroll story on
 * desktop and by a timer on phones; everything is state + CSS transitions, so reduced motion
 * just snaps between states.
 */
const LOG = [
  { at: 0, t: "09:41:07", src: "widget", msg: (t: T) => <>report.submit <b>#128</b> · {t("story.stage.screenshot")} 412 kB · {t("story.stage.errors")}</> },
  { at: 0, t: "09:41:07", src: "api", msg: () => <>POST /api/widget/items <em>201</em> 84 ms</> },
  { at: 0, t: "09:41:07", src: "mail", msg: () => <>new_bug → support@ · outbox</> },
  { at: 1, t: "09:41:08", src: "hook", msg: () => <>item.created → slack <em>200</em></> },
  { at: 1, t: "09:52:30", src: "github", msg: () => <>item.linked → acme/app#482</> },
  { at: 2, t: "11:18:44", src: "mcp", msg: () => <>set_status #128 fixed 2.15 · Claude Code</>, brand: true },
  { at: 3, t: "11:18:45", src: "mail", msg: (t: T) => <>bug_status → reporter <em>{t("story.stage.delivered")}</em></> },
];
const REACHED = [1, 2, 4, 4]; // stops lit per step
const fade = "transition-[opacity,transform,translate] duration-500 ease-out motion-reduce:transition-none";

export function Stage({ step, className }: { step: number; className?: string }) {
  const t = useTranslations("landing");
  const summaryValues = t.raw("story.stage.summaryValues") as string[];
  const reached = step < 0 ? 0 : REACHED[step]!;
  const on = (s: number) => step >= s;
  return (
    <div className={cn("grid gap-1.5 rounded-2xl border bg-surface p-1.5 shadow-[0_30px_80px_-40px_rgb(13_12_20/0.3)]", className)} role="img" aria-label={t("story.stage.label")}>
      {/* host app, in the host's own brand */}
      <div className="look-host oz-scope relative overflow-hidden rounded-xl border bg-background text-foreground" aria-hidden>
        <div className="flex h-9 items-center gap-2 border-b bg-surface px-3.5">
          <span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" /><span className="size-2.5 rounded-full bg-line" />
          <span className="ml-2 min-w-0 truncate rounded-md bg-wash px-2.5 py-0.5 font-mono text-[11px] text-muted-foreground">{t("story.stage.url")}</span>
        </div>
        <div className="relative h-[320px] p-4 sm:h-[268px] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">{t("story.stage.app").charAt(0)}</span>
              <span className="truncate text-[14px] font-semibold tracking-tight">{t("story.stage.invoice")}</span>
            </span>
            <span className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-semibold text-primary-foreground">{t("story.stage.download")}</span>
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 rounded-lg border bg-surface p-3 text-[12px] text-muted-foreground">
            {(t.raw("story.stage.lines") as [string, string][]).map(([a, b]) => <span key={a} className="contents"><span className="truncate">{a}</span><span className="tabular-nums">{b}</span></span>)}
          </div>

          <div className="absolute inset-x-3 bottom-3 grid justify-items-end gap-2.5 sm:inset-x-5 sm:bottom-4">
            <div className={cn(fade, "w-full max-w-[400px] origin-bottom-right rounded-xl border bg-surface p-3.5 shadow-[0_12px_32px_-12px_rgb(17_24_39/0.25)]",
              !on(0) && "translate-y-4 scale-95 opacity-0")}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] leading-snug font-semibold">{t("story.stage.report")}</p>
                <span className="shrink-0 font-mono text-[14px] leading-tight font-semibold text-primary tabular-nums">#128</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5"><Camera className="size-3" />{t("story.stage.screenshot")}</span>
                <span className="rounded bg-wash px-1.5 py-0.5 font-mono">v2.14.0</span>
                <span className="rounded bg-wash px-1.5 py-0.5 font-mono max-[380px]:hidden">Chrome 141 · macOS</span>
                <span className={cn(fade, "inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5 font-mono", !on(1) && "opacity-0")}><GitPullRequestArrow className="size-3" />#482</span>
              </div>
              <ol className="mt-3.5 grid grid-cols-5">
                {(t.raw("story.stage.stops") as string[]).map((s, i) => {
                  const lit = i < reached;
                  return (
                    <li key={s} className="relative grid justify-items-center gap-1 text-center">
                      {i > 0 && (
                        <span className="absolute top-[6px] right-1/2 left-[-50%] h-0.5 rounded-full bg-line">
                          <span className={cn("absolute inset-0 origin-left rounded-full bg-primary transition-transform duration-700 ease-out motion-reduce:transition-none", lit ? "scale-x-100" : "scale-x-0")} />
                        </span>
                      )}
                      <span className="relative z-10 grid size-3.5 place-items-center rounded-full bg-surface">
                        <span className={cn("absolute grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 motion-reduce:transition-none", lit ? "scale-100 delay-300" : "scale-0")}>
                          <Check className="size-2.5" strokeWidth={4} />
                        </span>
                        <span className="size-3 rounded-full border-[1.5px] border-dashed border-line-strong" />
                      </span>
                      <span className={cn("hidden text-[10px] leading-tight font-medium transition-colors sm:block", !lit && "text-muted-foreground")}>{s}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="flex w-full max-w-[400px] items-end justify-between gap-3">
              <div className={cn(fade, "min-w-0 origin-bottom-left rounded-xl rounded-bl-sm bg-primary px-3 py-2 text-[12.5px] leading-snug text-primary-foreground", !on(3) && "translate-y-3 scale-95 opacity-0")}>
                <b className="font-semibold">{t("story.stage.replyFrom")}:</b> {t("story.stage.reply")}
              </div>
              <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
                <OzviMark mono className="size-5" />
                <span className={cn("absolute inset-0 rounded-full ring-2 ring-primary", step < 0 && "animate-ping motion-reduce:animate-none")} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* the system side: what Ozvi did meanwhile */}
      <div className="look-term oz-scope flex min-w-0 flex-col rounded-xl bg-background p-4 text-foreground" aria-hidden>
        <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-foreground/65">
          <span className="size-1.5 rounded-full bg-success ring-[3px] ring-success/20" />
          {t("story.stage.log")} · acme
        </div>
        <ol className="grid min-h-[150px] content-start gap-1.5 font-mono text-[11px] leading-[1.45] sm:text-[11.5px]">
          {LOG.map((l, i) => (
            <li key={i} className={cn(fade, "grid grid-cols-[auto_1fr] gap-x-3", !on(l.at) && "-translate-x-2 opacity-0")}>
              <span className="text-foreground/65 tabular-nums">{l.t}</span>
              <span className="min-w-0 truncate text-foreground/80 [&_b]:font-semibold [&_b]:text-foreground [&_em]:text-success [&_em]:not-italic">
                <span className={cn("mr-2 inline-block w-[6ch]", l.brand ? "text-primary" : "text-foreground/65")}>{l.src}</span>
                {l.msg(t)}
              </span>
            </li>
          ))}
        </ol>
        <dl className={cn(fade, "mt-3 grid grid-cols-3 gap-3 border-t border-foreground/10 pt-3 font-mono text-[10.5px]", !on(3) && "opacity-0")}>
          {(t.raw("story.stage.summary") as string[]).map((k, i) => (
            <div key={k}><dt className="text-foreground/65">{k}</dt><dd className="mt-0.5 text-[13.5px] text-foreground">{summaryValues[i]}</dd></div>
          ))}
        </dl>
      </div>
    </div>
  );
}
