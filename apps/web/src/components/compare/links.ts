import type { Locale } from "@/i18n/locales";
import { COMPARE_IDS, COMPARE_PATH, type CompareLocale } from "@/lib/compare";

/** Footer group of the landing: the comparison pages exist in Slovak and English only. */
const TITLE: Record<CompareLocale, string> = { sk: "Porovnania", en: "Compare" };
const LINK: Record<CompareLocale, Record<(typeof COMPARE_IDS)[number], string>> = {
  sk: { canny: "Ozvi vs Canny", featurebase: "Ozvi vs Featurebase", fider: "Alternatíva k Fideru" },
  en: { canny: "Ozvi vs Canny", featurebase: "Ozvi vs Featurebase", fider: "Fider alternative" },
};

export function compareLinks(locale: Locale): { title: string; items: { href: string; title: string }[] } | null {
  if (locale !== "sk" && locale !== "en") return null;
  return { title: TITLE[locale], items: COMPARE_IDS.map((id) => ({ href: COMPARE_PATH[id][locale], title: LINK[locale][id] })) };
}
