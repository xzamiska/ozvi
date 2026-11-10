import { render, type JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Fragment, jsx, jsxs } from "preact/jsx-runtime";
import { createApi, traitsLine, type Controller } from "./api";
import { ignored, install, snapshot, type OzviConfig } from "./capture";
import type { ProjectConfig, Shared } from "./shared";
import type { OzviTab } from "./types";
import { PACK_LANGS, packFor, type PackLang } from "./lang-pack";

/**
 * <ozvi-widget project="billiwo" token-url="/api/ozvi-token" app-version="2.15.0"></ozvi-widget>
 *
 * Attributes
 *   project      project slug (required)
 *   host         Ozvi base URL; defaults to where widget.js was loaded from
 *   token        a signOzviToken() value, or
 *   token-url    same-origin endpoint of the host app returning {"token": "..."} (preferred: always fresh)
 *   app-version  shown to the team with every bug
 *   launcher     "none" hides the floating button; open it with window.Ozvi.open()
 *   label        launcher text
 *   lang         sk | cs | en; defaults to <html lang>, then the browser language, then sk
 *   network      "off" = no network log; "bodies" = also keep (masked) bodies of failed requests
 *   actions      "off" = no action timeline
 *   links        "auto" = attach Sentry / PostHog / LogRocket session links when their SDKs are on the page
 * Everything else (maskRequest hook, explicit session links) via window.OzviConfig; see capture.ts and the README.
 * Programmatic API: window.Ozvi (api.ts, types.ts); inline <ozvi-roadmap> and <ozvi-changelog> (embeds.tsx).
 */

const CUR = document.currentScript as HTMLScriptElement | null;
const SCRIPT_ORIGIN = (() => {
  try { return new URL(CUR!.src).origin; } catch { return location.origin; }
})();
type Win = { Ozvi?: unknown; OzviConfig?: OzviConfig & { nonce?: string }; __ozviP?: Shared; __ozviIdeas?: unknown; __ozviEmbed?: (el: HTMLElement, kind: string) => void };
const W = window as unknown as Win;
// Strict CSP: the nonce of this <script> goes to every script and style the widget adds.
const NONCE = CUR?.nonce || W.OzviConfig?.nonce || "";

// Console errors, the network log and the action timeline help the team reproduce. Masked as they are
// recorded, kept in memory only, sent only with a bug report (capture.ts).
install();
// A second copy of widget.js on the page keeps the first one's API.
const api = (W.Ozvi as { __?: unknown } | undefined)?.__ ? (W.Ozvi as ReturnType<typeof createApi>) : createApi(window as never, "1");

