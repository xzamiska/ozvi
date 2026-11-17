import { limitSize, PLAN_LIMITS, PRICES } from "@ozvi/db";
import { fontsHref, parseTheme, presets, toCss } from "@ozvi/theme";
import { Accessibility, ArrowRightLeft, Check, ChevronDown, EyeOff, Languages, MessageSquare, Minus, Palette, Star } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DevTabs, type DevTab } from "@/components/landing/DevTabs";
import { Reveal } from "@/components/landing/Reveal";
import { MiniBoard } from "@/components/landing/SampleBoard";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { ScrollStory, WidgetForm } from "@/components/landing/ScrollStory";
import { LangSwitch, SiteHeader, type NavItem } from "@/components/landing/SiteHeader";
import { signupClosed } from "@/lib/account-rules";
import { ownFeedback } from "@/lib/own-feedback";
import { compareLinks } from "@/components/compare/links";
import { COMPARE_PATH } from "@/lib/compare";
import { OzviLogo, OzviMark } from "@/components/ozvi/Logo";
import { StatusMark } from "@/components/ozvi/route";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { LEGAL } from "@/lib/legal";
import { githubStars } from "@/lib/github-stars";
import { DEMO_PATH, GITHUB_REPO } from "@/lib/seo";

/*
 * Ozvi's landing wears the same Ozvi preset as the console (light, dark with the system), so the
 * site and the product read as one thing. The host app in the story, the event log ("terminal",
 * always dark) and the showcase boards keep their own themes, scoped by class.
 */
const site = parseTheme(presets.ozvi);
const term = parseTheme({ ...presets.ozvi, colors: presets.ozvi.dark, dark: undefined });
const host = parseTheme({ name: "Host", colors: { accent: "#1D4ED8", ink: "#111827", surface: "#FFFFFF", canvas: "#F3F4F6", border: "#E5E7EB" }, font: { body: "Geist", source: "google" }, radius: 8 });
const PLANS = ["free", "pro", "studio"] as const;
const PLAN_NAME = { free: "Free", pro: "Pro", studio: "Studio" } as const;

type T = Awaited<ReturnType<typeof getTranslations<"landing">>>;

function devTabs(t: T, lang: string): DevTab[] {
  return [
    {
      id: "widget", label: t("dev.tabs.widget.label"), file: "index.html", note: t("dev.tabs.widget.note"),
      code: `<script src="https://ozvi.io/widget.js" defer></script>

<ozvi-widget
  project="acme"
  token-url="/api/ozvi-token"
  app-version="2.15.0"
  lang="${lang}"
></ozvi-widget>`,
    },
    {
      id: "sso", label: t("dev.tabs.sso.label"), file: "app/api/ozvi-token/route.ts", note: t("dev.tabs.sso.note"),
      code: `import { signOzviToken } from "@ozvi/sdk";

// ${t("dev.tabs.sso.comment")}
export async function GET(req: Request) {
  const user = await currentUser(req);
  const token = signOzviToken(
    { id: user.id, email: user.email, name: user.name,
      traits: { plan: user.plan } },
    process.env.OZVI_SSO_SECRET!,
  );
  return Response.json({ token });
}`,
    },
    {
      id: "mcp", label: t("dev.tabs.mcp.label"), file: "terminal", note: t("dev.tabs.mcp.note"),
      code: `# Claude Code
claude mcp add --transport http ozvi \\
  https://ozvi.io/acme/mcp \\
  --header "Authorization: Bearer ozvi_pat_…"

# ${t("dev.tabs.mcp.comment")}
> ${t("dev.tabs.mcp.q1")}
> ${t("dev.tabs.mcp.q2")}`,
    },
    {
      id: "hook", label: t("dev.tabs.hook.label"), file: "POST https://api.acme.dev/hooks/ozvi", note: t("dev.tabs.hook.note"),
      code: `ozvi-signature: t=1762594725,v1=5f2c…

{
  "event": "item.status_changed",
  "project": { "slug": "acme" },
  "item": {
    "number": 128, "kind": "bug",
    "title": "${t("dev.tabs.hook.title")}",
    "status": "fixed", "fixedInVersion": "2.15"
  }
}`,
    },
  ];
}

