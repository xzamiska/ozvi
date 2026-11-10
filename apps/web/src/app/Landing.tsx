import { PLAN_LIMITS, PRICES } from "@ozvi/db";
import { fontsHref, parseTheme, presets, toCss } from "@ozvi/theme";
import { Bot, Check, Code, EyeOff, GitPullRequest, Globe, Inbox, Mail, MessageSquare, Minus, Server, Sparkles, Webhook } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DevTabs, type DevTab } from "@/components/landing/DevTabs";
import { Beams, ReportStream, RouteFill, Terminal } from "@/components/landing/Live";
import { Reveal } from "@/components/landing/Reveal";
import { HeroLoop } from "@/components/landing/HeroLoop";
import { LangSwitch, SiteHeader, type NavItem } from "@/components/landing/SiteHeader";
import { signupClosed } from "@/lib/account-rules";
import { ProductTour } from "@/components/landing/ProductTour";
import { OzviLogo, OzviMark } from "@/components/ozvi/Logo";
import { LOCALE_TAG, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

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
const tile = "relative overflow-hidden rounded-2xl border bg-surface p-6 shadow-[0_1px_0_rgb(13_12_20/0.03)]";
const tileH = "text-[18px] font-semibold tracking-tight";
const tileP = "mt-2 max-w-[48ch] text-[14.5px] leading-relaxed text-muted-foreground";
const ghost = "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-5 text-[14.5px] font-medium text-foreground transition-colors hover:border-foreground/40";

export async function Landing({ locale, signedIn = false }: { locale: Locale; signedIn?: boolean }) {
  const t = await getTranslations({ locale, namespace: "landing" });
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
  const fonts = [...new Set([site, host].map((th) => fontsHref(th, { skipBundled: true })).filter(Boolean))] as string[];

  return (
    <>
      {fonts.map((f) => <link key={f} rel="stylesheet" href={f} />)}
      <style>{toCss(site) + toCss(term, ".look-term") + toCss(host, ".look-host")}</style>

      <div className="min-h-dvh overflow-x-clip bg-background font-brand text-foreground">
        <SiteHeader locale={locale} signedIn={signedIn} soon={soon} />

        <main id="main" tabIndex={-1}>
          {/* hero: the promise on the left, the product doing it on the right */}
          <section className="relative isolate overflow-hidden">
            <div className="oz-frame grid gap-12 pt-14 pb-16 md:pt-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,500px)] lg:items-center lg:gap-16 lg:pb-24">
              <div>
                <h1 className="max-w-[13ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.04em] sm:text-[58px] lg:text-[68px]">{t("hero.title")}</h1>
                <p className={cn(lede, "mt-6 max-w-[48ch] text-[18px] md:text-[19px]")}>{t("hero.lede")}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  {go(start.label, primary)}
                  <a href="#how" className={ghost}>{t("hero.secondary")}</a>
                </div>
                <p className="mt-5 max-w-[48ch] text-[13.5px] text-muted-foreground">{t("hero.note")}</p>
              </div>
              <HeroLoop className="mx-auto w-full max-w-[500px] lg:mx-0" />
            </div>
          </section>

          {/* the product, part by part: what users see and what the team sees */}
          <Reveal as="section" id="how" aria-labelledby="how-h" className="oz-frame scroll-mt-20 pb-24 lg:pb-32">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <h2 id="how-h" data-r className={cn(h2, "max-w-[15ch]")}>{t("product.title")}</h2>
              <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("product.lede")}</p>
            </div>
            <div data-r className="mt-12"><ProductTour /></div>
          </Reveal>

          {/* where reports come from and where they end up */}
          <section id="flow" aria-labelledby="flow-h" className="scroll-mt-16 border-y bg-surface">
            <Reveal className="oz-frame py-24 lg:py-28">
              <h2 id="flow-h" data-r className={cn(h2, "mx-auto max-w-[19ch] text-center")}>{t("flow.title")}</h2>
              <p data-r className={cn(lede, "mx-auto mt-5 max-w-[58ch] text-center")}>{t("flow.lede")}</p>
              <div data-r className="mt-14 overflow-x-auto pb-2 [scrollbar-width:none]">
                <Beams className="mx-auto min-w-[640px] max-w-[900px]"
                  left={(t.raw("flow.sources") as string[]).map((label, i) => {
                    const Icon = [MessageSquare, Mail, Code, Bot][i]!;
                    return <span key={label} className={flowChip}><Icon className="size-4 text-brand-text" aria-hidden />{label}</span>;
                  })}
                  hub={<span className="grid size-24 place-items-center rounded-3xl border bg-background shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--oz-accent)_55%,transparent)]"><OzviMark className="size-12" /></span>}
                  right={(t.raw("flow.tools") as string[]).map((label, i) => {
                    const Icon = [GitPullRequest, Sparkles, Webhook, Inbox][i]!;
                    return <span key={label} className={flowChip}><Icon className="size-4 text-success" aria-hidden />{label}</span>;
                  })} />
              </div>
            </Reveal>
          </section>

          {/* everything it does: live tiles for the essentials, the rest by job */}
          <Reveal as="section" id="features" aria-labelledby="features-h" className="oz-frame scroll-mt-20 py-24 lg:py-32">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <h2 id="features-h" data-r className={cn(h2, "max-w-[15ch]")}>{t("features.title")}</h2>
              <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{t("features.lede")}</p>
            </div>
            <div className="mt-14 grid gap-4 md:grid-cols-6">
              <div data-r className={cn(tile, "md:col-span-3 md:row-span-2")}>
                <h3 className={tileH}>{t("features.tiles.stream.title")}</h3>
                <p className={tileP}>{t("features.tiles.stream.text")}</p>
                <div className="mt-6"><ReportStream items={(t.raw("features.tiles.stream.items") as { title: string; meta: string }[]).map((r, i) => ({ ...r, n: 126 + i, tone: i < 3 ? "bug" as const : "idea" as const }))} /></div>
              </div>
              <div data-r className={cn(tile, "md:col-span-3")}>
                <h3 className={tileH}>{t("features.tiles.mcp.title")}</h3>
                <p className={tileP}>{t("features.tiles.mcp.text")}</p>
                <div className="look-term oz-scope mt-5 rounded-xl bg-background p-4 text-foreground"><Terminal lines={t.raw("features.tiles.mcp.lines") as { who: "you" | "ai" | "tool"; text: string }[]} /></div>
              </div>
              <div data-r className={cn(tile, "md:col-span-3")}>
                <h3 className={tileH}>{t("features.tiles.route.title")}</h3>
                <div className="mt-5 grid gap-6 sm:grid-cols-[auto_1fr]">
                  <RouteFill stops={t.raw("features.tiles.route.stops") as string[]} />
                  <p className={cn(tileP, "mt-0 self-end")}>{t("features.tiles.route.text")}</p>
                </div>
              </div>
              <div data-r className={cn(tile, "md:col-span-2")}>
                <EyeOff className="size-5 text-brand-text" aria-hidden />
                <h3 className={cn(tileH, "mt-4")}>{t("features.tiles.privacy.title")}</h3>
                <p className={tileP}>{t("features.tiles.privacy.text")}</p>
                <div aria-hidden className="mt-4 grid gap-2 rounded-xl border bg-background p-3 text-[12.5px]">
                  <span className="flex justify-between text-muted-foreground">{t("features.tiles.privacy.email")}<span className="text-foreground">jana@firma.sk</span></span>
                  <span className="flex justify-between text-muted-foreground">{t("features.tiles.privacy.password")}<span className="rounded bg-foreground/15 px-6 blur-[3px]">heslo123</span></span>
                </div>
              </div>
              <div data-r className={cn(tile, "md:col-span-2")}>
                <Globe className="size-5 text-brand-text" aria-hidden />
                <h3 className={cn(tileH, "mt-4")}>{t("features.tiles.eu.title")}</h3>
                <p className={tileP}>{t("features.tiles.eu.text")}</p>
              </div>
              <div data-r className={cn(tile, "md:col-span-2")}>
                <Server className="size-5 text-brand-text" aria-hidden />
                <h3 className={cn(tileH, "mt-4")}>{t("features.tiles.self.title")}</h3>
                <p className={tileP}>{t("features.tiles.self.text")}</p>
              </div>
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

          {/* their brand, not ours: what the theme covers (try it on the tour's board above) */}
          <section id="design" aria-labelledby="design-h" className="scroll-mt-16 border-t">
            <Reveal className="oz-frame py-24 lg:py-28">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
                <h2 id="design-h" data-r className={cn(h2, "max-w-[13ch]")}>{pg("title")}</h2>
                <p data-r className={cn(lede, "max-w-[52ch] lg:justify-self-end")}>{pg("lede")}</p>
              </div>
              <dl className="mt-14 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="oz-frame grid gap-10 py-14 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="grid content-start gap-4 sm:col-span-2 md:col-span-1">
              <OzviLogo markClassName="size-6" />
              <p className="max-w-[32ch] text-[14px] text-muted-foreground">{t("footer.tagline")}</p>
              <LangSwitch locale={locale} label={t("nav.language")} align="start" className="-ml-2 justify-self-start" />
            </div>
            {([
              [t("footer.product"), (t.raw("nav.productItems") as NavItem[]).slice(0, 3)],
              [t("footer.developers"), [...(t.raw("nav.devItems") as NavItem[]), t.raw("nav.devFeature") as NavItem]],
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
                <li><Link href="/subprocessors" className="hover:text-foreground">{tSub("link")}</Link></li>
                <li><Link href="/accessibility" className="hover:text-foreground">{tA11y("link")}</Link></li>
                <li><a href="#pricing" className="hover:text-foreground">{t("nav.pricing")}</a></li>
              </ul>
            </nav>
          </div>
          <div className="oz-frame flex flex-wrap justify-between gap-3 border-t py-6 text-[13px] text-muted-foreground">
            <span>© {new Date().getFullYear()} Ozvi</span>
            <span>{t("footer.license")}</span>
          </div>
        </footer>
      </div>
    </>
  );
}
