import { MASK, maskBody, maskText, maskUrl } from "../../sdk/src/mask";
import type { LinkKind, NetEntry, OzviConfig } from "./types";

export type { LinkKind, NetEntry, OzviConfig };

/**
 * What the widget remembers so the team can reproduce a bug: the last requests (network log), the last
 * user actions (route changes, clicks by accessible name, form submits) and console errors.
 * Everything is masked BEFORE it is kept, lives only in memory, and leaves the page only with a bug report.
 *
 * Host app configuration (set before widget.js loads, or later via Ozvi.configure):
 *   window.OzviConfig = {
 *     network: false,              // no network log
 *     networkBodies: true,         // also keep bodies of FAILED requests (masked, max 2 000 chars)
 *     actions: false,              // no action timeline
 *     maskRequest: (e) => e,       // last word on every request: change it, or return null to drop it
 *     links: { sentry: () => url, posthog: url, logrocket: url },
 *     detectLinks: true,           // read session links from Sentry/PostHog/LogRocket globals
 *     sentryOrg: "acme",           // needed to build the Sentry replay URL
 *   }
 * Attributes on <ozvi-widget> do the same for the simple cases: network="off|bodies", actions="off", links="auto".
 */

export interface Action { at: number; kind: "nav" | "click" | "submit"; label: string; role?: string }
export interface LogLine { at: number; text: string }

export const MAX_NET = 30;
export const MAX_ACTIONS = 30;
export const MAX_ERRORS = 20;
export const BODY_LIMIT = 2000;

/** Fixed-size buffer: the oldest entry falls out. */
export function ring<T>(max: number) {
  const a: T[] = [];
  return {
    push(x: T) { a.push(x); if (a.length > max) a.splice(0, a.length - max); },
    list: () => a.slice(),
    clear() { a.length = 0; },
  };
}

export const net = ring<NetEntry>(MAX_NET);
export const actions = ring<Action>(MAX_ACTIONS);
export const errors = ring<LogLine>(MAX_ERRORS);
/** URL prefixes never logged: the Ozvi host and the host app's token endpoint (its response IS a token). */
export const ignored: string[] = [];

type G = typeof globalThis & { OzviConfig?: OzviConfig; location?: Location; document?: Document };
const g = globalThis as G;
const cfg = (): OzviConfig => g.OzviConfig ?? {};
const attr = (n: string) => g.document?.querySelector("ozvi-widget")?.getAttribute(n) ?? null;
const netOn = () => cfg().network !== false && attr("network") !== "off";
const bodiesOn = () => cfg().networkBodies === true || attr("network") === "bodies";
const actionsOn = () => cfg().actions !== false && attr("actions") !== "off";
const abs = (u: string) => { try { return new URL(u, g.location?.href).href; } catch { return u; } };
const skip = (u: string) => /^(data|blob):/.test(u) || ignored.some((p) => p && u.startsWith(p));
const textual = (t?: string) => !t || /json|text|xml|x-www-form-urlencoded|problem/.test(t);

/** Built-in masking, then the host's maskRequest hook, then masking again (the hook may add data). */
export function finish(e: NetEntry): void {
  const hook = cfg().maskRequest;
  if (hook) {
    try {
      const r = hook({ ...e });
      if (r === null || r === false) return;
      if (r && typeof r === "object") e = { ...e, ...r };
    } catch { return; } // a broken hook must not leak what it meant to hide
  }
  e.url = maskUrl(e.url);
  if (e.req) e.req = maskBody(e.req, BODY_LIMIT);
  if (e.res) e.res = maskBody(e.res, BODY_LIMIT);
  net.push(e);
}

const now = () => (g.performance ? performance.now() : Date.now());
const mime = (h: string | null) => h?.split(";")[0]?.trim() || undefined;

