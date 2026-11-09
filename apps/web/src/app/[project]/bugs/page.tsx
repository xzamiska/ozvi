import { schema, withProject } from "@ozvi/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Bug, Lock, Search } from "lucide-react";
import Link from "next/link";
import { ExportMenu } from "@/components/ExportMenu";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState, FilterBar, Page, PageHead, Panel, RailSection, Segments } from "@/components/ozvi/page";
import { RouteLegend } from "@/components/ozvi/route";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { listItems, textMatch } from "@/lib/queries";
import { Input } from "@/components/ui/input";
import { LoadMore } from "@/components/ozvi/LoadMore";
import { UrlSelect } from "@/components/ozvi/UrlSelect";
import { fetchLimit, nextPageHref, pageParam, takePage } from "@/lib/paging";
import { stopLabel } from "@/lib/route-text";
import { getTranslations } from "next-intl/server";
import { Gate, signInText } from "../_gate";
import { hasTag, listTags } from "@/lib/tags";
import { tagFromParam } from "@/lib/tag-rules";
import { decorateRows } from "@/lib/row-extras";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("board.nav", "bugs");

/** Filters speak the route's words: open stops, fixed (incl. verified), everything. */
const STAGES = {
  open: { statuses: ["new", "confirmed", "in_progress"] },
  fixed: { statuses: ["fixed", "verified"] },
  all: { statuses: ["new", "confirmed", "in_progress", "fixed", "verified", "wont_fix"] },
} as const;

