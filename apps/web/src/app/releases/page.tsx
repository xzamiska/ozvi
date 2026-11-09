import { parseTheme, presets, toCss } from "@ozvi/theme";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OzviLogo } from "@/components/ozvi/Logo";
import { LOCALE_TAG } from "@/i18n/locales";
import { requestLocale } from "@/i18n/server";
import { cloudOnly } from "@/lib/legal";
import { renderMarkdown } from "@/lib/markdown";
import { releaseAnchor, releaseNotes } from "@/lib/releases";

export const dynamic = "force-dynamic";

const theme = parseTheme(presets.ozvi);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await requestLocale(), namespace: "releases" });
  return { title: t("meta"), alternates: { types: { "application/json": "/releases.json" } } };
}

/** Ozvi's own release notes (apps/web/releases/*.md), newest first. Cloud (ozvi.io) only. */
export default async function Releases() {
  if (!cloudOnly()) notFound();
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "releases" });
  const tAccount = await getTranslations({ locale, namespace: "account.layout" });
  const notes = await releaseNotes();
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b bg-surface">
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 md:min-h-16">
            <Link href={locale !== "sk" ? `/${locale}` : "/"} aria-label={tAccount("home")}><OzviLogo /></Link>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="oz-frame flex-1 pt-10 pb-20 md:pt-14">
          <div className="max-w-[72ch]">
            <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[36px]">{t("title")}</h1>
            <p className="mt-3 text-[17px] leading-[1.6] text-muted-foreground">{t("lede")}</p>
            {locale !== "sk" && <p className="mt-2 text-[14px] text-muted-foreground">{t("slovakOnly")}</p>}

            {notes.length === 0 ? (
              <p className="mt-12 rounded-xl border bg-surface p-6 text-muted-foreground">{t("empty")}</p>
            ) : (
              <ol className="mt-12 grid gap-12">
                {notes.map((n) => (
                  <li key={n.version} id={releaseAnchor(n.version)} className="scroll-mt-24 border-t pt-6">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="font-heading text-[22px] font-bold tracking-tight"><span data-num>{n.version}</span></h2>
                      {n.date && <time dateTime={n.date} className="text-[14px] text-muted-foreground">{fmt(n.date)}</time>}
                      {n.breaking && (
                        <span className="rounded-sm border border-st-ack/40 bg-st-ack/10 px-1.5 py-px text-[12px] font-semibold text-foreground">{t("breaking")}</span>
                      )}
                    </div>
                    {n.breaking && <p className="mt-2 text-[14px] text-muted-foreground">{t("breakingText")}</p>}
                    <div lang="sk" className="oz-md mt-4 text-[16px] leading-[1.7]" dangerouslySetInnerHTML={{ __html: renderMarkdown(n.body, { headings: true }) }} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
