import { PLAN_LIMITS, PRICES } from "@ozvi/db";
import { fontsHref, parseTheme, presets, toCss } from "@ozvi/theme";
import { Accessibility, ArrowRightLeft, Bot, Check, Code, EyeOff, GitMerge, GitPullRequest, Inbox, Languages, Mail, MessageSquare, Minus, Server, Sparkles, Star, Webhook } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DevTabs, type DevTab } from "@/components/landing/DevTabs";
import { Beams, ReportStream, RouteFill, Terminal } from "@/components/landing/Live";
import { Reveal } from "@/components/landing/Reveal";
import { MiniBoard } from "@/components/landing/SampleBoard";
import { SmoothScroll } from "@/components/landing/SmoothScroll";
import { StickySteps } from "@/components/landing/StickySteps";
import { TeamDesk } from "@/components/landing/TeamDesk";
import { LangSwitch, SiteHeader, type NavItem } from "@/components/landing/SiteHeader";
import { signupClosed } from "@/lib/account-rules";
import { ownFeedback } from "@/lib/own-feedback";
import { ProductTour } from "@/components/landing/ProductTour";
import { compareLinks } from "@/components/compare/links";
import { OzviLogo, OzviMark } from "@/components/ozvi/Logo";
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

const h2 = "text-[32px] leading-[1.06] font-semibold tracking-[-0.04em] text-balance md:text-[44px]";
const lede = "text-[16.5px] leading-relaxed text-muted-foreground";
const primary = "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-foreground px-5 text-[14.5px] font-semibold text-background transition-opacity hover:opacity-85";
/** Before launch (OZVI_SIGNUP=closed) the sign-up buttons become this plain label. */
const soonLabel = "inline-flex h-11 items-center justify-center rounded-lg border border-dashed border-line-strong px-5 text-[14.5px] font-medium text-muted-foreground";
const flowChip = "inline-flex items-center gap-2.5 rounded-xl border bg-background px-3.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap shadow-[0_8px_24px_-16px_rgb(13_12_20/0.35)]";
const hostPanel = "look-host oz-scope overflow-hidden rounded-2xl border bg-background font-sans text-foreground shadow-[0_30px_80px_-40px_rgb(13_12_20/0.4)]";
const note = "pointer-events-none absolute hidden items-center gap-2.5 rounded-2xl border bg-surface/90 px-3.5 py-2.5 text-left text-[13px] leading-snug shadow-[0_20px_50px_-20px_rgb(13_12_20/0.35)] backdrop-blur lg:flex";
const tile = "relative overflow-hidden rounded-2xl border bg-surface p-6 shadow-[0_1px_0_rgb(13_12_20/0.03)]";
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

