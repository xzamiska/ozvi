import type { OzviApi, OzviConfig, OzviOptions } from "./types";

/**
 * @ozvi/widget — plain ESM entry. Loads widget.js from your Ozvi host once and gives you the API.
 * Safe to import during server rendering: nothing touches `window` until you call a function in the browser,
 * and on the server every call is a no-op.
 *
 *   import { loadOzvi, ozvi } from "@ozvi/widget";
 *   loadOzvi({ host: "https://feedback.example.com", project: "acme", tokenUrl: "/api/ozvi-token" });
 *   ozvi.open("ideas");           // queued until widget.js has loaded
 */

export type * from "./types";

export interface LoadOptions extends Partial<OzviOptions> {
  /** URL of widget.js; default `${host}/widget.js`. */
  src?: string;
  /** CSP nonce for the <script> (and everything the widget adds after it). */
  nonce?: string;
  /** window.OzviConfig (network log, masking hooks, session links), applied before widget.js runs. */
  config?: OzviConfig;
}

const METHODS = ["init", "open", "close", "toggle", "isOpen", "prefill", "identify", "logout", "setTraits", "setLanguage", "on", "off", "configure"] as const;
type Stub = ((...a: unknown[]) => void) & { q: unknown[][] } & Record<string, unknown>;
type W = Window & { Ozvi?: OzviApi | Stub; OzviConfig?: OzviConfig & { nonce?: string } };

const inBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";

/** window.Ozvi, or the snippet stub that queues calls until widget.js replaces it. */
export function getOzvi(): OzviApi | null {
  if (!inBrowser()) return null;
  const w = window as W;
  if (!w.Ozvi) {
    const stub = function (...a: unknown[]) { stub.q.push(a); } as Stub;
    stub.q = [];
    for (const m of METHODS) stub[m] = (...a: unknown[]) => { stub.q.push([m, ...a]); };
    stub.ready = new Promise((res) => stub.q.push(["ready", res]));
    w.Ozvi = stub;
  }
  return w.Ozvi as OzviApi;
}

let loading: Promise<OzviApi> | null = null;

/**
 * Adds widget.js (once) and, with `project`, an <ozvi-widget> (Ozvi.init). Resolves with window.Ozvi when ready.
 * Rejects on the server and when the script cannot load (CSP, network).
 */
export function loadOzvi(opts: LoadOptions = {}): Promise<OzviApi> {
  if (!inBrowser()) return Promise.reject(new Error("loadOzvi() runs in the browser; call it from an effect"));
  const w = window as W;
  const { src, nonce, config, ...init } = opts;
  if (config || nonce) w.OzviConfig = { ...w.OzviConfig, ...config, ...(nonce && { nonce }) };
  const api = getOzvi()!;
  if (init.project) api.init(init as OzviOptions);
  if (!loading) {
    const url = src ?? `${(init.host ?? "").replace(/\/$/, "")}/widget.js`;
    loading = new Promise<void>((res, rej) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
      if (existing && (window as W).Ozvi && "version" in (window as W).Ozvi!) return res();
      const s = existing ?? document.createElement("script");
      s.addEventListener("load", () => res());
      s.addEventListener("error", () => { loading = null; rej(new Error(`Ozvi widget.js could not load from ${url}`)); });
      if (!existing) {
        s.src = url; s.async = true;
        if (nonce) s.nonce = nonce;
        document.head.appendChild(s);
      }
    }).then(() => (window as W).Ozvi!.ready as Promise<OzviApi>);
  }
  return loading!;
}

/**
 * The API without waiting: every call goes to window.Ozvi (queued before widget.js loads, no-op on the server).
 * `on` returns an unsubscribe function in the browser.
 */
export const ozvi: Omit<OzviApi, "ready" | "version" | "isOpen"> & { isOpen(): boolean } = Object.fromEntries(
  METHODS.map((m) => [m, (...a: unknown[]) => {
    const api = getOzvi() as unknown as Record<string, (...x: unknown[]) => unknown> | null;
    if (!api) return m === "on" ? () => {} : m === "isOpen" ? false : undefined;
    if (m === "on" && !("version" in api)) {
      // Before load: queue the subscription, and keep a way to cancel it once the real API is there.
      api.on!(...a);
      return () => (getOzvi() as unknown as Record<string, (...x: unknown[]) => unknown>).off!(...a);
    }
    if (m === "isOpen" && !("version" in api)) return false;
    return api[m]!(...a);
  }]),
) as never;
