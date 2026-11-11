import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isUnseen, readSeen, seenKey, unseenCount, writeSeen } from "./seen";
import { getJson, shared, type ProjectConfig } from "./shared";
import { packFor } from "./lang-pack";

/**
 * widget-embeds.js: inline <ozvi-roadmap> and <ozvi-changelog>, loaded only when one of them is on the page
 * (widget.js defines the element shells). Shadow DOM, themed by the project theme, fonts only from Ozvi.
 *
 *   <ozvi-roadmap project="billiwo" limit="5" heading="none"></ozvi-roadmap>
 *   <ozvi-changelog project="billiwo" limit="3"></ozvi-changelog>
 *   <ozvi-changelog project="billiwo" mode="badge" align="end"></ozvi-changelog>
 *
 * Shared attributes: project (required), host, lang, heading (own heading text, or "none"), token-url / token
 * (private boards). Changelog: limit (1–20, default 5), mode="list" | "badge", align="start" | "end".
 * Roadmap: limit cards per lane (default 5), lanes="planned,in_progress,shipped".
 * Events: ozvi:unseen {count} on <ozvi-changelog> whenever the number of unseen entries is known or changes.
 */

const T = {
  sk: {
    roadmap: "Roadmapa", whole: "Celá roadmapa", nothing: "Zatiaľ nič", votes: (n: number) => `${n} ${n === 1 ? "hlas" : n >= 2 && n <= 4 ? "hlasy" : "hlasov"}`,
    news: "Novinky", all: "Všetky novinky", fresh: "Nové", freshN: (n: number) => `${n} ${n === 1 ? "nová" : n >= 2 && n <= 4 ? "nové" : "nových"}`,
    none: "Zatiaľ žiadne novinky.", more: "Celý záznam", fail: "Nepodarilo sa načítať. Skúste obnoviť stránku.", related: "Súvisiace nápady",
    loading: "Načítavam…",
  },
  cs: {
    roadmap: "Roadmapa", whole: "Celá roadmapa", nothing: "Zatím nic", votes: (n: number) => `${n} ${n === 1 ? "hlas" : n >= 2 && n <= 4 ? "hlasy" : "hlasů"}`,
    news: "Novinky", all: "Všechny novinky", fresh: "Nové", freshN: (n: number) => `${n} ${n === 1 ? "nová" : n >= 2 && n <= 4 ? "nové" : "nových"}`,
    none: "Zatím žádné novinky.", more: "Celý záznam", fail: "Nepodařilo se načíst. Zkuste obnovit stránku.", related: "Související nápady",
    loading: "Načítám…",
  },
  en: {
    roadmap: "Roadmap", whole: "Full roadmap", nothing: "Nothing yet", votes: (n: number) => `${n} ${n === 1 ? "vote" : "votes"}`,
    news: "What's new", all: "All updates", fresh: "New", freshN: (n: number) => `${n} new`,
    none: "No updates yet.", more: "Read more", fail: "Couldn't load. Try reloading the page.", related: "Related ideas",
    loading: "Loading…",
  },
};
const TAG: Record<string, string> = { sk: "sk-SK", cs: "cs-CZ", en: "en-GB", pl: "pl-PL", hu: "hu-HU", de: "de-DE" };

