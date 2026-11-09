import { parseTheme, presets, toCss } from "@ozvi/theme";
import { FileWarning, Languages } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTranslations } from "next-intl/server";
import { requestLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";
import { OzviLogo } from "./ozvi/Logo";

const theme = parseTheme(presets.ozvi);

/**
 * Frame for the cloud's legal pages: Ozvi's own theme, read mode, a draft notice until reviewed.
 * The texts exist only in Slovak; other locales get a one-line note that the Slovak version binds.
 */
export async function LegalShell({ title, toc = [], children }: { title: string; toc?: { id: string; label: string }[]; children: React.ReactNode }) {
  const locale = await requestLocale();
  const tAccount = await getTranslations({ locale, namespace: "account" });
  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col" lang="sk">
        <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          {/* Wraps instead of scrolling sideways at 320 px (WCAG 1.4.10). */}
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 md:min-h-16">
            <Link href="/" aria-label="Ozvi – úvod"><OzviLogo /></Link>
            <nav aria-label="Právne dokumenty" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] font-medium">
              <Link href="/terms" className="text-muted-foreground hover:text-foreground">Podmienky</Link>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground">Súkromie</Link>
              <Link href="/subprocessors" className="text-muted-foreground hover:text-foreground">Subdodávatelia</Link>
              <Link href="/accessibility" className="text-muted-foreground hover:text-foreground">Prístupnosť</Link>
            </nav>
          </div>
        </header>

        <div className="oz-frame flex-1 pt-10 pb-20 md:pt-14">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,68ch)_220px] lg:justify-between">
            <main id="main" tabIndex={-1} className="min-w-0">
              {locale !== "sk" && (
                <p role="note" lang={locale} className="mb-6 flex items-start gap-2 rounded-lg border bg-wash px-3.5 py-2.5 text-[14px]">
                  <Languages className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{tAccount("legalNote")}
                </p>
              )}
              <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[36px]">{title}</h1>
              <p className="mt-2 text-[14px] text-muted-foreground">Účinné od {LEGAL.effective} · verzia {LEGAL.version}</p>
              {LEGAL.draft && (
                <Alert role="note" className="mt-6 border-st-ack/40">
                  <FileWarning className="text-st-ack" />
                  <AlertTitle>Návrh</AlertTitle>
                  <AlertDescription>Text ešte nekontroloval právnik a môže sa pred spustením zmeniť.</AlertDescription>
                </Alert>
              )}
              <article
                className="mt-8 max-w-[68ch] text-[16px] leading-[1.7] text-foreground
                  [&_a]:text-brand-text [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[0.2em] [&_a:hover]:decoration-2
                  [&_b]:font-semibold
                  [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:font-heading [&_h2]:text-[20px] [&_h2]:leading-snug [&_h2]:font-bold [&_h2]:tracking-tight
                  [&_li]:pl-1 [&_li+li]:mt-2 [&_p+p]:mt-4 [&_p+ul]:mt-3
                  [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-line-strong [&_ul+p]:mt-4"
              >
                {children}
              </article>
            </main>
            {toc.length > 0 && (
              <nav aria-label="Obsah" className="max-lg:hidden">
                <div className="lg:sticky lg:top-24">
                  <h2 className="mb-2 text-[13px] font-semibold text-muted-foreground">Obsah</h2>
                  <ol className="grid gap-0.5 border-l text-[13.5px]">
                    {toc.map((t, i) => (
                      <li key={t.id}>
                        <a href={`#${t.id}`} className="-ml-px grid grid-cols-[1.75rem_1fr] border-l border-transparent py-1 pl-3 leading-snug text-muted-foreground hover:border-foreground hover:text-foreground">
                          <span className="tabular-nums">{i + 1}.</span>{t.label}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