const h2 = "text-[32px] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance md:text-[44px]";
const lede = "text-[16.5px] leading-relaxed text-muted-foreground";
const primary = "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[14.5px] font-semibold text-background transition-opacity hover:opacity-85";
/** Before launch (OZVI_SIGNUP=closed) the sign-up buttons become this plain label. */
const soonLabel = "inline-flex h-11 items-center justify-center rounded-lg border border-dashed border-line-strong px-5 text-[14.5px] font-medium text-muted-foreground";
const hostPanel = "look-host oz-scope overflow-hidden rounded-xl border bg-background font-sans text-foreground";
const note = "pointer-events-none absolute hidden items-center gap-2.5 rounded-xl border bg-surface/90 px-3.5 py-2.5 text-left text-[13px] leading-snug backdrop-blur lg:flex";
const tile = "relative border-t-2 border-foreground pt-5";
const tileH = "text-[18px] font-semibold tracking-tight";
const tileP = "mt-2 max-w-[48ch] text-[14.5px] leading-relaxed text-muted-foreground";
const ghost = "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-[14.5px] font-medium text-foreground transition-colors hover:border-foreground/40";

/** "Star us on GitHub": an outlined link, the count only once it means something (lib/github-stars.ts). */
function StarLink({ label, stars, tag, className }: { label: string; stars: number | null; tag: string; className?: string }) {
  return (
    <a href={GITHUB_REPO} target="_blank" rel="noopener" className={cn("inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-line-strong bg-surface px-3.5 text-[14px] font-semibold transition-colors hover:bg-accent", className)}>
      <Star className="size-4 text-warn" aria-hidden />{label}
      {stars !== null && <span className="rounded-md bg-muted px-1.5 text-[12.5px] font-medium text-muted-foreground tabular-nums">{stars.toLocaleString(tag)}</span>}
    </a>
  );
}

/**
 * The hero's picture: the one loop Ozvi closes, from the customer's side. A still (inert, one
 * description for screen readers); no stack traces here, those belong to the developers' section.
 */
