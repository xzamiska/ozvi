import { PLAN_LIMITS, PRICES, type Interval, type PaidPlan } from "@ozvi/db";
import { AlertTriangle, CalendarClock, Check, CircleCheck, FileSignature, Mail } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LEGAL } from "@/lib/legal";
import { notFound, redirect } from "next/navigation";
import { bytes, ConsoleHead, eur, Meter, day, num } from "@/components/ozvi/console";
import { Panel, Segments } from "@/components/ozvi/page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAccount } from "@/lib/account";
import { consoleWorkspace, usageOf } from "@/lib/console";
import { cancelPlan, changePlan, openPortal, resumePlan, startCheckout } from "@/lib/app-actions";
import { BillingDialog, PendingSubmit } from "@/components/ozvi/BillingDialog";
import { billingEnabled, devBilling, isUpgrade, prorationEstimate } from "@/lib/creem";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locales";
import { requestLocale } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { consoleTitle } from "@/lib/board-meta";

export const generateMetadata = consoleTitle("plan");

const PLAN_NAME = { free: "Free", pro: "Pro", studio: "Studio" } as const;

type PlanT = Awaited<ReturnType<typeof getTranslations<"console.plan">>>;

const FEATURES = (p: "free" | PaidPlan, t: PlanT, locale: Locale) => {
  const l = PLAN_LIMITS[p];
  return [
    Number.isFinite(l.projects) ? t("fProjects", { count: l.projects }) : t("fProjectsUnlimited"),
    Number.isFinite(l.emailsPerMonth) ? t("fEmails", { n: num(l.emailsPerMonth, locale) }) : t("fEmailsUnlimited"),
    t("fStorage", { size: bytes(l.attachmentBytes, locale) }),
    l.customDomain ? t("fDomain") : t("fOzviAddress"),
    l.badge ? t("fBadge") : t("fNoBadge"),
    ...(l.translationsPerMonth > 0 ? [Number.isFinite(l.translationsPerMonth) ? t("fTranslations", { n: num(l.translationsPerMonth, locale) }) : t("fTranslationsUnlimited")] : []),
    ...(l.ai ? [t("fAi")] : []),
  ];
};

