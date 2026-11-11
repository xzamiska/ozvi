import type { CompareLocale } from "@/lib/compare";

/**
 * Copy of a comparison page. Competitor facts come only from the market research of November 2026
 * (reports in the owner's research folder); Ozvi's own from plans.ts and the landing. Kept in TS, not
 * in messages/*.json: these pages exist in Slovak and English only and change on their own schedule.
 */

/** A table cell. The mark is a second channel next to the words, never the only one (DESIGN.md). */
export type Mark = "yes" | "no" | "partial";
export interface Cell { text: string; mark?: Mark }

export interface CompareRow { label: string; ozvi: Cell; them: Cell }

export interface CompareContent {
  meta: { title: string; description: string };
  /** The other product's name as written in the table head. */
  them: string;
  h1: string;
  /** The short answer under the title: who should pick what, in two or three sentences. */
  answer: string[];
  table: { caption: string; rows: CompareRow[]; note?: string };
  /** Where the other product is the better choice. Be fair. */
  pickThem: { title: string; items: string[] };
  pickOzvi: { title: string; items: string[] };
  migrate: { title: string; text: string; steps: string[] };
  faq: { q: string; a: string }[];
  /** Where the competitor facts come from (their own pages, as the research cited them). */
  sources: { label: string; href: string }[];
}

/** Prices from plans.ts, formatted for the page's language. */
export interface Facts { pro: string; proQuarter: string; studio: string; studioQuarter: string }

export type ContentFn = (facts: Facts) => CompareContent;
export type PageContent = Record<CompareLocale, ContentFn>;

/** Shared words of the comparison frame. */
export const UI: Record<CompareLocale, {
  kicker: string; asOf: string; feature: string; marks: Record<Mark, string>;
  start: string; console: string; demo: string; soon: string; faq: string; sources: string; compare: string;
  home: string; otherLang: string; otherLangName: string; footerNote: string; pricing: string; docs: string;
}> = {
  sk: {
    kicker: "Porovnanie", asOf: "Údaje o konkurencii k novembru 2026", feature: "Funkcia",
    marks: { yes: "áno", no: "nie", partial: "čiastočne" },
    start: "Začať zadarmo", console: "Otvoriť konzolu", demo: "Vyskúšať demo", soon: "Spúšťame čoskoro",
    faq: "Časté otázky", sources: "Zdroje údajov o konkurencii", compare: "Ďalšie porovnania",
    home: "Ozvi – úvod", otherLang: "English", otherLangName: "Read in English", footerNote: "Verejný zdrojový kód (FSL). SDK a widget pod MIT.",
    pricing: "Ceny", docs: "Dokumentácia API",
  },
  en: {
    kicker: "Comparison", asOf: "Competitor details as of November 2026", feature: "Feature",
    marks: { yes: "yes", no: "no", partial: "partly" },
    start: "Start for free", console: "Open console", demo: "Try the demo", soon: "Launching soon",
    faq: "Frequently asked questions", sources: "Sources for competitor details", compare: "More comparisons",
    home: "Ozvi – home", otherLang: "Slovensky", otherLangName: "Čítať po slovensky", footerNote: "Source-available (FSL). SDK and widget under MIT.",
    pricing: "Pricing", docs: "API docs",
  },
};
