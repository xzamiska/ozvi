import { ExternalLink, Lock, MapPin, MousePointerClick, SendHorizontal, ServerCrash, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { LINK_KINDS, timeline, type Capture, type TimelineEntry } from "@/lib/bug-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Team-only bug evidence captured by the widget: the steps before the report (next to the screenshot),
 * the session links to Sentry / PostHog / LogRocket. The network log is NetworkLog (client: copy, expand).
 */

export function TeamOnly() {
  const t = useTranslations("board.item.capture");
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-st-ack/12 px-1.5 py-px text-[11.5px] font-semibold text-st-ack">
      <Lock className="size-3" aria-hidden />{t("teamOnly")}
    </span>
  );
}

/** −m:ss before the report. */
function before(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `−${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const path = (u: string) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };

export function CaptureTimeline({ capture, locale, className }: { capture: Capture; locale: Locale; className?: string }) {
  const t = useTranslations("board.item.capture");
  const entries = timeline(capture);
  if (!entries.length) return null;
  const end = capture.sentAt ?? entries.at(-1)!.at;
  const clock = new Intl.DateTimeFormat(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const role = (r?: string) => (r === "link" ? t("role.link") : !r || r === "button" || r === "submit" ? t("role.button") : t("role.other"));

  const row = (e: TimelineEntry): { icon: React.ReactNode; main: React.ReactNode; sub: string; bad?: boolean } => {
    if (e.type === "error") return { icon: <TriangleAlert className="size-3.5" />, main: <span className="line-clamp-3 font-mono text-[12px] [overflow-wrap:anywhere]">{e.text}</span>, sub: t("kind.error"), bad: true };
    if (e.type === "request") return {
      icon: <ServerCrash className="size-3.5" />, bad: true,
      main: <span className="font-mono text-[12px] [overflow-wrap:anywhere]"><b className="font-semibold">{e.method}</b> {path(e.url)}</span>,
      sub: `${e.status || t("networkError")} · ${t("kind.request")}`,
    };
    if (e.kind === "nav") return { icon: <MapPin className="size-3.5" />, main: <span className="font-mono text-[12px] [overflow-wrap:anywhere]">{e.label}</span>, sub: t("kind.nav") };
    if (e.kind === "submit") return { icon: <SendHorizontal className="size-3.5" />, main: e.label || t("unnamedForm"), sub: t("kind.submit") };
    return { icon: <MousePointerClick className="size-3.5" />, main: e.label, sub: role(e.role) };
  };

  return (
    <section aria-labelledby="steps-h" className={cn("min-w-0 rounded-xl border bg-surface", className)}>
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 id="steps-h" className="text-[14px] font-semibold">{t("steps")}</h2>
        <TeamOnly />
      </header>
      {/* Scrollable region: focusable so keyboard users can scroll it. */}
      <ol tabIndex={0} aria-labelledby="steps-h" className="max-h-[460px] overflow-y-auto px-4 py-3.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        {entries.map((e, i) => {
          const r = row(e);
          const at = new Date(e.at);
          return (
            <li key={i} className="relative grid grid-cols-[20px_minmax(0,1fr)_auto] gap-x-2.5 pb-3.5 last:pb-0">
              {i < entries.length - 1 && <span aria-hidden className="absolute top-5 bottom-0 left-[9.5px] border-l border-line-strong" />}
              <span className={cn("relative z-10 grid size-5 place-items-center rounded-full bg-surface", r.bad ? "text-destructive" : "text-muted-foreground")} aria-hidden>{r.icon}</span>
              <div className="min-w-0 pt-px">
                <div className={cn("text-[13.5px] leading-snug font-medium", r.bad && "text-destructive")}>{r.main}</div>
                <p className="text-[12px] text-muted-foreground">{r.sub}</p>
              </div>
              <time dateTime={at.toISOString()} title={`${clock.format(at)} · ${t("before", { time: before(end - e.at) })}`}
                className="pt-0.5 text-[12px] text-muted-foreground tabular-nums">{before(end - e.at)}</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CaptureLinks({ links }: { links: Capture["links"] }) {
  const t = useTranslations("board.item.capture");
  const list = LINK_KINDS.filter((k) => links?.[k]);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-[13px] font-semibold text-muted-foreground">{t("sessions")}</span>
      {list.map((k) => (
        <Button key={k} asChild variant="outline" size="sm">
          <a href={links![k]} target="_blank" rel="noopener noreferrer">{t(`link.${k}`)}<ExternalLink className="size-3.5" aria-hidden /></a>
        </Button>
      ))}
    </div>
  );
}
