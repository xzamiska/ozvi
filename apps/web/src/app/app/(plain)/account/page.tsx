import { AlertTriangle, CircleCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { DeleteAccountForm, EmailForm, NameForm } from "@/components/AccountForms";
import { LanguageChoice } from "@/components/ozvi/LanguageMenu";
import { Page, PageHead, Panel } from "@/components/ozvi/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { getAccount } from "@/lib/account";
import { signOutEverywhereAction } from "@/lib/account-actions";
import { cn } from "@/lib/utils";
import { deletionPlan } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  return { title: (await getTranslations("account"))("meta.account") };
}

function Section({ id, title, lede, children, danger }: { id: string; title: string; lede?: React.ReactNode; children: React.ReactNode; danger?: boolean }) {
  return (
    <section aria-labelledby={id} className="grid gap-4 py-8 first:pt-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 id={id} className={cn("font-heading text-[17px] font-bold tracking-tight", danger && "text-destructive")}>{title}</h2>
        {lede && <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{lede}</p>}
      </div>
      <Panel className={cn("grid gap-6 p-5 sm:p-6", danger && "border-destructive/35")}>{children}</Panel>
    </section>
  );
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ e?: string; changed?: string }> }) {
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const sp = await searchParams;
  const cloud = process.env.OZVI_MODE === "cloud";
  const locale = await requestLocale();
  const m = await getTranslations("account");
  const t = await getTranslations("account.account");
  const error = sp.e === "expired" || sp.e === "other" || sp.e === "taken" ? t(`errors.${sp.e}`) : null;
  const plan = cloud ? await deletionPlan(account.id, locale) : null;

  return (
    <Page measure="max-w-[920px]">
      <PageHead
        back={{ href: "/app", label: m("layout.backToConsole") }}
        title={t("title")}
        lede={t("lede")}
      />
      {(sp.changed || error) && (
        <div className="mb-8 grid gap-3">
          {sp.changed && (
            <Alert role="status" className="border-success/30">
              <CircleCheck className="text-success" />
              <AlertTitle>{t("changedTitle")}</AlertTitle>
              <AlertDescription>{t("changed")}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="border-destructive/30">
              <AlertTriangle />
              <AlertDescription className="text-destructive">{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="divide-y">
        <Section id="acc-profile" title={t("profile")}>
          <NameForm name={account.name ?? ""} />
          <div className="border-t pt-6"><EmailForm email={account.email} /></div>
        </Section>

        <Section id="acc-language" title={t("language")} lede={t("languageLede")}>
          <div><LanguageChoice label={t("language")} /></div>
        </Section>

        <Section id="acc-sessions" title={t("sessions")}>
          <form action={signOutEverywhereAction} className="grid gap-3">
            <p className="text-[14px]">{t("sessionsText")}</p>
            <div><Button type="submit" variant="outline">{t("signOutAll")}</Button></div>
          </form>
        </Section>

        {plan && (
          <Section id="acc-delete" title={t("deleteTitle")} lede={t("deleteLede")} danger>
            {plan.blockers.length > 0 ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>{t("cantDelete")}</AlertTitle>
                <AlertDescription>
                  <ul className="grid list-disc gap-1 pl-4 text-foreground">{plan.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-3 text-[14px]">
                  {plan.remove.length > 0 ? (
                    <>
                      <p>{t("removeList")}</p>
                      <ul className="grid gap-1 rounded-lg border bg-wash px-4 py-3">
                        {plan.remove.map((w) => (
                          <li key={w.id}><b className="font-semibold">{w.name}</b><span className="text-muted-foreground">{w.projects.length ? `: ${w.projects.join(", ")}` : t("noProjects")}</span></li>
                        ))}
                      </ul>
                      <p className="text-[13px] text-muted-foreground">{t("exportHint")}</p>
                    </>
                  ) : <p>{t("nothingRemoved")}</p>}
                  {plan.leave.length > 0 && <p>{t("leave", { list: plan.leave.map((w) => w.name).join(", ") })}</p>}
                </div>
                <div className="border-t pt-6"><DeleteAccountForm email={account.email} blocked={false} /></div>
              </>
            )}
          </Section>
        )}
      </div>
    </Page>
  );
}
