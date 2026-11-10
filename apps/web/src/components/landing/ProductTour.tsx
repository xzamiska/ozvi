"use client";

import { parseTheme, toCss } from "@ozvi/theme";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ACCENTS, BASES, MiniBoard, type View } from "./SampleBoard";
import { TeamDesk } from "./TeamDesk";

/**
 * The product, part by part: what each part of a board is for (left) and the part itself (right),
 * in a host's brand. The users' parts are the working sample board (vote, add an idea, comment);
 * the team's part is the bug queue with one report open. The board's own tabs and this list stay
 * in sync. A small bar re-themes the board through the same toCss() a real board uses, so the
 * landing shows the board once and "it looks like your app" on the same board.
 */
type Part = View | "team";
const PARTS: Part[] = ["ideas", "roadmap", "news", "bugs", "team"];
const RADII = [0, 8, 16] as const;

export function ProductTour() {
  const t = useTranslations("landing");
  const [part, setPart] = useState<Part>("ideas");
  const [look, setLook] = useState({ accent: ACCENTS[1]!, dark: false, radius: 8 as (typeof RADII)[number] });
  const css = useMemo(() => toCss(parseTheme({
    name: t("product.app"), colors: { accent: look.accent, ...(look.dark ? BASES.dark : BASES.neutral) },
    font: { body: "Geist", source: "google" }, radius: look.radius,
  }), ".tour-board"), [look, t]);
  const seg = (on: boolean) => cn("h-7 rounded-md px-2.5 text-[12.5px] font-medium", on ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground");

  const keys = (e: React.KeyboardEvent) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = PARTS[(PARTS.indexOf(part) + step + PARTS.length) % PARTS.length]!;
    setPart(next);
    document.getElementById(`tour-${next}`)?.focus();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-10">
      <div role="tablist" aria-orientation="vertical" aria-label={t("product.tablist")} onKeyDown={keys}
        className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:content-start lg:gap-1 lg:overflow-visible lg:px-0">
        {PARTS.map((p) => {
          const on = part === p;
          return (
            <button key={p} id={`tour-${p}`} type="button" role="tab" aria-selected={on} aria-controls="tour-panel" tabIndex={on ? 0 : -1} onClick={() => setPart(p)}
              className={cn("grid shrink-0 snap-start content-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors max-lg:w-[250px]",
                on ? "border-line-strong bg-surface shadow-[0_12px_32px_-24px_rgb(13_12_20/0.5)]" : "border-transparent hover:bg-wash")}>
              <span className="flex items-center gap-2 text-[15px] font-semibold">
                <span aria-hidden className={cn("size-2 rounded-full transition-colors", on ? "bg-primary" : "bg-line-strong")} />
                {t(`product.parts.${p}.title`)}
                {p === "team" && <span className="ml-auto rounded-full border px-2 py-px text-[11px] font-medium text-muted-foreground">{t("product.teamOnly")}</span>}
              </span>
              <span className={cn("pl-4 text-[13.5px] leading-relaxed text-muted-foreground")}>{t(`product.parts.${p}.text`)}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 rounded-2xl border bg-wash p-2 sm:p-4">
        <style>{css}</style>
        <div role="group" aria-label={t("product.look.label")} className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-[12.5px]">
          <span className="font-medium text-muted-foreground">{t("product.look.label")}</span>
          <span className="flex items-center gap-1.5">
            {ACCENTS.map((a) => (
              <button key={a} type="button" onClick={() => setLook((l) => ({ ...l, accent: a }))} aria-label={t("product.look.accent", { color: a })} aria-pressed={look.accent === a}
                className={cn("grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-wash", look.accent === a && "ring-2 ring-foreground")} style={{ background: a }}>
                {look.accent === a && <Check className="size-3 text-white" strokeWidth={3} />}
              </button>
            ))}
          </span>
          <span className="flex rounded-lg border bg-surface p-0.5">
            <button type="button" aria-pressed={!look.dark} onClick={() => setLook((l) => ({ ...l, dark: false }))} className={seg(!look.dark)}>{t("product.look.light")}</button>
            <button type="button" aria-pressed={look.dark} onClick={() => setLook((l) => ({ ...l, dark: true }))} className={seg(look.dark)}>{t("product.look.dark")}</button>
          </span>
          <span className="flex rounded-lg border bg-surface p-0.5" aria-label={t("product.look.radius")} role="group">
            {RADII.map((r) => (
              <button key={r} type="button" aria-pressed={look.radius === r} onClick={() => setLook((l) => ({ ...l, radius: r }))} className={seg(look.radius === r)} title={`${t("product.look.radius")} ${r} px`}>
                <span aria-hidden className="block size-3 border-[1.5px] border-current" style={{ borderRadius: r / 3 }} /><span className="sr-only">{r} px</span>
              </button>
            ))}
          </span>
        </div>
        <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-${part}`} className="tour-board oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground shadow-[0_20px_50px_-30px_rgb(13_12_20/0.35)] transition-colors">
          {part === "team" ? <TeamDesk /> : <MiniBoard name={t("product.app")} compact={false} view={part} onView={setPart} />}
        </div>
      </div>
    </div>
  );
}