export function installNetwork(): void {
  const of = g.fetch as (typeof fetch & { oz?: 1 }) | undefined;
  if (of && !of.oz) {
    const f = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      // eslint-disable-next-line prefer-rest-params
      const p: Promise<Response> = of.apply(this, arguments as unknown as [RequestInfo, RequestInit]);
      try {
        const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const url = abs(raw);
        if (!netOn() || skip(url)) return p;
        const method = String(init?.method ?? (input as Request).method ?? "GET").toUpperCase();
        const t0 = now();
        const at = Date.now();
        // Kept only in this closure; stored (masked) only when the request fails and bodies are on.
        const reqBody = typeof init?.body === "string" ? init.body : undefined;
        p.then((r) => {
          const type = mime(r.headers.get("content-type"));
          const len = Number(r.headers.get("content-length"));
          const e: NetEntry = { at, method, url, status: r.status, ms: Math.round(now() - t0), failed: !r.ok, ...(len >= 0 && r.headers.has("content-length") ? { size: len } : {}), ...(type ? { type } : {}) };
          if (e.failed && bodiesOn()) {
            if (reqBody) e.req = reqBody;
            if (textual(type)) { r.clone().text().then((t) => { e.res = t.slice(0, 20000); finish(e); }, () => finish(e)); return; }
          }
          finish(e);
        }, (err: unknown) => {
          finish({ at, method, url, status: 0, ms: Math.round(now() - t0), failed: true, error: String((err as Error)?.name || "Error").slice(0, 60) });
        });
      } catch { /* never break the host's request */ }
      return p;
    } as typeof fetch & { oz?: 1 };
    f.oz = 1;
    g.fetch = f;
  }

  const X = g.XMLHttpRequest?.prototype as (XMLHttpRequest & { oz?: 1 }) | undefined;
  if (X && !X.oz) {
    X.oz = 1;
    const open = X.open, send = X.send;
    type Tagged = XMLHttpRequest & { ozr?: { method: string; url: string } };
    X.open = function (this: Tagged, m: string, u: string | URL) {
      this.ozr = { method: String(m).toUpperCase(), url: abs(String(u)) };
      // eslint-disable-next-line prefer-rest-params
      return (open as (...a: unknown[]) => void).apply(this, arguments as unknown as unknown[]);
    } as typeof X.open;
    X.send = function (this: Tagged, body?: Document | XMLHttpRequestBodyInit | null) {
      const r = this.ozr;
      try {
        if (r && netOn() && !skip(r.url)) {
          const t0 = now();
          const at = Date.now();
          this.addEventListener("loadend", () => {
            const status = this.status;
            const type = mime(this.getResponseHeader("content-type"));
            const len = this.getResponseHeader("content-length");
            const e: NetEntry = { at, method: r.method, url: r.url, status, ms: Math.round(now() - t0), failed: status === 0 || status >= 400,
              ...(len ? { size: Number(len) } : {}), ...(type ? { type } : {}), ...(status === 0 ? { error: "NetworkError" } : {}) };
            if (e.failed && bodiesOn()) {
              if (typeof body === "string") e.req = body;
              if ((this.responseType === "" || this.responseType === "text") && textual(type)) e.res = this.responseText.slice(0, 20000);
            }
            finish(e);
          });
        }
      } catch { /* never break the host's request */ }
      return send.call(this, body ?? null);
    };
  }
}

const SKIP_TEXT = "textarea,select,input,script,style,svg title";

/** Visible text without form values; [data-ozvi-mask] parts become *** . */
function textOf(n: Node): string {
  let s = "";
  n.childNodes.forEach((c) => {
    if (c.nodeType === 3) s += c.nodeValue;
    else if (c.nodeType === 1) {
      const el = c as Element;
      if (el.hasAttribute("data-ozvi-mask")) s += ` ${MASK} `;
      else if (!el.matches(SKIP_TEXT) && el.getAttribute("aria-hidden") !== "true") s += ` ${textOf(el)} `;
    }
  });
  return s;
}

/** The accessible name of a clicked control, never an input's value (except button-like inputs, whose value IS the label). */
export function nameOf(el: Element): string {
  if (el.closest("[data-ozvi-mask]")) return MASK;
  const doc = el.ownerDocument;
  const by = el.getAttribute("aria-labelledby");
  const input = el as HTMLInputElement;
  const buttonLike = el.tagName === "INPUT" && /^(submit|button|reset)$/.test(input.type);
  const labels = "labels" in el && input.labels ? [...input.labels].map(textOf).join(" ") : "";
  const n = el.getAttribute("aria-label")
    || (by ? by.split(/\s+/).map((id) => { const x = doc.getElementById(id); return x ? textOf(x) : ""; }).join(" ") : "")
    || (buttonLike ? input.value : "")
    || labels
    || textOf(el)
    || el.getAttribute("title")
    || el.querySelector("img[alt]")?.getAttribute("alt")
    || "";
  return maskText(n.replace(/\s+/g, " ").trim()).slice(0, 80);
}

const CLICKABLE = "button,a[href],[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=switch],[role=checkbox],input[type=submit],input[type=button],input[type=reset],input[type=checkbox],input[type=radio],summary,select";

