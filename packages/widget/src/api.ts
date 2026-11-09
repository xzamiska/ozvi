import type { OzviApi, OzviConfig, OzviEventName, OzviIdentity, OzviLang, OzviOptions, OzviPrefill, OzviTab, OzviTokenSource, OzviTraits } from "./types";

/**
 * window.Ozvi: the programmatic API. Pure (no Preact, no DOM rendering) so it is tested on its own.
 * Calls made before widget.js loaded (the snippet stub collects them in `Ozvi.q`) run in order once it has;
 * calls that need the widget (open, close…) wait until an <ozvi-widget> is on the page.
 */

/** What a mounted <ozvi-widget> exposes to the API. */
export interface Controller {
  el: HTMLElement;
  open(tab: OzviTab): void;
  close(): void;
  isOpen(): boolean;
}

export interface ApiState {
  prefill: OzviPrefill | null;
  lang: OzviLang | null;
  identity: { token?: OzviTokenSource; id?: string } | null;
  traits: OzviTraits | null;
}

type Fn = (d: unknown) => void;
export interface Internals {
  state: ApiState;
  attach(c: Controller): void;
  detach(c: Controller): void;
  subscribe(fn: () => void): () => void;
  emit(name: OzviEventName, detail: unknown, el?: HTMLElement): void;
  /** A token for the API: identify() > token attribute > token-url (cached until shortly before it expires). */
  token(attrs: { token?: string; url?: string }, fetcher?: typeof fetch): Promise<string>;
  /** The person's id for per-person local state (identify({id}), else the id inside the last token). */
  uid(): string;
}

export type FullApi = OzviApi & { __: Internals; q?: unknown[] };

const METHODS = ["init", "open", "close", "toggle", "isOpen", "prefill", "identify", "logout", "setTraits", "setLanguage", "on", "off", "configure"] as const;
const LANGS = ["sk", "cs", "en", "pl", "hu", "de"];

/** Claims of a signOzviToken() value, unverified (only for the expiry and the local per-person key). */
export function peekToken(token: string): { id?: string; exp?: number } {
  try {
    const p = token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(p + "===".slice((p.length + 3) % 4)));
  } catch { return {}; }
}