export default async function Billing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paid?: string; i?: string; done?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  if (process.env.OZVI_MODE !== "cloud") notFound();
  const usage = await usageOf(ws);
  const interval: Interval = sp.i === "quarter" ? "quarter" : "year";
  const enabled = billingEnabled();
  const owner = ws.role === "owner";
  const locale = await requestLocale();
  const t = await getTranslations("console.plan");
  const paying = (ws.plan === "pro" || ws.plan === "studio") && !!ws.creemSubscriptionId;
  const curPlan = ws.plan as PaidPlan;
  const curInterval: Interval = ws.planInterval === "quarter" ? "quarter" : "year";
  const cancelling = ws.planStatus === "scheduled_cancel";
  const end = ws.planPeriodEnd ? day(ws.planPeriodEnd, locale) : null;
  const per = (i: Interval) => (i === "year" ? t("perYear") : t("perQuarter"));
  const priceOf = (p: PaidPlan, i: Interval) => `${eur(PRICES[p][i], locale)} ${per(i)}`;
  const doneKey = sp.done ?? "";
  const donePlan = /^(pro|studio)-(year|quarter)$/.exec(doneKey);
  const done = donePlan ? { title: t("doneChangeTitle", { plan: PLAN_NAME[donePlan[1] as PaidPlan] }), text: t("doneChange", { price: priceOf(donePlan[1] as PaidPlan, donePlan[2] as Interval) }) }
    : doneKey === "canceled" ? { title: t("doneCancelTitle"), text: t("doneCancel", { plan: PLAN_NAME[curPlan] ?? ws.plan, date: end ?? "" }) }
    : doneKey === "resumed" ? { title: t("doneResumeTitle"), text: t("doneResume", { date: end ?? "" }) } : null;
  const keep = t("dlg.keep");
  /** The confirm dialog for moving the subscription to plan p, interval i. */
  const changeDialog = (p: PaidPlan, i: Interval, label: string, variant: "outline" | "default" = "outline") => {
    const up = isUpgrade(ws, p, i);
    const est = prorationEstimate(ws, p, i);
    return (
      <BillingDialog trigger={label} triggerVariant={variant} className="w-full" keep={keep}
        title={t("dlg.changeTitle", { plan: `${PLAN_NAME[p]} (${per(i)})` })}
        lines={[
          t("dlg.changeFrom", { from: `${PLAN_NAME[curPlan]} (${priceOf(curPlan, curInterval)})`, to: `${PLAN_NAME[p]} (${priceOf(p, i)})` }),
          up ? (est !== null && est > 0 ? t("dlg.chargeNow", { amount: eur(est, locale) }) : t("dlg.chargeNowNoAmount")) : (est !== null && est < 0 ? t("dlg.refund", { amount: eur(-est, locale) }) : t("dlg.refundNoAmount")),
          t("dlg.limitsNow"),
          ...(end ? [t("dlg.nextCharge", { date: end, price: priceOf(p, i) })] : []),
        ]}
        confirm={up ? t("dlg.payAndSwitch", { plan: PLAN_NAME[p] }) : t("dlg.switch", { plan: PLAN_NAME[p] })}
        pending={up ? t("dlg.paying") : t("dlg.working")}
        action={changePlan.bind(null, ws.id, p, i)} />
    );
  };

  return (
    <div>
      <ConsoleHead
        title={t("title")}
        lede={t("lede")}
      />

      <div className="mb-6 grid gap-3 empty:hidden">
        {sp.paid && (
          <Alert role="status" className="border-success/30">
            <CircleCheck className="text-success" />
            <AlertTitle>{t("paidTitle")}</AlertTitle>
            <AlertDescription>{t("paid")}</AlertDescription>
          </Alert>
        )}
        {done && (
          <Alert role="status" className="border-success/30">
            <CircleCheck className="text-success" />
            <AlertTitle>{done.title}</AlertTitle>
            <AlertDescription>{done.text}</AlertDescription>
          </Alert>
        )}
        {ws.planStatus === "past_due" && (
          <Alert variant="destructive" className="border-destructive/30">
            <AlertTriangle />
            <AlertTitle>{t("pastDueTitle")}</AlertTitle>
            <AlertDescription>{t("pastDue")}</AlertDescription>
          </Alert>
        )}
      </div>

      {paying && (
        <section aria-labelledby="sub-h" className="mb-10 grid gap-4 rounded-xl border bg-surface p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
          <div className="grid gap-1">
            <h2 id="sub-h" className="text-[13px] font-semibold text-muted-foreground">{t("sub.title")}</h2>
            <p className="text-[19px] font-semibold tracking-tight">{PLAN_NAME[curPlan]} · {per(curInterval)}
              <span className="ml-2 text-[14px] font-normal text-muted-foreground">{priceOf(curPlan, curInterval)} {t("sub.vat")}</span></p>
            <p className={cn("flex items-center gap-1.5 text-[14px]", cancelling ? "text-st-ack" : "text-muted-foreground")}>
              <CalendarClock className="size-4 shrink-0" aria-hidden />
              {cancelling ? t("sub.ends", { plan: PLAN_NAME[curPlan], date: end ?? "" }) : end ? t("sub.next", { date: end, price: priceOf(curPlan, curInterval) }) : t("sub.active")}
            </p>
          </div>
          {owner && (
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {cancelling
                ? <BillingDialog trigger={t("sub.resume")} triggerVariant="default" keep={keep} title={t("dlg.resumeTitle")}
                    lines={[t("dlg.resumeText", { plan: PLAN_NAME[curPlan], date: end ?? "", price: priceOf(curPlan, curInterval) })]}
                    confirm={t("sub.resume")} pending={t("dlg.working")} action={resumePlan.bind(null, ws.id)} />
                : <BillingDialog trigger={t("sub.cancel")} triggerVariant="ghost" tone="destructive" keep={t("dlg.keepPlan", { plan: PLAN_NAME[curPlan] })} title={t("dlg.cancelTitle")}
                    lines={[t("dlg.cancelText", { plan: PLAN_NAME[curPlan], date: end ?? "" }), t("dlg.cancelData")]}
                    confirm={t("sub.cancel")} pending={t("dlg.working")} action={cancelPlan.bind(null, ws.id)} />}
              <form action={openPortal.bind(null, ws.id)}><PendingSubmit variant="outline" pending={t("dlg.opening")}>{t("sub.invoices")}</PendingSubmit></form>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="usage-h" className="mb-10 grid gap-4">
        <h2 id="usage-h" className="text-[15px] font-semibold tracking-tight">{t("usageTitle")}</h2>
        <div className="grid gap-6 rounded-xl border bg-surface p-5 sm:grid-cols-3">
          <Meter label={t("emails")} used={usage.emails.used} limit={usage.emails.limit} locale={locale} />
          <Meter label={t("attachments")} used={usage.storage.used} limit={usage.storage.limit} format={bytes} locale={locale} />
          <Meter label={t("projects")} used={usage.projects.used} limit={usage.projects.limit} full={t("projectsFull")} locale={locale} />
          {usage.translations.limit > 0 && <Meter label={t("translations")} used={usage.translations.used} limit={usage.translations.limit} locale={locale} />}
        </div>
        <p className="text-[13px] text-muted-foreground">{t("usageNote")}</p>
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{t("plans")}</h2>
        <Segments label={t("billing")} items={[
            { href: "?i=year", label: t("yearly"), active: interval === "year" },
            { href: "?i=quarter", label: t("quarterly"), active: interval === "quarter" },
          ]} />
      </div>
      <Panel as="section" className="grid md:grid-cols-3 md:divide-x max-md:divide-y">
        {(["free", "pro", "studio"] as const).map((p) => {
          const current = ws.plan === p;
          const price = p === "free" ? null : PRICES[p][interval];
          return (
            <div key={p} aria-labelledby={`plan-${p}`} aria-current={current ? "true" : undefined}
              className={cn("relative flex flex-col gap-5 p-5 sm:p-6", current && "bg-brand-soft/40")}>
              {current && <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />}
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 id={`plan-${p}`} className="text-[16px] font-semibold tracking-tight">{PLAN_NAME[p]}</h2>
                  {current && <span className="text-[12.5px] font-semibold text-brand-text">{t("current")}</span>}
                </div>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-[30px] font-semibold tracking-[-0.04em] tabular-nums">{eur(price ?? 0, locale)}</span>
                  <span className="text-[13.5px] text-muted-foreground">{price === null ? t("forever") : interval === "year" ? t("perYear") : t("perQuarter")}</span>
                </p>
              </div>
              <ul className="grid flex-1 content-start gap-2 text-[14px]">
                {FEATURES(p, t, locale).map((f) => (
                  <li key={f} className="grid grid-cols-[16px_1fr] gap-2.5"><Check className="mt-0.5 size-4 text-brand-text" aria-hidden />{f}</li>
                ))}
              </ul>
              {!owner ? null
                : current
                  // The current plan in the other interval: switch how often you pay.
                  ? paying && !cancelling && p !== "free" && interval !== curInterval
                    ? changeDialog(p, interval, interval === "year" ? t("payYearly") : t("payQuarterly"))
                    : null
                  : p === "free"
                    ? paying
                      ? cancelling
                        ? <p className="text-[13.5px] text-muted-foreground">{t("freeFrom", { date: end ?? "" })}</p>
                        : <BillingDialog trigger={t("switchTo", { plan: "Free" })} className="w-full" tone="destructive" keep={t("dlg.keepPlan", { plan: PLAN_NAME[curPlan] })} title={t("dlg.cancelTitle")}
                            lines={[t("dlg.cancelText", { plan: PLAN_NAME[curPlan], date: end ?? "" }), t("dlg.cancelData")]}
                            confirm={t("sub.cancel")} pending={t("dlg.working")} action={cancelPlan.bind(null, ws.id)} />
                      : null
                    : paying
                      ? cancelling
                        ? <p className="text-[13.5px] text-muted-foreground">{t("resumeFirst")}</p>
                        : changeDialog(p, interval, t("switchTo", { plan: PLAN_NAME[p] }))
                      : <form action={startCheckout.bind(null, ws.id, p, interval)}><PendingSubmit className="w-full" disabled={!enabled} pending={t("dlg.opening")}>{t("switchTo", { plan: PLAN_NAME[p] })}</PendingSubmit></form>}
            </div>
          );
        })}
      </Panel>

      <div className="mt-6 grid gap-4">
        <p className="text-[14px] text-muted-foreground">{t("everyPlan")}{owner && paying ? t("changeHint") : ""}</p>
        {!owner && <p className="text-[14px] text-muted-foreground">{t("memberNote")}</p>}
        <p className="max-w-[68ch] border-t pt-4 text-[13px] text-muted-foreground">
          {t("vat")}
          {!enabled && t("notEnabled")}{devBilling() && t("simulated")}
        </p>
      </div>

      <section id="dpa" aria-labelledby="dpa-h" className="mt-12 grid scroll-mt-24 gap-4 rounded-xl border bg-surface p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-5 sm:p-6">
        <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand-text"><FileSignature className="size-5" /></span>
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="dpa-h" className="text-[15px] font-semibold tracking-tight">{t("dpa.title")}</h2>
            <Badge variant="outline" className="border-st-ack/50">{t("dpa.badge")}</Badge>
          </div>
          <p className="max-w-[68ch] text-[14px] text-muted-foreground">{t("dpa.text")}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button asChild variant="outline">
              <a href={`mailto:${LEGAL.email}?subject=${encodeURIComponent(`DPA – ${ws.name}`)}`}><Mail />{t("dpa.request")}</a>
            </Button>
            <Link href="/subprocessors" className="oz-link text-[14px]">{t("dpa.subprocessors")}</Link>
          </div>
          <p className="max-w-[68ch] text-[13px] text-muted-foreground">{t("dpa.kit")}</p>
        </div>
      </section>
    </div>
  );
}
