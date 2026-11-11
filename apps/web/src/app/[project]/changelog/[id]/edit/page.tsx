import { schema, withProject } from "@ozvi/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ChangelogForm } from "@/components/ChangelogForm";
import { AiBadge } from "@/components/ozvi/AiBadge";
import { Page, PageHead } from "@/components/ozvi/page";
import { aiAvailable } from "@/lib/ai";
import { linkCandidates } from "@/lib/changelog-queries";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { LOCALE_TAG } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { Gate } from "../../../_gate";
import { boardTitle } from "@/lib/board-meta";
import { needSection } from "@/lib/sections-server";

export const generateMetadata = boardTitle("board.changelog", "editTitle");

export default async function EditEntry({ params, searchParams }: { params: Promise<{ project: string; id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { project: slug, id } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, plan, locale } = await getCtx(slug);
  needSection(project, "changelog");
  const t = await getTranslations("board.changelog");
  if (!isTeam) return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/changelog/${id}/edit`} title={t("teamOnlyTitle")}
      text={user ? t("teamOnlyNoRole") : t("teamOnlySignIn")} />;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await withProject(db, project.id, async (tx) => {
    const entry = await tx.query.changelogEntries.findFirst({ where: eq(schema.changelogEntries.id, id) });
    if (!entry) return null;
    const linked = (await tx.select({ id: schema.changelogItems.itemId }).from(schema.changelogItems).where(eq(schema.changelogItems.entryId, id))).map((r) => r.id);
    const reviewer = entry.reviewedById ? (await tx.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, entry.reviewedById)))[0]?.name ?? null : null;
    return { entry, linked, reviewer, candidates: await linkCandidates(tx, linked) };
  });
  if (!data) notFound();
  return (
    <Page>
      <PageHead title={data.entry.publishedAt ? t("editTitle") : t("draftTitle")} back={{ href: `/${slug}/changelog`, label: t("title") }}
        lede={data.entry.publishedAt
          ? t("editLede", { date: data.entry.publishedAt.toLocaleDateString(LOCALE_TAG[locale]) })
          : t("draftLede")} />
      {sp.saved && <p role="status" className="-mt-3 mb-6 text-[14px] font-medium text-success">{t("saved")}</p>}
      {data.entry.aiModel && data.entry.publishedAt && (
        <p className="mb-6"><AiBadge model={data.entry.aiModel} reviewer={data.reviewer} reviewed /></p>
      )}
      <ChangelogForm slug={slug} id={id} initial={{ title: data.entry.title, body: data.entry.body, itemIds: data.linked, ai: !!data.entry.aiModel }}
        candidates={data.candidates} published={!!data.entry.publishedAt} ai={aiAvailable(plan)}
        notice={(data.entry.releaseTag || data.entry.aiModel) && !data.entry.publishedAt && (
        <div className="grid max-w-[68ch] gap-2 rounded-xl border bg-surface px-4 py-3.5 text-[14px]">
          {data.entry.releaseTag && (
            <p>
              <span className="font-semibold" data-num>{t("releaseDraft", { version: data.entry.releaseTag })}</span>{" "}
              <span className="text-muted-foreground">{t("releaseDraftText")}</span>{" "}
              {data.entry.releaseUrl && <a href={data.entry.releaseUrl} target="_blank" rel="noreferrer" className="oz-link">{t("releaseOnGithub")}</a>}
            </p>
          )}
          {data.entry.aiPending && <p role="status" className="text-muted-foreground">{t("aiWriting")}</p>}
          {data.entry.aiModel && (
            <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <AiBadge model={data.entry.aiModel} reviewer={null} reviewed={false} />
              <span>{t("aiReviewNote", { name: user?.name ?? "" })}</span>
            </p>
          )}
        </div>
      )} />
    </Page>
  );
}
