import { parseTheme, presets, toCss } from "@ozvi/theme";
import { Languages } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { cn } from "@/lib/utils";
import { OzviLogo } from "../ozvi/Logo";

const theme = parseTheme(presets.ozvi);

const PROSE = `mt-10 max-w-[80ch] text-[15.5px] leading-[1.7]
  [&_h2]:mt-16 [&_h2]:mb-4 [&_h2]:scroll-mt-24 [&_h2]:border-t [&_h2]:pt-10 [&_h2]:font-heading [&_h2]:text-[24px] [&_h2]:leading-tight [&_h2]:font-bold [&_h2]:tracking-tight
  [&_h2:first-child]:mt-0 [&_h2:first-child]:border-t-0 [&_h2:first-child]:pt-0
  [&_h3]:mt-10 [&_h3]:mb-3 [&_h3]:scroll-mt-24 [&_h3]:text-[17.5px] [&_h3]:font-semibold [&_h3]:tracking-tight
  [&_h4]:mt-6 [&_h4]:mb-2 [&_h4]:text-[15px] [&_h4]:font-semibold
  [&_p+p]:mt-4 [&_p+ul]:mt-3 [&_ul+p]:mt-4 [&_ol+p]:mt-4 [&_p+ol]:mt-3
  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-line-strong [&_ol]:list-decimal [&_ol]:pl-5 [&_li+li]:mt-1.5
  [&_a]:text-brand-text [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[0.2em] [&_a:hover]:decoration-2
  [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-px [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.86em] [&_:not(pre)>code]:break-words
  [&_strong]:font-semibold`;

export type DocsPage = "widget" | "api" | "webhooks" | "automation";
export interface TocEntry { id: string; label: string; sub?: boolean }

/**
 * Frame for the developer docs (/docs/*): Ozvi's own theme, a reading column and a sticky table of
 * contents. The docs are written in English (like the API itself); other locales get a one-line note.
 */
export async function DocsShell({ page, title, lede, toc, children }: {
  page: DocsPage; title: string; lede: React.ReactNode; toc: TocEntry[]; children: React.ReactNode;
}) {
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "docs" });
  // The docs are English end to end, their chrome too; only the note says so in the reader's language.
  const en = await getTranslations({ locale: "en", namespace: "docs" });
  const pages: DocsPage[] = ["widget", "api", "webhooks", "automation"];
  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col bg-background">
        <header lang="en" className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 md:min-h-16">
            <div className="flex items-center gap-3">
              <Link href="/" aria-label={en("home")}><OzviLogo /></Link>
              <span aria-hidden className="h-5 w-px bg-line" />
              <span className="font-mono text-[12.5px] text-muted-foreground">docs</span>
            </div>
            <nav aria-label={en("navLabel")} className="flex flex-wrap items-center gap-x-1 text-[14px] font-medium">
              {pages.map((p) => (
                <Link key={p} href={`/docs/${p}`} aria-current={p === page ? "page" : undefined}
                  className={cn("inline-flex min-h-9 items-center rounded-md px-2.5 text-muted-foreground hover:bg-wash hover:text-foreground",
                    p === page && "bg-wash font-semibold text-foreground")}>
                  {en(p)}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <div className="oz-frame flex-1 pt-10 pb-24 md:pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-14">
            <main id="main" tabIndex={-1} className="min-w-0" lang="en">
              {locale !== "en" && (
                <p role="note" lang={locale} className="mb-6 flex items-start gap-2 rounded-lg border bg-wash px-3.5 py-2.5 text-[14px]">
                  <Languages className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{t("englishNote")}
                </p>
              )}
              <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[38px]">{title}</h1>
              <div className="mt-3 max-w-[68ch] text-[16.5px] leading-relaxed text-muted-foreground">{lede}</div>
              <article className={PROSE}>{children}</article>
            </main>
            <nav lang="en" aria-label={en("toc")} className="max-lg:hidden">
              <div className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto">
                <h2 className="mb-2 text-[13px] font-semibold text-muted-foreground">{en("toc")}</h2>
                <ol className="grid border-l text-[13.5px]" lang="en">
                  {toc.map((e) => (
                    <li key={e.id}>
                      <a href={`#${e.id}`} className={cn("-ml-px block border-l border-transparent py-1 leading-snug text-muted-foreground hover:border-foreground hover:text-foreground",
                        e.sub ? "pl-6 text-[13px]" : "pl-3")}>
                        {e.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </>
  );
}
