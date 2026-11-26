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
import { loginHref } from "@/lib/project";
import { budgetLeft, voteModeOf } from "@/lib/votes";
import { withProject } from "@ozvi/db";
import { db } from "@/lib/db";
import { knownByNumber, knownOpen } from "@/lib/known-issues";

export const generateMetadata = async ({ params, searchParams }: { params: Promise<{ project: string }>; searchParams: Promise<{ kind?: string }> }) =>
  boardTitle("board.newItem", (await searchParams).kind === "bug" ? "titleBug" : "titleIdea")({ params });

/** Host apps can deep-link: /billiwo/new?kind=bug&url=/invoices/12&v=2.14.0 */
export default async function NewItem({ params, searchParams }: {
  params: Promise<{ project: string }>;
  searchParams: Promise<{ kind?: string; url?: string; v?: string; known?: string }>;
}) {
  const { project: slug } = await params;
  const sp = await searchParams;
  const { project, user, locale } = await getCtx(slug);
  const t = await getTranslations("board.newItem");
  const tb = await getTranslations("board");
  const kind = sp.kind === "bug" ? "bug" : "idea";
  needSection(project, kind === "bug" ? "bugs" : "ideas");
  const bug = kind === "bug";

  const returnTo = `/${slug}/new?kind=${kind}`;
  // A guest on a public board may write an idea and see similar ones (vote there after signing in); posting
  // needs a sign-in that comes back to this form, where the draft waits (kept in the tab, NewItemForm).
  const guestLogin = !user && !bug && project.ideasPublic ? loginHref(project, returnTo) : null;
  if (!user && !guestLogin) {
    return <Gate project={project} locale={locale} returnTo={returnTo} title={bug ? t("gateBug") : t("gateIdea")}
      text={await signInText(project, locale, t("gateText"))} />;
  }
  // "Mám ten istý problém" on the list of known issues: the form starts joined to it (if it is still open).
  const known = bug && user && /^\d{1,9}$/.test(sp.known ?? "")
    ? await withProject(db, project.id, async (tx) => {
      const k = await knownByNumber(tx, Number(sp.known));
      return k && knownOpen(k.status) ? { number: k.number, title: k.title, body: k.body, status: k.status, affected: k.affected } : null;
    }) : null;
  return (
    <Page>
      <PageHead
        back={{ href: `/${slug}/${bug ? "bugs" : "ideas"}`, label: bug ? tb("nav.bugs") : tb("nav.ideas") }}
        title={bug ? t("titleBug") : t("titleIdea")}
        lede={bug ? t("ledeBug") : t("ledeIdea")}
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,640px)_1fr] lg:gap-16">
        {user && isBlocked(user) ? (
          <p role="note" className="flex items-start gap-2 self-start rounded-xl border border-dashed bg-surface/60 px-4 py-3.5 text-[14.5px] text-muted-foreground">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />{(await getTranslations("moderation"))("blockedNotice")}
          </p>
        ) : <NewItemForm slug={slug} kind={kind} prefill={{ url: sp.url?.slice(0, 500), appVersion: sp.v?.slice(0, 50), known }} login={guestLogin}
              vote={{ mode: voteModeOf(project), left: user && !bug ? await withProject(db, project.id, (tx) => budgetLeft(tx, project, user.id)) : null }} />}
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