const CSS = `
:host{all:initial;display:block;container-type:inline-size;font-family:var(--oz-font-body,system-ui,sans-serif);color:var(--oz-ink,#111214);font-size:14px;line-height:1.5}
:host([mode=badge]){display:inline-block;position:relative;container-type:normal}
*{box-sizing:border-box}
a{color:var(--oz-accent,#5A3FE6);text-underline-offset:2px}
:focus-visible{outline:2px solid var(--oz-accent,#5A3FE6);outline-offset:2px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.top{display:flex;flex-wrap:wrap;gap:4px 16px;justify-content:space-between;align-items:baseline;margin:0 0 12px}
h2{margin:0;font-family:var(--oz-font-heading,inherit);font-size:18px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:8px}
.top a{font-size:13px;font-weight:600;min-height:24px;display:inline-flex;align-items:center}
.lanes{display:grid;gap:12px;align-items:start}
@container (min-width:640px){.lanes{grid-template-columns:repeat(var(--n,3),minmax(0,1fr))}}
.lane{background:var(--oz-canvas,#f3f4f8);border:1px solid var(--oz-border,#ddd);border-radius:calc(var(--oz-radius,8px) + 2px);padding:10px}
h3{margin:0 0 8px;font-size:13px;font-weight:700;display:flex;align-items:center;gap:7px}
h3 .n{margin-left:auto;font-weight:600;color:color-mix(in srgb,var(--oz-ink,#111214) 72%,var(--oz-canvas,#f3f4f8));font-variant-numeric:tabular-nums}
.mk{width:10px;height:10px;border-radius:9px;border:2px solid var(--oz-accent,#5A3FE6);flex:none}
.mk[data-s=planned]{border-style:dashed}.mk[data-s=in_progress]{background:linear-gradient(90deg,var(--oz-accent,#5A3FE6) 50%,transparent 50%)}.mk[data-s=shipped]{background:var(--oz-accent,#5A3FE6)}
ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.card{background:var(--oz-surface,#fff);border:1px solid var(--oz-border,#ddd);border-radius:var(--oz-radius,8px);padding:9px 11px}
.card a{color:inherit;font-weight:600;text-decoration:none;overflow-wrap:anywhere;display:inline-block;min-height:24px}
.card a:hover{text-decoration:underline}
.meta{display:flex;flex-wrap:wrap;gap:4px 8px;font-size:12px;color:color-mix(in srgb,var(--oz-ink,#111214) 74%,var(--oz-surface,#fff));margin-top:2px}
.chip{font-size:11.5px;font-weight:600;padding:0 7px;border-radius:999px;border:1px solid var(--oz-border,#ddd)}
.empty{font-size:13px;color:color-mix(in srgb,var(--oz-ink,#111214) 72%,var(--oz-canvas,#f3f4f8));margin:4px 2px}
.err{color:var(--oz-danger,#B3261E);font-weight:600}
.skel{height:120px;border-radius:var(--oz-radius,8px);background:color-mix(in srgb,var(--oz-ink,#111214) 6%,var(--oz-surface,#fff))}
.entries{display:grid;gap:10px}
article{background:var(--oz-surface,#fff);border:1px solid var(--oz-border,#ddd);border-radius:calc(var(--oz-radius,8px) + 2px);padding:14px 16px}
article h3{font-size:15px;margin:0 0 2px;display:block}
.when{font-size:12.5px;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center}
.new{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:1px 8px;border-radius:999px;background:var(--oz-accent,#5A3FE6);color:var(--oz-on-accent,#fff)}
.when time,.ai{color:color-mix(in srgb,var(--oz-ink,#111214) 74%,var(--oz-surface,#fff))}
.ai{font-style:italic}
.body{margin-top:8px;max-height:13em;overflow:hidden;position:relative;overflow-wrap:anywhere}
.body.cut::after{content:"";position:absolute;inset:auto 0 0;height:3em;background:linear-gradient(transparent,var(--oz-surface,#fff))}
.body p,.body ul,.body ol,.body pre,.body blockquote{margin:0 0 .6em}.body ul,.body ol{padding-left:1.3em;display:block}.body li{list-style:revert}
.body h3,.body h4{font-size:14px;margin:.6em 0 .3em}
.body code{font-family:ui-monospace,monospace;font-size:.92em}
.body pre{white-space:pre-wrap}
.body img{max-width:100%}
.rel{margin-top:8px;font-size:12.5px}.rel a{margin-right:8px}
.more{display:inline-flex;min-height:24px;align-items:center;margin-top:6px;font-size:13px;font-weight:600}
.badge{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border:1px solid var(--oz-border,#ddd);border-radius:999px;background:var(--oz-surface,#fff);color:inherit;font:inherit;font-weight:600;cursor:pointer}
.badge:hover{border-color:var(--oz-accent,#5A3FE6)}
.count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--oz-accent,#5A3FE6);color:var(--oz-on-accent,#fff);font-size:12px;font-weight:700;display:inline-grid;place-items:center;font-variant-numeric:tabular-nums}
.pop{position:absolute;z-index:2147482999;top:calc(100% + 8px);left:0;width:min(400px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 80px));overflow:auto;background:var(--oz-canvas,#f3f4f8);border:1px solid var(--oz-border,#ddd);border-radius:calc(var(--oz-radius,8px) + 4px);box-shadow:0 18px 50px rgba(0,0,0,.22);padding:14px}
:host([align=end]) .pop{left:auto;right:0}
@media (prefers-reduced-motion:no-preference){.pop{animation:oz-in .18s cubic-bezier(.16,1,.3,1)}@keyframes oz-in{from{opacity:0;transform:translateY(-4px)}}}
`;

type Lang = string;
type Str = (typeof T)["en"];
/** Inline sk/cs/en; pl/hu/de from the language pack widget.js loaded before the embed (lang-pack.ts). */
const strings = (l: Lang): Str => (T as Record<string, Str>)[l] ?? (packFor(l)?.embeds as Str | undefined) ?? T.en;
interface Lane { status: string; label: string; total: number; rows: { number: number; title: string; votes: number; sub: string | null; tags: { name: string }[]; url: string }[] }
interface Entry { id: string; title: string; html: string; publishedAt: string; url: string; ai: boolean; aiNote: string | null; items: { number: number; title: string; url: string }[] }

