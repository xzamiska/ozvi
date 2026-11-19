import { schema, withProject } from "@ozvi/db";
import { ListKeys } from "@/components/ozvi/ListKeys";
import { inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { ItemRow } from "@/components/ItemRow";
import { EmptyState, Page, PageHead, Panel, RailSection } from "@/components/ozvi/page";
import { Button } from "@/components/ui/button";
import { boardTitle } from "@/lib/board-meta";
import { db } from "@/lib/db";
import { inboxActivity, inboxSince } from "@/lib/inbox";
import { markRead } from "@/lib/inbox-actions";
import { getCtx } from "@/lib/project";
import { listItems } from "@/lib/queries";
import { decorateRows } from "@/lib/row-extras";
import { sectionOfKind, sectionOn } from "@/lib/sections";
import { listTags } from "@/lib/tags";
import { budgetLeft, myVoteWeights, voteModeOf } from "@/lib/votes";
import { LOCALE_TAG } from "@/i18n/locales";
import { Gate } from "../_gate";

export const generateMetadata = boardTitle("board.inbox");

/**
 * Team inbox "New": items where somebody else did something since this team member last marked it read
 * (lib/inbox.ts), the newest activity first, each with what happened.
 */
export default async function Inbox({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, isTeam, locale } = await getCtx(slug);
  const t = await getTranslations("board.inbox");
  if (!user || !isTeam) {
    return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/inbox`} title={t("gateTitle")} text={t("gateText")} />;
  }
  const kinds = (["idea", "bug"] as const).filter((k) => sectionOn(project, sectionOfKind(k)));
  const since = inboxSince(user.inboxSeenAt ?? null);
  const renderedAt = new Date();
  const { rows, allTags, weights, left } = await withProject(db, project.id, async (tx) => {
    const news = await inboxActivity(tx, user.id, since, kinds, 100);
    const found = news.length ? await listItems(tx, [inArray(schema.items.id, news.map((n) => n.itemId))], "new", true, { limit: 100, team: true }) : [];
    const byId = new Map(found.map((r) => [r.id, r]));
    const rows = news.flatMap((n) => {
      const r = byId.get(n.itemId);
      if (!r) return [];
      const parts = [
        ...(n.created ? [t("created")] : []),
        ...(n.comments ? [t("comments", { n: n.comments })] : []),
        ...(n.statuses ? [t("statuses", { n: n.statuses })] : []),
      ];
      return [{ ...r, news: parts.join(" · ") }];
    });
    await decorateRows(tx, project, locale, rows, true);
    return { rows, allTags: await listTags(tx, true), weights: await myVoteWeights(tx, user.id, rows.map((x) => x.id)), left: await budgetLeft(tx, project, user.id) };
  });
  const sinceLabel = since.toLocaleString(LOCALE_TAG[locale], { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Page>
      {isTeam && <ListKeys />}
      <PageHead title={t("title")} count={rows.length} lede={user.inboxSeenAt ? t("ledeSince", { since: sinceLabel }) : t("ledeWeek")}
        actions={rows.length > 0 ? (
          <form action={markRead.bind(null, slug, renderedAt.toISOString())}><Button type="submit" variant="outline">{t("markRead")}</Button></form>
        ) : undefined} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {rows.length === 0 ? (
            <EmptyState title={t("emptyTitle")} text={t("emptyText")} />
          ) : (
            <Panel as="ul" className="divide-y">
              {rows.map((r) => (
                <ItemRow key={r.id} slug={slug} row={r} voted={weights.has(r.id)} weight={weights.get(r.id)} login={null} locale={locale}
                  vote={{ mode: voteModeOf(project), left }} tagging={{ all: allTags, admin: user.role === "admin" }} />
              ))}
            </Panel>
          )}
        </div>
        <aside className="grid content-start gap-8 lg:sticky lg:top-24">
          <RailSection title={t("ruleTitle")}>
            <p className="text-[13.5px] leading-snug text-muted-foreground">{t("rule")}</p>
          </RailSection>
        </aside>
      </div>
    </Page>
  );
}