const toAttr = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function createApi(w: Window & { Ozvi?: unknown; OzviConfig?: OzviConfig }, version: string, doc?: Document): FullApi {
  const prev = w.Ozvi as { q?: ArrayLike<unknown>[] } | ((...a: unknown[]) => unknown) | undefined;
  const listeners = new Map<string, Set<Fn>>();
  const subs = new Set<() => void>();
  const state: ApiState = { prefill: null, lang: null, identity: null, traits: null };
  const ctls: Controller[] = [];
  const waiting: ((c: Controller) => void)[] = [];
  let cached: { v: string; exp: number; key: string } | null = null;
  let lastUid = "";
  const changed = () => subs.forEach((f) => f());
  const withCtl = (f: (c: Controller) => void) => (ctls[0] ? f(ctls[0]) : void waiting.push(f));

  const api = function (method: string, ...args: unknown[]) {
    if (method === "ready") return typeof args[0] === "function" ? api.ready.then(args[0] as (a: OzviApi) => void) : api.ready;
    const f = (api as unknown as Record<string, unknown>)[method];
    if (typeof f === "function" && (METHODS as readonly string[]).includes(method)) return (f as (...a: unknown[]) => unknown)(...args);
  } as FullApi;

  const internals: Internals = {
    state,
    attach(c) { ctls.push(c); waiting.splice(0).forEach((f) => f(c)); },
    detach(c) { const i = ctls.indexOf(c); if (i >= 0) ctls.splice(i, 1); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    emit(name, detail, el) {
      for (const fn of [...(listeners.get(name) ?? [])]) {
        // One broken listener must not stop the others or the widget.
        try { fn(detail); } catch (e) { setTimeout(() => { throw e; }); }
      }
      el?.dispatchEvent(new CustomEvent(`ozvi:${name}`, { detail, bubbles: true, composed: true }));
    },
    async token(attrs, fetcher = w.fetch.bind(w)) {
      const src = state.identity?.token;
      let tok: string;
      if (src) tok = typeof src === "function" ? await src() : src;
      else if (attrs.token) tok = attrs.token;
      else {
        if (!attrs.url) throw new Error("no-token");
        const now = Date.now() / 1000;
        if (cached && cached.key === attrs.url && cached.exp - 60 > now) tok = cached.v;
        else {
          const r = await fetcher(attrs.url, { credentials: "include" });
          if (!r.ok) throw new Error("no-token");
          tok = r.headers.get("content-type")?.includes("json") ? (await r.json()).token : await r.text();
          tok = String(tok ?? "").trim();
          const exp = peekToken(tok).exp;
          cached = exp ? { v: tok, exp, key: attrs.url } : null;
        }
      }
      if (!tok) throw new Error("no-token");
      lastUid = peekToken(tok).id ?? lastUid;
      return tok;
    },
    uid: () => state.identity?.id ?? lastUid,
  };

  Object.assign(api, {
    version,
    __: internals,
    ready: Promise.resolve(api),
    init(o: OzviOptions) {
      const d = doc ?? w.document;
      const existing = d.querySelector(`ozvi-widget[project="${CSS.escape(o.project)}"]`);
      if (existing) return existing;
      const el = d.createElement("ozvi-widget");
      for (const [k, v] of Object.entries(o)) if (v != null && v !== "") el.setAttribute(toAttr(k), String(v));
      d.body.appendChild(el);
      return el;
    },
    open: (tab: OzviTab = "menu") => withCtl((c) => c.open(tab)),
    close: () => withCtl((c) => c.close()),
    toggle: (tab: OzviTab = "menu") => withCtl((c) => (c.isOpen() ? c.close() : c.open(tab))),
    isOpen: () => !!ctls[0]?.isOpen(),
    prefill(p: OzviPrefill | null) {
      state.prefill = p && typeof p === "object"
        ? { title: p.title == null ? undefined : String(p.title).slice(0, 200), body: p.body == null ? undefined : String(p.body).slice(0, 10000), kind: p.kind === "idea" ? "idea" : "bug" }
        : null;
      changed();
    },
    identify(who: OzviTokenSource | OzviIdentity) {
      state.identity = typeof who === "string" || typeof who === "function" ? { token: who } : who && typeof who === "object" ? { token: who.token, id: who.id } : null;
      cached = null;
      changed();
    },
    logout() { state.identity = null; cached = null; lastUid = ""; changed(); },
    setTraits(t: OzviTraits) { state.traits = t && typeof t === "object" ? { ...state.traits, ...t } : null; changed(); },
    setLanguage(l: OzviLang) { state.lang = LANGS.includes(l) ? l : null; changed(); },
    on(name: OzviEventName, fn: Fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
      return () => api.off(name, fn as never);
    },
    off(name: OzviEventName, fn: Fn) { listeners.get(name)?.delete(fn); },
    configure(c: OzviConfig) { w.OzviConfig = { ...w.OzviConfig, ...c }; },
  });

  w.Ozvi = api;
  // Drain the snippet queue: entries are argument lists, ["open", "ideas"] or an `arguments` object.
  const q = (prev as { q?: ArrayLike<unknown>[] } | undefined)?.q;
  if (q) for (const call of Array.from(q)) {
    const [m, ...a] = Array.from(call);
    try { api(String(m), ...a); } catch (e) { setTimeout(() => { throw e; }); }
  }
  return api;
}

/** Bug context line for setTraits(): "plan: pro · company: Acme", bounded like other context fields. */
export function traitsLine(t: OzviTraits | null): string {
  if (!t) return "";
  return Object.entries(t).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k.slice(0, 40)}: ${String(v).slice(0, 100)}`).join(" · ").slice(0, 500);
}
