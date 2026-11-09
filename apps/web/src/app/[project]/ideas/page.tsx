import { schema, withProject } from "@ozvi/db";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { ExportMenu } from "@/components/ExportMenu";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState, FilterBar, Page, PageHead, Panel, RailSection, Segments } from "@/components/ozvi/page";
import { RouteLegend, StatusMark } from "@/components/ozvi/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { ago } from "@/lib/format";
import { getCtx, loginHref } from "@/lib/project";
import { countItems, listItems, textMatch } from "@/lib/queries";
import { LoadMore } from "@/components/ozvi/LoadMore";
import { UrlSelect } from "@/components/ozvi/UrlSelect";
import { VoteBudget } from "@/components/VoteBudget";
import { fetchLimit, nextPageHref, pageParam, takePage } from "@/lib/paging";
import { customerPlans, demandFor } from "@/lib/customers";
import { LOCALE_TAG } from "@/i18n/locales";
import { formatMoney, wantedByPlan } from "@/lib/traits";
import { budgetLeft, myVoteWeights, voteModeOf } from "@/lib/votes";
import { getTranslations } from "next-intl/server";
import { Gate, signInText } from "../_gate";
import { hasTag, listTags } from "@/lib/tags";
import { tagFromParam } from "@/lib/tag-rules";
import { decorateRows } from "@/lib/row-extras";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("board.ideas");

const FILTERS = {
  active: { statuses: ["open", "planned", "in_progress"] },
  shipped: { statuses: ["shipped"] },
  all: { statuses: ["open", "planned", "in_progress", "shipped", "declined"] },
} as const;

