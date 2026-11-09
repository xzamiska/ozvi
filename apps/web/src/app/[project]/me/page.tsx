import { Download } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { redirect } from "next/navigation";
import { Page, PageHead, Panel } from "@/components/ozvi/page";
import { EraseMeForm } from "@/components/PrivacyForms";
import { SettingsSection } from "@/components/settings-base";
import { Button } from "@/components/ui/button";
import { getCtx } from "@/lib/project";
import { getTranslations } from "next-intl/server";
import { setEmails } from "@/lib/privacy-actions";
import { boardTitle } from "@/lib/board-meta";

export const generateMetadata = boardTitle("board.me");

export default async function Me({ params }: { params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, user, locale } = await getCtx(slug);
  if (!user) redirect(`/${slug}/ideas`);
  const t = await getTranslations("board.me");
  const tb = await getTranslations("board");
  return (
    <Page>
      <PageHead
        title={t("title")}
        lede={t("lede", { app: project.name })}
      />
      <div className="grid max-w-[720px] gap-14">
        <SettingsSection id="ucet" title={t("account")} text={user.name ? t("accountNamed") : t("accountUnnamed", { shown: user.role === "member" ? tb("user") : tb("teamMember") })}>
          <Panel className="flex items-center gap-4 p-5 sm:p-6">
            <Avatar name={user.name ?? user.email} url={user.avatarUrl} size={40} />
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold">{user.name ?? t("noName")}</p>
              {user.email && <p className="truncate text-[13.5px] text-muted-foreground">{user.email}</p>}
            </div>
          </Panel>
        </SettingsSection>
        <SettingsSection id="emaily" title={t("emails")} text={t("emailsText")}>
          <Panel className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <p className="text-[14.5px]">
              {!user.email ? <span className="text-muted-foreground">{t("noEmail")}</span>
                : user.emailOptOut ? t.rich("emailsOff", { email: user.email, b: (c) => <b className="font-semibold">{c}</b>, addr: (c) => <span className="break-all">{c}</span> })
                : t.rich("emailsOn", { email: user.email, addr: (c) => <b className="font-semibold break-all">{c}</b> })}
            </p>
            {user.email && (
              <form action={setEmails.bind(null, slug, user.emailOptOut)}>
                <Button type="submit" variant="outline">{user.emailOptOut ? t("turnOn") : t("turnOff")}</Button>
              </form>
            )}
          </Panel>
        </SettingsSection>
        <SettingsSection id="stiahnut" title={t("download")} text={t("downloadText")}>
          <Panel className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <p className="text-[14.5px]">{t("downloadWhat")}</p>
            <Button asChild variant="outline"><a href={`/${slug}/me/export`} download><Download />{t("downloadButton")}</a></Button>
          </Panel>
        </SettingsSection>
        <SettingsSection id="zmazat" title={t("erase")} text={t("eraseText")}>
          <div className="grid gap-4 rounded-xl border border-destructive/40 bg-surface p-5 sm:p-6">
            <div className="grid gap-2 text-[14px]">
              <p className="font-semibold">{t("whatHappens")}</p>
              <ul className="grid list-disc gap-1 pl-5 text-muted-foreground marker:text-line-strong">
                {(t.raw("eraseList") as string[]).map((li) => <li key={li}>{li}</li>)}
              </ul>
            </div>
            <EraseMeForm slug={slug} />
          </div>
        </SettingsSection>
      </div>
    </Page>
  );
}
