import { Ban, Lock } from "lucide-react";
import { isBlocked } from "@/lib/moderation-rules";
import { NewItemForm } from "@/components/NewItemForm";
import { Page, PageHead, RailSection } from "@/components/ozvi/page";
import { RouteLegend } from "@/components/ozvi/route";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";
import { Gate, signInText } from "../_gate";
import { boardTitle } from "@/lib/board-meta";
import { needSection } from "@/lib/sections-server";

export const generateMetadata = async ({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ kind?: string }> }) =>
  boardTitle("board.newItem", (await searchParams).kind === "bug" ? "titleBug" : "titleIdea")({ params });

/** Host apps can deep-link: /billiwo/new?kind=bug&url=/invoices/12&v=2.14.0 */
export default async function NewItem({ params, searchParams }: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ kind?: string; url?: string; v?: string }>;
}) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations("board.newItem");
  const tb = await getTranslations("board");
  const kind = sp.kind === "bug" ? "bug" : "idea";
  needSection(project, kind === "bug" ? "bugs" : "ideas");
  const bug = kind === "bug";

  if (!user) {
    return <Gate project={project} locale={locale} returnTo={`/${slug}/new?kind=${kind}`} title={bug ? t("gateBug") : t("gateIdea")}
      text={await signInText(project, locale, t("gateText"))} />;
  }
  return (
    <Page>
      <PageHead
        back={{ href: `/${slug}/${bug ? "bugs" : "ideas"}`, label: bug ? tb("nav.bugs") : tb("nav.ideas") }}
        title={bug ? t("titleBug") : t("titleIdea")}
        lede={bug ? t("ledeBug") : t("ledeIdea")}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_1fr] lg:gap-16">
        {isBlocked(user) ? (
          <p role="note" className="flex items-start gap-2 self-start rounded-xl border border-dashed bg-surface/60 px-4 py-3.5 text-[14.5px] text-muted-foreground">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />{(await getTranslations("moderation"))("blockedNotice")}
          </p>
        ) : <NewItemForm slug={slug} kind={kind} prefill={{ url: sp.url?.slice(0, 500), appVersion: sp.v?.slice(0, 50) }} />}
        <aside className="grid content-start gap-6 lg:pt-1">
          <RailSection title={tb("route")}>
            <RouteLegend kind={kind} />
          </RailSection>
          {bug && <p className="flex gap-2 text-[13px] text-muted-foreground"><Lock className="mt-0.5 size-3.5 shrink-0" />{t("privateNote")}</p>}
        </aside>
      </div>
    </Page>
  );
}