export default async function Ideas({ params, searchParams }: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ sort?: string; f?: string; q?: string; plan?: string; p?: string; tag?: string }>;
}) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = await getTranslations("board.ideas");
  const tb = await getTranslations("board");
  // "mrr" (by customers' revenue) and the plan filter are team-only: they read customer traits.
  const sort = sp.sort === "new" ? "new" : sp.sort === "mrr" && isTeam ? "mrr" : "top";
  const plan = isTeam ? (sp.plan ?? "").trim().slice(0, 60) : "";
  const page = pageParam(sp.p);
  // Team only: ideas waiting in the moderation queue (any status).
  const queue = isTeam && sp.f === "queue";
  const f = queue ? "all" : sp.f && sp.f in FILTERS ? (sp.f as keyof typeof FILTERS) : "active";
  const fParam = queue ? "queue" : f;
  const q = (sp.q ?? "").trim().slice(0, 100);

  if (!project.ideasPublic && !user) {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/ideas`} title={t("gateTitle")}
      text={await signInText(project, locale, t("gateText"))} />;
  }

  const { items } = schema;
  const { queued, rows, hasMore, total, voted, weights, left, plans, shipped, allTags, tag } = await withProject(db, project.id, async (tx) => {
    // Tags: everybody filters by public ones; team-only tags exist (and filter) only for the team.
    const allTags = await listTags(tx, isTeam);
    const tag = tagFromParam(allTags, sp.tag, isTeam);
    const where = [eq(items.kind, "idea"), inArray(items.status, [...FILTERS[f].statuses]), ...textMatch(q), ...(plan ? [wantedByPlan(plan)] : []), ...(tag ? [hasTag(tag.id)] : [])];
    const { rows, hasMore } = takePage(await listItems(tx, where, sort, isTeam, { limit: fetchLimit(page), team: isTeam, viewerId: user?.id, queue }), page);
    const total = hasMore || page > 1 ? await countItems(tx, where, { viewerId: user?.id, queue }) : rows.length;
    const queued = isTeam ? await countItems(tx, [eq(items.kind, "idea")], { queue: true }) : 0;
    const weights = await myVoteWeights(tx, user?.id, rows.map((r) => r.id));
    await decorateRows(tx, project, locale, rows, isTeam);
    const plans = isTeam ? await customerPlans(tx) : [];
    if (isTeam) {
      // Exact per-currency MRR for the rows on screen (the SQL sort sums cents without converting currencies).
      const demand = await demandFor(tx, rows.map((r) => ({ id: r.id, authorId: r.authorId ?? null })));
      for (const r of rows) r.mrrLabel = demand.get(r.id)?.mrr.map((m) => formatMoney(m.cents, m.currency, LOCALE_TAG[locale])).join(" + ") || undefined;
    }
    const shipped = await tx.select({ number: items.number, title: items.title, updatedAt: items.updatedAt }).from(items)
      .where(and(eq(items.kind, "idea"), eq(items.status, "shipped"), isNull(items.mergedIntoId), isNull(items.deletedAt), eq(items.pending, false))).orderBy(desc(items.updatedAt)).limit(4);
    return { queued, rows, hasMore, total, voted: new Set(weights.keys()), weights, left: await budgetLeft(tx, project, user?.id), plans, shipped, allTags, tag };
  });
  const m = await getTranslations("moderation");
  const tg = await getTranslations("tags");
  const keep = { sort, f: fParam, ...(q ? { q } : {}), ...(plan ? { plan } : {}), ...(tag ? { tag: tag.name } : {}) };
  const href = (o: Record<string, string>) => `?${new URLSearchParams({ ...keep, ...o })}`;
  const vote = { mode: voteModeOf(project), left };
  const login = user ? null : (loginHref(project, `/${slug}/ideas`) ?? false);

  return (
    <Page>
      <PageHead
        title={t("title")}
        lede={t("lede")}
        actions={user
          ? <>
              {isTeam && <ExportMenu slug={slug} kind="idea" query={keep} />}
              <Button asChild size="lg"><Link href={`/${slug}/new?kind=idea`}><Plus />{t("suggest")}</Link></Button>
            </>
          : login ? <Button asChild size="lg" variant="outline"><a href={login}>{t("signInToSuggest")}</a></Button> : null}
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <div className="mb-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <form className="relative min-w-[220px] flex-1" role="search">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder={t("search")} aria-label={t("search")} className="h-9 bg-surface pl-9" autoComplete="off" />
              <input type="hidden" name="f" value={fParam} />
              <input type="hidden" name="sort" value={sort} />
              {plan && <input type="hidden" name="plan" value={plan} />}
              {tag && <input type="hidden" name="tag" value={tag.name} />}
            </form>
            <FilterBar>
              <Segments label={t("status")} items={[
                ...(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((k) => ({ href: href({ f: k }), label: t(`filters.${k}`), active: !queue && k === f })),
                ...(isTeam && (queued > 0 || queue) ? [{ href: href({ f: "queue" }), active: queue,
                  label: <span className="inline-flex items-center gap-1.5">{m("queue")}<span className="rounded-full bg-current/15 px-1.5 text-[11.5px] font-bold tabular-nums" data-num>{queued}</span></span> }] : []),
              ]} />
              <Segments label={t("order")} items={[
                { href: href({ sort: "top" }), label: <><span className="sm:hidden">{t("topShort")}</span><span className="max-sm:hidden">{t("top")}</span></>, active: sort === "top" },
                { href: href({ sort: "new" }), label: <><span className="sm:hidden">{t("newShort")}</span><span className="max-sm:hidden">{t("newest")}</span></>, active: sort === "new" },
                ...(isTeam ? [{ href: href({ sort: "mrr" }), label: t("byMrr"), active: sort === "mrr" }] : []),
              ]} />
              {allTags.length > 0 && (
                <UrlSelect name="tag" value={tag?.name ?? ""} label={tg("filter")}
                  options={[{ value: "", label: tg("all") }, ...allTags.map((x) => ({ value: x.name, label: x.public ? x.name : `${x.name} · ${tg("teamOnly")}` }))]} />
              )}
              {isTeam && (plans.length > 0 || plan) && (
                <UrlSelect name="plan" value={plan} label={t("planFilter")}
                  options={[{ value: "", label: t("allPlans") }, ...[...new Set([...plans, ...(plan ? [plan] : [])])].map((p) => ({ value: p, label: t("planOption", { plan: p }) }))]} />
              )}
            </FilterBar>
          </div>

          {left !== null && <VoteBudget left={left} budget={project.voteBudget!} mode={vote.mode} />}
          {rows.length === 0 ? (
            queue && !q && !plan ? <EmptyState title={m("queueEmpty")} text={m("queueEmptyText")} /> :
            tag && !q ? <EmptyState title={tg("noneForTag", { tag: tag.name })} text={tg("noneForTagText")}
              action={<Button asChild variant="outline"><Link href={`?${new URLSearchParams(Object.entries(keep).filter(([k]) => k !== "tag"))}`}>{tg("all")}</Link></Button>} /> :
            plan && !q ? <EmptyState title={t("noneForPlan", { plan })} text={t("noneForPlanText")}
              action={<Button asChild variant="outline"><Link href={`?${new URLSearchParams({ sort, f })}`}>{t("allPlans")}</Link></Button>} /> :
            q ? <EmptyState title={t("nothingFor", { q })} text={t("nothingForText")} action={<Button asChild variant="outline"><Link href={`?${new URLSearchParams({ sort, f, ...(plan ? { plan } : {}) })}`}>{t("clearSearch")}</Link></Button>} />
              : f !== "all" ? <EmptyState title={f === "shipped" ? t("noneShipped") : t("noneActive")} text={t("emptyFilter")}
                  action={<Button asChild variant="outline"><Link href={href({ f: "all" })}>{t("showAll")}</Link></Button>} />
              : <EmptyState title={t("emptyTitle")} text={user ? t("emptyUser") : t("emptyGuest")} />
          ) : (
            <Panel as="ul" className="divide-y">
              {rows.map((r) => <ItemRow key={r.id} slug={slug} row={r} voted={voted.has(r.id)} weight={weights.get(r.id)} vote={vote} login={login} locale={locale}
                tagHref={(x) => `?${new URLSearchParams({ ...keep, tag: x.name })}`} tagging={isTeam ? { all: allTags, admin: user?.role === "admin" } : undefined} />)}
            </Panel>
          )}
          <LoadMore href={hasMore ? nextPageHref(keep, page) : null} shown={rows.length} total={total} />
        </div>

        <aside className="grid content-start gap-8 lg:sticky lg:top-24">
          {shipped.length > 0 && (
            <RailSection title={t("recentlyShipped")}>
              <ul className="grid gap-3">
                {shipped.map((s) => (
                  <li key={s.number} className="grid grid-cols-[16px_1fr] gap-3">
                    <StatusMark kind="idea" status="shipped" className="mt-0.5" />
                    <div className="min-w-0">
                      <Link href={`/${slug}/i/${s.number}`} className="text-[14.5px] leading-snug font-medium hover:underline">{s.title}</Link>
                      <div className="text-[12.5px] text-muted-foreground"><time dateTime={s.updatedAt.toISOString()}>{ago(s.updatedAt, locale)}</time></div>
                    </div>
                  </li>
                ))}
              </ul>
              <Link href={`/${slug}/changelog`} className="oz-link text-[13.5px]">{t("allNews")}</Link>
            </RailSection>
          )}
          {/* What the stops mean: once, beside the list, on screens wide enough for a rail. */}
          <RailSection title={tb("route")} className="max-lg:hidden">
            <RouteLegend kind="idea" />
          </RailSection>
        </aside>
      </div>
    </Page>
  );
}
