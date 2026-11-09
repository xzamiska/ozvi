"use client";

import { Check, ChevronUp } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { castVote } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type VoteMode = "simple" | "importance";
const WEIGHTS = [1, 2, 3] as const;

/**
 * Upvote. Voted = filled in the host accent; signed-out visitors get a link to sign in instead.
 * Importance mode: the click opens a small picker (nice to have / important / critical = weight 1–3).
 * With a vote budget the picker (or, in simple mode, a refused click) says how many votes are left.
 * The count is the weighted sum; the plain number of people is in the label and tooltip.
 */
export function VoteButton({ slug, itemId, count, voters, voted, weight, login, size = "md", mode = "simple", left = null }: {
  slug: string; itemId: string; count: number; voted: boolean;
  /** Plain number of people who voted (count is the weighted sum). */
  voters?: number;
  /** The viewer's vote weight (1–3); falls back to `voted`. */
  weight?: number;
  /** null = signed in; string = where to sign in; false = no way to sign in here. */
  login: string | null | false;
  size?: "md" | "lg";
  mode?: VoteMode;
  /** Remaining vote points for the viewer; null = no budget. */
  left?: number | null;
}) {
  const mine = weight ?? (voted ? 1 : 0);
  const [state, setState] = useOptimistic({ count, weight: mine, voters: voters ?? null });
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useTranslations("forms.vote");
  const isVoted = state.weight > 0;
  const importance = mode === "importance";
  // Points this vote could use: what is left plus what it already holds.
  const room = left === null ? Infinity : left + mine;

  const cls = cn(
    "relative z-10 grid shrink-0 place-items-center content-center rounded-lg border bg-surface font-heading font-bold leading-none tabular-nums transition-[background-color,border-color,color,transform] duration-200 ease-out-expo",
    size === "lg" ? "h-[68px] w-16 gap-1 text-xl" : "h-14 w-12 gap-0.5 text-[15px]",
    isVoted
      ? "border-brand-line bg-brand-soft text-brand-text hover:border-brand"
      : "border-line-strong text-foreground hover:border-brand hover:text-brand-text",
    login === null && "active:scale-95",
  );
  const people = state.voters ?? null;
  const tip = importance && people !== null ? t("weighted", { points: state.count, people }) : t("count", { count: state.count });
  const inner = (
    <>
      <ChevronUp className={size === "lg" ? "size-5" : "size-4"} strokeWidth={2.5} />
      <span data-num>{state.count}</span>
      {importance && isVoted && (
        // How important it is to me: 1–3 filled ticks (shape, not just colour).
        <span aria-hidden className="absolute bottom-1 flex gap-0.5">
          {WEIGHTS.map((w) => <span key={w} className={cn("h-[3px] w-1.5 rounded-full", w <= state.weight ? "bg-brand" : "bg-line-strong")} />)}
        </span>
      )}
    </>
  );

  if (login !== null) {
    const label = `${tip}. ${t("signIn")}.`;
    return login
      ? <a className={cls} href={login} aria-label={label} title={t("signIn")}>{inner}</a>
      : <span className={cls} aria-label={label} title={t("signedInOnly")}>{inner}</span>;
  }

  function vote(w: number) {
    if (pending) return;
    setError(null);
    const prev = state.weight;
    start(async () => {
      setState({ count: Math.max(0, state.count - prev + w), weight: w,
        voters: state.voters === null ? null : state.voters + (prev === 0 && w > 0 ? 1 : prev > 0 && w === 0 ? -1 : 0) });
      const r = await castVote(slug, itemId, w);
      if (r.error) { setError(r.error); setOpen(true); } else if (importance) setOpen(false);
    });
  }

  const exhausted = !isVoted && room < 1;
  const label = importance
    ? `${isVoted ? t("change") : t("vote")}, ${tip}`
    : `${isVoted ? t("unvote") : t("vote")}, ${tip}`;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      {importance ? (
        <PopoverTrigger asChild>
          <button type="button" className={cls} aria-pressed={isVoted} aria-disabled={pending || undefined} aria-label={label} title={tip}>{inner}</button>
        </PopoverTrigger>
      ) : (
        <PopoverAnchor asChild>
          {/* aria-disabled, not disabled: a disabled button drops keyboard focus to the page mid-vote (WCAG 2.4.3). */}
          <button type="button" className={cls} aria-pressed={isVoted} aria-disabled={pending || undefined} aria-label={label}
            onClick={() => {
              if (pending) return;
              // Out of votes: explain instead of failing silently. The popover closes on outside click.
              if (exhausted) { setError(null); setOpen(true); return; }
              vote(isVoted ? 0 : 1);
            }}>
            {inner}
          </button>
        </PopoverAnchor>
      )}
      <PopoverContent align="start" className="w-64 p-1.5">
        {importance && (
          <>
            <p className="px-2.5 pt-1.5 pb-1 text-[13px] font-semibold">{t("howImportant")}</p>
            <div role="group" aria-label={t("howImportant")} className="grid">
              {WEIGHTS.map((w) => {
                const current = state.weight === w;
                const tooMuch = !current && w > room;
                return (
                  <button key={w} type="button" disabled={tooMuch} aria-disabled={pending || undefined} aria-pressed={current}
                    onClick={() => vote(w)}
                    className={cn("flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-wash disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent",
                      current && "bg-brand-soft text-brand-text hover:bg-brand-soft")}>
                    <span aria-hidden className="flex w-5 shrink-0 gap-0.5">
                      {WEIGHTS.map((x) => <span key={x} className={cn("h-2.5 w-1 rounded-full", x <= w ? "bg-current" : "bg-line-strong")} />)}
                    </span>
                    <span className="min-w-0 flex-1 font-medium">{t(`level${w}`)}</span>
                    {left !== null && <span className="text-[12.5px] text-muted-foreground tabular-nums">{t("cost", { n: w })}</span>}
                    {current && <Check className="size-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {isVoted && (
              <button type="button" aria-disabled={pending || undefined} onClick={() => vote(0)}
                className="mt-0.5 w-full rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium text-muted-foreground hover:bg-wash hover:text-foreground">
                {t("remove")}
              </button>
            )}
          </>
        )}
        {(left !== null || error) && (
          <div className={cn("px-2.5 py-2 text-[13px] leading-snug", importance && "mt-1 border-t")}>
            {error ? <p role="alert" className="text-destructive">{error}</p>
              : exhausted ? <p>{t("exhausted")}</p>
              : <p className="text-muted-foreground">{t("left", { n: Math.max(0, room - state.weight) })}</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
