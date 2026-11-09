import { parseTheme, presets, toCss } from "@ozvi/theme";
import { FileWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { OzviLogo } from "@/components/ozvi/Logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LOCALE_TAG } from "@/i18n/locales";
import { requestLocale } from "@/i18n/server";
import { cloudOnly, LEGAL } from "@/lib/legal";

// OZVI_MODE and the locale are read per request (the same image runs self-host and cloud).
export const dynamic = "force-dynamic";

/** Date the list last changed. Update together with the messages (subprocessors.items) and docs/DPA.md. */
const CHANGED = new Date("2026-11-08");

const theme = parseTheme(presets.ozvi);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await requestLocale(), namespace: "subprocessors" });
  return { title: t("meta") };
}

interface Entry { name: string; entity: string; purpose: string; data: string; location: string; transfer: string; when: string; note?: string }
const FIELDS = ["purpose", "data", "location", "transfer", "when"] as const;

/** Text from the messages; "TODO: …" marks what the operator hasn't confirmed yet (never guessed). */
function Value({ text, pending }: { text: string; pending: string }) {
  const m = /^TODO:\s*(.*)$/s.exec(text);
  if (!m) return <>{text}</>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="rounded-sm border border-st-ack/40 bg-st-ack/10 px-1.5 py-px text-[12px] font-semibold whitespace-nowrap text-foreground">{pending}</span>
      <span className="text-muted-foreground">{m[1]}</span>
    </span>
  );
}

/** Public list of the cloud's sub-processors (GDPR art. 28(2) and (4)); linked from /privacy, /terms and the footer. */
export default async function Subprocessors() {
  // A self-hosted instance has its own operator and its own processors.
  if (!cloudOnly()) notFound();
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "subprocessors" });
  const tAccount = await getTranslations({ locale, namespace: "account.layout" });
  const tA11y = await getTranslations({ locale, namespace: "a11y" });
  const items = t.raw("items") as Entry[];
  const not = t.raw("not") as string[];
  const pending = t("pending");
  const date = CHANGED.toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b bg-surface">
          {/* Wraps instead of scrolling sideways at 320 px (WCAG 1.4.10). */}
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 md:min-h-16">
            <Link href={locale !== "sk" ? `/${locale}` : "/"} aria-label={tAccount("home")}><OzviLogo /></Link>
            <nav aria-label={tAccount("legal")} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] font-medium">
              <Link href="/terms" className="text-muted-foreground hover:text-foreground">{tAccount("terms")}</Link>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground">{tAccount("privacy")}</Link>
              <Link href="/accessibility" className="text-muted-foreground hover:text-foreground">{tA11y("link")}</Link>
            </nav>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="oz-frame flex-1 pt-10 pb-20 md:pt-14">
          <div className="max-w-[80ch]">
            <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[36px]">{t("title")}</h1>
            <p className="mt-3 max-w-[68ch] text-[17px] leading-[1.6] text-muted-foreground">{t("lede")}</p>
            {LEGAL.draft && (
              <Alert role="note" className="mt-6 max-w-[68ch] border-st-ack/40">
                <FileWarning className="text-st-ack" />
                <AlertTitle>{t("draftTitle")}</AlertTitle>
                <AlertDescription>{t("draftText")}</AlertDescription>
              </Alert>
            )}

            <h2 id="list" className="sr-only">{t("listTitle")}</h2>
            <ul aria-labelledby="list" className="mt-10 grid gap-4">
              {items.map((e) => (
                <li key={e.name} id={e.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "")}
                  className="scroll-mt-24 rounded-xl border bg-surface p-5 sm:p-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <h3 className="font-heading text-[18px] font-bold tracking-tight">{e.name}</h3>
                    <p className="text-[13.5px] text-muted-foreground"><Value text={e.entity} pending={pending} /></p>
                  </div>
                  <dl className="mt-4 grid gap-x-6 gap-y-3 text-[14.5px] leading-[1.55] sm:grid-cols-[11rem_minmax(0,1fr)]">
                    {FIELDS.map((f) => (
                      <div key={f} className="contents">
                        <dt className="text-[13px] font-semibold text-muted-foreground sm:pt-px">{t(`fields.${f}`)}</dt>
                        <dd className="max-sm:-mt-2"><Value text={e[f]} pending={pending} /></dd>
                      </div>
                    ))}
                  </dl>
                  {e.note && <p className="mt-4 border-t pt-3 text-[13.5px]"><Value text={e.note} pending={pending} /></p>}
                </li>
              ))}
            </ul>

            <article className="mt-12 max-w-[68ch] text-[16px] leading-[1.7]
              [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-[20px] [&_h2]:leading-snug [&_h2]:font-bold [&_h2]:tracking-tight
              [&_li+li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground [&_p+p]:mt-4
              [&_a]:text-brand-text [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[0.2em]">
              <h2 id="not">{t("notTitle")}</h2>
              <ul>{not.map((s) => <li key={s}>{s}</li>)}</ul>

              <h2 id="changes">{t("changesTitle")}</h2>
              <p>{t.rich("changes", { link: (c) => <Link href="/privacy#cast-7">{c}</Link> })}</p>
              <p>{t("contact", { email: LEGAL.email })}</p>

              <p className="mt-10 border-t pt-4 text-[14px] text-muted-foreground">{t("updated", { date })}</p>
            </article>
          </div>
        </main>
      </div>
    </>
  );
}
