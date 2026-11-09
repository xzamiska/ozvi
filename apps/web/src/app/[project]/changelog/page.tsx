import { withProject } from "@ozvi/db";
import { Markdown } from "@/components/Markdown";
import { projectOrigin } from "@/lib/email/url";
import { Plus, Rss, Tag } from "lucide-react";
import { AiBadge } from "@/components/ozvi/AiBadge";
import { countUnannounced, listUnannounced } from "@/lib/release";
import { routeText } from "@/lib/route";
import type { Locale } from "@/i18n/locales";
import Link from "next/link";
import { EmptyState, Page, PageHead } from "@/components/ozvi/page";
import { StatusMark } from "@/components/ozvi/route";
import { Button } from "@/components/ui/button";
import { countEntries, listEntries } from "@/lib/changelog-queries";
import { LoadMore } from "@/components/ozvi/LoadMore";
import { fetchLimit, nextPageHref, pageParam, takePage } from "@/lib/paging";

const ENTRIES_PAGE = 20;
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { Gate, signInText } from "../_gate";
import { cn } from "@/lib/utils";
import { boardTitle } from "@/lib/board-meta";
import { TranslateBar, TranslatedBody, TranslatedTitle, TranslationScope } from "@/components/ozvi/Translate";
import { translationView } from "@/lib/translate-view";

export const generateMetadata = boardTitle("board.changelog");

