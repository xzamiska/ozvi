import { checkUrl, safeFetch } from "./net";
import { validRedirectUri } from "./oauth-uri";

/**
 * OAuth Client ID Metadata Documents (draft-ietf-oauth-client-id-metadata-document, the client
 * registration MCP prefers since 2026-07-28): the client_id is an https URL and the document it
 * serves is the client's registration. We fetch it ourselves, so the URL is attacker-chosen:
 * https only, never internal addresses (in self-host too; the guarded agent also pins DNS),
 * no redirects, 5 s, 16 KB, and a cache that honours Cache-Control so a client can't make us
 * fetch on every page view.
 */

export interface ClientMetadata {
  clientId: string;
  /** Host of the client_id URL: the only part of the identity we have verified. */
  host: string;
  /** Self-asserted by the document; may be spoofed, so always shown next to `host`. */
  name: string;
  logoUri?: string;
  clientUri?: string;
  redirectUris: string[];
}

export class CimdError extends Error {}

const MAX_BYTES = 16 * 1024;
const TIMEOUT_MS = 5000;
const DEFAULT_TTL_S = 300;
const MAX_TTL_S = 86_400;
const FAIL_TTL_S = 60;
const MAX_ENTRIES = 500;

/** Is this client_id a metadata-document URL (as opposed to a legacy DCR id)? */
export const isCimdClientId = (clientId: string) => clientId.startsWith("https://");

/** Client ID URL rules (draft §3): https, a path, no fragment, credentials or dot segments, canonical form. */
export function checkClientIdUrl(clientId: string): string | null {
  if (clientId.length > 2048) return "client_id URL is too long";
  let u: URL;
  try { u = new URL(clientId); } catch { return "client_id is not a URL"; }
  if (u.protocol !== "https:") return "client_id must use https";
  if (u.pathname === "/" || u.pathname === "") return "client_id URL must have a path";
  if (u.hash || clientId.includes("#")) return "client_id URL must not contain a fragment";
  if (u.username || u.password) return "client_id URL must not contain credentials";
  if (/\/\.{1,2}(\/|$|\?)/.test(clientId)) return "client_id URL must not contain dot segments";
  if (u.href !== clientId) return "client_id URL must be in canonical form";
  if (checkUrl(clientId, "cloud", "en")) return "client_id URL points to an address we don't fetch";
  return null;
}

/** Seconds a response may be cached for, per its Cache-Control / Expires headers. */
export function cacheTtl(headers: Headers, now = Date.now()): number {
  const cc = (headers.get("cache-control") ?? "").toLowerCase();
  if (/(^|,)\s*(no-store|no-cache|private)\b/.test(cc)) return 0;
  const maxAge = /(?:^|,)\s*max-age\s*=\s*"?(\d+)/.exec(cc);
  if (maxAge) return Math.min(Number(maxAge[1]), MAX_TTL_S);
  const expires = headers.get("expires");
  if (expires) {
    const at = Date.parse(expires);
    const base = Date.parse(headers.get("date") ?? "") || now;
    return Number.isNaN(at) ? 0 : Math.max(0, Math.min(Math.floor((at - base) / 1000), MAX_TTL_S));
  }
  return DEFAULT_TTL_S;
}

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const httpsUrl = (v: unknown) => {
  const s = str(v, 2048);
  if (!s) return undefined;
  try { return new URL(s).protocol === "https:" ? s : undefined; } catch { return undefined; }
};

