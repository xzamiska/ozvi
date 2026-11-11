import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LOCALES, type Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { LANDING_PATH as PATH, landingJsonLd, pageMeta } from "@/lib/seo";
import { Landing } from "./Landing";

/** Per-locale metadata with hreflang alternates, so search engines pair the landings of every language. */
export async function landingMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "landing" });
  return pageMeta({
    title: t("meta.title"), description: t("meta.description"), path: PATH[locale], locale,
    languages: { ...Object.fromEntries(LOCALES.map((l) => [l, PATH[l]])), "x-default": PATH.sk },
  });
}

/** /cs, /en, /pl, /hu, /de: the landing exists only in the cloud; a self-hosted instance goes to its board. */
export async function LandingPage({ locale }: { locale: Locale }) {
  if (process.env.OZVI_MODE !== "cloud") redirect("/");
  const t = await getTranslations({ locale, namespace: "landing" });
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: landingJsonLd(locale, t("meta.description")) }} />
      <Landing locale={locale} signedIn={!!(await getAccount())} />
    </>
  );
}
