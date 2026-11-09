import { parseTheme, presets, toCss } from "@ozvi/theme";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { OzviLogo } from "@/components/ozvi/Logo";
import { requestLocale } from "@/i18n/server";
import { LEGAL } from "@/lib/legal";

// The locale and OZVI_MODE are read per request (same image for self-host and cloud).
export const dynamic = "force-dynamic";

/** Date of the last audit (docs/ACCESSIBILITY.md). Update both together. */
const AUDITED = new Date("2026-11-08");

const theme = parseTheme(presets.ozvi);

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await requestLocale(), namespace: "a11y.page" });
  return { title: t("meta") };
}

/** Public accessibility statement (EAA / EN 301 549). Short and honest; the full report is docs/ACCESSIBILITY.md. */
export default async function Accessibility() {
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "a11y.page" });
  const tAccount = await getTranslations({ locale, namespace: "account.layout" });
  const cloud = process.env.OZVI_MODE === "cloud";
  const date = AUDITED.toLocaleDateString(locale === "en" ? "en-GB" : `${locale}-${locale.toUpperCase()}`, { day: "numeric", month: "long", year: "numeric" });
  const list = (k: "scope" | "limits") => t.raw(k) as string[];

  return (
    <>
      <style>{toCss(theme)}</style>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b bg-surface">
          <div className="oz-frame flex h-14 items-center justify-between gap-4 md:h-16">
            <Link href={cloud && locale !== "sk" ? `/${locale}` : "/"} aria-label={tAccount("home")}><OzviLogo /></Link>
            {cloud && (
              <nav aria-label={tAccount("legal")} className="flex items-center gap-4 text-[13.5px] font-medium">
                <Link href="/terms" className="text-muted-foreground hover:text-foreground">{tAccount("terms")}</Link>
                <Link href="/privacy" className="text-muted-foreground hover:text-foreground">{tAccount("privacy")}</Link>
              </nav>
            )}
          </div>
        </header>
        <main id="main" tabIndex={-1} className="oz-frame flex-1 pt-10 pb-20 md:pt-14">
          <article className="max-w-[68ch] text-[16px] leading-[1.7]
            [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:text-[20px] [&_h2]:leading-snug [&_h2]:font-bold [&_h2]:tracking-tight
            [&_li+li]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground [&_p+p]:mt-4 [&_ul+p]:mt-4
            [&_a]:text-brand-text [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[0.2em]">
            <h1 className="font-heading text-[30px] leading-tight font-bold tracking-tight md:text-[36px]">{t("title")}</h1>
            <p className="mt-3 text-[17px] text-muted-foreground">{t("lede")}</p>

            <h2>{t("statusTitle")}</h2>
            <p>{t("status")}</p>

            <h2>{t("scopeTitle")}</h2>
            <ul>{list("scope").map((s) => <li key={s}>{s}</li>)}</ul>
            <p>{t("themeNote")}</p>

            <h2>{t("limitsTitle")}</h2>
            <ul>{list("limits").map((s) => <li key={s}>{s}</li>)}</ul>

            <h2>{t("testedTitle")}</h2>
            <p>{t("tested", { date })}</p>
            <p>{t("reportNote")}</p>

            <h2>{t("feedbackTitle")}</h2>
            <p>{cloud ? t("feedback", { email: LEGAL.email }) : t("feedbackSelf")}</p>

            <h2>{t("enforcementTitle")}</h2>
            <p>{t("enforcement")}</p>

            <p className="mt-10 border-t pt-4 text-[14px] text-muted-foreground">{t("updated", { date })}</p>
          </article>
        </main>
      </div>
    </>
  );
}