function act(a: Omit<Action, "at">) {
  if (actionsOn()) actions.push({ at: Date.now(), ...a });
}

let lastNav = "";
function nav() {
  const l = g.location;
  if (!l) return;
  const u = maskUrl(l.pathname + l.search + l.hash);
  if (u !== lastNav) { lastNav = u; act({ kind: "nav", label: u }); }
}

const inWidget = (e: Event) => e.composedPath().some((n) => (n as Element).tagName === "OZVI-WIDGET");

export function installActions(): void {
  const doc = g.document;
  if (!doc || (doc as Document & { ozA?: 1 }).ozA) return;
  (doc as Document & { ozA?: 1 }).ozA = 1;
  doc.addEventListener("click", (e) => {
    if (inWidget(e)) return;
    const el = (e.target as Element | null)?.closest?.(CLICKABLE);
    if (!el) return;
    const role = el.getAttribute("role") || (el.tagName === "A" ? "link" : el.tagName === "INPUT" ? (el as HTMLInputElement).type : el.tagName === "SELECT" ? "select" : "button");
    act({ kind: "click", label: nameOf(el) || role, role });
  }, true);
  doc.addEventListener("submit", (e) => {
    if (inWidget(e)) return;
    const f = e.target as HTMLFormElement;
    const name = f.getAttribute("aria-label") || f.getAttribute("name") || f.id || (f.querySelector("h1,h2,h3,legend") ? textOf(f.querySelector("h1,h2,h3,legend")!) : "");
    act({ kind: "submit", label: f.closest("[data-ozvi-mask]") ? MASK : maskText(name.replace(/\s+/g, " ").trim()).slice(0, 80) });
  }, true);
  const h = g.history;
  for (const k of ["pushState", "replaceState"] as const) {
    const o = h[k];
    h[k] = function (this: History, ...a: Parameters<History["pushState"]>) { const r = o.apply(this, a); try { nav(); } catch { /* ignore */ } return r; };
  }
  addEventListener("popstate", nav);
  addEventListener("hashchange", nav);
  nav();
}

export function installErrors(): void {
  const keep = (text: string) => errors.push({ at: Date.now(), text: maskText(text).slice(0, 300) });
  const orig = console.error.bind(console);
  console.error = (...a: unknown[]) => { try { keep(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ")); } catch { /* ignore */ } orig(...a); };
  if (typeof addEventListener === "function") {
    addEventListener("error", (e) => keep(`${(e as ErrorEvent).message} @ ${maskUrl((e as ErrorEvent).filename ?? "")}:${(e as ErrorEvent).lineno}`));
    addEventListener("unhandledrejection", (e) => keep(`Unhandled: ${String((e as PromiseRejectionEvent).reason)}`));
  }
}

/** Session links the host set, plus (only when allowed) the ones its Sentry / PostHog / LogRocket expose. */
export function sessionLinks(): Partial<Record<LinkKind, string>> {
  const c = cfg();
  const out: Partial<Record<LinkKind, string>> = {};
  const set = (k: LinkKind, v: unknown) => { if (!out[k] && typeof v === "string" && /^https?:\/\//.test(v)) out[k] = v.slice(0, 500); };
  for (const k of ["sentry", "posthog", "logrocket"] as const) {
    try { const v = c.links?.[k]; set(k, typeof v === "function" ? v() : v); } catch { /* ignore */ }
  }
  if (c.detectLinks || attr("links") === "auto") {
    const w = g as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { const id = w.Sentry?.getReplay?.()?.getReplayId?.(); if (id && c.sentryOrg) set("sentry", `https://${encodeURIComponent(c.sentryOrg)}.sentry.io/replays/${encodeURIComponent(id)}/`); } catch { /* ignore */ }
    try { set("posthog", w.posthog?.get_session_replay_url?.({ withTimestamp: true, timestampLookBack: 30 })); } catch { /* ignore */ }
    try { set("logrocket", w.LogRocket?.sessionURL); } catch { /* ignore */ }
  }
  return out;
}

/** What goes into a bug report's context; respects the opt-outs at the moment of sending too. */
export function snapshot() {
  return {
    network: netOn() ? net.list().sort((a, b) => a.at - b.at) : [],
    actions: actionsOn() ? actions.list() : [],
    errors: errors.list(),
    links: sessionLinks(),
  };
}

export function install(): void {
  installErrors();
  installNetwork();
  installActions();
}