export default async function Bugs({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ s?: string; st?: string; q?: string; sort?: string; p?: string; tag?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = await getTranslations("board.bugs");
  const tb = await getTranslations("board");

  if (!user) {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/bugs`} title={t("gateTitle")}
      text={await signInText(project, locale, t("gateText"))} />;
  }

  // An exact status (team's select) overrides the stage segments.
  const st = isTeam && (STAGES.all.statuses as readonly string[]).includes(sp.st ?? "") ? sp.st as (typeof STAGES.all.statuses)[number] : null;
  const stage = st ? null : sp.s && sp.s in STAGES ? (sp.s as keyof typeof STAGES) : isTeam ? "open" : "all";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const sort = sp.sort === "old" ? "old" : sp.sort === "affected" && isTeam ? "affected" : "new";
  const page = pageParam(sp.p);
  const { items } = schema;
  const mine = isTeam ? [] : [eq(items.authorId, user.id)];
  const { rows, hasMore, counts, allTags, tag } = await withProject(db, project.id, async (tx) => {
    // Tags: everybody filters by public ones; team-only tags exist (and filter) only for the team.
    const allTags = await listTags(tx, isTeam);
    const tag = tagFromParam(allTags, sp.tag, isTeam);
    const search = [...textMatch(q), ...(tag ? [hasTag(tag.id)] : [])];
    const page_ = takePage(await listItems(tx, [eq(items.kind, "bug"), inArray(items.status, st ? [st] : [...STAGES[stage!].statuses]), ...mine, ...search], sort, isTeam,
      { limit: fetchLimit(page), team: isTeam }), page);
    await decorateRows(tx, project, locale, page_.rows, isTeam);
    return { ...page_, allTags, tag,
    // Counts follow the search, so the numbers on the segments match what a click shows.
    counts: Object.fromEntries((await tx.select({ status: items.status, n: sql<number>`count(*)::int` }).from(items)
      .where(and(eq(items.kind, "bug"), sql`${items.mergedIntoId} is null and ${items.deletedAt} is null`, ...mine, ...search)).groupBy(items.status)).map((r) => [r.status, r.n])) as Record<string, number>,
  }; });
  const count = (k: keyof typeof STAGES) => STAGES[k].statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const keep = { ...(st ? { st } : { s: stage! }), ...(q ? { q } : {}), ...(sort !== "new" ? { sort } : {}), ...(tag ? { tag: tag.name } : {}) };
  const tg = await getTranslations("tags");
  const href = (o: Record<string, string>) => `?${new URLSearchParams({ ...keep, ...o })}`;
  const shownTotal = st ? (counts[st] ?? 0) : count(stage!);
  const total = count("all");
  const report = <Button asChild size="lg"><Link href={`/${slug}/new?kind=bug`}><Bug />{t("report")}</Link></Button>;

  return (
    <Page>
      <PageHead
        title={isTeam ? t("titleTeam") : t("titleMine")}
        lede={isTeam ? t("ledeTeam") : t("ledeMine")}
        actions={isTeam ? <><ExportMenu slug={slug} kind="bug" query={keep} />{report}</> : report}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {(total > 0 || q || tag) && (
            <div className="mb-3 grid gap-2">
              <form className="relative min-w-0" role="search">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="h-9 bg-surface pl-9" autoComplete="off" />
                {Object.entries(keep).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              </form>
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-4">
              <FilterBar>
                <Segments label={t("status")} items={(Object.keys(STAGES) as (keyof typeof STAGES)[]).map((k) => ({
                  href: `?${new URLSearchParams({ s: k, ...(q ? { q } : {}), ...(sort !== "new" ? { sort } : {}), ...(tag ? { tag: tag.name } : {}) })}`, active: k === stage,
                  label: <>{t(`stages.${k}`)}<span className="ml-1.5 tabular-nums opacity-60">{count(k)}</span></>,
                }))} />
                {isTeam && (
                  <UrlSelect name="st" value={st ?? ""} label={t("exactStatus")}
                    options={[{ value: "", label: t("anyStatus") }, ...STAGES.all.statuses.map((s) => ({ value: s, label: `${stopLabel(locale, s, project)} (${counts[s] ?? 0})` }))]} />
                )}
                {allTags.length > 0 && (
                  <UrlSelect name="tag" value={tag?.name ?? ""} label={tg("filter")}
                    options={[{ value: "", label: tg("all") }, ...allTags.map((x) => ({ value: x.name, label: x.public ? x.name : `${x.name} · ${tg("teamOnly")}` }))]} />
                )}
                <Segments label={t("order")} items={[
                  { href: href({ sort: "new" }), label: t("sortNew"), active: sort === "new" },
                  { href: href({ sort: "old" }), label: t("sortOld"), active: sort === "old" },
                  ...(isTeam ? [{ href: href({ sort: "affected" }), label: t("sortAffected"), active: sort === "affected" }] : []),
                ]} />
              </FilterBar>
              {!isTeam && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><Lock className="size-3.5" />{t("onlyYou")}</span>}
              </div>
            </div>
          )}
          {total === 0 && !q && !tag ? (
            <EmptyState
              title={isTeam ? t("emptyTeamTitle") : t("emptyMineTitle")}
              text={isTeam ? t("emptyTeamText") : t("emptyMineText")}
            />
          ) : rows.length === 0 && tag && !q ? (
            <EmptyState title={tg("noneForTag", { tag: tag.name })} text={tg("noneForTagText")}
              action={<Button asChild variant="outline"><Link href={`?${new URLSearchParams(Object.entries(keep).filter(([k]) => k !== "tag"))}`}>{tg("all")}</Link></Button>} />
          ) : rows.length === 0 && q ? (
            <EmptyState title={t("nothingFor", { q })} text={t("nothingForText")}
              action={<Button asChild variant="outline"><Link href={`?${new URLSearchParams(Object.entries(keep).filter(([k]) => k !== "q"))}`}>{t("clearSearch")}</Link></Button>} />
          ) : rows.length === 0 ? (
            <EmptyState
              title={st ? t("noneStatus", { status: stopLabel(locale, st, project) }) : stage === "open" ? t("noneOpen") : t("noneFixed")}
              text={st ? t("noneStatusText") : stage === "open" ? t("noneOpenText") : t("noneFixedText")}
              action={<Button asChild variant="outline"><Link href="?s=all">{t("showAll")}</Link></Button>}
            />
          ) : (
            <Panel as="ul" className="divide-y">{rows.map((r) => <ItemRow key={r.id} slug={slug} row={r} voted={false} login={false} locale={locale}
              tagHref={(x) => `?${new URLSearchParams({ ...keep, tag: x.name })}`} tagging={isTeam ? { all: allTags, admin: user.role === "admin" } : undefined} />)}</Panel>
          )}
          <LoadMore href={hasMore ? nextPageHref(keep, page) : null} shown={rows.length} total={shownTotal} />
        </div>
        <aside className="grid content-start gap-8 max-lg:hidden">
          <RailSection title={tb("route")}><RouteLegend kind="bug" /></RailSection>
        </aside>
      </div>
    </Page>
  );
}