export async function Landing({ locale, signedIn = false }: { locale: Locale; signedIn?: boolean }) {
  const t = await getTranslations({ locale, namespace: "landing" });
  const stars = await githubStars();
  const pg = await getTranslations({ locale, namespace: "playground" });
  const tA11y = await getTranslations({ locale, namespace: "a11y" });
  const tSub = await getTranslations({ locale, namespace: "subprocessors" });
  const tag = LOCALE_TAG[locale];
  const eur = (c: number) => new Intl.NumberFormat(tag, { style: "currency", currency: "EUR", maximumFractionDigits: c % 100 ? 2 : 0 }).format(c / 100);
  const num = (n: number) => (Number.isFinite(n) ? n.toLocaleString(tag) : t("pricing.unlimited"));
  const gb = (b: number) => `${b / 1024 ** 3} GB`;
  const yes = (on: boolean) => on
    ? <Check className="mx-auto size-4 text-foreground" strokeWidth={2.5} role="img" aria-label={t("pricing.yes")} />
    : <Minus className="mx-auto size-4 text-foreground/55" role="img" aria-label={t("pricing.no")} />;
  const rows: { label: string; value: (p: (typeof PLANS)[number]) => React.ReactNode }[] = [
    { label: t("pricing.rows.projects"), value: (p) => num(PLAN_LIMITS[p].projects) },
    { label: t("pricing.rows.emails"), value: (p) => num(PLAN_LIMITS[p].emailsPerMonth) },
    { label: t("pricing.rows.files"), value: (p) => gb(PLAN_LIMITS[p].attachmentBytes) },
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
  const fonts = [...new Set([site, host].map((th) => fontsHref(th, { skipBundled: true })).filter(Boolean))] as string[];

  return (
    <>
      {fonts.map((f) => <link key={f} rel="stylesheet" href={f} />)}
      <style>{toCss(site) + toCss(term, ".look-term") + toCss(host, ".look-host")}</style>

      <div className="min-h-dvh overflow-x-clip bg-background font-brand text-foreground">
        <SmoothScroll />
        <SiteHeader locale={locale} signedIn={signedIn} soon={soon} />

        <main id="main" tabIndex={-1}>
          {/* hero: the promise, then the product as the picture (a still: nothing to click here) */}
          <section className="relative isolate -mt-[68px] pt-[68px]">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1050px] bg-[radial-gradient(45%_40%_at_18%_14%,color-mix(in_oklab,var(--oz-accent)_16%,transparent),transparent_70%),radial-gradient(40%_35%_at_82%_8%,rgb(20_184_166/0.13),transparent_70%),radial-gradient(50%_45%_at_50%_62%,rgb(236_72_153/0.07),transparent_70%)]" />
            <div className="oz-frame pt-16 text-center md:pt-24">
              <p className="oz-rise mx-auto inline-flex items-center gap-2 rounded-full border bg-surface/80 px-3 py-1 text-[13px] text-muted-foreground backdrop-blur">
                <Sparkles className="size-3.5 text-brand-text" aria-hidden />{t("hero.badge")}
              </p>
              <h1 className="oz-rise mx-auto mt-6 max-w-[16ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.045em] [animation-delay:80ms] sm:text-[64px] lg:text-[80px]">{t("hero.title")}</h1>
              <p className={cn(lede, "oz-rise mx-auto mt-6 max-w-[56ch] text-[18px] [animation-delay:160ms] md:text-[19px]")}>{t("hero.lede")}</p>
              <div className="oz-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:240ms]">
                {go(start.label, primary)}
                <Link href={DEMO_PATH[locale]} className={soon ? primary : ghost}>{t("demo.hero")}</Link>
                <a href="#how" className={cn(ghost, "border-transparent bg-transparent")}>{t("hero.secondary")}</a>
              </div>
              <p className="mt-5 text-[13.5px] text-muted-foreground">{t("hero.note")}</p>
            </div>

            <div className="oz-frame relative mt-14 pb-20 lg:pb-28">
              <div role="img" aria-label={t("hero.shotLabel")} className="relative mx-auto max-w-[1100px] rounded-[26px] border bg-surface/60 p-2 shadow-[0_50px_120px_-50px_color-mix(in_oklab,var(--oz-accent)_45%,transparent)] backdrop-blur sm:p-2.5">
                <div inert className="pointer-events-none grid gap-2.5 select-none lg:grid-cols-[1fr_1.15fr]">
                  <div className={hostPanel}><MiniBoard name={t("product.app")} compact={false} /></div>
                  <div className={cn(hostPanel, "hidden lg:block")}><TeamDesk /></div>
                </div>
                <span aria-hidden className={cn(note, "oz-float-in bottom-20 -left-12 [animation-delay:900ms]")}><Mail className="size-4 shrink-0 text-brand-text" /><span><b className="font-semibold">{t("hero.notes.mail")}</b><br /><span className="text-muted-foreground">{t("hero.notes.mailSub")}</span></span></span>
                <span aria-hidden className={cn(note, "oz-float-in -right-10 bottom-28 [animation-delay:1700ms]")}><GitMerge className="size-4 shrink-0 text-success" /><span><b className="font-semibold">{t("hero.notes.merge")}</b><br /><span className="text-muted-foreground">{t("hero.notes.mergeSub")}</span></span></span>
                <span aria-hidden className={cn(note, "oz-float-in -top-5 right-24 [animation-delay:2500ms]")}><span className="size-2 shrink-0 rounded-full bg-success" />{t("hero.notes.votes")}</span>
              </div>
            </div>
          </section>

          {/* how it works: the steps scroll past, the picture on the right follows */}
          <section id="how" aria-labelledby="how-h" className="oz-frame scroll-mt-24 py-16 lg:py-8">
            <h2 id="how-h" className="sr-only">{t("hero.secondary")}</h2>
            <StickySteps steps={(t.raw("steps") as { title: string; text: string }[]).map((s, i) => ({ ...s, panel: [
              <div key="s" className="rounded-2xl border bg-surface p-5 sm:p-6"><ReportStream items={(t.raw("features.tiles.stream.items") as { title: string; meta: string }[]).map((r, k) => ({ ...r, n: 126 + k, tone: k < 3 ? "bug" as const : "idea" as const }))} /></div>,
              <div key="t" className={hostPanel}><TeamDesk /></div>,
              <div key="i" inert className={cn(hostPanel, "pointer-events-none select-none")}><MiniBoard name={t("product.app")} compact={false} view="roadmap" fit /></div>,
              <div key="b" className="grid gap-6">
                <div className="overflow-x-auto pb-1 [scrollbar-width:none]"><Beams className="min-w-[560px]"
                  left={(t.raw("flow.sources") as string[]).map((l, k) => { const Icon = [MessageSquare, Mail, Code, Bot][k]!; return <span key={l} className={flowChip}><Icon className="size-4 text-brand-text" aria-hidden />{l}</span>; })}
                  hub={<span className="grid size-20 place-items-center rounded-3xl border bg-background shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--oz-accent)_55%,transparent)]"><OzviMark className="size-10" /></span>}
                  right={(t.raw("flow.tools") as string[]).map((l, k) => { const Icon = [GitPullRequest, Sparkles, Webhook, Inbox][k]!; return <span key={l} className={flowChip}><Icon className="size-4 text-success" aria-hidden />{l}</span>; })} /></div>
                <div className="look-term oz-scope rounded-2xl bg-background p-5 text-foreground"><Terminal lines={t.raw("features.tiles.mcp.lines") as { who: "you" | "ai" | "tool"; text: string }[]} /></div>
              </div>,
              <div key="r" className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-center">
                <div className="rounded-2xl border bg-surface p-7"><RouteFill stops={t.raw("features.tiles.route.stops") as string[]} /></div>
                <div className={cn(hostPanel, "p-6")}>
                  <p className="text-[12.5px] text-muted-foreground">{t("story.stage.app")} → jana@firma.sk</p>
                  <p className="mt-2 text-[17px] font-semibold">{t("hero.loop.mailSubject")}</p>
                  <p className="mt-1.5 text-[14px] leading-relaxed">{t("hero.loop.mailBody")}</p>
                  <div className="mt-4 flex gap-2 text-[13px] font-semibold"><span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">{t("hero.loop.yes")}</span><span className="rounded-md border border-line-strong px-3 py-1.5">{t("hero.loop.no")}</span></div>
                </div>
              </div>,
            ][i] }))} />
          </section>

          {/* where it lives: the board alone is enough; the widget and the embeds are optional */}
          <section id="ways" aria-labelledby="ways-h" className="oz-frame scroll-mt-24 pb-24 lg:pb-28">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
              <h2 id="ways-h" className={cn(h2, "max-w-[18ch]")}>{t("ways.title")}</h2>
              <p className={cn(lede, "max-w-[52ch]")}>{t("ways.lede")}</p>
            </div>
            <ol className="mt-10 grid overflow-hidden rounded-3xl border bg-surface md:grid-cols-3">
              {(t.raw("ways.items") as { tag: string; title: string; text: string }[]).map((w, i) => (
                <li key={w.title} className={cn("grid content-start gap-4 p-6 sm:p-8", i > 0 && "max-md:border-t md:border-l")}>
                  <div aria-hidden className="grid h-[132px] content-center rounded-2xl border bg-background p-4">
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
            <div className="grid overflow-hidden rounded-3xl border bg-surface shadow-[0_40px_100px_-60px_color-mix(in_oklab,var(--oz-accent)_60%,transparent)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
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
              <div aria-hidden className="relative min-h-[320px] border-t bg-[radial-gradient(60%_60%_at_70%_30%,color-mix(in_oklab,var(--oz-accent)_14%,transparent),transparent_70%)] p-6 lg:border-t-0 lg:border-l">
                <div className={cn(hostPanel, "max-w-[360px] p-5 text-[13px]")}>
                  <p className="text-[15px] font-semibold">{t("demo.app")}</p>
                  <p className="mt-2 flex justify-between text-muted-foreground">{t("demo.phone")}<span className="rounded bg-foreground/15 px-10 blur-[3px]">+421 905</span></p>
                  <p className="mt-1.5 flex justify-between text-muted-foreground">{t("demo.noteLabel")}<span className="rounded bg-foreground/15 px-14 blur-[3px]">alergia</span></p>
                  <p className="mt-3 font-medium text-destructive">{t("demo.failed")}</p>
                </div>
                <div className="absolute right-6 bottom-6 left-16 max-w-[380px] rounded-2xl border bg-background p-4 shadow-[0_30px_60px_-30px_rgb(13_12_20/0.45)] sm:left-auto sm:w-[360px]">
                  <p className="text-[13px] font-semibold">{t("demo.teamGets")}</p>
                  <p className="mt-2 font-mono text-[11.5px] text-destructive">500 PUT /api/bookings/2026-11-14</p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] text-muted-foreground">
                    {(t.raw("demo.chips") as string[]).map((c) => <span key={c} className="rounded bg-wash px-1.5 py-0.5">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* try it: the working board in the visitor's colours, and what a theme covers */}
          <section id="design" aria-labelledby="design-h" className="relative isolate scroll-mt-24 border-y bg-surface">
            <Reveal className="oz-frame py-24 lg:py-28">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
                <h2 id="design-h" data-r className={cn(h2, "max-w-[15ch]")}>{t("try.title")}</h2>
                <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("try.lede")}</p>
              </div>
              <div data-r className="mt-12"><ProductTour /></div>
              <div data-r className="mt-8 flex flex-wrap items-center gap-4">
                <Link href={DEMO_PATH[locale]} className={ghost}>{t("try.demo")}</Link>
                <span className="text-[14px] text-muted-foreground">{t("try.demoNote")}</span>
              </div>
              <dl className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {(pg.raw("scope.items") as { k: string; v: string }[]).map((i) => (
                  <div key={i.k} data-r className="grid content-start gap-1.5 border-t pt-4">
                    <dt className="text-[15px] font-semibold">{i.k}</dt>
                    <dd className="text-[14px] leading-relaxed text-muted-foreground">{i.v}</dd>
                  </div>
                ))}
              </dl>
              <p data-r className="mt-10 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">{pg("scope.limit")}</p>
            </Reveal>
          </section>

          {/* everything it does: live tiles for the essentials, the rest by job */}
          <Reveal as="section" id="features" aria-labelledby="features-h" className="oz-frame scroll-mt-20 py-24 lg:py-32">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <h2 id="features-h" data-r className={cn(h2, "max-w-[15ch]")}>{t("features.title")}</h2>
              <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("features.lede")}</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
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
              {(["self", "fider", "langs", "a11y"] as const).map((k) => {
                const Icon = { self: Server, fider: ArrowRightLeft, langs: Languages, a11y: Accessibility }[k];
                return (
                  <div key={k} data-r className={tile}>
                    <Icon className="size-5 text-brand-text" aria-hidden />
                    <h3 className={cn(tileH, "mt-4")}>{t(`features.tiles.${k}.title`)}</h3>
                    <p className={tileP}>{t(`features.tiles.${k}.text`)}</p>
                  </div>
                );
              })}
            </div>

            <h3 data-r className="mt-20 text-[20px] font-semibold tracking-tight">{t("features.moreTitle")}</h3>
            <div className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {(t.raw("features.groups") as { title: string; items: string[] }[]).map((g) => (
                <div key={g.title} data-r className="grid content-start gap-4 border-t border-line-strong pt-5">
                  <h4 className="text-[16px] font-semibold tracking-tight">{g.title}</h4>
                  <ul className="grid gap-2.5 text-[14.5px] leading-snug text-foreground/85">
                    {g.items.map((i) => (
                      <li key={i} className="grid grid-cols-[auto_1fr] gap-2.5"><Check className="mt-0.5 size-4 text-primary" strokeWidth={2.5} aria-hidden />{i}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Reveal>

          {/* GitHub: from the report to the fix and back to the author, as it really runs */}
          <section id="github" aria-labelledby="github-h" className="scroll-mt-16 border-t">
            <Reveal className="oz-frame py-24 lg:py-28">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
                <h2 id="github-h" data-r className={cn(h2, "max-w-[17ch]")}>{t("github.title")}</h2>
                <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("github.lede")}</p>
              </div>
              <ol className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {(t.raw("github.steps") as { title: string; text: string }[]).map((st, i) => (
                  <li key={st.title} data-r className="grid content-start gap-4 rounded-2xl border bg-surface p-5">
                    <div aria-hidden className="grid h-[118px] content-center gap-2 rounded-xl border bg-background p-3.5 text-[12.5px]">
                      {i === 0 ? (<>
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 font-semibold text-background"><GitPullRequest className="size-3.5" />{t("github.ui.connect")}</span>
                        <span className="flex items-center justify-between rounded-md border bg-surface px-2.5 py-1.5 font-mono text-[11.5px]">vasafirma/app<Check className="size-3.5 text-success" strokeWidth={2.5} /></span>
                      </>) : i === 1 ? (<>
                        <span className="truncate font-semibold">#128 · {t("github.ui.bug")}</span>
                        <span className="w-fit rounded-md border bg-surface px-2 py-1 font-semibold whitespace-nowrap">{t("github.ui.create")}</span>
                        <span className="truncate font-mono text-[11.5px] text-muted-foreground">→ vasafirma/app#412</span>
                      </>) : i === 2 ? (<>
                        <span className="flex items-center gap-1.5 font-mono text-[11.5px]"><span className="size-2 rounded-full bg-foreground/50" />#412 closed · completed</span>
                        <span className="flex items-center gap-1.5 font-mono text-[11.5px]"><span className="size-2 rounded-full bg-success" />release v2.15</span>
                      </>) : (<>
                        <span className="text-[11.5px] text-muted-foreground">→ jana@firma.sk</span>
                        <span className="font-semibold">{t("hero.loop.mailSubject")}</span>
                        <span className="truncate text-muted-foreground">{t("hero.loop.mailBody")}</span>
                      </>)}
                    </div>
                    <h3 className="flex items-baseline gap-2 text-[16.5px] leading-snug font-semibold"><span className="font-mono text-[13px] text-muted-foreground tabular-nums">{i + 1}</span>{st.title}</h3>
                    <p className="text-[14px] leading-relaxed text-muted-foreground">{st.text}</p>
                  </li>
                ))}
              </ol>
              <p data-r className="mt-8 max-w-[80ch] text-[14px] leading-relaxed text-muted-foreground">{t("github.note")}</p>
            </Reveal>
          </section>

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
              [t("footer.developers"), [...(t.raw("nav.devItems") as NavItem[]), t.raw("nav.devFeature") as NavItem]],
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
