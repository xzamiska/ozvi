import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusMark } from "@/components/ozvi/route";
import { cn } from "@/lib/utils";

/**
 * The hero's product picture: one bug report on its route, in three places. The user reports it in
 * the host app (widget), it lands on the team's board as #128 and moves to Opravené, and the author
 * gets the answer by e-mail. Host surfaces wear the host's own brand (`.look-host`).
 *
 * Numbered stops joined by the route line (the Tracking Page signature).
 * The markup is the finished state. The one authored moment is pure CSS (globals.css, `oz-hl-*`),
 * played once on load under `prefers-reduced-motion: no-preference`; no script, so no flash on
 * hydration and nothing moves after ~4 s (WCAG 2.2.2).
 */
const BUG = ["new", "confirmed", "in_progress", "fixed", "verified"] as const;
const REACHED = 4; // new … fixed lit, verified still ahead

export function HeroLoop({ className }: { className?: string }) {
  const t = useTranslations("landing");
  const stops = t.raw("story.stage.stops") as string[];
  const where = t.raw("hero.loop.where") as [string, string, string];
  const app = t("story.stage.app");

  return (
    <div role="img" aria-label={t("hero.loop.label")} className={cn("relative", className)}>
      <ol aria-hidden className="relative grid gap-5">
        {/* 1 · in the host app */}
        <li className="relative grid grid-cols-[25px_minmax(0,1fr)] gap-x-4">
          <Leg n={1} />
          <Stop n={1} />
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted-foreground">{where[0]}</p>
            <div className="look-host oz-scope overflow-hidden rounded-xl border bg-background text-foreground shadow-[0_24px_60px_-32px_rgb(13_12_20/0.45)]">
              <div className="flex h-8 items-center gap-1.5 border-b bg-surface px-3">
                <span className="size-2 rounded-full bg-line" /><span className="size-2 rounded-full bg-line" /><span className="size-2 rounded-full bg-line" />
                <span className="ml-2 min-w-0 truncate rounded bg-wash px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">{t("story.stage.url")}</span>
              </div>
              <div className="relative grid gap-3 p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,232px)]">
                <div className="hidden content-start gap-2 sm:grid">
                  <span className="flex items-center gap-2">
                    <span className="grid size-5 place-items-center rounded bg-primary text-[10px] font-bold text-primary-foreground">{app.charAt(0)}</span>
                    <span className="truncate text-[13px] font-semibold tracking-tight">{t("story.stage.invoice")}</span>
                  </span>
                  {(t.raw("story.stage.lines") as [string, string][]).map(([a, b]) => (
                    <span key={a} className="flex justify-between gap-3 border-b border-line pb-1.5 text-[11.5px] text-muted-foreground">
                      <span className="truncate">{a}</span><span className="shrink-0 tabular-nums">{b}</span>
                    </span>
                  ))}
                </div>
                {/* the Ozvi widget, open */}
                <div className="oz-hl-widget rounded-lg border bg-surface p-3 shadow-[0_12px_28px_-14px_rgb(17_24_39/0.35)]">
                  <p className="text-[12.5px] font-semibold">{t("hero.loop.widgetTitle")}</p>
                  <p className="mt-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-[12px] leading-snug">{t("story.stage.report")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded bg-wash px-1.5 py-0.5"><Camera className="size-3" />{t("story.stage.screenshot")}</span>
                    <span className="rounded bg-wash px-1.5 py-0.5 font-mono">v2.14.0</span>
                    <span className="ml-auto rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">{t("hero.loop.widgetSend")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </li>

        {/* 2 · on the team's board */}
        <li className="relative grid grid-cols-[25px_minmax(0,1fr)] gap-x-4">
          <Leg n={2} />
          <Stop n={2} />
          <div>
            <p className="oz-hl-board mb-2 text-[13px] font-medium text-muted-foreground">{where[1]}</p>
            <div className="oz-hl-board look-host oz-scope grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3.5 gap-y-2.5 rounded-xl border bg-surface p-3.5 text-foreground shadow-[0_24px_60px_-32px_rgb(13_12_20/0.45)] sm:grid-cols-[auto_minmax(0,1fr)_auto]">
              <span data-num className="text-[20px] leading-none font-extrabold tracking-tight">#128</span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] leading-tight font-semibold">{t("story.stage.report")}</span>
                <span className="mt-1 block text-[12px] text-muted-foreground">{app} · v2.14.0 · Chrome 141</span>
              </span>
              <span className="col-span-2 grid justify-items-start gap-2 sm:col-span-1 sm:justify-items-end">
                {/* status: Prijaté, then Opravené */}
                <span className="grid text-[12.5px] font-semibold whitespace-nowrap">
                  <span className="oz-hl-was inline-flex items-center gap-1.5 [grid-area:1/1]"><StatusMark kind="bug" status="new" />{stops[0]}</span>
                  <span className="oz-hl-now inline-flex items-center gap-1.5 [grid-area:1/1]"><StatusMark kind="bug" status="fixed" />{stops[3]} · 2.15</span>
                </span>
                <span className="flex items-center">
                  {BUG.map((s, i) => (
                    <span key={s} className="flex items-center">
                      {i > 0 && <span className={cn("h-0.5 w-3.5", i < REACHED ? "oz-hl-bar bg-st-done" : "bg-line-strong")} style={{ animationDelay: `${1500 + i * 180}ms` }} />}
                      <span className={cn("size-2 rounded-full", i < REACHED ? "oz-hl-dot bg-st-done" : "border-[1.5px] border-line-strong")} style={{ animationDelay: `${1500 + i * 180}ms` }} />
                    </span>
                  ))}
                </span>
              </span>
            </div>
          </div>
        </li>

        {/* 3 · the answer, in the author's inbox */}
        <li className="grid grid-cols-[25px_minmax(0,1fr)] gap-x-4">
          <Stop n={3} />
          <div className="oz-hl-mail">
            <p className="mb-2 text-[13px] font-medium text-muted-foreground">{where[2]}</p>
            <div className="look-host oz-scope rounded-xl border bg-surface p-3.5 text-foreground shadow-[0_24px_60px_-32px_rgb(13_12_20/0.45)]">
              <div className="flex items-center gap-2.5">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{app.charAt(0)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{t("hero.loop.mailSubject")}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{app} · {t("story.stage.report")}</span>
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-snug">{t("hero.loop.mailBody")}</p>
              <div className="mt-2.5 flex gap-1.5 text-[11.5px] font-semibold">
                <span className="rounded-md bg-primary px-2.5 py-1 text-primary-foreground">{t("hero.loop.yes")}</span>
                <span className="rounded-md border border-line-strong px-2.5 py-1">{t("hero.loop.no")}</span>
              </div>
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

/** The route from one stop to the next: from this stop's centre down to the next one (gap 20px + 14px). */
function Leg({ n }: { n: 1 | 2 }) {
  return (
    <span aria-hidden className="absolute top-[16px] -bottom-[36px] left-[11px] w-[3px] overflow-hidden rounded-full bg-line">
      <span className={cn("absolute inset-0 origin-top rounded-full bg-primary", `oz-hl-leg${n}`)} />
    </span>
  );
}

function Stop({ n }: { n: 1 | 2 | 3 }) {
  return (
    <span className={cn("relative z-10 mt-[3px] grid size-[25px] place-items-center rounded-full border-[3px] border-background bg-primary text-[11px] font-bold text-primary-foreground", `oz-hl-stop${n}`)}>
      {n}
    </span>
  );
}