/** Validates a parsed document against the URL it was fetched from. */
export function parseClientMetadata(clientId: string, doc: unknown): ClientMetadata {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new CimdError("metadata document must be a JSON object");
  const d = doc as Record<string, unknown>;
  if (d.client_id !== clientId) throw new CimdError("client_id in the metadata document does not match its URL");
  if ("client_secret" in d || "client_secret_expires_at" in d) throw new CimdError("metadata document must not contain a client secret");
  const auth = d.token_endpoint_auth_method ?? "none";
  if (auth !== "none") throw new CimdError(`token_endpoint_auth_method ${String(auth)} is not supported (public clients only)`);
  if (d.grant_types !== undefined && !(Array.isArray(d.grant_types) && d.grant_types.includes("authorization_code"))) {
    throw new CimdError("grant_types must include authorization_code");
  }
  if (d.response_types !== undefined && !(Array.isArray(d.response_types) && d.response_types.includes("code"))) {
    throw new CimdError("response_types must include code");
  }
  const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris : [];
  if (uris.length === 0 || uris.length > 20 || !uris.every((u): u is string => typeof u === "string" && validRedirectUri(u))) {
    throw new CimdError("redirect_uris must be 1–20 https (or loopback http) URIs without fragments");
  }
  const name = typeof d.client_name === "string" ? d.client_name.replace(/[\u0000-\u001f\u007f<>‪-‮⁦-⁩]/g, "").trim().slice(0, 60) : "";
  if (!name) throw new CimdError("client_name is required");
  const host = new URL(clientId).host;
  return { clientId, host, name, redirectUris: uris, logoUri: httpsUrl(d.logo_uri), clientUri: httpsUrl(d.client_uri) };
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
/** SSRF-guarded in every mode: a client_id comes from whoever crafted the authorize link. */
const defaultFetcher: Fetcher = (url, init) => safeFetch(url, init, "cloud");

async function readCapped(res: Response): Promise<string> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new CimdError("metadata document is too large");
  if (!res.body) return res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) { void reader.cancel(); throw new CimdError("metadata document is too large"); }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

async function download(clientId: string, fetcher: Fetcher, now: number): Promise<{ meta: ClientMetadata; ttl: number }> {
  let res: Response;
  try {
    res = await fetcher(clientId, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new CimdError(e instanceof CimdError ? e.message : "metadata document could not be fetched");
  }
  if (res.status !== 200) throw new CimdError(`metadata document returned HTTP ${res.status}${res.status >= 300 && res.status < 400 ? " (redirects are not followed)" : ""}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/^application\/([\w.+-]+\+)?json\b/i.test(type)) throw new CimdError("metadata document must be served as application/json");
  let doc: unknown;
  try { doc = JSON.parse(await readCapped(res)); } catch (e) {
    throw e instanceof CimdError ? e : new CimdError("metadata document is not valid JSON");
  }
  return { meta: parseClientMetadata(clientId, doc), ttl: cacheTtl(res.headers, now) };
}

type Entry = { at: number; expires: number } & ({ meta: ClientMetadata } | { error: string });
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<ClientMetadata>>();

export function clearCimdCache() { cache.clear(); inflight.clear(); }

/**
 * Resolves a CIMD client_id to its validated metadata (cached). Throws CimdError with a
 * developer-facing reason. `allowFetch` lets callers rate-limit network fetches (cache hits are free).
 */
export async function resolveClientMetadata(clientId: string, opts: { fetcher?: Fetcher; now?: number; allowFetch?: () => boolean } = {}): Promise<ClientMetadata> {
  const now = opts.now ?? Date.now();
  const bad = checkClientIdUrl(clientId);
  if (bad) throw new CimdError(bad);
  const hit = cache.get(clientId);
  if (hit && hit.expires > now) {
    if ("error" in hit) throw new CimdError(hit.error);
    return hit.meta;
  }
  const pending = inflight.get(clientId);
  if (pending) return pending;
  if (opts.allowFetch && !opts.allowFetch()) throw new CimdError("too many metadata fetches, try again later");
  const p = (async () => {
    try {
      const { meta, ttl } = await download(clientId, opts.fetcher ?? defaultFetcher, now);
      if (ttl > 0) remember(clientId, { meta, at: now, expires: now + ttl * 1000 });
      else cache.delete(clientId);
      return meta;
    } catch (e) {
      const error = e instanceof CimdError ? e.message : "metadata document could not be fetched";
      remember(clientId, { error, at: now, expires: now + FAIL_TTL_S * 1000 });
      throw new CimdError(error);
    } finally {
      inflight.delete(clientId);
    }
  })();
  inflight.set(clientId, p);
  return p;
}

function remember(key: string, entry: Entry) {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

/** True when every redirect goes to this machine, i.e. any local app could claim to be this client. */
export const loopbackOnly = (uris: string[]) => uris.every((u) => /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(u));
