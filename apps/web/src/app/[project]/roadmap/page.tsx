import { withProject } from "@ozvi/db";
import { LoadMore } from "@/components/ozvi/LoadMore";
import { nextPageHref, pageParam } from "@/lib/paging";
import Link from "next/link";
import { Page, PageHead } from "@/components/ozvi/page";
import { StatusMark } from "@/components/ozvi/route";
import { TagChip } from "@/components/ozvi/tags";
import { UrlSelect } from "@/components/ozvi/UrlSelect";
import { roadmapLanes, ROADMAP_LANES } from "@/lib/roadmap";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { Gate, signInText } from "../_gate";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { stopHint, stopLabel } from "@/lib/route-text";
import { parseStatusLabels } from "@/lib/statuses";
import { boardTitle } from "@/lib/board-meta";
import { needSection } from "@/lib/sections-server";

export const generateMetadata = boardTitle("board.roadmap");

const COPY = {
  planned: { title: "planned", empty: "plannedEmpty" },
  in_progress: { title: "inProgress", empty: "inProgressEmpty" },
  shipped: { title: "shipped", empty: "shippedEmpty" },
} as const;
const COLUMNS = ROADMAP_LANES.map((l) => ({ ...l, ...COPY[l.status] }));

export default async function Roadmap({ params, searchParams }: {
  params: Promise<{ project: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { project: slug } = await params;
  const sp = await searchParams;
  // Each column pages on its own (?pl=2&sh=3), so loading more in one keeps the others as they are.
  const pages = Object.fromEntries(COLUMNS.map((c) => [c.key, pageParam(sp[c.key])])) as Record<(typeof COLUMNS)[number]["key"], number>;
  const { project, user, isTeam, locale } = await getCtx(slug);
  needSection(project, "roadmap");
  const t = await getTranslations("board.roadmap");
  const tb = await getTranslations("board");
  if (!project.ideasPublic && !user) {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/roadmap`} title={t("gateTitle")}
      text={await signInText(project, locale, t("gateText"))} />;
  }
  // Tags: public ones for everybody, team-only ones only for the team (same ?tag=<name> as the ideas list).
  const { allTags, tag, lanes: cols } = await withProject(db, project.id, (tx) => roadmapLanes(tx, project, locale, { team: isTeam, tag: sp.tag, pages }));
  const tg = await getTranslations("tags");
  const keep: Record<string, string> = {
    ...Object.fromEntries(COLUMNS.filter((c) => pages[c.key] > 1).map((c) => [c.key, String(pages[c.key])])),
    ...(tag ? { tag: tag.name } : {}),
  };
  const tagHref = (name: string) => `?${new URLSearchParams({ tag: name })}`;
  // Columns are stages; a renamed stage shows the board's word ("Nedávno vydané" stays unless renamed).
  const renamed = new Set(Object.keys(parseStatusLabels(project.statusLabels)));
  const fmt = new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "long" });

  return (
    <Page>
      <PageHead title={t("title")} lede={t("lede")} actions={allTags.length > 0 && (
        <UrlSelect name="tag" value={tag?.name ?? ""} label={tg("filter")} resetKeys={COLUMNS.map((c) => c.key)}
          options={[{ value: "", label: tg("all") }, ...allTags.map((x) => ({ value: x.name, label: x.public ? x.name : `${x.name} · ${tg("teamOnly")}` }))]} />
      )} />
      <div className="relative grid gap-6 md:grid-cols-3 md:gap-5">
        <span aria-hidden className="absolute top-[11px] right-[16%] left-[16%] hidden h-0.5 bg-line-strong md:block" />
        {COLUMNS.map((c, i) => (
          <section key={c.status} aria-labelledby={`col-${c.status}`} className="relative grid content-start gap-4">
            <header className="grid grid-cols-[24px_1fr] items-center gap-x-2 gap-y-1 md:grid-cols-1 md:justify-items-center md:text-center">
              <span className="relative z-10 grid size-6 place-items-center rounded-full bg-background"><StatusMark kind="idea" status={c.status} className="size-5" /></span>
              <h2 id={`col-${c.status}`} className="font-heading text-[17px] font-bold md:mt-1">
                {c.status === "shipped" && !renamed.has("shipped") ? t(c.title) : stopLabel(locale, c.status, project)} <span className="ml-1 text-sm font-semibold text-muted-foreground" data-num>{cols[i]!.total}</span>
              </h2>
              <p className="col-start-2 max-w-[32ch] text-[13px] text-muted-foreground md:col-start-1">{stopHint(locale, c.status)}</p>
            </header>
            {cols[i]!.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-3 text-center text-[13.5px] leading-snug text-muted-foreground">{tag ? tg("noneForTag", { tag: tag.name }) : t(c.empty)}</p>
            ) : (
              <ul className="grid gap-2">
                {cols[i]!.rows.map((it) => (
                  <li key={it.number} className="group relative grid grid-cols-[1fr_auto] items-start gap-x-3 rounded-xl border bg-surface px-4 py-3 transition-colors hover:border-line-strong">
                    <Link href={`/${slug}/i/${it.number}`} className="oz-stretch text-[14.5px] leading-snug font-semibold group-hover:underline"><span className="mr-1.5 font-heading font-bold text-muted-foreground tabular-nums">#{it.number}</span>{it.title}</Link>
                    <span className="pt-px text-[13px] font-medium whitespace-nowrap text-muted-foreground" data-num>
                      {c.status === "shipped" ? fmt.format(it.updatedAt) : tb("votes", { n: it.votes })}
                    </span>
                    {/* Sub-status after the lane's stop ("Rozpracované · V testovaní"), then the tags this viewer may see. */}
                    {(it.subLabel || it.tags.length > 0) && (
                      <div className="col-span-2 mt-2 flex min-w-0 flex-wrap items-center gap-1">
                        {it.subLabel && (
                          <span className="mr-1 inline-flex h-6 min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground" title={it.subLabel}>
                            <StatusMark kind="idea" status={c.status} className="size-3.5 shrink-0" />
                            <span className="sr-only">{stopLabel(locale, c.status, project)} · </span><span className="truncate">{it.subLabel}</span>
                          </span>
                        )}
                        {it.tags.map((x) => <TagChip key={x.id} tag={x} href={tagHref(x.name)} className="h-6" />)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {cols[i]!.hasMore && (
              <LoadMore className="mt-0 justify-center md:flex-col md:gap-1.5" href={nextPageHref(keep, pages[c.key], c.key)}
                shown={cols[i]!.rows.length} total={cols[i]!.total} />
            )}
          </section>
        ))}
      </div>
    </Page>
  );
}
