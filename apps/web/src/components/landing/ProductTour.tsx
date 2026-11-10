"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MiniBoard, type View } from "./Playground";
import { TeamDesk } from "./TeamDesk";

/**
 * The product, part by part: what each part of a board is for (left) and the part itself (right),
 * in a host's brand. The users' parts are the working sample board (vote, add an idea, comment);
 * the team's part is the bug queue with one report open. The board's own tabs and this list stay
 * in sync.
 */
type Part = View | "team";
const PARTS: Part[] = ["ideas", "roadmap", "news", "bugs", "team"];

export function ProductTour() {
  const t = useTranslations("landing");
  const [part, setPart] = useState<Part>("ideas");

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

      <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-${part}`} className="min-w-0 rounded-2xl border bg-wash p-2 sm:p-4">
        <div className="look-host oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground shadow-[0_20px_50px_-30px_rgb(13_12_20/0.35)]">
          {part === "team" ? <TeamDesk /> : <MiniBoard name={t("product.app")} compact={false} view={part} onView={setPart} />}
        </div>
      </div>
    </div>
  );
}
