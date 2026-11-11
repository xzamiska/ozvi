import type { Metadata } from "next";
import { LOCALES, type Locale } from "@/i18n/locales";
import { PRICES } from "@ozvi/db";
import { publicUrl } from "./email/url";

/**
 * Search and share metadata for Ozvi's own public pages (cloud). Boards are never indexed (ADR-0010) and
 * set their own metadata. Absolute URLs come from metadataBase (root layout = PUBLIC_URL).
 */

export const LANDING_PATH: Record<Locale, string> = { sk: "/", cs: "/cs", en: "/en", pl: "/pl", hu: "/hu", de: "/de" };
const OG_LOCALE: Record<Locale, string> = { sk: "sk_SK", cs: "cs_CZ", en: "en_US", pl: "pl_PL", hu: "hu_HU", de: "de_DE" };
export const GITHUB_REPO = "https://github.com/xzamiska/ozvi";

/** Share image per language (public/og, 1200×630). */
export const ogImage = (locale: Locale) => ({ url: `/og/ozvi-${locale}.png`, width: 1200, height: 630, alt: "Ozvi" });

export function pageMeta(o: { title: string; description: string; path: string; locale?: Locale; languages?: Record<string, string> }): Metadata {
  const locale = o.locale ?? "sk";
  const image = ogImage(locale);
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path, ...(o.languages && { languages: o.languages }) },
    openGraph: {
      title: o.title, description: o.description, url: o.path, siteName: "Ozvi", type: "website",
      locale: OG_LOCALE[locale], alternateLocale: o.languages ? LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]) : undefined,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: o.title, description: o.description, images: [image.url] },
  };
}

/** schema.org for the landing: who makes Ozvi and what it costs (prices from plans.ts, EUR, without VAT). */
export function landingJsonLd(locale: Locale, description: string): string {
  const base = publicUrl();
  const offer = (name: string, cents: number, unit: string) => ({
    "@type": "Offer", name, price: (cents / 100).toFixed(2), priceCurrency: "EUR",
    priceSpecification: { "@type": "UnitPriceSpecification", price: (cents / 100).toFixed(2), priceCurrency: "EUR", unitCode: unit, valueAddedTaxIncluded: false },
  });
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}/#org`, name: "Ozvi", url: `${base}/`, logo: `${base}/email/ozvi-logo.png`, sameAs: [GITHUB_REPO] },
      { "@type": "WebSite", "@id": `${base}/#site`, name: "Ozvi", url: `${base}/`, inLanguage: locale, publisher: { "@id": `${base}/#org` } },
      {
        "@type": "SoftwareApplication", name: "Ozvi", url: `${base}${LANDING_PATH[locale]}`, description,
        applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: [...LOCALES],
        publisher: { "@id": `${base}/#org` }, image: `${base}/og/ozvi-${locale}.png`,
        offers: [
          offer("Free", 0, "ANN"),
          offer("Pro (yearly)", PRICES.pro.year, "ANN"), offer("Pro (quarterly)", PRICES.pro.quarter, "QAN"),
          offer("Studio (yearly)", PRICES.studio.year, "ANN"), offer("Studio (quarterly)", PRICES.studio.quarter, "QAN"),
        ],
      },
    ],
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