const scripts = new Map<string, Promise<void>>();
const load = (src: string) => {
  if (!scripts.has(src)) scripts.set(src, new Promise<void>((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.nonce = NONCE; s.onload = () => res(); s.onerror = () => { scripts.delete(src); rej(new Error(src)); };
    document.head.appendChild(s);
  }));
  return scripts.get(src)!;
};
const configs = new Map<string, Promise<ProjectConfig | null>>();
/** Project look (theme CSS for :host, font stylesheet), fetched once per project and shared with the embeds. */
const loadConfig = (host: string, project: string) => {
  const key = `${host}/${project}`;
  if (!configs.has(key)) configs.set(key, fetch(`${key}/api/widget/config`).then((r) => r.json()).then((c: ProjectConfig) => {
    // @font-face does not work inside shadow DOM, so the font stylesheet goes to the host document (once).
    // Fonts come only from the Ozvi origin (/fonts/css), never from a font CDN: no visitor IP leaves for Google.
    const fonts = c.fonts && new URL(c.fonts, `${host}/`);
    if (fonts && fonts.origin === new URL(`${host}/`).origin && !document.querySelector(`link[data-ozvi-fonts]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = fonts.href; l.nonce = NONCE; l.setAttribute("data-ozvi-fonts", "");
      document.head.appendChild(l);
    }
    return c;
  }).catch(() => { configs.delete(key); return null; }));
  return configs.get(key)!;
};

type View = "menu" | "bug" | "sent" | "ideas" | "idea";

// Strings per language. Kept terse: the whole widget has a 20 kB gzip budget.
const T = {
  sk: {
    fb: "Spätná väzba", fbFor: "Spätná väzba pre ", app: "aplikáciu", shooting: "Pripravujem screenshot…",
    bug: "Nahlásiť chybu", bugSub: "Priložíme screenshot a technické údaje", idea: "Navrhnúť nápad", ideaSub: "Alebo zahlasujte za existujúci",
    mine: "Moje hlásenia", mineSub: "Stav a odpovede tímu", thanks: "Ďakujeme", close: "Zavrieť",
    what: "Čo nefunguje?", whatPh: "Napr. Po uložení zmizne poznámka", how: "Čo ste robili a čo ste čakali?", opt: "(nepovinné)",
    howPh: "Napr. vyplnil som poznámku a po uložení zmizla", shotAlt: "Screenshot, ktorý sa priloží", shotDel: "Odstrániť screenshot",
    del: "Odstrániť ", attach: "Priložiť súbor", sending: "Odosielam…",
    note: "Priložíme adresu stránky, verziu aplikácie, prehliadač a posledné chyby z konzoly. Hlásenie uvidíte len vy a tím.", ann: "Označiť", annFail: "Editor sa nepodarilo načítať.",
    tech: "Priložiť záznam požiadaviek a krokov", techSub: "Bez obsahu polí, citlivé údaje maskujeme. Vidí ho len tím.",
    tag: "Hlásenie chyby", route: "Trasa hlásenia", stops: ["Prijaté", "Potvrdené", "Rozpracované", "Opravené"],
    sent: "Hlásenie sme dostali. Vidíte ho len vy a tím. Pri každej zastávke vám príde e-mail a po oprave nám jedným klikom potvrdíte, či to funguje.",
    view: "Pozrieť hlásenie", files: "Niektoré súbory sme nepridali: najviac 10 MB, obrázky, PDF alebo text.",
    queued: "Čaká na schválenie", queuedText: "Tím príspevky od ľudí mimo tímu pred zverejnením schvaľuje. Zatiaľ ho vidíte len vy, po schválení ho uvidia všetci. Ak ho tím nezverejní, napíšeme vám prečo.",
    fail: "Hlásenie sa nepodarilo odoslať.", who: "Nepodarilo sa overiť, kto ste. Obnovte stránku a skúste to znova.",
    ideas: "Nápady", loading: "Načítavam…", loadFail: "Nepodarilo sa načítať. Skontrolujte pripojenie a skúste to znova.", back: "Späť",
  },
  cs: {
    fb: "Zpětná vazba", fbFor: "Zpětná vazba pro ", app: "aplikaci", shooting: "Připravuji snímek obrazovky…",
    bug: "Nahlásit chybu", bugSub: "Přiložíme snímek obrazovky a technické údaje", idea: "Navrhnout nápad", ideaSub: "Nebo hlasujte pro existující",
    mine: "Moje hlášení", mineSub: "Stav a odpovědi týmu", thanks: "Děkujeme", close: "Zavřít",
    what: "Co nefunguje?", whatPh: "Např. Po uložení zmizí poznámka", how: "Co jste dělali a co jste čekali?", opt: "(nepovinné)",
    howPh: "Např. vyplnil jsem poznámku a po uložení zmizela", shotAlt: "Snímek obrazovky, který se přiloží", shotDel: "Odebrat snímek",
    del: "Odebrat ", attach: "Přiložit soubor", sending: "Odesílám…",
    note: "Přiložíme adresu stránky, verzi aplikace, prohlížeč a poslední chyby z konzole. Hlášení uvidíte jen vy a tým.", ann: "Označit", annFail: "Editor se nepodařilo načíst.",
    tech: "Přiložit záznam požadavků a kroků", techSub: "Bez obsahu polí, citlivé údaje maskujeme. Vidí ho jen tým.",
    tag: "Hlášení chyby", route: "Cesta hlášení", stops: ["Přijato", "Potvrzeno", "Rozpracováno", "Opraveno"],
    sent: "Hlášení jsme dostali. Vidíte ho jen vy a tým. Při každé zastávce vám přijde e-mail a po opravě nám jedním kliknutím potvrdíte, zda to funguje.",
    view: "Zobrazit hlášení", files: "Některé soubory jsme nepřidali: nejvýše 10 MB, obrázky, PDF nebo text.",
    queued: "Čeká na schválení", queuedText: "Tým příspěvky od lidí mimo tým před zveřejněním schvaluje. Zatím ho vidíte jen vy, po schválení ho uvidí všichni. Pokud ho tým nezveřejní, napíšeme vám proč.",
    fail: "Hlášení se nepodařilo odeslat.", who: "Nepodařilo se ověřit, kdo jste. Obnovte stránku a zkuste to znovu.",
    ideas: "Nápady", loading: "Načítám…", loadFail: "Nepodařilo se načíst. Zkontrolujte připojení a zkuste to znovu.", back: "Zpět",
  },
  en: {
    fb: "Feedback", fbFor: "Feedback for ", app: "the app", shooting: "Taking a screenshot…",
    bug: "Report a bug", bugSub: "We'll attach a screenshot and technical details", idea: "Suggest an idea", ideaSub: "Or vote for an existing one",
    mine: "My reports", mineSub: "Status and replies from the team", thanks: "Thank you", close: "Close",
    what: "What isn't working?", whatPh: "E.g. The note disappears after saving", how: "What did you do and what did you expect?", opt: "(optional)",
    howPh: "E.g. I filled in the note and it was gone after saving", shotAlt: "Screenshot to be attached", shotDel: "Remove screenshot",
    del: "Remove ", attach: "Attach a file", sending: "Sending…",
    note: "We'll attach the page address, app version, browser and recent console errors. Only you and the team can see the report.", ann: "Mark up", annFail: "The editor couldn't load.",
    tech: "Attach the request log and recent steps", techSub: "No field contents; sensitive data is masked. Only the team sees it.",
    tag: "Bug report", route: "Report route", stops: ["Received", "Confirmed", "In progress", "Fixed"],
    sent: "We've got your report. Only you and the team can see it. You'll get an e-mail at every stop, and after the fix you confirm with one click whether it works.",
    view: "View report", files: "Some files weren't added: max 10 MB, images, PDF or text only.",
    queued: "Awaiting approval", queuedText: "The team approves posts from outside the team before publishing them. For now only you can see it; once approved, everyone can. If the team doesn't publish it, we'll e-mail you why.",
    fail: "The report couldn't be sent.", who: "We couldn't verify who you are. Reload the page and try again.",
    ideas: "Ideas", loading: "Loading…", loadFail: "Couldn't load. Check your connection and try again.", back: "Back",
  },
};
type Inline = keyof typeof T;
type Lang = Inline | PackLang;
type Str = (typeof T)["en"];
const isPack = (l: string): l is PackLang => (PACK_LANGS as readonly string[]).includes(l);
const pickLang = (el: HTMLElement): Lang => {
  for (const v of [api.__.state.lang, el.getAttribute("lang"), document.documentElement.lang, navigator.language]) {
    const l = (v ?? "").slice(0, 2).toLowerCase();
    if (l in T || isPack(l)) return l as Lang;
  }
  return "sk";
};
/** pl/hu/de come from widget-lang-<l>.js (lang-pack.ts); English only if that file failed to load. */
const strings = (l: Lang): Str => (l in T ? T[l as Inline] : (packFor(l)?.main as Str | undefined) ?? T.en);
const ensurePack = (host: string, l: Lang): Promise<unknown> =>
  isPack(l) && !packFor(l) ? load(`${host}/widget-lang-${l}.js`).catch(() => {}) : Promise.resolve();

const svg = (d: string, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ICON = {
  close: "M6 6l12 12M18 6L6 18",
  chat: "M20 12a8 8 0 01-11.6 7.1L4 20l1-4.2A8 8 0 1120 12z",
  bug: "M12 20a5 5 0 005-5v-3a5 5 0 00-10 0v3a5 5 0 005 5zM9 7a3 3 0 016 0M3 13h4M17 13h4",
  idea: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0012 3z",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  clip: "M20 11.5l-7.8 7.8a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8",
  check: "M5 12.5l4.5 4.5L19 7.5",
  pen: "M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16z",
  back: "M15 18l-6-6 6-6",
};
type Config = ProjectConfig;

// Only what the chunks use (build.mjs maps their preact imports here); add exports here when a chunk needs more.
W.__ozviP = { preact: { render }, hooks: { useEffect, useRef, useState }, jsx: { jsx, jsxs, Fragment }, nonce: NONCE, origin: SCRIPT_ORIGIN, api, load, config: loadConfig, lang: pickLang };

const CSS = `
:host{all:initial;position:fixed;z-index:2147483000;bottom:20px;right:20px;font-family:var(--oz-font-body,system-ui,sans-serif);color:var(--oz-ink,#111214)}
*{box-sizing:border-box;font:inherit;color:inherit}
.launch{display:inline-flex;gap:8px;align-items:center;height:44px;padding:0 18px 0 14px;border:0;border-radius:999px;background:var(--oz-accent,#5A3FE6);color:var(--oz-on-accent,#fff);font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.08),0 10px 28px -8px rgba(0,0,0,.35);transition:transform .2s cubic-bezier(.16,1,.3,1)}
.launch:hover{transform:translateY(-1px)}.launch[disabled]{cursor:progress;opacity:.85}
.panel{animation:oz-in .22s cubic-bezier(.16,1,.3,1);transform-origin:bottom right;position:absolute;bottom:0;right:0;width:min(380px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 40px));overflow:auto;background:var(--oz-surface,#fff);border:1px solid var(--oz-border,#ddd);border-radius:calc(var(--oz-radius,8px) + 4px);box-shadow:0 18px 50px rgba(0,0,0,.22);padding:16px}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.head h2{margin:0;font-family:var(--oz-font-heading,inherit);font-size:16px;font-weight:700}.head h2:focus{outline:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.x{display:grid;place-items:center;width:32px;height:32px;border:0;background:none;cursor:pointer;border-radius:8px;opacity:.7}.x:hover{opacity:1;background:color-mix(in srgb,currentColor 8%,transparent)}
.opt{display:grid;grid-template-columns:36px 1fr;column-gap:12px;align-items:center;width:100%;text-align:left;padding:12px;margin-bottom:8px;border:1px solid var(--oz-border,#ddd);border-radius:var(--oz-radius,8px);background:var(--oz-surface,#fff);cursor:pointer;transition:border-color .15s,background-color .15s}
.opt i{grid-row:span 2;display:grid;place-items:center;width:36px;height:36px;border-radius:calc(var(--oz-radius,8px) - 2px);background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 12%,var(--oz-surface,#fff));color:var(--oz-accent,#5A3FE6)}
.opt b{font-weight:600;font-size:14px}.opt span{font-size:12.5px;opacity:.7}
.opt:hover{border-color:var(--oz-accent,#5A3FE6);background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 5%,var(--oz-surface,#fff))}
.files{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 4px 3px 10px;border-radius:999px;background:var(--oz-canvas,#f3f4f8);font-size:12px;overflow:hidden}
.chip button{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:999px;background:none;cursor:pointer}
.attach{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px dashed var(--oz-border,#ccc);border-radius:999px;background:none;cursor:pointer;font-size:12.5px;font-weight:600}
.attach:hover{border-color:var(--oz-accent,#5A3FE6);color:var(--oz-accent,#5A3FE6)}
.tag{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:var(--oz-radius,8px);background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 10%,var(--oz-surface,#fff));font-size:12.5px;font-weight:600}
.tag b{font-family:var(--oz-font-heading,inherit);font-size:22px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.route{display:grid;grid-template-columns:repeat(4,1fr);list-style:none;margin:16px 0 4px;padding:0}
.route li{position:relative;display:grid;justify-items:center;gap:6px;font-size:11.5px;font-weight:600;text-align:center;opacity:.72}
.route li.on{opacity:1}
.route li i{position:relative;z-index:1;width:12px;height:12px;border-radius:999px;border:2px solid color-mix(in srgb,var(--oz-ink,#111214) 25%,var(--oz-border,#ddd));background:var(--oz-surface,#fff)}
.route li.on i{border-color:var(--oz-accent,#5A3FE6);background:var(--oz-accent,#5A3FE6);box-shadow:0 0 0 4px color-mix(in srgb,var(--oz-accent,#5A3FE6) 22%,transparent)}
.route li+li::before{content:"";position:absolute;top:5px;right:50%;width:100%;height:2px;background:color-mix(in srgb,var(--oz-ink,#111214) 18%,var(--oz-border,#ddd))}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
input,textarea{width:100%;padding:9px 11px;border:1px solid color-mix(in srgb,var(--oz-ink,#111214) 22%,var(--oz-border,#ddd));border-radius:var(--oz-radius,8px);background:var(--oz-surface,#fff);font-size:14px;transition:border-color .15s,box-shadow .15s}
input:focus,textarea:focus{outline:none;border-color:var(--oz-accent,#5A3FE6);box-shadow:0 0 0 3px color-mix(in srgb,var(--oz-accent,#5A3FE6) 25%,transparent)}
::selection{background:color-mix(in srgb,var(--oz-accent,#5A3FE6) 24%,transparent)}
textarea{resize:vertical;min-height:80px}
.shot{position:relative;margin-top:10px}.shot img{width:100%;border-radius:var(--oz-radius,8px);border:1px solid var(--oz-border,#ddd);display:block}
.shot div{position:absolute;top:6px;right:6px;display:flex;gap:6px}
.shot button{display:inline-flex;align-items:center;gap:5px;min-height:28px;border:0;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;background:rgba(0,0,0,.72);color:#fff;cursor:pointer}.shot button:hover{background:rgba(0,0,0,.88)}
.tech{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:start;margin:12px 0 0;font-size:13px;font-weight:600;cursor:pointer}
.tech input{width:16px;height:16px;margin:2px 0 0;padding:0;accent-color:var(--oz-accent,#5A3FE6)}.tech small{grid-column:2;font-size:12px;font-weight:400;opacity:.75}
.btn{margin-top:14px;width:100%;padding:11px;border:0;border-radius:var(--oz-radius,8px);background:var(--oz-accent,#5A3FE6);color:var(--oz-on-accent,#fff);font-weight:600;cursor:pointer}
.btn[disabled]{opacity:.6;cursor:progress}
.muted{font-size:12px;opacity:.75;margin:10px 0 0}
.err{color:var(--oz-danger,#B3261E);font-weight:600;font-size:13px;margin:10px 0 0}
a{color:var(--oz-accent,#5A3FE6)}
@keyframes oz-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
:focus-visible{outline:2px solid var(--oz-accent,#5A3FE6);outline-offset:2px}
`;

/** Props of the lazy ideas view (ideas.tsx, widget-ideas.js). */
export interface IdeasCtx {
  host: string; project: string; lang: Lang; view: "ideas" | "idea";
  setView(v: "ideas" | "idea"): void;
  token(): Promise<string>;
  openBoard(path: string): void;
}

function App({ el }: { el: HTMLElement & { _r?: () => void } }) {
  const attr = (n: string) => el.getAttribute(n) ?? "";
  const host = (attr("host") || SCRIPT_ORIGIN).replace(/\/$/, "");
  const project = attr("project");
  const lang = pickLang(el);
  const t = strings(lang);
  const [, rerender] = useState(0);
  // Language switched at runtime (Ozvi.setLanguage) to one that is not loaded yet: load it, then re-render.
  useEffect(() => { if (isPack(lang) && !packFor(lang)) void ensurePack(host, lang).then(() => rerender((n) => n + 1)); }, [lang, host]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [config, setConfig] = useState<Config | null>(null);
  const [shot, setShot] = useState<Blob | null>(null);
  const [shotUrl, setShotUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ number: number; pending?: string | null } | null>(null);
  const [extra, setExtra] = useState<File[]>([]);
  const [tech, setTech] = useState(true);
  const [hasTech, setHasTech] = useState(false);
  const [Ideas, setIdeas] = useState<((p: { ctx: IdeasCtx }) => JSX.Element) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pre = api.__.state.prefill;

  const addFiles = (files: File[]) => {
    const ok = files.filter((f) => f.size <= 10 * 1024 * 1024 && /^(image\/|application\/pdf|text\/)/.test(f.type || "text/plain"));
    if (ok.length < files.length) setError(t.files);
    setExtra((prev) => [...prev, ...ok].slice(0, shot ? 4 : 5));
  };
  const title = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const emit = (name: Parameters<typeof api.__.emit>[0], detail: unknown = {}) => api.__.emit(name, detail, el);

  // Focus follows the panel (WCAG 2.4.3): into it when it opens or changes view, back to the launcher when it closes.
  useEffect(() => {
    if (open) {
      if (view !== "bug") setTimeout(() => (view === "sent" ? heading.current : panel.current?.querySelector<HTMLElement>("button.opt"))?.focus(), 30);
      if (!wasOpen.current) emit("open", { tab: view });
    } else if (wasOpen.current) {
      if (!busy) launcher.current?.focus();
      emit("close");
    }
    wasOpen.current = open;
  }, [open, view, busy]);

  useEffect(() => {
    // Our own requests and the host's token endpoint (its response is a token) never enter the network log.
    ignored.push(`${host}/${project}/api/`, `${host}/${project}/sso`, `${host}/widget-`, `${host}/fonts/`);
    if (attr("token-url")) try { ignored.push(new URL(attr("token-url"), location.href).href.split("?")[0]!); } catch { /* ignore */ }
  }, [host, project]);

  useEffect(() => { loadConfig(host, project).then((c) => c?.css && setConfig(c)); }, [host, project]);

  // window.Ozvi drives this widget: open/close/toggle; prefill, identify, setLanguage re-render it.
  const self = useRef<Controller>(null as never);
  self.current = { el, open: (tab) => openTab(tab), close: () => close(), isOpen: () => open };
  useEffect(() => {
    const ctl: Controller = { el, open: (x) => self.current.open(x), close: () => self.current.close(), isOpen: () => self.current.isOpen() };
    const force = () => rerender((n) => n + 1);
    el._r = force;
    api.__.attach(ctl);
    const unsub = api.__.subscribe(force);
    return () => { api.__.detach(ctl); unsub(); };
  }, []);

  useEffect(() => () => { if (shotUrl) URL.revokeObjectURL(shotUrl); }, [shotUrl]);

  const token = () => api.__.token({ token: attr("token"), url: attr("token-url") });

  function openTab(tab: OzviTab) {
    setError("");
    if (tab === "bug") return void startBug();
    if (tab === "mine") return void openBoard("/bugs");
    if (tab === "ideas" || tab === "idea") return void showIdeas(tab);
    setView("menu"); setOpen(true);
  }

  /** In-widget ideas (list, vote, suggest): widget-ideas.js, loaded on first use. */
  async function showIdeas(v: "ideas" | "idea") {
    setView(v); setOpen(true);
    if (Ideas) return;
    try {
      if (!W.__ozviIdeas) await load(`${host}/widget-ideas.js`);
      setIdeas(() => W.__ozviIdeas as never);
    } catch {
      setError(t.loadFail);
    }
  }

  async function startBug() {
    setError("");
    setOpen(false); // hide the panel so the screenshot shows the app, not us
    setBusy(true);
    try {
      const w = window as unknown as { __ozviShot?: (e: Element) => Promise<Blob | null> };
      if (!w.__ozviShot) await load(`${host}/widget-shot.js`);
      const blob = await w.__ozviShot!(el);
      setShot(blob);
      setShotUrl(blob ? URL.createObjectURL(blob) : null);
    } catch {
      setShot(null);
    }
    const s = snapshot();
    setHasTech(s.network.length + s.actions.length > 0);
    setBusy(false);
    setView("bug");
    setOpen(true);
    setTimeout(() => title.current?.focus(), 30);
  }

  /** Lazy-loads the annotation editor (widget-annotate.js); a marked-up copy replaces the screenshot, blur included. */
  async function markUp() {
    if (!shot) return;
    const w = window as unknown as { __ozviAnnotate?: (b: Blob, m: ShadowRoot, l: Lang) => Promise<Blob | null> };
    try {
      if (!w.__ozviAnnotate) await load(`${host}/widget-annotate.js`);
      const out = await w.__ozviAnnotate!(shot, el.shadowRoot!, lang);
      if (out) { setShot(out); setShotUrl(URL.createObjectURL(out)); }
    } catch {
      setError(t.annFail);
    }
  }

  async function openBoard(path: string) {
    // Open synchronously to avoid popup blockers, then point it at the SSO URL.
    const win = window.open("about:blank", "_blank");
    try {
      const tok = await token();
      const url = `${host}/${project}/sso?token=${encodeURIComponent(tok)}&return=${encodeURIComponent(`/${project}${path}`)}`;
      if (win) win.location.href = url; else location.href = url;
    } catch {
      if (win) win.location.href = `${host}/${project}${path}`;
    }
  }

  function ctxCapture() {
    const s = snapshot();
    return {
      console: s.errors.map((x) => x.text).join("\n"),
      errors: s.errors,
      sentAt: Date.now(),
      ...(api.__.state.traits ? { traits: traitsLine(api.__.state.traits) } : {}),
      ...(tech ? { network: s.network, actions: s.actions, links: s.links } : {}),
    };
  }

  async function submit(e: Event) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    f.set("kind", "bug");
    f.set("context", JSON.stringify({
      url: location.href,
      appVersion: attr("app-version"),
      browser: navigator.userAgent,
      viewport: `${innerWidth}×${innerHeight}`,
      language: navigator.language,
      ...ctxCapture(),
    }));
    if (shot) f.append("files", shot, "screenshot.jpg");
    extra.forEach((x) => f.append("files", x, x.name));
    setBusy(true); setError("");
    emit("submit", { kind: "bug", title: String(f.get("title") ?? "") });
    try {
      const r = await fetch(`${host}/${project}/api/widget/items?lang=${lang}`, { method: "POST", body: f, headers: { authorization: `Bearer ${await token()}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || t.fail);
      setSent({ number: data.number, pending: data.pending });
      setView("sent");
      setShot(null); setShotUrl(null); setExtra([]);
      if (pre?.kind !== "idea") api.__.state.prefill = null;
      emit("submitted", { kind: "bug", number: data.number, url: `${host}${data.url}`, pending: data.pending ?? null });
    } catch (err) {
      const message = (err as Error).message === "no-token" ? t.who : (err as Error).message;
      setError(message);
      emit("error", { kind: "bug", message });
    } finally {
      setBusy(false);
    }
  }

  function close() { setOpen(false); setView("menu"); setError(""); }

  // Keyboard: Escape closes, Tab cycles inside the panel (the shadow root's activeElement is ours).
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab" || !panel.current) return;
    const f = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([hidden]),textarea,a[href]")];
    if (!f.length) return;
    const active = (el.shadowRoot?.activeElement ?? null) as HTMLElement | null;
    const [first, last] = [f[0]!, f[f.length - 1]!];
    if (e.shiftKey && (active === first || !panel.current.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  };

  const isIdeas = view === "ideas" || view === "idea";
  const bugPre = pre && pre.kind !== "idea" ? pre : null;

  return (
    <>
      <style nonce={NONCE}>{CSS}</style>
      <span class="sr" role="status">{busy && !open ? t.shooting : ""}</span>
      {config && <style nonce={NONCE}>{config.css}</style>}
      {!open && attr("launcher") !== "none" && (
        <button ref={launcher} class="launch" onClick={() => openTab("menu")} disabled={busy} aria-haspopup="dialog">
          {svg(ICON.chat, 18)}{busy ? t.shooting : attr("label") || t.fb}
        </button>
      )}
      {open && (
        <div ref={panel} class="panel" role="dialog" aria-modal="true" aria-label={t.fbFor + (config?.name ?? t.app)} onKeyDown={onKey}>
          <div class="head">
            {isIdeas && (
              <button class="x" onClick={() => (view === "idea" ? setView("ideas") : setView("menu"))} aria-label={t.back}>{svg(ICON.back)}</button>
            )}
            <h2 ref={heading} tabIndex={-1}>{view === "bug" ? t.bug : view === "sent" ? t.thanks : view === "idea" ? t.idea : view === "ideas" ? t.ideas : config?.name ?? t.fb}</h2>
            <button class="x" onClick={close} aria-label={t.close}>{svg(ICON.close)}</button>
          </div>

          {view === "menu" && (
            <>
              <button class="opt" onClick={startBug}><i>{svg(ICON.bug)}</i><b>{t.bug}</b> <span>{t.bugSub}</span></button>
              <button class="opt" onClick={() => showIdeas("ideas")}><i>{svg(ICON.idea)}</i><b>{t.idea}</b> <span>{t.ideaSub}</span></button>
              <button class="opt" onClick={() => openBoard("/bugs")}><i>{svg(ICON.list)}</i><b>{t.mine}</b> <span>{t.mineSub}</span></button>
            </>
          )}

          {isIdeas && (Ideas
            ? <Ideas ctx={{ host, project, lang, view, setView, token, openBoard }} />
            : <p class={error ? "err" : "muted"} role={error ? "alert" : "status"}>{error || t.loading}</p>)}

          {view === "bug" && (
            <form onSubmit={submit}>
              <label for="oz-t">{t.what}</label>
              <input id="oz-t" ref={title} name="title" required minLength={3} maxLength={200} placeholder={t.whatPh} defaultValue={bugPre?.title} />
              <label for="oz-b">{t.how} <span style="font-weight:400;opacity:.7">{t.opt}</span></label>
              <textarea id="oz-b" name="body" maxLength={10000} placeholder={t.howPh} defaultValue={bugPre?.body}
                onPaste={(e) => { const fl = [...(e.clipboardData?.files ?? [])]; if (fl.length) { e.preventDefault(); addFiles(fl); } }} />
              {shotUrl && (
                <div class="shot">
                  <img src={shotUrl} alt={t.shotAlt} />
                  <div>
                    <button type="button" onClick={markUp}>{svg(ICON.pen, 14)}{t.ann}</button>
                    <button type="button" onClick={() => { setShot(null); setShotUrl(null); }}>{t.shotDel}</button>
                  </div>
                </div>
              )}
              <div class="files">
                {extra.map((x, i) => (
                  <span class="chip" key={`${x.name}-${i}`}>{x.name}
                    <button type="button" aria-label={t.del + x.name} onClick={() => setExtra(extra.filter((_, j) => j !== i))}>{svg(ICON.close, 12)}</button>
                  </span>
                ))}
                <button type="button" class="attach" onClick={() => fileInput.current?.click()}>{svg(ICON.clip, 15)}{t.attach}</button>
                <input ref={fileInput} type="file" multiple hidden accept="image/*,application/pdf,text/plain,.log"
                  onChange={(e) => { const t = e.currentTarget; addFiles([...(t.files ?? [])]); t.value = ""; }} />
              </div>
              {hasTech && (
                <label class="tech"><input type="checkbox" checked={tech} onChange={(e) => setTech(e.currentTarget.checked)} />{t.tech}<small>{t.techSub}</small></label>
              )}
              {error && <p class="err" role="alert">{error}</p>}
              <button class="btn" disabled={busy}>{busy ? t.sending : t.bug}</button>
              <p class="muted">{t.note}</p>
            </form>
          )}

          {view === "sent" && sent && (
            <>
              <div class="tag"><span>{sent.pending ? t.queued : t.tag}</span><b>#{sent.number}</b></div>
              {sent.pending ? <p role="status">{t.queuedText}</p> : (
                <>
                  <ol class="route" aria-label={t.route}>
                    {t.stops.map((l, i) => <li key={l} class={i === 0 ? "on" : ""}><i />{l}</li>)}
                  </ol>
                  <p>{t.sent}</p>
                </>
              )}
              <button class="btn" onClick={() => openBoard(`/i/${sent.number}`)}>{t.view}</button>
            </>
          )}
        </div>
      )}
    </>
  );
}

class OzviWidget extends HTMLElement {
  static observedAttributes = ["lang", "label", "launcher"];
  declare _r?: () => void;
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    // Typing in the widget must not trigger the host app's keyboard shortcuts or paste handlers:
    // outside the shadow root these events are retargeted to <ozvi-widget>, so the host cannot
    // tell they came from a text field. Our own handlers sit deeper and run first.
    for (const type of ["keydown", "keyup", "keypress", "paste", "copy", "cut"]) {
      root.addEventListener(type, (e) => e.stopPropagation());
    }
    // Polish, Hungarian, German: the strings arrive first, so nobody sees the widget in another language.
    void ensurePack((this.getAttribute("host") || SCRIPT_ORIGIN).replace(/\/$/, ""), pickLang(this)).then(() => render(<App el={this} />, root));
  }
  attributeChangedCallback() { this._r?.(); }
  // The element is a handle too: document.querySelector("ozvi-widget").open("ideas").
  open(tab?: OzviTab) { api.open(tab); }
  close() { api.close(); }
  toggle(tab?: OzviTab) { api.toggle(tab); }
  prefill(p: Parameters<typeof api.prefill>[0]) { api.prefill(p); }
}

if (!customElements.get("ozvi-widget")) customElements.define("ozvi-widget", OzviWidget);

// Inline embeds: tiny shells here, the UI (widget-embeds.js) loads when one appears on the page.
for (const kind of ["roadmap", "changelog"]) {
  if (customElements.get(`ozvi-${kind}`)) continue;
  customElements.define(`ozvi-${kind}`, class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: "open" });
      const host = (this.getAttribute("host") || SCRIPT_ORIGIN).replace(/\/$/, "");
      Promise.all([W.__ozviEmbed ? Promise.resolve() : load(`${host}/widget-embeds.js`), ensurePack(host, pickLang(this))])
        .then(() => W.__ozviEmbed!(this, kind), () => {});
    }
  });
}

