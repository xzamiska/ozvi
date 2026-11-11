import { PLAN_LIMITS, type PlanName } from "@ozvi/db";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Plug, Plus, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityLine, ago, bytes, Card, ConsoleHead, Meter, SectionHead, Stat } from "@/components/ozvi/console";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAccount } from "@/lib/account";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { activityActor, activityDetail, activityLabel, activityOf } from "@/lib/activity";
import { consoleWorkspace, statsFor, usageOf } from "@/lib/console";
import { projectOrigin } from "@/lib/email/url";
import { consoleTitle } from "@/lib/board-meta";

export const generateMetadata = consoleTitle("overview");

export const dynamic = "force-dynamic";

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; workspaceDeleted?: string }> }) {
  const { id } = await params;
  const { created, workspaceDeleted } = await searchParams;
  const tSet = await getTranslations("console.settings");
  const account = await getAccount();
  if (!account) redirect("/app/login");
  const ws = await consoleWorkspace(account.id, id);
  if (!ws) notFound();
  const cloud = process.env.OZVI_MODE === "cloud";
  const plan = ws.plan as PlanName;
  const owner = ws.role === "owner";
  const locale = await requestLocale();
  const c = await getTranslations("console");
  const t = await getTranslations("console.overview");
  const planLabel = c(`planName.${plan}`);

  const [stats, usage, recent] = await Promise.all([
    Promise.all(ws.projects.map((p) => statsFor(p.id))),
    cloud ? usageOf(ws) : null,
    activityOf(ws.id, { limit: 6 }),
  ]);
  const rows = ws.projects.map((p, i) => ({ p, s: stats[i]!, url: `${projectOrigin(p)}/${p.slug}` }));
  const fresh = created ? ws.projects.find((p) => p.slug === created) : undefined;
  const atLimit = ws.projects.length >= PLAN_LIMITS[plan].projects;
  const near = usage && [usage.emails, usage.storage].some((u) => Number.isFinite(u.limit) && u.used / u.limit >= 0.8);
  const unverified = ws.projects.filter((p) => p.customDomain && !p.customDomainVerifiedAt);

  return (
    <>
      <ConsoleHead
        title={ws.name}
        lede={cloud ? t("lede", { plan: planLabel, projects: t("projects", { count: ws.projects.length }) }) : t("ledeSelf")}
        actions={atLimit && cloud
          ? <Button asChild variant="outline"><Link href={`/app/w/${ws.id}/plan`}>{t("moreProjects")}</Link></Button>
          : <Button asChild><Link href={`/app/new?w=${ws.id}`}><Plus />{t("newProject")}</Link></Button>}
      />

      <div className="mb-8 grid gap-3 empty:hidden">
        {workspaceDeleted && (
          <p role="status" className="flex items-center gap-2 rounded-xl border bg-surface px-5 py-3 text-[14px] font-medium"><CheckCircle2 className="size-4 text-success" aria-hidden />{tSet("deleted")}</p>
        )}
        {fresh && (
          <div role="status" className="grid gap-4 rounded-xl border border-brand-line bg-brand-soft/50 px-5 py-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <CheckCircle2 className="hidden size-5 text-brand-text sm:block" aria-hidden />
            <div className="grid gap-0.5">
              <p className="text-[14.5px] font-semibold">{t("created", { name: fresh.name })}</p>
              <p className="text-[13.5px] text-muted-foreground">{t("createdNext")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><a href={`/app/open/${fresh.slug}?to=admin`}>{t("setUp")}</a></Button>
              <Button asChild size="sm" variant="outline"><a href={`/app/open/${fresh.slug}`}>{t("openBoard")}</a></Button>
            </div>
          </div>
        )}
        {!account.name && (
          <div className="grid gap-3 rounded-xl border bg-surface px-4 py-3 text-[13.5px] sm:flex sm:items-center sm:gap-4">
            <UserRound className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden />
            <span className="min-w-0 flex-1">{t("addName")}</span>
            <Button asChild size="sm" variant="outline" className="justify-self-start"><Link href="/app/account">{t("addNameCta")}</Link></Button>
          </div>
        )}
        {ws.planStatus === "past_due" && (
          <Alert variant="destructive" className="border-destructive/30">
            <AlertTriangle />
            <AlertTitle>{t("pastDueTitle")}</AlertTitle>
            <AlertDescription>
              {owner ? t.rich("pastDueOwner", { link: (chunks) => <Link href={`/app/w/${ws.id}/plan`} className="oz-link">{chunks}</Link> }) : t("pastDueMember")}
            </AlertDescription>
          </Alert>
        )}
        {near && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{t("nearTitle")}</AlertTitle>
            <AlertDescription>{t.rich("near", { link: (chunks) => <Link href={`/app/w/${ws.id}/plan`} className="oz-link">{chunks}</Link> })}</AlertDescription>
          </Alert>
        )}
        {unverified.map((p) => (
          <Alert key={p.id}>
            <AlertTriangle />
            <AlertTitle>{t("domainTitle", { domain: p.customDomain ?? "" })}</AlertTitle>
            <AlertDescription>{t.rich("domain", { board: p.name, link: (chunks) => <a href={`/app/open/${p.slug}?to=admin`} className="oz-link">{chunks}</a> })}</AlertDescription>
          </Alert>
        ))}
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="projects-h" className="min-w-0">
          <SectionHead id="projects-h" title={t("projectsHead")} />
          {rows.length === 0 ? (
            <div className="grid justify-items-start gap-3 rounded-xl border border-dashed bg-surface px-5 py-6">
              <p className="text-[14px] text-muted-foreground">{t("empty")}</p>
              <Button asChild size="sm"><Link href={`/app/new?w=${ws.id}`}><Plus />{t("createProject")}</Link></Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {rows.map(({ p, s, url }) => (
                <article key={p.id} aria-labelledby={`p-${p.id}`} className="overflow-hidden rounded-xl border bg-surface">
                  <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg border bg-wash text-[14px] font-semibold">{p.name.charAt(0).toUpperCase()}</span>
                      <div className="min-w-0">
                        <h3 id={`p-${p.id}`} className="truncate text-[15px] font-semibold tracking-tight">{p.name}</h3>
                        <a href={url} className="inline-flex max-w-full items-center gap-1 font-mono text-[12px] text-muted-foreground hover:text-foreground">
                          <span className="truncate">{url.replace(/^https?:\/\//, "")}</span><ArrowUpRight className="size-3 shrink-0" aria-hidden />
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline"><a href={`/app/open/${p.slug}?to=admin`}><Settings />{t("settings")}</a></Button>
                      <Button asChild size="sm"><a href={`/app/open/${p.slug}`}>{t("openBoard")}</a></Button>
                    </div>
                  </header>
                  <div className="grid grid-cols-2 border-t sm:grid-cols-4 [&>*]:border-line max-sm:[&>*:nth-child(n+3)]:border-t sm:[&>*+*]:border-l max-sm:[&>*:nth-child(2n)]:border-l">
                    <Stat label={t("newBugs")} value={s.newBugs} tone="attention" href={`/app/open/${p.slug}?to=bugs`} locale={locale} />
                    <Stat label={t("ideasToDecide")} value={s.waitingIdeas} tone="attention" href={`/app/open/${p.slug}`} locale={locale} />
                    <Stat label={t("commentsWeek")} value={s.commentsWeek} locale={locale} />
                    <Stat label={t("users")} value={s.appUsers} locale={locale} />
                  </div>
                  {s.appUsers === 0 ? (
                    <p className="flex items-start gap-2 border-t bg-wash px-5 py-3 text-[13px]">
                      <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>{t.rich("noUsers", { link: (chunks) => <a href={`/app/open/${p.slug}?to=admin`} className="oz-link">{chunks}</a> })}</span>
                    </p>
                  ) : s.lastActivity && (
                    <p className="border-t px-5 py-2.5 text-[12.5px] text-muted-foreground">{t("lastActivity", { when: ago(s.lastActivity, locale) })}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="grid content-start gap-4">
          {usage ? (
            <Card title={t("planCard", { plan: planLabel })} action={<Link href={`/app/w/${ws.id}/plan`} className="text-[13px] font-medium text-brand-text hover:underline">{plan === "free" && owner ? t("upgrade") : t("detail")}</Link>}>
              <Meter label={t("emailsMonth")} used={usage.emails.used} limit={usage.emails.limit} locale={locale} />
              <Meter label={t("attachments")} used={usage.storage.used} limit={usage.storage.limit} format={bytes} locale={locale} />
              <Meter label={t("projectsMeter")} used={usage.projects.used} limit={usage.projects.limit} full={t("projectsFull")} locale={locale} />
          {usage.translations.limit > 0 && <Meter label={t("translations")} used={usage.translations.used} limit={usage.translations.limit} locale={locale} />}
            </Card>
          ) : null}
          <Card title={t("recent")} action={<Link href={`/app/w/${ws.id}/activity`} className="text-[13px] font-medium text-brand-text hover:underline">{t("all")}</Link>}>
            {recent.length === 0 ? <p className="text-[13.5px] text-muted-foreground">{t("noActivity")}</p> : (
              <ol className="grid gap-3.5">
                {recent.map(({ a, project }) => (
                  <li key={a.id}><ActivityLine label={activityLabel(a.action, locale)} detail={activityDetail(a.action, a.detail, locale)} actor={activityActor(a.actor, locale)} project={project} when={ago(a.createdAt, locale)} /></li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
