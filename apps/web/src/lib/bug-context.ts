import { maskBody, maskText, maskUrl } from "@ozvi/sdk/mask";

/**
 * Bug report depth: the network log, action timeline, console errors and session links the widget
 * captures (packages/widget/src/capture.ts). The client already masks; this is the server's second line:
 * known shapes only, bounded counts and sizes, masked again. All of it is visible to the team only.
 */

export const CAPTURE_LIMITS = {
  network: 30,
  actions: 30,
  errors: 20,
  url: 1000,
  label: 120,
  body: 2000,
  /** The whole capture part of a context, serialised. Bodies go first, then the oldest entries. */
  bytes: 48_000,
  /** The raw `context` form field; anything bigger is dropped unread. */
  raw: 256_000,
} as const;

export const LINK_KINDS = ["sentry", "posthog", "logrocket"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export interface NetEntry {
  at: number; method: string; url: string; status: number; ms: number; failed: boolean;
  size?: number; type?: string; error?: string; req?: string; res?: string;
}
export interface ActionEntry { at: number; kind: "nav" | "click" | "submit"; label: string; role?: string }
export interface ErrorEntry { at: number; text: string }
export interface Capture {
  network?: NetEntry[];
  actions?: ActionEntry[];
  errors?: ErrorEntry[];
  links?: Partial<Record<LinkKind, string>>;
  sentAt?: number;
}
/** Keys of the capture part: what contextFor() hides from everyone outside the team. */
export const CAPTURE_KEYS = ["network", "actions", "errors", "links", "sentAt"] as const;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 1_500_000_000_000 && v < 4_000_000_000_000 ? Math.round(v) : null);
const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.min(Math.round(v), max) : null);
const METHOD = /^[A-Z]{3,7}$/;

function cleanNet(v: unknown): NetEntry | null {
  if (!obj(v)) return null;
  const at = time(v.at);
  const url = str(v.url, CAPTURE_LIMITS.url * 2);
  const method = str(v.method, 10).toUpperCase();
  const status = num(v.status, 999);
  if (at === null || !url || !METHOD.test(method) || status === null) return null;
  const e: NetEntry = { at, method, url: maskUrl(url).slice(0, CAPTURE_LIMITS.url), status, ms: num(v.ms, 3_600_000) ?? 0,
    failed: v.failed === true || status === 0 || status >= 400 };
  const size = num(v.size, 1e12);
  if (size !== null) e.size = size;
  const type = str(v.type, 100);
  if (/^[\w.+-]+\/[\w.+-]+$/.test(type)) e.type = type;
  const error = str(v.error, 60);
  if (error) e.error = maskText(error);
  // Bodies only ever for failed requests.
  if (e.failed) {
    const req = str(v.req, CAPTURE_LIMITS.body * 4);
    const res = str(v.res, CAPTURE_LIMITS.body * 4);
    if (req) e.req = maskBody(req, CAPTURE_LIMITS.body);
    if (res) e.res = maskBody(res, CAPTURE_LIMITS.body);
  }
  return e;
}

function cleanAction(v: unknown): ActionEntry | null {
  if (!obj(v)) return null;
  const at = time(v.at);
  const kind = v.kind === "nav" || v.kind === "click" || v.kind === "submit" ? v.kind : null;
  if (at === null || !kind) return null;
  const raw = str(v.label, CAPTURE_LIMITS.label * 4);
  const label = (kind === "nav" ? maskUrl(raw) : maskText(raw)).slice(0, CAPTURE_LIMITS.label);
  const role = str(v.role, 20);
  return { at, kind, label, ...(/^[a-z]+$/.test(role) ? { role } : {}) };
}

function cleanError(v: unknown): ErrorEntry | null {
  if (!obj(v)) return null;
  const at = time(v.at);
  const text = str(v.text, 600);
  return at === null || !text ? null : { at, text: maskText(text).slice(0, 300) };
}

