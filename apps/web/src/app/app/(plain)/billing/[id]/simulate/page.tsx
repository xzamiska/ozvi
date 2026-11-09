import type { Interval, PaidPlan } from "@ozvi/db";
import { FlaskConical } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { day } from "@/components/ozvi/console";
import { Page, PageHead, Panel } from "@/components/ozvi/page";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { getAccount, workspacesOf } from "@/lib/account";
import { simulateBilling } from "@/lib/app-actions";
import { devBilling } from "@/lib/creem";

export const dynamic = "force-dynamic";

/**
 * Local cloud testing only (OZVI_DEV_BILLING=1): stands in for Creem's checkout and customer portal.
 * Each button sends a synthetic event through the same code as a real webhook.
 */
export default async function SimulateBilling({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string; i?: string }> }) {
  if (!devBilling()) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = (await workspacesOf(account.id)).find((w) => w.id === id && w.role === "owner");
  if (!ws) notFound();
  const plan: PaidPlan | null = sp.plan === "pro" || sp.plan === "studio" ? sp.plan : null;
  const interval: Interval = sp.i === "quarter" ? "quarter" : "year";
  const paid = ws.plan === "pro" || ws.plan === "studio";
  const locale = await requestLocale();
  const c = await getTranslations("console");
  const t = await getTranslations("console.simulate");
  const btn = (label: string, kind: Parameters<typeof simulateBilling>[1], primary = false) => (
    <form action={simulateBilling.bind(null, ws.id, kind, plan ?? "pro", interval)}>
      <Button type="submit" variant={primary ? "default" : "outline"}>{label}</Button>
    </form>
  );

  return (
    <>
      <div role="note" className="border-b border-brand-line bg-brand-soft text-foreground">
        <div className="oz-frame flex items-start gap-2.5 py-2.5 text-[13.5px] font-medium">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t("devOnly")} (<code className="font-mono text-[12.5px]">OZVI_DEV_BILLING=1</code>). {t("devNote")}</p>
        </div>
      </div>
      <Page measure="max-w-[760px]">
        <PageHead back={{ href: `/app/w/${ws.id}/plan`, label: c("plan.title") }} title={t("title")} />

        <Panel className="mb-6">
          <dl className="grid gap-x-6 gap-y-2 px-5 py-4 text-[14px] sm:grid-cols-[140px_1fr]">
            <dt className="text-muted-foreground">{t("workspace")}</dt><dd className="font-semibold">{ws.name}</dd>
            <dt className="text-muted-foreground">{t("plan")}</dt><dd className="font-mono text-[13px]">{ws.plan}</dd>
            {ws.planStatus && <><dt className="text-muted-foreground">{t("status")}</dt><dd className="font-mono text-[13px]">{ws.planStatus}</dd></>}
            {ws.planPeriodEnd && <><dt className="text-muted-foreground">{t("periodEnd")}</dt><dd className="tabular-nums">{day(ws.planPeriodEnd, locale)}</dd></>}
          </dl>
        </Panel>

        <div className="grid gap-8">
          {plan && (
            <section aria-labelledby="sim-pay" className="grid gap-3">
              <h2 id="sim-pay" className="font-heading text-[16px] font-bold">{t("payment")}</h2>
              <div className="flex flex-wrap gap-2">{btn(t("pay", { plan: c(`planName.${plan}`), interval: interval === "year" ? c("plan.perYear") : c("plan.perQuarter") }), "pay", true)}</div>
            </section>
          )}
          {paid && (
            <section aria-labelledby="sim-sub" className="grid gap-3">
              <h2 id="sim-sub" className="font-heading text-[16px] font-bold">{t("subscription")}</h2>
              <div className="flex flex-wrap gap-2">
                {btn(t("renew"), "renew")}
                {btn(t("pastDue"), "past_due")}
                {btn(t("cancel"), "cancel")}
                {btn(t("expire"), "expire")}
              </div>
            </section>
          )}
          {!plan && !paid && <p className="text-[14px] text-muted-foreground">{t("none")}</p>}
        </div>
      </Page>
    </>
  );
}
