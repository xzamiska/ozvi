import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LOCALE_TAG, LOCALES, type Locale } from "@/i18n/locales";
import { DEMO_PATH, pageMeta } from "@/lib/seo";

/** Metadata of /demo and /<locale>/demo: the language is in the path, like the landing. */
export async function demoMetadata(locale: Locale): Promise<Metadata> {
  if (process.env.OZVI_MODE !== "cloud") return { title: "Demo – Ozvi" };
  const s = await getTranslations({ locale, namespace: "seo" });
  return pageMeta({ title: s("demoTitle"), description: s("demoDescription"), path: DEMO_PATH[locale], locale, languages: { ...Object.fromEntries(LOCALES.map((l) => [LOCALE_TAG[l], DEMO_PATH[l]])), "x-default": DEMO_PATH.sk } });
}