/** Session links: only the three known tools, only http(s) URLs. */
function cleanLinks(v: unknown): Capture["links"] | null {
  if (!obj(v)) return null;
  const out: Partial<Record<LinkKind, string>> = {};
  for (const k of LINK_KINDS) {
    const u = str(v[k], 600);
    try {
      const url = new URL(u);
      if (url.protocol === "https:" || url.protocol === "http:") out[k] = url.href.slice(0, 500);
    } catch { /* not a URL */ }
  }
  return Object.keys(out).length ? out : null;
}

const list = <T,>(v: unknown, max: number, clean: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.slice(-max * 2).map(clean).filter((x): x is T => x !== null).slice(-max) : [];

/** Untrusted widget capture → known shapes, bounded, masked; within CAPTURE_LIMITS.bytes as a whole. */
export function cleanCapture(raw: unknown): Capture {
  if (!obj(raw)) return {};
  const network = list(raw.network, CAPTURE_LIMITS.network, cleanNet).sort((a, b) => a.at - b.at);
  const actions = list(raw.actions, CAPTURE_LIMITS.actions, cleanAction);
  const errors = list(raw.errors, CAPTURE_LIMITS.errors, cleanError);
  const links = cleanLinks(raw.links);
  const sentAt = time(raw.sentAt);
  const out: Capture = {
    ...(network.length ? { network } : {}), ...(actions.length ? { actions } : {}), ...(errors.length ? { errors } : {}),
    ...(links ? { links } : {}), ...(sentAt !== null ? { sentAt } : {}),
  };
  const size = () => JSON.stringify(out).length;
  if (size() > CAPTURE_LIMITS.bytes && out.network) {
    for (const e of out.network) { delete e.req; delete e.res; }
  }
  while (size() > CAPTURE_LIMITS.bytes && (out.network?.length || out.actions?.length || out.errors?.length)) {
    if (out.network?.length) out.network.shift();
    if (out.actions?.length) out.actions.shift();
    if (out.errors?.length) out.errors.shift();
  }
  return out;
}

/** The context as a given viewer may see it: the capture part (network, steps, session links) is team-only. */
export function contextFor<T extends Record<string, unknown>>(ctx: T | null | undefined, isTeam: boolean): T | null {
  if (!ctx) return null;
  if (isTeam) return ctx;
  const out: Record<string, unknown> = { ...ctx };
  for (const k of CAPTURE_KEYS) delete out[k];
  return out as T;
}

/** Shell-safe single-quoted argument. */
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/** "Copy as cURL": the request as recorded, with the masked values left masked; never auth headers or cookies. */
export function toCurl(e: NetEntry): string {
  const parts = [`curl ${q(e.url)}`];
  if (e.method !== "GET") parts.push(`-X ${e.method}`);
  if (e.req) {
    const json = /^\s*[[{]/.test(e.req);
    parts.push(`-H ${q(`content-type: ${json ? "application/json" : "application/x-www-form-urlencoded"}`)}`);
    parts.push(`--data-raw ${q(e.req)}`);
  }
  return parts.join(" \\\n  ");
}

export type TimelineEntry =
  | { type: "action"; at: number; kind: ActionEntry["kind"]; label: string; role?: string }
  | { type: "error"; at: number; text: string }
  | { type: "request"; at: number; method: string; url: string; status: number; error?: string };

/** Steps, console errors and failed requests in one ordered list (newest last), for the timeline. */
export function timeline(c: Capture): TimelineEntry[] {
  return [
    ...(c.actions ?? []).map((a): TimelineEntry => ({ type: "action", ...a })),
    ...(c.errors ?? []).map((e): TimelineEntry => ({ type: "error", ...e })),
    ...(c.network ?? []).filter((n) => n.failed).map((n): TimelineEntry => ({ type: "request", at: n.at, method: n.method, url: n.url, status: n.status, ...(n.error ? { error: n.error } : {}) })),
  ].sort((a, b) => a.at - b.at);
}
