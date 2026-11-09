import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ItemRow } from "@/components/ItemRow";
import { LoadMore } from "@/components/ozvi/LoadMore";
import { EmptyState, FilterBar, Page, PageHead, Panel, RailSection, Segments } from "@/components/ozvi/page";
import { db } from "@/lib/db";
import { fetchLimit, nextPageHref, pageParam, takePage } from "@/lib/paging";
import { getCtx } from "@/lib/project";
import { countItems, listItems } from "@/lib/queries";
import { decorateRows } from "@/lib/row-extras";
import { listTags } from "@/lib/tags";
import { unansweredWhere } from "@/lib/unanswered";
import { budgetLeft, myVoteWeights, voteModeOf } from "@/lib/votes";
import { Gate } from "../_gate";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("board.unanswered");

/**
 * Team queue "Bez odpovede": active reports where somebody has waited longer than the project's
 * N days for a public reply or a status change, the longest wait first (lib/unanswered.ts).
 */
export default async function Unanswered({ params, searchParams }: {
  params: Promise<{ project: string }>; searchParams: Promise<{ k?: string; p?: string }>;
}) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = await getTranslations("board.unanswered");
  if (!user || !isTeam) {
    return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/unanswered`} title={t("gateTitle")} text={t("gateText")} />;
  }
  const kind = sp.k === "idea" || sp.k === "bug" ? sp.k : null;
  const page = pageParam(sp.p);
  const days = project.unansweredDays;
  const { items } = schema;
  const base = [unansweredWhere(days)];
  const { rows, hasMore, counts, allTags, weights, left } = await withProject(db, project.id, async (tx) => {
    const where = [...base, ...(kind ? [eq(items.kind, kind)] : [])];
    const r = takePage(await listItems(tx, where, "waiting", true, { limit: fetchLimit(page), team: true }), page);
    await decorateRows(tx, project, locale, r.rows, true);
    const [ideas, bugs] = await Promise.all([
      countItems(tx, [...base, eq(items.kind, "idea")]), countItems(tx, [...base, eq(items.kind, "bug")]),
    ]);
    return { ...r, counts: { idea: ideas, bug: bugs }, allTags: await listTags(tx, true),
      weights: await myVoteWeights(tx, user.id, r.rows.map((x) => x.id)), left: await budgetLeft(tx, project, user.id) };
  });
  const total = counts.idea + counts.bug;
  const shownTotal = kind ? counts[kind] : total;
  const keep = kind ? { k: kind } : {};
  const seg = (k: "idea" | "bug" | null, label: string, n: number) => ({
    href: k ? `?k=${k}` : "?", active: kind === k,
    label: <>{label}<span className="ml-1.5 tabular-nums opacity-60">{n}</span></>,
  });

  return (
    <Page>
      <PageHead title={t("title")} count={total} lede={t("lede", { n: days })} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {total > 0 && (
            <FilterBar className="mb-3">
              <Segments label={t("kind")} items={[seg(null, t("all"), total), seg("idea", t("ideas"), counts.idea), seg("bug", t("bugs"), counts.bug)]} />
            </FilterBar>
          )}
          {rows.length === 0 ? (
            <EmptyState title={t("emptyTitle")} text={t("emptyText", { n: days })} />
          ) : (
            <Panel as="ul" className="divide-y">
              {rows.map((r) => (
                <ItemRow key={r.id} slug={slug} row={r} voted={weights.has(r.id)} weight={weights.get(r.id)} login={null} locale={locale}
                  vote={{ mode: voteModeOf(project), left }}
                  tagging={{ all: allTags, admin: user.role === "admin" }} />
              ))}
            </Panel>
          )}
          <LoadMore href={hasMore ? nextPageHref(keep, page) : null} shown={rows.length} total={shownTotal} />
        </div>
        <aside className="grid content-start gap-8 lg:sticky lg:top-24">
          <RailSection title={t("ruleTitle")}>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{t("rule", { n: days })}</p>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{t("ruleClears")}</p>
            {user.role === "admin" && <Link href={`/${slug}/admin#unanswered`} className="oz-link text-[13.5px]">{t("change")}</Link>}
          </RailSection>
        </aside>
      </div>
    </Page>
  );
}