function HeroLoop({ t, e }: { t: T; e: Awaited<ReturnType<typeof getTranslations<"email">>> }) {
  const where = t.raw("hero.loop.where") as string[];
  const stops = (t.raw("story.stage.stops") as string[]).slice(0, 4);
  const status = ["new", "confirmed", "in_progress", "fixed"] as const;
  const cards = [
    <WidgetForm key="app" typed={1} shot={false} sent={false} compact className="w-full shadow-none" />,
    <div key="team" className="rounded-xl border-2 border-foreground bg-surface p-4 text-[13.5px] shadow-[0_1px_0_var(--oz-ink),0_24px_48px_-24px_color-mix(in_oklab,var(--oz-ink)_45%,transparent)]">
      <p className="text-[22px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">#128</p>
      <p className="mt-2 font-semibold">{t("story.stage.report")}</p>
      <ol className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12.5px]">
        {stops.map((s, k) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            {k > 0 && <span aria-hidden className="h-[3px] w-3 rounded-full bg-st-done sm:w-4" />}
            <StatusMark kind="bug" status={status[k]!} />
            <span className={k === 3 ? "font-semibold" : "text-muted-foreground"}>{s}{k === 3 && <span className="font-medium text-muted-foreground"> · 2.15</span>}</span>
          </li>
        ))}
      </ol>
    </div>,
    // the e-mail Ozvi sends when a bug is fixed (lib/email/render.ts), in Ozvi's look
    <div key="mail" className="look-ozvi oz-scope min-w-0 rounded-xl border bg-surface p-4 font-sans text-[13.5px] text-foreground">
      <p className="truncate text-[12.5px] text-muted-foreground"><b className="font-semibold text-foreground">{t("story.stage.app")}</b> · {e("bugFixedSubject", { title: t("story.stage.report") })}</p>
      <p className="mt-2 text-[16px] leading-snug font-bold">{e("bugFixedHeading")}</p>
      <p className="mt-1">{e("bugFixedBodyVersion", { title: t("story.stage.report"), version: "2.15" })}</p>
      <p className="mt-3"><span className="inline-flex rounded-lg bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground">{e("confirmFix")}</span></p>
    </div>,
  ];
  return (
    <div role="img" aria-label={t("hero.loop.label")} className="w-full max-w-[540px] lg:justify-self-end">
      <ol inert className="pointer-events-none relative grid gap-5 select-none">
        <span aria-hidden className="absolute top-3 bottom-8 left-[11.5px] w-px bg-line-strong" />
        {cards.map((card, i) => (
          <li key={i} className="oz-rise relative grid grid-cols-[24px_minmax(0,1fr)] gap-x-4" style={{ animationDelay: `${260 + i * 200}ms` }}>
            <span className="relative z-10 grid size-6 place-items-center rounded-full border bg-background text-[12px] font-semibold tabular-nums">{i + 1}</span>
            <div className="grid min-w-0 gap-2">
              <p className="text-[13px] leading-6 font-medium text-muted-foreground">{where[i]}</p>
              {card}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export async function Landing({ locale, signedIn = false }: { locale: Locale; signedIn?: boolean }) {
  const t = await getTranslations({ locale, namespace: "landing" });
  const stars = await githubStars();
  const tA11y = await getTranslations({ locale, namespace: "a11y" });
  const tSub = await getTranslations({ locale, namespace: "subprocessors" });
  const tMail = await getTranslations({ locale, namespace: "email" });
  const tag = LOCALE_TAG[locale];
  const eur = (c: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
  const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString(tag) : t("pricing.unlimited"));
  const yes = (on: boolean) => on
    ? <Check className="mx-auto size-4 text-foreground" strokeWidth={2.5} role="img" aria-label={t("pricing.yes")} />
    : <Minus className="mx-auto size-4 text-foreground/55" role="img" aria-label={t("pricing.no")} />;
  const rows: { label: string; value: (p: (typeof PLANS)[number]) => React.ReactNode }[] = [
    { label: t("pricing.rows.projects"), value: (p) => num(PLAN_LIMITS[p].projects) },
    { label: t("pricing.rows.emails"), value: (p) => num(PLAN_LIMITS[p].emailsPerMonth) },
    { label: t("pricing.rows.files"), value: (p) => limitSize(PLAN_LIMITS[p].attachmentBytes) },
    { label: t("pricing.rows.domain"), value: (p) => yes(PLAN_LIMITS[p].customDomain) },
    { label: t("pricing.rows.badge"), value: (p) => yes(!PLAN_LIMITS[p].badge) },
    { label: t("pricing.rows.translations"), value: (p) => (PLAN_LIMITS[p].translationsPerMonth > 0 ? num(PLAN_LIMITS[p].translationsPerMonth) : yes(false)) },
    { label: t("pricing.rows.ai"), value: (p) => yes(PLAN_LIMITS[p].ai) },
    { label: t("pricing.rows.users"), value: () => t("pricing.unlimited") },
    { label: t("pricing.rows.all"), value: () => yes(true) },
  ];
  const price = (p: (typeof PLANS)[number]) => (p === "free" ? eur(0) : eur(PRICES[p].year));
  const priceNote = (p: (typeof PLANS)[number]) => (p === "free" ? t("pricing.forever") : t("pricing.yearly", { q: eur(PRICES[p].quarter) }));
  const cta = (p: (typeof PLANS)[number]) => (p === "free" ? t("nav.start") : t("pricing.choose", { p: PLAN_NAME[p] }));
  const start = signedIn ? { href: "/app", label: t("nav.console") } : { href: "/app/login", label: t("nav.start") };
  const soon = !signedIn && signupClosed();
  /** The sign-up button, or before launch a plain "launching soon" label in the same place and size. */
  const go = (label: string, className: string, extra?: string) => soon
    ? <span className={cn(soonLabel, extra)}>{t("nav.soon")}</span>
    : <Link href={start.href} className={cn(className, extra)}>{label}</Link>;
  const own = await ownFeedback();
  const compare = compareLinks(locale);
  const faq = [
    ...(t.raw("faq.items") as { q: string; a: string }[]),
    { q: t("faq.price.q"), a: t("faq.price.a", { pro: eur(PRICES.pro.year), studio: eur(PRICES.studio.year) }) },
  ];
  const sentryHref = locale === "sk" || locale === "en" ? COMPARE_PATH.sentry[locale] : null;
  const fonts = [...new Set([site, host].map((th) => fontsHref(th, { skipBundled: true })).filter(Boolean))] as string[];

  return (
    <>
      {fonts.map((f) => <link key={f} rel="stylesheet" href={f} />)}
      <style>{toCss(site) + toCss(term, ".look-term") + toCss(host, ".look-host") + toCss(site, ".look-ozvi")}</style>

      <div className="min-h-dvh overflow-x-clip bg-background font-brand text-foreground">
        <SmoothScroll />
        <SiteHeader locale={locale} signedIn={signedIn} soon={soon} />

        <main id="main" tabIndex={-1}>
          {/* hero: the promise from the customer's side, and the loop it closes (report → fix → the customer hears) */}
          <section className="relative isolate -mt-[68px] pt-[68px]">
            <div className="oz-frame grid gap-10 pt-6 pb-16 sm:gap-12 md:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-16 lg:pb-24">
              <div>
                <h1 className="oz-rise max-w-[21ch] text-[30px] leading-[1.08] font-extrabold tracking-[-0.035em] text-balance sm:text-[46px] lg:text-[54px]">{t("hero.title")}</h1>
                <p className={cn(lede, "oz-rise mt-5 max-w-[50ch] text-[16.5px] [animation-delay:80ms] sm:mt-6 sm:text-[17px] md:text-[18.5px]")}>{t("hero.lede")}</p>
                <div className="oz-rise mt-7 flex flex-wrap gap-3 [animation-delay:160ms] sm:mt-8">
                  {go(start.label, primary)}
                  <Link href={DEMO_PATH[locale]} className={soon ? primary : ghost}>{t("demo.hero")}</Link>
                  <a href="#how" className={cn(ghost, "hidden border-transparent bg-transparent px-3 sm:inline-flex")}>{t("hero.secondary")}</a>
                </div>
                <p className="mt-4 text-[13.5px] text-muted-foreground sm:mt-5">{t("hero.note")}</p>
              </div>
              <HeroLoop t={t} e={tMail} />
            </div>
          </section>

          {/* the question the launch post kept getting ("why not Sentry?"), answered without naming anyone here */}
          <section aria-labelledby="monitoring-h" className="border-y bg-surface">
            <div className="oz-frame grid gap-8 py-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 lg:py-20">
              <div>
                <h2 id="monitoring-h" className={cn(h2, "max-w-[18ch]")}>{t("monitoring.title")}</h2>
                <p className={cn(lede, "mt-4 max-w-[42ch]")}>{t("monitoring.both")}</p>
                {sentryHref && <a href={sentryHref} className="mt-5 inline-flex text-[14.5px] font-semibold underline decoration-line-strong underline-offset-4 hover:decoration-foreground">{t("monitoring.link")}</a>}
              </div>
              <dl className="grid gap-8 sm:grid-cols-2">
                <div className="grid content-start gap-2 border-t pt-4">
                  <dt className="text-[14px] font-semibold text-muted-foreground">{t("monitoring.themLabel")}</dt>
                  <dd className="text-[15.5px] leading-relaxed text-muted-foreground">{t("monitoring.them")}</dd>
                </div>
                <div className="grid content-start gap-2 border-t-2 border-foreground pt-4">
                  <dt className="text-[14px] font-semibold">Ozvi</dt>
                  <dd className="text-[15.5px] leading-relaxed">
                    {t("monitoring.ozvi")}
                    <ul className="mt-4 grid gap-2 text-[15px] font-medium">
                      {(t.raw("monitoring.examples") as string[]).map((x) => <li key={x}>{x}</li>)}
                    </ul>
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* how it works: one report, #128, followed from the customer's app to the team, GitHub and back */}
          <section id="how" aria-labelledby="how-h" className="oz-frame scroll-mt-24 py-16 lg:py-8">
            <h2 id="how-h" className="sr-only">{t("hero.secondary")}</h2>
            <ScrollStory />
          </section>

          {/* the other half: ideas, votes and the roadmap */}
          <section aria-labelledby="ideas-h" className="oz-frame grid gap-10 pb-24 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-center lg:gap-16 lg:pt-8 lg:pb-28">
            <div>
              <h2 id="ideas-h" className="max-w-[18ch] text-[30px] leading-tight font-extrabold tracking-[-0.035em] lg:text-[38px]">{t("ideasStep.title")}</h2>
              <p className="mt-4 max-w-[46ch] text-[16.5px] leading-relaxed text-muted-foreground">{t("ideasStep.text")}</p>
            </div>
            <div inert className={cn(hostPanel, "pointer-events-none select-none")}><MiniBoard name={t("product.app")} compact={false} view="roadmap" fit /></div>
          </section>

          {/* where it lives: the board alone is enough; the widget and the embeds are optional */}
          <section id="ways" aria-labelledby="ways-h" className="oz-frame scroll-mt-24 pb-24 lg:pb-28">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <h2 id="ways-h" className={cn(h2, "max-w-[18ch]")}>{t("ways.title")}</h2>
              <p className={cn(lede, "max-w-[52ch]")}>{t("ways.lede")}</p>
            </div>
            <ol className="mt-10 grid overflow-hidden rounded-xl border bg-surface md:grid-cols-3">
              {(t.raw("ways.items") as { tag: string; title: string; text: string }[]).map((w, i) => (
                <li key={w.title} className={cn("grid content-start gap-4 p-6 sm:p-8", i > 0 && "max-md:border-t md:border-l")}>
                  <div aria-hidden className="grid h-[132px] content-center rounded-xl border bg-background p-4">
                    {i === 0 ? (
                      <div className="overflow-hidden rounded-lg border bg-surface text-[12px]">
                        <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5"><span className="size-1.5 rounded-full bg-line-strong" /><span className="size-1.5 rounded-full bg-line-strong" /><span className="ml-1.5 truncate rounded bg-wash px-2 py-0.5 font-mono text-[11px] text-muted-foreground">feedback.vasafirma.sk</span></div>
                        <div className="flex gap-3 px-2.5 py-2 font-medium">{(t.raw("ways.tabs") as string[]).map((x, k) => <span key={x} className={k === 0 ? "text-foreground underline decoration-primary decoration-2 underline-offset-[6px]" : "text-muted-foreground"}>{x}</span>)}</div>
                      </div>
                    ) : i === 1 ? (
                      <div className="grid gap-3">
                        <code className="truncate rounded-md bg-wash px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">&lt;script src=&quot;…/widget.js&quot; defer&gt;</code>
                        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"><MessageSquare className="size-3.5" />{t("ways.launcher")}</span>
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <code className="truncate rounded-md bg-wash px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">&lt;ozvi-roadmap project=&quot;…&quot;&gt;</code>
                        <code className="truncate rounded-md bg-wash px-2.5 py-1.5 font-mono text-[11.5px] text-muted-foreground">&lt;ozvi-changelog project=&quot;…&quot;&gt;</code>
                      </div>
                    )}
                  </div>
                  <span className={cn("w-fit rounded-full px-2.5 py-0.5 text-[12px] font-semibold", i === 0 ? "bg-brand-soft text-brand-text" : "bg-wash text-muted-foreground")}>{w.tag}</span>
                  <h3 className="text-[19px] leading-snug font-semibold tracking-tight">{w.title}</h3>
                  <p className="text-[14.5px] leading-relaxed text-muted-foreground">{w.text}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 max-w-[80ch] text-[14px] leading-relaxed text-muted-foreground">{t("ways.note")}</p>
          </section>

          {/* the demo: report a bug in someone else's app and see what the team gets */}
          <section id="demo" aria-labelledby="demo-h" className="oz-frame scroll-mt-24 pb-24 lg:pb-28">
            <div className="grid overflow-hidden rounded-xl border bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <div className="p-7 sm:p-10 lg:p-12">
                <h2 id="demo-h" className={cn(h2, "max-w-[16ch]")}>{t("demo.title")}</h2>
                <p className={cn(lede, "mt-5 max-w-[48ch]")}>{t("demo.lede")}</p>
                <ul className="mt-6 grid gap-2.5 text-[14.5px] text-foreground/85">
                  {(t.raw("demo.points") as string[]).map((x) => <li key={x} className="grid grid-cols-[auto_1fr] gap-2.5"><Check className="mt-0.5 size-4 text-primary" strokeWidth={2.5} aria-hidden />{x}</li>)}
                </ul>
                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link href={DEMO_PATH[locale]} className={primary}>{t("demo.cta")}</Link>
                  <span className="text-[13.5px] text-muted-foreground">{t("demo.note")}</span>
                </div>
              </div>
              {/* a still of the demo: the app with masked fields, and what the team gets */}
              <div aria-hidden className="grid content-center gap-4 border-t bg-background p-6 sm:p-8 lg:border-t-0 lg:border-l">
                <div className={cn(hostPanel, "w-full max-w-[360px] p-5 text-[13px]")}>
                  <p className="text-[15px] font-semibold">{t("demo.app")}</p>
                  <p className="mt-2 flex justify-between text-muted-foreground">{t("demo.phone")}<span className="rounded bg-foreground/15 px-10 blur-[3px]">+421 905</span></p>
                  <p className="mt-1.5 flex justify-between text-muted-foreground">{t("demo.noteLabel")}<span className="rounded bg-foreground/15 px-14 blur-[3px]">alergia</span></p>
                  <p className="mt-3 font-medium text-destructive">{t("demo.failed")}</p>
                </div>
                <div className="w-full max-w-[380px] justify-self-end rounded-xl border bg-surface p-4">
                  <p className="text-[13px] font-semibold">{t("demo.teamGets")}</p>
                  <p className="mt-2 text-[13.5px]">{t("demo.quote")}</p>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">500 PUT /api/bookings/2026-11-14</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] text-muted-foreground">
                    {(t.raw("demo.chips") as string[]).map((c) => <span key={c} className="rounded bg-wash px-1.5 py-0.5">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* everything it does: live tiles for the essentials, the rest by job */}
          <Reveal as="section" id="features" aria-labelledby="features-h" className="oz-frame scroll-mt-20 py-24 lg:py-32">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <h2 id="features-h" data-r className={cn(h2, "max-w-[15ch]")}>{t("features.title")}</h2>
              <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("features.lede")}</p>
            </div>
            <div className="mt-14 grid gap-x-10 gap-y-12 md:grid-cols-3">
              <div data-r className={cn(tile, "md:row-span-2")}>
                <EyeOff className="size-5 text-brand-text" aria-hidden />
                <h3 className={cn(tileH, "mt-4")}>{t("features.tiles.privacy.title")}</h3>
                <p className={tileP}>{t("features.tiles.privacy.text")}</p>
                <div aria-hidden className="mt-5 grid gap-2 rounded-xl border bg-background p-3 text-[12.5px]">
                  <span className="flex justify-between text-muted-foreground">{t("features.tiles.privacy.email")}<span className="text-foreground">jana@firma.sk</span></span>
                  <span className="flex justify-between text-muted-foreground">{t("features.tiles.privacy.password")}<span className="rounded bg-foreground/15 px-6 blur-[3px]">heslo123</span></span>
                </div>
                <h3 className={cn(tileH, "mt-8")}>{t("features.tiles.eu.title")}</h3>
                <p className={tileP}>{t("features.tiles.eu.text")}</p>
              </div>
              {(["brand", "fider", "langs", "a11y"] as const).map((k) => {
                const Icon = { brand: Palette, fider: ArrowRightLeft, langs: Languages, a11y: Accessibility }[k];
                return (
                  <div key={k} id={k === "brand" ? "brand" : undefined} data-r className={cn(tile, k === "brand" && "scroll-mt-24")}>
                    <Icon className="size-5 text-brand-text" aria-hidden />
                    <h3 className={cn(tileH, "mt-4")}>{t(`features.tiles.${k}.title`)}</h3>
                    <p className={tileP}>{t(`features.tiles.${k}.text`)}</p>
                  </div>
                );
              })}
            </div>

            <details data-r className="group mt-16 border-t border-line-strong">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-5 text-[20px] font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                {t("features.moreTitle")}<ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="grid gap-x-10 gap-y-10 pt-4 pb-2 sm:grid-cols-2 lg:grid-cols-3">
                {(t.raw("features.groups") as { title: string; items: string[] }[]).map((g) => (
                  <div key={g.title} className="grid content-start gap-4 border-t pt-5">
                    <h4 className="text-[16px] font-semibold tracking-tight">{g.title}</h4>
                    <ul className="grid gap-2.5 text-[14.5px] leading-snug text-foreground/85">
                      {g.items.map((i) => (
                        <li key={i} className="grid grid-cols-[auto_1fr] gap-2.5"><Check className="mt-0.5 size-4 text-primary" strokeWidth={2.5} aria-hidden />{i}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          </Reveal>

          {/* developers */}
          <section id="developers" aria-labelledby="dev-h" className="scroll-mt-16 border-t bg-surface">
            <Reveal className="oz-frame grid gap-12 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-32">
              <div>
                <h2 id="dev-h" data-r className={cn(h2, "max-w-[14ch]")}>{t("dev.title")}</h2>
                <p data-r className={cn(lede, "mt-5 max-w-[46ch]")}>{t("dev.lede")}</p>
                <ul data-r className="mt-8 grid gap-3 text-[14.5px] text-foreground/80">
                  {(t.raw("dev.points") as string[]).map((p) => (
                    <li key={p} className="grid grid-cols-[auto_1fr] gap-3"><Check className="mt-1 size-4 text-primary" strokeWidth={2.5} aria-hidden />{p}</li>
                  ))}
                </ul>
              </div>
              <div data-r className="min-w-0"><DevTabs tabs={devTabs(t, locale)} /></div>
              {/* GitHub: from the report to the fix and back to the author, in four lines */}
              <div id="github" data-r className="scroll-mt-24 border-t pt-10 lg:col-span-2">
                <div className="grid gap-4 lg:grid-cols-2 lg:items-end">
                  <h3 className="max-w-[24ch] text-[24px] leading-tight font-semibold tracking-[-0.03em]">{t("github.title")}</h3>
                  <p className="max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground lg:justify-self-end">{t("github.lede")}</p>
                </div>
                <ol className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                  {(t.raw("github.steps") as { title: string; text: string }[]).map((st, i) => (
                    <li key={st.title} className="grid content-start gap-2 border-t pt-4">
                      <h4 className="flex items-baseline gap-2 text-[15.5px] leading-snug font-semibold"><span className="text-[13px] text-muted-foreground tabular-nums">{i + 1}</span>{st.title}</h4>
                      <p className="text-[14px] leading-relaxed text-muted-foreground">{st.text}</p>
                    </li>
                  ))}
                </ol>
                <p className="mt-6 max-w-[80ch] text-[14px] leading-relaxed text-muted-foreground">{t("github.note")}</p>
              </div>
            </Reveal>
            <dl aria-label="Spec" className="oz-frame grid border-t pb-4 sm:grid-cols-2 lg:grid-cols-4">
              {(t.raw("spec") as { k: string; v: string }[]).map((s, i) => (
                <div key={s.k} className={cn("grid content-start gap-2 py-8 sm:pr-6", i > 0 && "max-sm:border-t", i % 2 === 1 && "sm:border-l sm:pl-6", i >= 2 && "sm:max-lg:border-t", i === 2 && "lg:border-l lg:pl-6")}>
                  <dt className="font-mono text-[20px] font-medium tracking-tight">{s.k}</dt>
                  <dd className="text-[14px] leading-relaxed text-muted-foreground">{s.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* pricing */}
          <section id="pricing" aria-labelledby="pricing-h" className="scroll-mt-16 border-t bg-surface">
            <Reveal className="oz-frame py-24 lg:py-32">
              <div className="mb-12 grid gap-5 lg:grid-cols-2 lg:items-end">
                <h2 id="pricing-h" data-r className={h2}>{t("pricing.title")}</h2>
                <p data-r className={cn(lede, "max-w-[50ch] lg:justify-self-end")}>{t("pricing.lede")}</p>
              </div>
              <div data-r className="grid gap-4 md:hidden">
                {PLANS.map((p) => (
                  <div key={p} className={cn("rounded-xl border bg-background p-5", p === "pro" && "border-primary/40")}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-[16px] font-semibold">{PLAN_NAME[p]}</h3>
                      <span className="text-[26px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{price(p)}</span>
                    </div>
                    <p className="mt-1 text-right text-[12.5px] text-muted-foreground">{priceNote(p)}</p>
                    <dl className="mt-4 grid gap-2 border-t pt-4 text-[14px]">
                      {rows.map((r) => (
                        <div key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <dt className="text-muted-foreground">{r.label}</dt>
                          <dd className="text-right tabular-nums [&_svg]:mx-0">{r.value(p)}</dd>
                        </div>
                      ))}
                    </dl>
                    {go(cta(p), p === "pro" ? primary : ghost, "mt-5 h-10 w-full")}
                  </div>
                ))}
              </div>
              <div data-r className="hidden overflow-x-auto rounded-xl border bg-background md:block">
                <table className="w-full min-w-[640px] border-collapse text-[14.5px]">
                  <thead>
                    <tr className="border-b">
                      <th scope="col" className="w-[34%] px-5 py-6 text-left align-bottom text-[13px] font-medium text-muted-foreground">{t("pricing.plan")}</th>
                      {PLANS.map((p) => (
                        <th key={p} scope="col" className={cn("px-5 py-6 text-left align-top font-normal", p === "pro" && "bg-primary/[0.05]")}>
                          <span className="text-[15px] font-semibold">{PLAN_NAME[p]}</span>
                          <span className="mt-3 block text-[32px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{price(p)}</span>
                          <span className="mt-2 block text-[12.5px] text-muted-foreground">{priceNote(p)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label} className="border-b">
                        <th scope="row" className="px-5 py-3.5 text-left font-normal text-muted-foreground">{r.label}</th>
                        {PLANS.map((p) => <td key={p} className={cn("px-5 py-3.5 text-center tabular-nums", p === "pro" && "bg-primary/[0.05]")}>{r.value(p)}</td>)}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {PLANS.map((p) => (
                        <td key={p} className={cn("px-5 py-6", p === "pro" && "bg-primary/[0.05]")}>
                          {go(cta(p), p === "pro" ? primary : ghost, "h-10 w-full")}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div id="self-host" data-r className="mt-8 grid scroll-mt-24 gap-8 rounded-xl border bg-background p-6 md:p-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
                <div>
                  <h3 className="text-[22px] font-semibold tracking-[-0.03em]">{t("self.title")}</h3>
                  <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">{t("self.text")}</p>
                  <p className="mt-4 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">{t("star.text")}</p>
                  <StarLink label={t("star.cta")} stars={stars} tag={LOCALE_TAG[locale]} className="mt-3" />
                </div>
                <pre tabIndex={0} role="region" aria-label={t("self.title")} className="look-term oz-scope overflow-x-auto rounded-lg bg-background p-4 font-mono text-[12.5px] leading-[1.75] text-foreground"><code>
                  <span className="text-foreground/65"># {t("self.c1")}</span>{"\n"}
                  {"docker compose up -d\n\n"}
                  <span className="text-foreground/65"># {t("self.c2")}</span>{"\n"}
                  {"docker compose exec ozvi node ozvi.mjs \\\n  project:create acme "}<span className="text-success">&quot;{t("self.name")}&quot;</span>
                </code></pre>
              </div>
            </Reveal>
          </section>

          {/* the questions people asked about the launch */}
          <section id="faq" aria-labelledby="faq-h" className="scroll-mt-16 border-t">
            <div className="oz-frame grid gap-8 py-20 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16 lg:py-28">
              <h2 id="faq-h" className={cn(h2, "max-w-[12ch]")}>{t("faq.title")}</h2>
              <div className="divide-y border-y">
                {faq.map((f) => (
                  <details key={f.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-5 text-[16.5px] font-semibold [&::-webkit-details-marker]:hidden">
                      {f.q}<ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="max-w-[65ch] pb-6 text-[15px] leading-relaxed text-muted-foreground">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
              "@context": "https://schema.org", "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            }).replace(/</g, "\\u003c") }} />
          </section>

          {/* closing */}
          <section className="border-t">
            <Reveal className="oz-frame grid justify-items-center gap-7 py-28 text-center lg:py-36">
              <OzviMark animated className="size-16 text-foreground" />
              <h2 data-r className={cn(h2, "max-w-[18ch]")}>{t("closing.title")}</h2>
              <p data-r className={cn(lede, "-mt-2")}>{t("closing.text")}</p>
              <div data-r className="flex flex-wrap justify-center gap-3">
                {go(start.label, primary)}
                <a href="#pricing" className={ghost}>{t("closing.compare")}</a>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="border-t bg-surface">
          <div className={cn("oz-frame grid gap-10 py-14 sm:grid-cols-2", compare ? "md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]" : "md:grid-cols-[1.4fr_1fr_1fr_1fr]")}>
            <div className="grid content-start gap-4 sm:col-span-2 md:col-span-1">
              <OzviLogo markClassName="size-6" />
              <p className="max-w-[32ch] text-[14px] text-muted-foreground">{t("footer.tagline")}</p>
              <p className="text-[14px] text-muted-foreground">{t("footer.contact")}: <a href={`mailto:${LEGAL.email}`} className="font-medium text-foreground underline-offset-4 hover:underline">{LEGAL.email}</a></p>
              <LangSwitch locale={locale} label={t("nav.language")} align="start" className="-ml-2 justify-self-start" />
            </div>
            {([
              [t("footer.product"), [...(t.raw("nav.productItems") as NavItem[]).slice(0, 3), { href: DEMO_PATH[locale], title: t("footer.demo"), text: "" }, ...(own ? [{ href: own.ideas, title: t("footer.feedback"), text: "" }] : [])]],
              [t("footer.developers"), [...(t.raw("nav.devItems") as NavItem[]), t.raw("nav.devFeature") as NavItem, { href: "/blog", title: t("footer.blog"), text: "" }]],
              ...(compare ? [[compare.title, compare.items.map((i) => ({ ...i, text: "" }))] as const] : []),
            ] as const).map(([h, items]) => (
              <nav key={h} aria-label={h}>
                <h2 className="text-[13px] font-semibold">{h}</h2>
                <ul className="mt-3 grid gap-2 text-[14px] text-muted-foreground">
                  {items.map((i) => <li key={i.title}><a href={i.href} className="hover:text-foreground">{i.title}</a></li>)}
                </ul>
              </nav>
            ))}
            <nav aria-label={t("footer.legal")}>
              <h2 className="text-[13px] font-semibold">{t("footer.legal")}</h2>
              <ul className="mt-3 grid gap-2 text-[14px] text-muted-foreground">
                <li><Link href="/terms" className="hover:text-foreground">{t("footer.terms")}</Link></li>
                <li><Link href="/privacy" className="hover:text-foreground">{t("footer.privacy")}</Link></li>
                <li><Link href="/dpa" className="hover:text-foreground">{t("footer.dpa")}</Link></li>
                <li><Link href="/subprocessors" className="hover:text-foreground">{tSub("link")}</Link></li>
                <li><Link href="/accessibility" className="hover:text-foreground">{tA11y("link")}</Link></li>
                <li><a href="#pricing" className="hover:text-foreground">{t("nav.pricing")}</a></li>
              </ul>
            </nav>
          </div>
          <div className="oz-frame flex flex-wrap justify-between gap-3 border-t py-6 text-[13px] text-muted-foreground">
            <span>© {new Date().getFullYear()} Ozvi</span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <a href={GITHUB_REPO} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 hover:text-foreground"><Star className="size-3.5" aria-hidden />{t("star.cta")}</a>
              <span>{t("footer.license")}</span>
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
