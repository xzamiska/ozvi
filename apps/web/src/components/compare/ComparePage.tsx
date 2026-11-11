import { PRICES } from "@ozvi/db";
import { parseTheme, presets, toCss } from "@ozvi/theme";
import { ArrowRight, CalendarDays, Check, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OzviLogo } from "@/components/ozvi/Logo";
import { LOCALE_TAG } from "@/i18n/locales";
import { getAccount } from "@/lib/account";
import { signupClosed } from "@/lib/account-rules";
import { COMPARE_IDS, COMPARE_PATH, compareLanguages, type CompareId, type CompareLocale } from "@/lib/compare";
import { pageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { CONTENT } from "./content";
import { UI, type Cell, type CompareContent, type Facts, type Mark } from "./types";

/*
 * Comparison pages (/vs/canny, /en/vs/canny, …): cloud only, one indexable URL per language. They
 * wear the landing's Ozvi preset and type scale, with a plain header of their own: the landing's
 * header links to sections of the landing itself.
 */

const site = parseTheme(presets.ozvi);
const HOME: Record<CompareLocale, string> = { sk: "/", en: "/en" };
const OG_LOCALE: Record<CompareLocale, string> = { sk: "sk_SK", en: "en_US" };

const h2 = "text-[26px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance md:text-[32px]";
const lede = "text-[16.5px] leading-relaxed text-muted-foreground";
const primary = "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[14.5px] font-semibold text-background transition-opacity hover:opacity-85";
const ghost = "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-[14.5px] font-medium text-foreground transition-colors hover:border-foreground/40";
const soonLabel = "inline-flex h-11 items-center justify-center rounded-lg border border-dashed border-line-strong px-5 text-[14.5px] font-medium text-muted-foreground";

function facts(locale: CompareLocale): Facts {
  const eur = (c: number) => new Intl.NumberFormat(LOCALE_TAG[locale], { style: "currency", currency: "EUR", maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
  return { pro: eur(PRICES.pro.year), proQuarter: eur(PRICES.pro.quarter), studio: eur(PRICES.studio.year), studioQuarter: eur(PRICES.studio.quarter) };
}

export const compareContent = (id: CompareId, locale: CompareLocale): CompareContent => CONTENT[id][locale](facts(locale));

export function compareMetadata(id: CompareId, locale: CompareLocale): Metadata {
  const c = compareContent(id, locale);
  const meta = pageMeta({ title: c.meta.title, description: c.meta.description, path: COMPARE_PATH[id][locale], locale, languages: compareLanguages(id) });
  // pageMeta lists every landing language; these pages exist in two.
  return { ...meta, openGraph: { ...meta.openGraph, alternateLocale: [OG_LOCALE[locale === "sk" ? "en" : "sk"]] } };
}

/** FAQPage structured data; `<` escaped so the copy cannot close the script tag. */
function faqJsonLd(c: CompareContent, locale: CompareLocale): string {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: locale,
    mainEntity: c.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const MARK_ICON: Record<Mark, typeof Check> = { yes: Check, no: X, partial: Minus };

/** A mark is the second channel: the word stays visible next to it (DESIGN.md). */
function CellView({ cell, marks }: { cell: Cell; marks: Record<Mark, string> }) {
  if (!cell.mark) return <span>{cell.text}</span>;
  const Icon = MARK_ICON[cell.mark];
  return (
    <span className="flex items-start gap-2">
      <Icon aria-hidden strokeWidth={2.5} className={cn("mt-[3px] size-4 shrink-0", cell.mark === "yes" ? "text-foreground" : "text-foreground/55")} />
      <span><span className="font-semibold">{marks[cell.mark]}</span><span className="text-muted-foreground"> · </span>{cell.text}</span>
    </span>
  );
}

export async function ComparePage({ id, locale }: { id: CompareId; locale: CompareLocale }) {
  // Ozvi's own marketing: a self-hosted instance has no landing and no comparison pages.
  if (process.env.OZVI_MODE !== "cloud") notFound();
  const c = compareContent(id, locale);
  const ui = UI[locale];
  const other: CompareLocale = locale === "sk" ? "en" : "sk";
  const home = HOME[locale];
  const signedIn = !!(await getAccount());
  const soon = !signedIn && signupClosed();
  const start = signedIn ? { href: "/app", label: ui.console } : { href: "/app/login", label: ui.start };
  const go = (className: string) => (soon ? <span className={soonLabel}>{ui.soon}</span> : <Link href={start.href} className={className}>{start.label}</Link>);
  const more = COMPARE_IDS.filter((x) => x !== id);

  return (
    <>
      <style>{toCss(site)}</style>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(c, locale) }} />
      <div className="min-h-dvh bg-background font-brand text-foreground">
        <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
          {/* Wraps instead of scrolling sideways at 320 px (WCAG 1.4.10). */}
          <div className="oz-frame flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 md:min-h-16">
            <Link href={home} aria-label={ui.home}><OzviLogo markClassName="size-7" /></Link>
            <nav aria-label="Ozvi" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-medium">
              <Link href={`${home}#pricing`} className="text-muted-foreground hover:text-foreground">{ui.pricing}</Link>
              <Link href={COMPARE_PATH[id][other]} hrefLang={other} lang={other} aria-label={ui.otherLangName} className="text-muted-foreground hover:text-foreground">{ui.otherLang}</Link>
              {soon
                ? <span className="inline-flex h-9 items-center rounded-lg border border-dashed border-line-strong px-4 text-muted-foreground">{ui.soon}</span>
                : <Link href={start.href} className="inline-flex h-9 items-center rounded-lg bg-foreground px-4 font-semibold whitespace-nowrap text-background transition-opacity hover:opacity-85">{start.label}</Link>}
            </nav>
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          <section className="oz-frame pt-12 pb-12 md:pt-20">
            <p className="text-[13.5px] font-semibold text-brand-text">{ui.kicker}</p>
            <h1 className="mt-3 max-w-[20ch] text-[40px] leading-[1.04] font-semibold tracking-[-0.045em] md:text-[56px]">{c.h1}</h1>
            <div className="mt-6 grid max-w-[68ch] gap-4">
              {c.answer.map((p) => <p key={p.slice(0, 32)} className={cn(lede, "text-[17.5px] text-foreground/85")}>{p}</p>)}
            </div>
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-[13px] text-muted-foreground">
              <CalendarDays className="size-3.5" aria-hidden />{ui.asOf}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {go(primary)}
              <Link href="/demo" className={ghost}>{ui.demo}</Link>
            </div>
          </section>

          <section aria-labelledby="table" className="oz-frame pb-16">
            <h2 id="table" className={h2}>{c.table.caption}</h2>
            {/* Sideways scroll only inside the table on narrow screens; reachable by keyboard. */}
            <div tabIndex={0} role="region" aria-labelledby="table" className="mt-6 overflow-x-auto rounded-xl border bg-surface">
              <table className="w-full min-w-[680px] border-collapse text-[14.5px] leading-snug">
                <caption className="sr-only">{c.table.caption}. {ui.asOf}.</caption>
                <thead>
                  <tr className="border-b bg-wash/60 text-left">
                    <th scope="col" className="w-[28%] px-5 py-3.5 text-[13px] font-semibold text-muted-foreground">{ui.feature}</th>
                    <th scope="col" className="w-[36%] px-5 py-3.5 text-[15px] font-semibold">Ozvi</th>
                    <th scope="col" className="w-[36%] px-5 py-3.5 text-[15px] font-semibold">{c.them}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {c.table.rows.map((r) => (
                    <tr key={r.label} className="align-top">
                      <th scope="row" className="px-5 py-4 text-left font-medium">{r.label}</th>
                      <td className="px-5 py-4"><CellView cell={r.ozvi} marks={ui.marks} /></td>
                      <td className="px-5 py-4"><CellView cell={r.them} marks={ui.marks} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">{ui.asOf}.{c.table.note && ` ${c.table.note}`}</p>
          </section>

          <section className="border-y bg-surface">
            <div className="oz-frame grid gap-10 py-16 md:grid-cols-2">
              {[c.pickThem, c.pickOzvi].map((g) => (
                <div key={g.title}>
                  <h2 className="text-[22px] font-semibold tracking-[-0.025em]">{g.title}</h2>
                  <ul className="mt-4 grid gap-3 text-[15.5px] leading-relaxed">
                    {g.items.map((i) => (
                      <li key={i} className="flex gap-3"><ArrowRight className="mt-[5px] size-4 shrink-0 text-brand-text" aria-hidden />{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="migrate" className="oz-frame grid gap-8 py-16 lg:grid-cols-[1fr_1.1fr] lg:items-start">
            <div>
              <h2 id="migrate" className={h2}>{c.migrate.title}</h2>
              <p className={cn(lede, "mt-4 max-w-[56ch]")}>{c.migrate.text}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {go(primary)}
                <Link href="/demo" className={ghost}>{ui.demo}</Link>
              </div>
            </div>
            <ol className="grid gap-px overflow-hidden rounded-xl border bg-line">
              {c.migrate.steps.map((s, i) => (
                <li key={s} className="flex gap-4 bg-surface p-5 text-[15px] leading-relaxed">
                  <span data-num className="font-heading text-[18px] font-bold tabular-nums text-brand-text">{i + 1}</span>{s}
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="faq" className="oz-frame pb-16">
            <h2 id="faq" className={h2}>{ui.faq}</h2>
            <div className="mt-6 divide-y rounded-xl border bg-surface">
              {c.faq.map((f) => (
                <details key={f.q} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-[16px] font-semibold [&::-webkit-details-marker]:hidden">
                    <h3>{f.q}</h3>
                    <span aria-hidden className="mt-0.5 text-[18px] leading-none text-muted-foreground group-open:hidden">+</span>
                    <span aria-hidden className="mt-0.5 hidden text-[18px] leading-none text-muted-foreground group-open:inline">−</span>
                  </summary>
                  <p className="mt-3 max-w-[72ch] text-[15.5px] leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="oz-frame grid gap-10 border-t py-12 md:grid-cols-2">
            <div>
              <h2 className="text-[15px] font-semibold">{ui.sources}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{ui.asOf}</p>
              <ul className="mt-3 grid gap-1.5 text-[14px]">
                {c.sources.map((s) => <li key={s.href}><a href={s.href} rel="noopener nofollow" className="text-muted-foreground underline decoration-line-strong underline-offset-[0.2em] hover:text-foreground">{s.label}</a></li>)}
              </ul>
            </div>
            <nav aria-labelledby="more">
              <h2 id="more" className="text-[15px] font-semibold">{ui.compare}</h2>
              <ul className="mt-3 grid gap-1.5 text-[14px]">
                {more.map((x) => <li key={x}><Link href={COMPARE_PATH[x][locale]} className="text-muted-foreground hover:text-foreground">{compareContent(x, locale).h1}</Link></li>)}
              </ul>
            </nav>
          </section>
        </main>

        <footer className="border-t bg-surface">
          <div className="oz-frame flex flex-wrap items-center justify-between gap-4 py-8 text-[13px] text-muted-foreground">
            <Link href={home} aria-label={ui.home}><OzviLogo markClassName="size-6" /></Link>
            <span>© {new Date().getFullYear()} Ozvi · {ui.footerNote}</span>
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/terms" className="hover:text-foreground">{locale === "sk" ? "Obchodné podmienky" : "Terms"}</Link>
              <Link href="/privacy" className="hover:text-foreground">{locale === "sk" ? "Ochrana súkromia" : "Privacy"}</Link>
              <Link href="/docs/api" className="hover:text-foreground">{ui.docs}</Link>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
