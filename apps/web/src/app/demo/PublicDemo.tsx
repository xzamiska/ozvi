import { parseTheme, presets, toCss } from "@ozvi/theme";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import Script from "next/script";
import { OzviLogo } from "@/components/ozvi/Logo";
import { requestLocale } from "@/i18n/server";
import { DemoActions } from "./DemoActions";
import { DemoInspector } from "./DemoInspector";
import { DEMO_PROJECT, demoMockScript, type DemoData } from "./mock";

/**
 * ozvi.io/demo: a booking app with the real Ozvi widget in it. Report a bug or suggest an idea and
 * see on the right what the team would get: screenshot with masked fields, console errors, the
 * failed request, the steps. Everything stays in the browser (mock.ts); no account, no server write.
 */
const site = parseTheme(presets.ozvi);
const host = parseTheme({ name: "Rezervácie", colors: { accent: "#1D4ED8", ink: "#111827", surface: "#FFFFFF", canvas: "#F3F4F6", border: "#E5E7EB" }, font: { body: "Geist", source: "google" }, radius: 8 });
const STATUS = ["planned", "in_progress", "open"] as const;

export async function PublicDemo() {
  const locale = await requestLocale();
  const t = await getTranslations({ locale, namespace: "demo" });
  const board = await getTranslations({ locale, namespace: "playground.board" });
  const route = await getTranslations({ locale, namespace: "route" });
  const ideas = (board.raw("ideas") as { title: string }[]).map((i, k) => ({
    id: `demo-${k}`, number: [129, 130, 124][k]!, title: i.title, votes: [41, 17, 9][k]!, status: STATUS[k]!, label: route(`label.${STATUS[k]!}`), weight: 0, pending: false,
  }));
  const news = board.raw("news") as { v: string; title: string; text: string }[];
  const data: DemoData = {
    config: { name: host.name, css: toCss(host, ":host"), fonts: null, ideasPublic: true },
    ideas,
    roadmap: { url: `/${DEMO_PROJECT}/roadmap`, lanes: (["planned", "in_progress", "shipped"] as const).map((s) => ({ status: s, label: route(`label.${s}`), total: 1, rows: s === "shipped"
      ? [{ number: 118, title: news[0]!.title, votes: 23, sub: null, tags: [], url: `/${DEMO_PROJECT}/changelog` }]
      : ideas.filter((i) => i.status === s).map((i) => ({ number: i.number, title: i.title, votes: i.votes, sub: null, tags: [], url: `/${DEMO_PROJECT}/i/${i.number}` })) })) },
    changelog: { url: `/${DEMO_PROJECT}/changelog`, entries: news.map((n, k) => ({ id: `n${k}`, title: `${n.v} · ${n.title}`, html: `<p>${n.text.replace(/[<>&]/g, "")}</p>`, publishedAt: new Date(Date.now() - (k * 17 + 3) * 86400_000).toISOString(), url: `/${DEMO_PROJECT}/changelog`, ai: false, aiNote: null, items: [] })) },
  };

  return (
    <div className="min-h-dvh bg-background font-brand text-foreground">
      <style>{toCss(site) + toCss(host, ".look-host")}</style>
      <script dangerouslySetInnerHTML={{ __html: demoMockScript(data) }} />
      <header className="border-b bg-surface">
        <div className="oz-frame flex h-14 items-center gap-4">
          <Link href="/" aria-label="Ozvi"><OzviLogo markClassName="size-6" className="[&>span:last-child]:text-[19px]" /></Link>
          <span className="text-[14px] text-muted-foreground">{t("badge")}</span>
          <Link href="/" className="ml-auto text-[14px] font-medium hover:underline">{t("back")}</Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="oz-frame grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div>
          <h1 className="max-w-[22ch] text-[34px] leading-tight font-semibold tracking-[-0.035em]">{t("title")}</h1>
          <ol className="mt-4 grid max-w-[60ch] gap-1.5 text-[15px] leading-relaxed text-muted-foreground">
            {(t.raw("steps") as string[]).map((s, i) => <li key={i} className="grid grid-cols-[22px_1fr]"><b className="text-foreground">{i + 1}.</b>{s}</li>)}
          </ol>

          {/* the host app (its own look, not Ozvi's) */}
          <div style={{ fontFamily: "system-ui, sans-serif", background: "#F3F4F6", color: "#111827", borderRadius: 16, border: "1px solid #E5E7EB", marginTop: 28, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 7, background: "#1D4ED8", color: "#fff", fontWeight: 700, fontSize: 13 }}>R</span>
              <b style={{ fontSize: 15 }}>{host.name}</b>
              <span style={{ marginLeft: "auto", fontSize: 13, opacity: 0.6 }}>app.vasafirma.sk</span>
            </div>
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #E5E7EB" }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>{t("app.title")}</h2>
              <p style={{ margin: "6px 0" }}><b>{t("app.client")}:</b> Jana Kováčová</p>
              <p style={{ margin: "6px 0" }}><b>{t("app.phone")}:</b> <span data-ozvi-mask>+421 905 123 456</span></p>
              <p style={{ margin: "6px 0" }}><b>{t("app.note")}:</b> <span data-ozvi-mask>{t("app.noteText")}</span></p>
              <p style={{ margin: "6px 0" }}><b>{t("app.service")}:</b> {t("app.serviceText")}</p>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 6 }}>{t("app.pin")} <input type="password" defaultValue="4711" style={{ border: "1px solid #D1D5DB", borderRadius: 6, padding: "4px 8px" }} /></label>
              <DemoActions labels={{ detail: t("app.detail"), history: t("app.history"), save: t("app.save"), failed: t("app.failed") }} />
            </div>
            {/* the app's own "What's new" page: two Ozvi embeds, styled as the app */}
            <div style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #E5E7EB", marginTop: 16, display: "grid", gap: 24 }}>
              {/* @ts-expect-error custom element */}
              <ozvi-roadmap project={DEMO_PROJECT} limit="3" />
              {/* @ts-expect-error custom element */}
              <ozvi-changelog project={DEMO_PROJECT} limit="2" />
            </div>
          </div>
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">{t("embedsNote")}</p>

        </div>
        <div className="lg:sticky lg:top-6"><DemoInspector sample={{ ideas: data.ideas, lanes: data.roadmap.lanes, news }} /></div>
      </main>
      {/* @ts-expect-error custom element */}
      <ozvi-widget project={DEMO_PROJECT} token-url="/demo/token" app-version="2.15.0" lang={locale} />
      <script dangerouslySetInnerHTML={{ __html: `window.OzviConfig={networkBodies:true}` }} />
      <Script src="/widget.js" strategy="afterInteractive" />
    </div>
  );
}
