import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, schema, withProject } from "@ozvi/db";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { db } from "./db";
import { safeFetch } from "./net";
import type { Project } from "./project";

/**
 * OpenID Connect login (authorization code + PKCE), an alternative to host-app SSO tokens for
 * apps that already run an identity provider (Keycloak, Authentik, Zitadel, Auth0, Google
 * Workspace, Billiwo's own provider that Fider used). The user's `sub` becomes externalId, so
 * people imported from Fider with the same provider keep their history (and SSO tokens must use
 * the same ids). Roles are never taken from the provider: users can edit their own claims at some
 * providers. They are managed in Ozvi (admin → Ľudia). Every URL goes through safeFetch (no
 * internal targets in cloud, no redirects).
 */

export interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; userinfo_endpoint?: string; token_endpoint_auth_methods_supported?: string[] }

const discoveries = new Map<string, { at: number; d: Discovery }>();
const jwks = new Map<string, { at: number; set: ReturnType<typeof createLocalJWKSet> }>();
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function discoverOidc(issuer: string, f: Fetcher = safeFetch): Promise<Discovery> {
  const hit = discoveries.get(issuer);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.d;
  const res = await f(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = (await res.json()) as Discovery;
  if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) throw new Error("chýba authorization_endpoint, token_endpoint alebo jwks_uri");
  if (d.issuer?.replace(/\/$/, "") !== issuer.replace(/\/$/, "")) throw new Error("issuer v konfigurácii sa nezhoduje");
  discoveries.set(issuer, { at: Date.now(), d });
  return d;
}

/* Short-lived, signed flow cookie: state + nonce + PKCE verifier + where to return. */

export interface Flow { state: string; nonce: string; verifier: string; ret: string; exp: number }
const key = () => {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
};
const mac = (body: string) => createHmac("sha256", key()).update(`oidc:${body}`).digest("base64url");
export const flowCookieName = (slug: string) => `ozvi_oidc_${slug}`;

export function encodeFlow(f: Flow) {
  const body = Buffer.from(JSON.stringify(f)).toString("base64url");
  return `${body}.${mac(body)}`;
}
export function decodeFlow(v: string | undefined, now = Date.now()): Flow | null {
  const [body, sig] = (v ?? "").split(".");
  if (!body || !sig) return null;
  const a = Buffer.from(sig), b = Buffer.from(mac(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const f = JSON.parse(Buffer.from(body, "base64url").toString()) as Flow;
    return f.exp * 1000 > now ? f : null;
  } catch { return null; }
}

export const redirectUri = (origin: string, slug: string) => `${origin}/${slug}/oidc/callback`;

export async function authorizeUrl(project: Project, origin: string, ret: string) {
  const d = await discoverOidc(project.oidcIssuer!);
  const flow: Flow = {
    state: randomBytes(16).toString("base64url"), nonce: randomBytes(16).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"), ret, exp: Math.floor(Date.now() / 1000) + 600,
  };
  const u = new URL(d.authorization_endpoint);
  u.search = new URLSearchParams({
    response_type: "code", client_id: project.oidcClientId!, redirect_uri: redirectUri(origin, project.slug),
    scope: "openid email profile", state: flow.state, nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();
  return { url: u.toString(), flow };
}

export class OidcError extends Error {}

async function keySet(uri: string, f: Fetcher) {
  const hit = jwks.get(uri);
  if (hit && Date.now() - hit.at < 600_000) return hit.set;
  const res = await f(uri, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new OidcError(`jwks ${res.status}`);
  const set = createLocalJWKSet((await res.json()) as JSONWebKeySet);
  jwks.set(uri, { at: Date.now(), set });
  return set;
}

export async function completeLogin(project: Project, origin: string, code: string, flow: Flow, f: Fetcher = safeFetch) {
  const d = await discoverOidc(project.oidcIssuer!, f);
  const secret = project.oidcClientSecretEnc ? decryptSecret(project.oidcClientSecretEnc) : "";
  const basic = !d.token_endpoint_auth_methods_supported || d.token_endpoint_auth_methods_supported.includes("client_secret_basic");
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, project.slug), code_verifier: flow.verifier,
    ...(!basic && { client_id: project.oidcClientId!, client_secret: secret }),
  });
  const res = await f(d.token_endpoint, {
    method: "POST", body, signal: AbortSignal.timeout(10_000),
    headers: {
      "content-type": "application/x-www-form-urlencoded", accept: "application/json",
      ...(basic && { authorization: `Basic ${Buffer.from(`${encodeURIComponent(project.oidcClientId!)}:${encodeURIComponent(secret)}`).toString("base64")}` }),
    },
  });
  if (!res.ok) throw new OidcError(`token endpoint ${res.status}`);
  const tokens = (await res.json()) as { id_token?: string; access_token?: string };
  if (!tokens.id_token) throw new OidcError("missing id_token");

  const { payload } = await jwtVerify(tokens.id_token, await keySet(d.jwks_uri, f), { issuer: d.issuer, audience: project.oidcClientId!, clockTolerance: 60 });
  if (payload.nonce !== flow.nonce) throw new OidcError("nonce mismatch");
  if (!payload.sub) throw new OidcError("missing sub");
  if (/^(email|account):/i.test(payload.sub)) throw new OidcError("reserved sub namespace");

  let claims: JWTPayload & Record<string, unknown> = payload;
  if ((!payload.email || !payload.name) && d.userinfo_endpoint && tokens.access_token) {
    const ui = await f(d.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10_000) });
    if (ui.ok) {
      const info = (await ui.json()) as Record<string, unknown>;
      if (info.sub === payload.sub) claims = { ...info, ...payload };
    }
  }
  const s = (k: string) => (typeof claims[k] === "string" ? (claims[k] as string).slice(0, 300) : null);
  const values = {
    projectId: project.id, externalId: payload.sub, email: s("email"),
    name: s("name") ?? s("preferred_username"), avatarUrl: s("picture"), lastSeenAt: new Date(),
  };
  const [user] = await withProject(db, project.id, (tx) => tx.insert(schema.users).values(values)
    .onConflictDoUpdate({
      target: [schema.users.projectId, schema.users.externalId],
      set: { email: values.email, name: values.name, avatarUrl: values.avatarUrl, lastSeenAt: values.lastSeenAt },
    }).returning());
  return user!;
}
