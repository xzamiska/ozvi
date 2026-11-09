import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LOCALES, type Locale } from "@/i18n/locales";
import { getTranslations } from "next-intl/server";
import { getAccount } from "@/lib/account";
import { Landing } from "./Landing";

const PATH: Record<Locale, string> = { sk: "/", cs: "/cs", en: "/en", pl: "/pl", hu: "/hu", de: "/de" };

/** Per-locale metadata with hreflang alternates, so search engines pair the landings of every language. */
export async function landingMetadata(locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "landing" });
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: { canonical: PATH[locale], languages: { ...Object.fromEntries(LOCALES.map((l) => [l, PATH[l]])), "x-default": PATH.sk } },
    openGraph: { title: t("meta.title"), description: t("meta.description"), type: "website", locale: locale },
  };
}

/** /cs, /en, /pl, /hu, /de: the landing exists only in the cloud; a self-hosted instance goes to its board. */
export async function LandingPage({ locale }: { locale: Locale }) {
  if (process.env.OZVI_MODE !== "cloud") redirect("/");
  return <Landing locale={locale} signedIn={!!(await getAccount())} />;
}