export default async function Changelog({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ published?: string; p?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, locale, plan } = await getCtx(slug);
  const t = await getTranslations("board.changelog");
  const tb = await getTranslations("board");
  if (!project.ideasPublic && !user) {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/changelog`} title={t("gateTitle")}
      text={await signInText(project, locale, t("gateText"))} />;
  }
  const page = pageParam(sp.p);
  const { rows: entries, hasMore, total, unannounced, translation } = await withProject(db, project.id, async (tx) => {
    const r = takePage(await listEntries(tx, isTeam, fetchLimit(page, ENTRIES_PAGE)), page, ENTRIES_PAGE);
    return { ...r, total: r.hasMore || page > 1 ? await countEntries(tx, isTeam) : r.rows.length,
      // Published entries only: drafts are the team's own work in progress.
      translation: await translationView(tx, { project, plan, locale, slug, origin: projectOrigin(project) },
        r.rows.filter((e) => e.publishedAt).map((e) => ({ subject: "changelog" as const, id: e.id, title: e.title, body: e.body }))),
      unannounced: isTeam && page === 1 ? { rows: await listUnannounced(tx, 8), n: await countUnannounced(tx) } : null };
  });
  const fmt = new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });

  return (
    <Page>
      <PageHead
        title={t("title")}
        lede={t("lede", { app: project.name })}
        actions={<>
          {project.ideasPublic && (
            <a href={`/${slug}/changelog/feed.xml`} className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              <Rss className="size-4" />RSS
            </a>
          )}
          {isTeam && <Button asChild size="lg" className="ml-2"><Link href={`/${slug}/changelog/new`}><Plus />{t("write")}</Link></Button>}
        </>}
      />
      {sp.published !== undefined && (
        <p role="status" className="mb-8 rounded-lg border border-st-done/40 bg-st-done/8 px-4 py-3 text-[14.5px] font-medium">
          {t("published")}{Number(sp.published) > 0 ? t("notified", { n: Number(sp.published) }) : ""}
        </p>
      )}
      {unannounced && unannounced.n > 0 && <Unannounced slug={slug} rows={unannounced.rows} n={unannounced.n} locale={locale} />}
      {entries.length === 0 ? (
        <EmptyState title={t("emptyTitle")} text={isTeam ? t("emptyTeam") : t("emptyGuest")} />
      ) : (
        <TranslationScope slug={slug} view={translation}>
        <ol className="grid gap-12">
          {entries.map((e) => (
            <li key={e.id} id={`e-${e.id}`} className="grid scroll-mt-24 gap-3 md:grid-cols-[180px_minmax(0,1fr)] md:gap-10">
              <div className="md:pt-1.5">
                <time dateTime={(e.publishedAt ?? e.createdAt).toISOString()} className={cn("text-[14px] font-semibold", !e.publishedAt && "text-st-ack")}>
                  {e.publishedAt ? fmt.format(e.publishedAt) : t("draft")}
                </time>
              </div>
              <article className={cn("min-w-0 border-t pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-10", !e.publishedAt && "border-dashed")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-heading text-[22px] leading-tight font-bold tracking-tight"><TranslatedTitle id={e.id}>{e.title}</TranslatedTitle></h2>
                  {isTeam && <Button asChild variant="outline" size="sm"><Link href={`/${slug}/changelog/${e.id}/edit`}>{e.publishedAt ? t("edit") : t("finishDraft")}</Link></Button>}
                </div>
                {(e.aiModel || (isTeam && !e.publishedAt && (e.releaseTag || e.aiPending))) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {isTeam && !e.publishedAt && e.releaseTag && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px] font-medium text-muted-foreground">
                        <Tag aria-hidden className="size-3.5" /><span data-num>{t("fromRelease", { version: e.releaseTag })}</span>
                      </span>
                    )}
                    {isTeam && !e.publishedAt && e.aiPending && <span role="status" className="text-[12.5px] font-medium text-muted-foreground">{t("aiWriting")}</span>}
                    {e.aiModel && <AiBadge model={e.aiModel} reviewer={e.reviewerName} reviewed={!!e.publishedAt} />}
                  </div>
                )}
                <TranslateBar id={e.id} className="mt-2" />
                {e.body && <TranslatedBody id={e.id} className="mt-3 text-[15.5px]"><Markdown source={e.body} headings slug={slug} origin={projectOrigin(project)} className="mt-3 text-[15.5px]" /></TranslatedBody>}
                {/* Release drafts already list their ideas (with links) in the text; don't repeat them. */}
                {e.items.length > 0 && !e.items.every((i) => e.body.includes(`/${slug}/i/${i.number})`)) && (
                  <ul className="mt-5 grid gap-2">
                    {e.items.map((i) => (
                      <li key={i.number} className="flex items-center gap-2.5 text-[14px]">
                        <StatusMark kind="idea" status="shipped" />
                        <Link href={`/${slug}/i/${i.number}`} className="font-medium hover:underline">{i.title}</Link>
                        <span className="text-muted-foreground" data-num>#{i.number} · {tb("votes", { n: i.votes })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </li>
          ))}
        </ol>
        </TranslationScope>
      )}
      {entries.length > 0 && (
        <LoadMore className="mt-12 md:ml-[220px]" href={hasMore ? nextPageHref({}, page) : null} shown={entries.length} total={total} />
      )}
    </Page>
  );
}

/**
 * Team only: shipped ideas and fixed bugs no published entry mentions yet. Voters hear only through the
 * changelog, so this is the list of people still waiting to hear.
 */
async function Unannounced({ slug, rows, n, locale }: {
  slug: string; n: number; locale: Locale;
  rows: Awaited<ReturnType<typeof listUnannounced>>;
}) {
  const t = await getTranslations({ locale, namespace: "board.changelog.unannounced" });
  const tr = await getTranslations({ locale, namespace: "route" });
  const fresh = rows.filter((r) => !r.inDraft);
  return (
    <section aria-labelledby="unannounced" className="mb-12 rounded-xl border bg-surface p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="unannounced" className="font-heading text-[17px] font-bold tracking-tight">
            {t("title")} <span className="ml-1 text-muted-foreground tabular-nums" data-num>{n}</span>
          </h2>
          <p className="mt-1 max-w-[62ch] text-[13.5px] text-muted-foreground">{t("lede")}</p>
        </div>
        {fresh.length > 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/${slug}/changelog/new?items=${fresh.map((r) => r.number).join(",")}`}><Plus />{t("write")}</Link>
          </Button>
        )}
      </div>
      <ul className="mt-4 grid gap-2">
        {rows.map((r) => (
          <li key={r.id} className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px]">
            <StatusMark kind={r.kind} status={r.status} />
            <Link href={`/${slug}/i/${r.number}`} className="min-w-0 font-medium hover:underline">{r.title}</Link>
            <span className="text-[13px] text-muted-foreground" data-num>
              #{r.number} · {routeText(tr, "label", r.status)}{r.fixedInVersion ? ` · ${r.fixedInVersion}` : ""}
            </span>
            {r.inDraft && <span className="rounded-full border px-2 py-px text-[12px] font-medium text-muted-foreground">{t("inDraft")}</span>}
          </li>
        ))}
      </ul>
      {n > rows.length && <p className="mt-3 text-[13px] text-muted-foreground">{t("more", { n: n - rows.length })}</p>}
    </section>
  );
}