/** Shared plumbing: language, theme, data (with the person's token when the page gives one). */
function useEmbed<D>(el: HTMLElement, path: (lang: Lang) => string) {
  const s = shared();
  const [, force] = useState(0);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [data, setData] = useState<D | null>(null);
  const [err, setErr] = useState("");
  // The project switched this section off: the embed takes no room on the host page.
  const [off, setOff] = useState(false);
  const attr = (n: string) => el.getAttribute(n) ?? "";
  const host = (attr("host") || s.origin).replace(/\/$/, "");
  const project = attr("project");
  const lang = s.lang(el) as Lang;
  useEffect(() => s.api.__.subscribe(() => force((n) => n + 1)), []);
  useEffect(() => { s.config(host, project).then((c) => c?.css && setConfig(c)); }, [host, project]);
  useEffect(() => {
    let live = true;
    (async () => {
      let auth: Record<string, string> = {};
      if (attr("token") || attr("token-url") || s.api.__.state.identity) {
        try { auth = { authorization: `Bearer ${await s.api.__.token({ token: attr("token"), url: attr("token-url") })}` }; } catch { /* anonymous */ }
      }
      const d = await getJson<D>(`${host}/${project}/api/widget/${path(lang)}${path(lang).includes("?") ? "&" : "?"}lang=${lang}`, { headers: auth });
      if (live) { setData(d); setErr(""); }
    })().catch((e: Error & { status?: number; data?: { sectionOff?: boolean } }) => {
      if (!live) return;
      if (e.data?.sectionOff) return void setOff(true);
      setErr(e.status === 401 ? e.message : strings(lang).fail);
    });
    return () => { live = false; };
  }, [host, project, lang, s.api.__.state.identity]);
  const styles = <><style nonce={s.nonce}>{CSS}</style>{config && <style nonce={s.nonce}>{config.css}</style>}</>;
  return { t: strings(lang), lang, host, project, data, err, off, styles, attr };
}

