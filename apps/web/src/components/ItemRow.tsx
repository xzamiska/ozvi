import { Hourglass, MessageSquare, Timer, Users } from "lucide-react";
import Link from "next/link";
import { StatusTag } from "@/components/ozvi/route";
import { TagChip } from "@/components/ozvi/tags";
import { TagPicker } from "@/components/ozvi/TagPicker";
import type { Tag } from "@/lib/tag-rules";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { useTranslations } from "next-intl";
import { ago } from "@/lib/format";
import { markdownExcerpt } from "@/lib/markdown";
import { VoteButton, type VoteMode } from "./VoteButton";

export interface Row {
  id: string; number: number; kind: "bug" | "idea"; title: string; body: string; status: string;
  voteCount: number; comments: number; fixedInVersion: string | null; createdAt: Date; authorName: string | null;
  /** Waiting for the team's approval (shown to its author and in the team's queue). */
  pending?: boolean;
  /** Filed by Ozvi from customer feedback: the author line says so instead of a person. */
  system?: boolean;
  /** Plain number of voters (voteCount is the weighted sum). */
  voters?: number;
  /** Team only: MRR in cents of the people who want it (see lib/traits.ts). */
  mrr?: number;
  /** Team only: people affected by a bug (reporter + merged duplicates). */
  affected?: number;
  /** Team only: author id (for the per-currency demand label). */
  authorId?: string | null;
  /** Team only: comments on it waiting for approval (suspicious links). */
  pendingComments?: number;
  /** Team only: exact MRR per currency, formatted ("1 240 € + 2 900 Kč"); set by the page from demandFor. */
  mrrLabel?: string;
  /** Custom sub-status (id from the list query; the page resolves `subLabel` in the viewer's language). */
  subStatusId?: string | null;
  subLabel?: string;
  /** Tags this viewer may see (the page resolves them with tagsByItem: team-only tags only for the team). */
  tags?: Tag[];
  /** Team queue "Bez odpovede": since when somebody has been waiting for the team. */
  waitingSince?: Date | null;
}

/** Team: assign tags from the list (the dashed "+" at the end of the tag line). */
export interface RowTagging { all: Tag[]; admin: boolean }

/** How this board votes and what the viewer has left; see VoteButton. */
export interface VoteSetup { mode: VoteMode; left: number | null }

/**
 * One report as a tracking line: vote (ideas) or number (bugs), title, one-line excerpt, meta,
 * and its status, shown once: on the right on wide screens, first in the meta line on phones.
 */
export function ItemRow({ slug, row, voted, weight, vote, login, locale = "sk", tagHref, tagging }: {
  slug: string; row: Row; voted: boolean; login: string | null | false; locale?: Locale;
  /** Makes tag chips filter links (list pages). */
  tagHref?: (tag: Tag) => string;
  tagging?: RowTagging;
  /** The viewer's vote weight on this idea (importance voting). */
  weight?: number;
  vote?: VoteSetup;
}) {
  const t = useTranslations("board");
  const idea = row.kind === "idea";
  return (
    <li className="group relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 px-4 py-4 transition-colors hover:bg-wash sm:px-5 md:grid-cols-[auto_minmax(0,1fr)_auto]">
      {idea && row.pending
        // Queued ideas take no votes yet: a quiet placeholder of the vote button's size.
        ? <span aria-hidden className="grid h-14 w-12 shrink-0 place-items-center rounded-lg border border-dashed border-line-strong text-st-ack"><Hourglass className="size-4" /></span>
        : idea
        ? <VoteButton slug={slug} itemId={row.id} count={row.voteCount} voters={row.voters} voted={voted} weight={weight} login={login}
            mode={vote?.mode} left={vote?.left ?? null} />
        : <span className="min-w-8 pt-0.5 text-right font-heading sm:w-12 text-[16px] font-bold text-foreground" data-num>#{row.number}</span>}
      <div className="min-w-0 self-center">
        {/* h2: rows sit right under the page's h1 (WCAG 1.3.1 heading order). */}
        <h2 className="text-[16.5px] leading-snug font-semibold">
          {idea && <span className="mr-2 font-heading text-[15px] font-bold text-muted-foreground tabular-nums">#{row.number}</span>}
          <Link href={`/${slug}/i/${row.number}`} className="oz-stretch outline-none after:rounded-none focus-visible:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
            {row.title}
          </Link>
        </h2>
        {row.body && <p className="mt-0.5 line-clamp-1 text-[14.5px] text-muted-foreground">{markdownExcerpt(row.body)}</p>}
        <div className="mt-1.5 flex min-w-0 items-center gap-x-3 overflow-hidden text-[13px] whitespace-nowrap text-muted-foreground">
          <StatusTag kind={row.kind} status={row.status} version={row.fixedInVersion} sub={row.subLabel} className="shrink md:hidden" />
          {row.waitingSince && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-st-ack" title={t("waitingSince", { date: row.waitingSince.toLocaleDateString(LOCALE_TAG[locale]) })}>
              <Timer className="size-3.5" aria-hidden />{t("waitingDays", { n: Math.max(0, Math.floor((Date.now() - row.waitingSince.getTime()) / 86_400_000)) })}
            </span>
          )}
          {row.pending && <span className="inline-flex shrink-0 items-center gap-1 font-medium text-st-ack"><Hourglass className="size-3.5" aria-hidden />{t("pendingBadge")}</span>}
          {!!row.pendingComments && <span className="inline-flex shrink-0 items-center gap-1 font-medium text-st-ack"><Hourglass className="size-3.5" aria-hidden />{t("pendingComments", { n: row.pendingComments })}</span>}
          <span className="min-w-0 truncate max-sm:hidden">{row.system ? t("fromCustomers") : row.authorName ?? t("user")}</span>
          <time className="shrink-0" dateTime={row.createdAt.toISOString()}>{ago(row.createdAt, locale)}</time>
          {row.comments > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1" aria-label={t("comments", { n: row.comments })}>
              <MessageSquare className="size-3.5" />{row.comments}
            </span>
          )}
          {/* Team-only columns: present on the row only when the server added them for a team viewer. */}
          {!!row.affected && row.affected > 1 && (
            <span className="inline-flex shrink-0 items-center gap-1" title={t("affected", { n: row.affected })} aria-label={t("affected", { n: row.affected })}>
              <Users className="size-3.5" />{row.affected}
            </span>
          )}
          {!!row.mrrLabel && (
            <span className="min-w-0 truncate font-medium text-foreground tabular-nums" title={`${t("mrrHint")}: ${row.mrrLabel}`}>
              {t("mrrShort", { mrr: row.mrrLabel })}
            </span>
          )}
        </div>
        {((row.tags?.length ?? 0) > 0 || tagging) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {row.tags?.map((tag) => <TagChip key={tag.id} tag={tag} href={tagHref?.(tag)} />)}
            {tagging && !row.pending && (
              <TagPicker key={(row.tags ?? []).map((x) => x.id).join()} slug={slug} itemId={row.id} all={tagging.all}
                selected={(row.tags ?? []).map((x) => x.id)} admin={tagging.admin} compact />
            )}
          </div>
        )}
      </div>
      <div className="hidden w-[164px] self-center md:flex">
        <StatusTag kind={row.kind} status={row.status} version={row.fixedInVersion} sub={row.subLabel} stacked />
      </div>
    </li>
  );
}
