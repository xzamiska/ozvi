import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { ROUTE, routeText, stopIndex, toneOf, type Kind, type Tone } from "@/lib/route";

/**
 * The route vocabulary. Every stage has its own shape (hollow, dotted, half, filled, seal,
 * slashed), so state never depends on colour alone and survives any host palette.
 */

export const TONE_TEXT: Record<Tone, string> = {
  wait: "text-st-wait", ack: "text-st-ack", work: "text-st-work", done: "text-st-done", off: "text-st-off",
};
const TONE_RING: Record<Tone, string> = {
  wait: "ring-st-wait/25", ack: "ring-st-ack/25", work: "ring-st-work/25", done: "ring-st-done/25", off: "",
};
const TONE_BG: Record<Tone, string> = {
  wait: "bg-st-wait", ack: "bg-st-ack", work: "bg-st-work", done: "bg-st-done", off: "bg-st-off",
};

export function StatusMark({ kind, status, className }: { kind: Kind; status: string; className?: string }) {
  const tone = toneOf(kind, status);
  const i = stopIndex(kind, status);
  const last = ROUTE[kind].length - 1;
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 shrink-0", TONE_TEXT[tone], className)}>
      {tone === "off" ? (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M4 12 12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : i <= 0 ? (
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.6 1.9" />
      ) : status === "in_progress" ? (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
        </>
      ) : tone === "ack" ? (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="8" r="2.4" fill="currentColor" />
        </>
      ) : i === last && kind === "bug" ? (
        // Verified: a seal, not a circle, so it never reads as "Opravené" at 16px.
        <>
          <path fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="0.8" d="M8.00 0.40L10.07 3.01L13.37 2.63L12.99 5.93L15.60 8.00L12.99 10.07L13.37 13.37L10.07 12.99L8.00 15.60L5.93 12.99L2.63 13.37L3.01 10.07L0.40 8.00L3.01 5.93L2.63 2.63L5.93 3.01Z" />
          <path d="m5.1 8 1.9 1.9 3.9-3.9" fill="none" stroke="var(--oz-surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5.4 8.1 1.8 1.8 3.5-3.6" fill="none" stroke="var(--oz-surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/**
 * Mark + stop name (+ version for a fixed bug). `sub` is the item's custom sub-status inside the stage
 * ("Rozpracované · V testovaní"); `stacked` puts it on a second line (list rows' status column).
 */
export function StatusTag({ kind, status, version, sub, stacked, className }: {
  kind: Kind; status: string; version?: string | null; sub?: string | null; stacked?: boolean; className?: string;
}) {
  const tone = toneOf(kind, status);
  const t = useTranslations("route");
  const label = (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap", sub && !stacked && "min-w-0", tone === "off" ? "text-muted-foreground" : "text-foreground", !stacked && className)}>
      <StatusMark kind={kind} status={status} />
      {routeText(t, "label", status)}
      {version && (status === "fixed" || status === "verified") && <span className="font-medium text-muted-foreground" data-num>v{version}</span>}
      {sub && !stacked && <span className="min-w-0 truncate font-medium text-muted-foreground"><span aria-hidden>· </span>{sub}</span>}
    </span>
  );
  if (!stacked || !sub) return stacked ? <span className={className}>{label}</span> : label;
  return (
    <span className={cn("grid min-w-0 gap-0.5", className)}>
      {label}
      <span className="truncate pl-[22px] text-[12.5px] font-medium text-muted-foreground" title={sub}>{sub}</span>
    </span>
  );
}

/** Compact stop-rail for list rows: reached stops filled in the current tone, the current one ringed. */

export function RouteRail({ kind, status, className }: { kind: Kind; status: string; className?: string }) {
  const stops = ROUTE[kind];
  const tone = toneOf(kind, status);
  const at = stopIndex(kind, status);
  const off = tone === "off";
  const t = useTranslations("route");
  return (
    <span
      role="img"
      aria-label={`${routeText(t, "label", status)}, ${off ? t("offRoute") : t("stopOf", { n: at + 1, of: stops.length })}`}
      className={cn("inline-flex items-center", off && "opacity-60", className)}
    >
      {stops.map((s, i) => {
        const reached = !off && i <= at;
        const current = !off && i === at;
        return (
          <span key={s} className="inline-flex items-center">
            {i > 0 && <span className={cn("h-0.5 w-3 sm:w-4", reached ? TONE_BG[tone] : "bg-line-strong", off && "bg-line")} />}
            <span
              title={routeText(t, "label", s)}
              className={cn(
                "block rounded-full",
                current ? cn("size-2.5 ring-[3px]", TONE_BG[tone], TONE_RING[tone])
                  : reached ? cn("size-2", TONE_BG[tone]) : "size-2 border-[1.5px] border-line-strong bg-surface",
              )}
            />
          </span>
        );
      })}
    </span>
  );
}

/** Vertical list of the stops with what each means: the route explained, optionally with the current stop. */
export function RouteLegend({ kind, current, className, on = "canvas" }: {
  kind: Kind; current?: string; className?: string; on?: "canvas" | "surface";
}) {
  const stops = ROUTE[kind];
  const at = current ? stopIndex(kind, current) : -1;
  const t = useTranslations("route");
  return (
    <ol className={cn("relative grid gap-4", className)}>
      <span aria-hidden className="absolute top-2 bottom-2 left-[7.5px] w-px bg-line-strong" />
      {stops.map((s, i) => (
        <li key={s} className={cn("relative grid grid-cols-[16px_1fr] gap-3", at >= 0 && i > at && "opacity-60")}>
          <span className={cn("relative z-10 grid h-4 place-items-center rounded-full", on === "canvas" ? "bg-background" : "bg-surface")}><StatusMark kind={kind} status={s} /></span>
          <div className="-mt-0.5">
            <div className={cn("text-[14px] font-semibold", i === at && "text-brand-text")}>{routeText(t, "label", s)}{i === at && <span className="ml-2 text-xs font-medium text-muted-foreground">{t("now")}</span>}</div>
            <p className="text-[13px] leading-snug text-muted-foreground">{routeText(t, "hint", s)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
