import { PLAN_LIMITS } from "@ozvi/db";
import { fontsHref, toCss } from "@ozvi/theme";
import { LayoutGrid, Settings } from "lucide-react";
import Link from "next/link";
import { AccountMenu } from "@/components/ozvi/AccountMenu";
import { BoardNav, HeaderLogin } from "@/components/ozvi/BoardNav";
import { Button } from "@/components/ui/button";
import { hasConsole } from "@/lib/account";
import { publicUrl } from "@/lib/email/url";
import { LocaleSwitcher } from "@/components/ozvi/LocaleSwitcher";
import { boardLocales } from "@/i18n/board";
import { getTranslations } from "next-intl/server";
import { getCtx, loginHref } from "@/lib/project";
import { withProject } from "@ozvi/db";
import { db } from "@/lib/db";
import { countItems } from "@/lib/queries";
import { unansweredWhere } from "@/lib/unanswered";

/** Every board page is titled "<page> – <project>" (WCAG 2.4.2); the board never shows Ozvi's name. */
export async function generateMetadata({ params }: { params: Promise<{ project: string }> }) {
  const { project } = await getCtx((await params).project);
  return { title: { template: `%s – ${project.name}`, default: project.name } };
}

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ project: string }> }) {
  const { project: slug } = await params;
  const { project, theme, user, plan, locale, isTeam } = await getCtx(slug);
  const t = await getTranslations({ locale, namespace: "board.shell" });
  const tA11y = await getTranslations({ locale, namespace: "a11y" });
  const { allowed } = boardLocales(project);
  const fonts = fontsHref(theme, { skipBundled: true });
  const login = loginHref(project, `/${slug}/ideas`);
  // People who came from the Ozvi console get a way back to it (the board may live on another domain).
  // Team: the "Bez odpovede" tab with how many reports wait longer than the project's N days.
  const unanswered = isTeam ? await withProject(db, project.id, (tx) => countItems(tx, [unansweredWhere(project.unansweredDays)])).catch(() => 0) : null;
  const consoleHref = user && user.role !== "member" && (await hasConsole(user.email, project.workspaceId)) ? `${publicUrl()}/app` : null;

  return (
    <>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="oz-frame grid grid-cols-[1fr_auto] items-stretch gap-x-6 md:grid-cols-[auto_1fr_auto]">
            <Link href={`/${slug}/ideas`} className="flex h-14 min-w-0 items-center gap-2.5 md:h-16">
              {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="h-7 w-auto max-w-[140px] object-contain" /> : null}
              <span className="truncate font-heading text-[17px] font-bold tracking-tight">{project.name}</span>
            </Link>
            <BoardNav slug={slug} unanswered={unanswered} className="col-span-2 row-start-2 h-11 md:col-span-1 md:col-start-2 md:row-start-1 md:h-16" />
            <div className="col-start-2 row-start-1 flex items-center justify-end gap-1.5 md:col-start-3">
              {user ? (
                <>
                  {consoleHref && (
                    <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                      <a href={consoleHref} title={t("backToConsole")}><LayoutGrid /><span className="max-sm:sr-only">{t("myProjects")}</span></a>
                    </Button>
                  )}
                  {user.role === "admin" && (
                    <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                      <Link href={`/${slug}/admin`} aria-label={t("settings")} title={t("settings")}><Settings /></Link>
                    </Button>
                  )}
                  <AccountMenu slug={slug} name={user.name} email={user.email} avatarUrl={user.avatarUrl} role={user.role} consoleHref={consoleHref} />
                </>
              ) : login ? (
                <HeaderLogin slug={slug} href={login} />
              ) : null}
            </div>
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="oz-frame grid justify-items-center gap-3 py-8 text-center text-xs text-muted-foreground">
          {allowed.length > 1 && <LocaleSwitcher locales={allowed} label={t("language")} />}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            {/* Absolute: on a custom domain every path belongs to the board. */}
            <a href={`${publicUrl()}/accessibility`} className="inline-flex min-h-6 items-center hover:text-foreground">{tA11y("link")}</a>
            {PLAN_LIMITS[plan].badge && (
              <a href="https://ozvi.io/?ref=badge" target="_blank" rel="noopener" className="inline-flex min-h-6 items-center hover:text-foreground">{t("badge")} <b className="ml-1 font-semibold">Ozvi</b></a>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}
