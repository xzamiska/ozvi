import { ExternalLink, GitBranch, GitPullRequest, Megaphone, MessageSquare, Tag } from "lucide-react";
import type { ProofSnapshot } from "@/lib/proof";
import Link from "next/link";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { useTranslations } from "next-intl";
import { ROUTE, routeText, stopIndex, type Kind } from "@/lib/route";
import { cn } from "@/lib/utils";
import { StatusMark } from "./route";

/**
 * The detail page's route: every dated stop the report passed (status changes, team replies,
 * linked GitHub issues, the release note), then the next stop as a dashed promise.
 */

export type JourneyEvent =
  | { type: "status"; at: Date; status: string; version?: string | null; who?: string | null; sub?: string | null; proof?: ProofSnapshot | null }
  /** A public team comment; the route links to it rather than quoting it (the thread shows it in full). */
  | { type: "reply"; at: Date; who: string | null; commentId: string }
  | { type: "link"; at: Date; ref: string; url: string; state: string }
  | { type: "release"; at: Date; title: string; href: string };

export function Journey({ kind, status, events, className, locale = "sk" }: {
  kind: Kind; status: string; events: JourneyEvent[]; className?: string; locale?: Locale;
}) {
  const t = useTranslations("board.journey");
  const tr = useTranslations("route");
  const dt = new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "numeric", year: "numeric" });
  const tm = new Intl.DateTimeFormat(LOCALE_TAG[locale], { hour: "2-digit", minute: "2-digit" });
  const sorted = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const at = stopIndex(kind, status);
  const next = at >= 0 && at < ROUTE[kind].length - 1 ? ROUTE[kind][at + 1]! : null;

  return (
    <ol className={cn("grid", className)}>
      {sorted.map((e, i) => (
        <li key={i} className="relative grid grid-cols-[20px_1fr] gap-3 pb-5 last:pb-0">
          {(i < sorted.length - 1 || next) && (
            <span aria-hidden className={cn("absolute top-5 bottom-0 left-[9.5px] w-0 border-l",
              i === sorted.length - 1 ? "border-dashed border-line-strong" : "border-solid border-line-strong")} />
          )}
          <span className="relative z-10 grid size-5 place-items-center rounded-full bg-surface">
            {e.type === "status" ? <StatusMark kind={kind} status={e.status} className="size-[18px]" />
              : e.type === "reply" ? <MessageSquare className="size-3.5 text-muted-foreground" />
              : e.type === "link" ? <GitBranch className="size-3.5 text-muted-foreground" />
              : <Megaphone className="size-3.5 text-st-done" />}
          </span>
          <div className="min-w-0 pt-px">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[14px] font-semibold">
                {e.type === "status" ? <>{routeText(tr, "label", e.status)}{e.version && (e.status === "fixed" || e.status === "verified") ? <span data-num>{t("inVersion", { v: e.version })}</span> : null}{e.sub ? <span className="font-medium text-muted-foreground"> · {e.sub}</span> : null}</>
                  : e.type === "reply" ? <a href={`#c-${e.commentId}`} className="hover:underline">{t("teamReply")}</a>
                  : e.type === "link" ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">GitHub {e.ref}</a>
                  : t("released")}
              </span>
              <time dateTime={e.at.toISOString()} title={`${dt.format(e.at)} ${tm.format(e.at)}`} className="text-[12.5px] text-muted-foreground">{dt.format(e.at)}</time>
            </div>
            {(e.type === "status" || e.type === "reply") && e.who && <p className="truncate text-[13px] text-muted-foreground">{e.who}</p>}
            {e.type === "status" && e.proof && <ProofList proof={e.proof} />}
            {e.type === "link" && <p className="text-[13px] text-muted-foreground">{e.state === "closed" ? t("issueClosed") : t("issueOpen")}</p>}
            {e.type === "release" && <Link href={e.href} className="text-[13px] text-muted-foreground hover:text-foreground">{e.title}</Link>}
          </div>
        </li>
      ))}
      {next && (
        <li className="relative grid grid-cols-[20px_1fr] gap-3">
          <span className="relative z-10 grid size-5 place-items-center rounded-full bg-surface opacity-60">
            <span className="size-2.5 rounded-full border-[1.5px] border-line-strong" />
          </span>
          <div className="min-w-0 pt-px">
            <span className="text-[14px] font-semibold text-muted-foreground">{t("next")} {routeText(tr, "label", next)}</span>
            <p className="text-[13px] leading-snug text-muted-foreground">{routeText(tr, "next", next)}</p>
          </div>
        </li>
      )}
    </ol>
  );
}

/** Evidence under the "fixed"/"shipped" stop: try it (preview), what changed (PRs), where it shipped (release). */
function ProofList({ proof }: { proof: ProofSnapshot }) {
  const t = useTranslations("board.journey");
  const link = "flex min-h-6 w-fit max-w-full min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground hover:underline";
  return (
    <ul aria-label={t("proof")} className="mt-1.5 grid gap-0.5">
      {proof.preview && (
        <li><a href={proof.preview} target="_blank" rel="noreferrer" className={cn(link, "font-medium text-foreground")}>
          <ExternalLink aria-hidden className="size-3.5 shrink-0" />{t("proofPreview")}</a></li>
      )}
      {proof.prs.map((p) => (
        <li key={p.url}><a href={p.url} target="_blank" rel="noreferrer" className={link}>
          <GitPullRequest aria-hidden className="size-3.5 shrink-0" /><span className="min-w-0 truncate">{p.title || p.ref || p.url}</span>
          {p.ref && p.title && <span className="shrink-0 max-sm:hidden" data-num>{p.ref}</span>}</a></li>
      ))}
      {proof.release && (
        <li>{proof.release.url
          ? <a href={proof.release.url} target="_blank" rel="noreferrer" className={link}><Tag aria-hidden className="size-3.5 shrink-0" /><span data-num>{t("proofRelease", { v: proof.release.tag })}</span></a>
          : <span className={link}><Tag aria-hidden className="size-3.5 shrink-0" /><span data-num>{t("proofRelease", { v: proof.release.tag })}</span></span>}</li>
      )}
    </ul>
  );
}