function Roadmap({ el }: { el: HTMLElement }) {
  const limit = el.getAttribute("limit") || "5";
  const { t, data, err, styles, attr, off } = useEmbed<{ url: string; lanes: Lane[] }>(el, () => `roadmap?limit=${encodeURIComponent(limit)}`);
  if (off) return null;
  const want = attr("lanes").split(",").map((x) => x.trim()).filter(Boolean);
  const lanes = data?.lanes.filter((l) => !want.length || want.includes(l.status)) ?? [];
  const heading = attr("heading");
  return (
    <section aria-labelledby="oz-rm" aria-busy={!data && !err}>
      {styles}
      <div class={heading === "none" ? "sr" : "top"}>
        <h2 id="oz-rm">{heading && heading !== "none" ? heading : t.roadmap}</h2>
        {data && heading !== "none" && <a href={data.url} target="_blank" rel="noopener">{t.whole}</a>}
      </div>
      {err && <p class="err" role="alert">{err}</p>}
      {!data && !err && <div class="lanes"><div class="skel" /><div class="skel" /><div class="skel" /><span class="sr" role="status">{t.loading}</span></div>}
      {data && (
        <div class="lanes" style={`--n:${lanes.length}`}>
          {lanes.map((l) => (
            <section class="lane" key={l.status} aria-labelledby={`oz-l-${l.status}`}>
              <h3 id={`oz-l-${l.status}`}><span class="mk" data-s={l.status} aria-hidden="true" />{l.label}<span class="n">{l.total}</span></h3>
              {l.rows.length ? (
                <ol>
                  {l.rows.map((c) => (
                    <li class="card" key={c.number}>
                      <a href={c.url} target="_blank" rel="noopener">{c.title}</a>
                      <div class="meta"><span>{t.votes(c.votes)}</span>{c.sub && <span>{c.sub}</span>}{c.tags.map((g) => <span class="chip" key={g.name}>{g.name}</span>)}</div>
                    </li>
                  ))}
                </ol>
              ) : <p class="empty">{t.nothing}</p>}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function Entries({ entries, seen, t, lang }: { entries: Entry[]; seen: string | null; t: Str; lang: Lang }) {
  const fmt = new Intl.DateTimeFormat(TAG[lang], { day: "numeric", month: "long", year: "numeric" });
  if (!entries.length) return <p class="empty">{t.none}</p>;
  return (
    <div class="entries">
      {entries.map((e) => (
        <article key={e.id} aria-labelledby={`oz-e-${e.id}`}>
          <h3 id={`oz-e-${e.id}`}>{e.title}</h3>
          <div class="when">
            <time dateTime={e.publishedAt}>{fmt.format(new Date(e.publishedAt))}</time>
            {isUnseen(e, seen) && <span class="new">{t.fresh}</span>}
            {e.aiNote && <span class="ai">{e.aiNote}</span>}
          </div>
          {/* Server-rendered from the board's safe Markdown: every text is escaped there (lib/markdown.ts). */}
          <div class={`body${e.html.length > 600 ? " cut" : ""}`} dangerouslySetInnerHTML={{ __html: e.html }} />
          {e.items.length > 0 && <div class="rel"><span class="sr">{t.related}: </span>{e.items.map((i) => <a key={i.number} href={i.url} target="_blank" rel="noopener">#{i.number} {i.title}</a>)}</div>}
          <a class="more" href={e.url} target="_blank" rel="noopener">{t.more}<span class="sr">: {e.title}</span></a>
        </article>
      ))}
    </div>
  );
}

function Changelog({ el }: { el: HTMLElement }) {
  const limit = el.getAttribute("limit") || "5";
  const { t, lang, host, project, data, err, styles, attr, off } = useEmbed<{ url: string; entries: Entry[] }>(el, () => `changelog?limit=${encodeURIComponent(limit)}`);
  const badge = attr("mode") === "badge";
  const key = seenKey(host, project, shared().api.__.uid());
  const store = (() => { try { return localStorage; } catch { return null; } })();
  // What was unseen when the entries arrived: the "New" marks stay for this visit even after they count as seen.
  const [seenAtLoad, setSeenAtLoad] = useState<string | null | undefined>(undefined);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLElement>(null);
  const announce = (n: number) => { setCount(n); el.dispatchEvent(new CustomEvent("ozvi:unseen", { detail: { count: n }, bubbles: true, composed: true })); };

  useEffect(() => {
    if (!data) return;
    const seen = readSeen(store, key);
    setSeenAtLoad(seen);
    announce(unseenCount(data.entries, seen));
    if (badge) return;
    // Inline list: the entries count as seen once the list has been on screen for a moment.
    const io = new IntersectionObserver(([x]) => {
      if (!x?.isIntersecting) return;
      setTimeout(() => { writeSeen(store, key, data.entries); announce(0); }, 1500);
      io.disconnect();
    }, { threshold: 0.3 });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, [data, key]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data) { writeSeen(store, key, data.entries); announce(0); }
  }
  // A click anywhere outside closes the popover (the host page stays usable, nothing is trapped).
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => { if (!e.composedPath().includes(el)) setOpen(false); };
    document.addEventListener("click", away);
    return () => document.removeEventListener("click", away);
  }, [open]);
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };

  const heading = attr("heading");
  const title = heading && heading !== "none" ? heading : t.news;
  const list = data && <Entries entries={data.entries} seen={seenAtLoad ?? null} t={t} lang={lang} />;
  const top = data && (
    <div class={heading === "none" && !badge ? "sr" : "top"}>
      <h2 id="oz-cl">{title}{!badge && count > 0 && <span class="count" aria-hidden="true">{count}</span>}{!badge && count > 0 && <span class="sr">{t.freshN(count)}</span>}</h2>
      <a href={data.url} target="_blank" rel="noopener">{t.all}</a>
    </div>
  );

  if (badge) {
    return (
      <div onKeyDown={onKey}>
        {styles}
        <button ref={btn} type="button" class="badge" aria-expanded={open} aria-controls="oz-pop" onClick={toggle}>
          {title}{count > 0 && <><span class="count" aria-hidden="true">{count}</span><span class="sr">, {t.freshN(count)}</span></>}
        </button>
        {open && (
          <section id="oz-pop" class="pop" aria-labelledby="oz-cl">
            {top}{list}
            {err && <p class="err" role="alert">{err}</p>}
          </section>
        )}
      </div>
    );
  }
  if (off) return null;
  return (
    <section ref={box} aria-labelledby="oz-cl" aria-busy={!data && !err}>
      {styles}
      {top ?? <h2 id="oz-cl" class={heading === "none" ? "sr" : ""}>{title}</h2>}
      {err && <p class="err" role="alert">{err}</p>}
      {!data && !err && <><div class="skel" /><span class="sr" role="status">{t.loading}</span></>}
      {list}
    </section>
  );
}

(window as unknown as { __ozviEmbed: (el: HTMLElement, kind: string) => void }).__ozviEmbed = (el, kind) =>
  render(kind === "roadmap" ? <Roadmap el={el} /> : <Changelog el={el} />, el.shadowRoot!);
