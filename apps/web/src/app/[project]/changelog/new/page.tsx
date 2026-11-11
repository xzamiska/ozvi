import { schema, withProject } from "@ozvi/db";
import { inArray } from "drizzle-orm";
import { ChangelogForm } from "@/components/ChangelogForm";
import { Page, PageHead } from "@/components/ozvi/page";
import { aiAvailable } from "@/lib/ai";
import { linkCandidates } from "@/lib/changelog-queries";
import { db } from "@/lib/db";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";
import { Gate } from "../../_gate";
import { boardTitle } from "@/lib/board-meta";
import { needSection } from "@/lib/sections-server";

export const generateMetadata = boardTitle("board.changelog", "newTitle");

export default async function NewEntry({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ item?: string; items?: string }> }) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, isTeam, plan, locale } = await getCtx(slug);
  needSection(project, "changelog");
  const t = await getTranslations("board.changelog");
  if (!isTeam) return <Gate project={project} locale={locale} signedIn={!!user} returnTo={`/${slug}/changelog/new`} title={t("teamOnlyTitle")}
      text={user ? t("teamOnlyNoRole") : t("teamOnlySignIn")} />;
  // ?item=12 (from an idea) or ?items=12,14,20 (from "Vydané, ale neoznámené", bugs included).
  const wanted = new Set([sp.item, ...(sp.items ?? "").split(",")].map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 50));
  const candidates = await withProject(db, project.id, async (tx) => {
    const ids = wanted.size ? (await tx.select({ id: schema.items.id }).from(schema.items).where(inArray(schema.items.number, [...wanted]))).map((r) => r.id) : [];
    return linkCandidates(tx, [], ids);
  });
  const pre = candidates.filter((c) => wanted.has(c.number)).map((c) => c.id);
  return (
    <Page>
      <PageHead title={t("newTitle")} back={{ href: `/${slug}/changelog`, label: t("title") }}
        lede={t("newLede")} />
      <ChangelogForm slug={slug} id={null} initial={{ title: "", body: "", itemIds: pre }} candidates={candidates} published={false} ai={aiAvailable(plan)} />
    </Page>
  );
}
