import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/**
 * Ozvi as a GitHub App (ADR-0011): an admin installs the app on the repositories they choose and
 * picks one in Ozvi; no personal token, no webhook to set up by hand. One app per Ozvi instance,
 * configured with OZVI_GITHUB_APP_* (scripts/create-github-app.mjs makes one); without it the
 * integration falls back to a fine-grained token and a per-project webhook.
 *
 * Connecting runs through GitHub's callback, which reaches the instance's main host, not the board's:
 * 1. the board signs a state (project, admin, 30 min) and sends the admin to GitHub;
 * 2. the callback checks the state, that the GitHub user who installed can see the installation (OAuth
 *    during installation) and which of its repositories they may write to: only those can be picked,
 *    so nobody attaches someone else's installation (or repositories they only read) to their board;
 * 3. it hands the board a short ticket for that installation, and the board stores it under the
 *    admin's own session.
 */

type Fetch = typeof fetch;
export interface GithubApp { id: string; slug: string; key: string; clientId: string; clientSecret: string; webhookSecret: string }

export function githubApp(env: Record<string, string | undefined> = process.env): GithubApp | null {
  const id = env.OZVI_GITHUB_APP_ID?.trim();
  const slug = env.OZVI_GITHUB_APP_SLUG?.trim();
  const raw = env.OZVI_GITHUB_APP_PRIVATE_KEY?.trim();
  const clientId = env.OZVI_GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = env.OZVI_GITHUB_APP_CLIENT_SECRET?.trim();
  const webhookSecret = env.OZVI_GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!id || !slug || !raw || !clientId || !clientSecret || !webhookSecret) return null;
  // PEM as is, with escaped newlines (one-line .env), or base64 of the PEM.
  const key = raw.includes("BEGIN") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8").trim();
  return { id, slug, key, clientId, clientSecret, webhookSecret };
}

const b64u = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The app's own JWT (RS256, 9 minutes; GitHub allows 10 and clocks drift). */
export function appJwt(app: GithubApp, now = Date.now()): string {
  const iat = Math.floor(now / 1000) - 60;
  const body = `${b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64u(JSON.stringify({ iat, exp: iat + 540, iss: app.id }))}`;
  return `${body}.${createSign("RSA-SHA256").update(body).sign(app.key, "base64url")}`;
}

async function api<T>(token: string, path: string, init: RequestInit = {}, f: Fetch = fetch): Promise<T> {
  const res = await f(`https://api.github.com${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "x-github-api-version": "2022-11-28", "user-agent": "ozvi" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GithubAppError(res.status);
  return (await res.json()) as T;
}
export class GithubAppError extends Error {
  constructor(public status: number) { super(`GitHub answered ${status}`); }
}

// Installation tokens live an hour; reuse them until five minutes before.
const tokens = new Map<number, { token: string; until: number }>();
export async function installationToken(app: GithubApp, installationId: number, f: Fetch = fetch): Promise<string> {
  const hit = tokens.get(installationId);
  if (hit && hit.until > Date.now()) return hit.token;
  const r = await api<{ token: string; expires_at: string }>(appJwt(app), `/app/installations/${installationId}/access_tokens`, { method: "POST" }, f);
  tokens.set(installationId, { token: r.token, until: new Date(r.expires_at).getTime() - 5 * 60_000 });
  return r.token;
}
export const forgetInstallation = (installationId: number) => tokens.delete(installationId);

/** The repositories the admin gave the app (owner/name), sorted. */
export async function installationRepos(app: GithubApp, installationId: number, f: Fetch = fetch): Promise<string[]> {
  const token = await installationToken(app, installationId, f);
  const out: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const r = await api<{ repositories: { full_name: string }[]; total_count: number }>(token, `/installation/repositories?per_page=100&page=${page}`, {}, f);
    out.push(...r.repositories.map((x) => x.full_name));
    if (out.length >= r.total_count || r.repositories.length < 100) break;
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Who owns the installation, for the "change access" link. */
export async function installationAccount(app: GithubApp, installationId: number, f: Fetch = fetch): Promise<{ login: string; org: boolean } | null> {
  try {
    const r = await api<{ account: { login: string; type: string } | null }>(appJwt(app), `/app/installations/${installationId}`, {}, f);
    return r.account ? { login: r.account.login, org: r.account.type === "Organization" } : null;
  } catch { return null; }
}

/**
 * Step 2: the code from GitHub's callback belongs to someone who can see this installation, and the
 * repositories in it they may WRITE to (only those can be connected: seeing a repo is not enough, an
 * outside collaborator with read access must not attach the owner's installation). null = no access.
 */
export async function installerRepos(app: GithubApp, code: string, installationId: number, f: Fetch = fetch): Promise<string[] | null> {
  const res = await f("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "ozvi" },
    body: JSON.stringify({ client_id: app.clientId, client_secret: app.clientSecret, code }),
    signal: AbortSignal.timeout(15_000),
  });
  const { access_token: user } = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !user) return null;
  let sees = false;
  for (let page = 1; page <= 5 && !sees; page++) {
    const r = await api<{ installations: { id: number }[] }>(user, `/user/installations?per_page=100&page=${page}`, {}, f);
    sees = r.installations.some((i) => i.id === installationId);
    if (r.installations.length < 100) break;
  }
  if (!sees) return null;
  const out: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await api<{ repositories: { full_name: string; permissions?: { admin?: boolean; push?: boolean } }[] }>(user, `/user/installations/${installationId}/repositories?per_page=100&page=${page}`, {}, f);
    out.push(...r.repositories.filter((x) => x.permissions?.push || x.permissions?.admin).map((x) => x.full_name));
    if (r.repositories.length < 100) break;
  }
  return out.slice(0, MAX_TICKET_REPOS);
}

/** Repositories carried in the ticket (and kept on the board): plenty for one board, short enough for a URL. */
export const MAX_TICKET_REPOS = 150;

/* ---------- signed state and ticket ---------- */

const secret = () => {
  const s = process.env.OZVI_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("OZVI_SESSION_SECRET must be set (at least 32 characters)");
  return s;
};
function sign(kind: string, data: object, ttlMs: number, now = Date.now()) {
  const body = b64u(JSON.stringify({ ...data, exp: now + ttlMs }));
  return `${body}.${createHmac("sha256", secret()).update(`github:${kind}:${body}`).digest("base64url")}`;
}
function read<T>(kind: string, v: string | null | undefined, now = Date.now()): T | null {
  const [body, sig] = (v ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", secret()).update(`github:${kind}:${body}`).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return d.exp > now ? d : null;
  } catch { return null; }
}

export interface InstallState { p: string; u: string; s: string }
export const installState = (s: InstallState, now?: number) => sign("state", s, 30 * 60_000, now);
export const readInstallState = (v: string | null | undefined, now?: number) => read<InstallState>("state", v, now);
/** r: repositories the installer may write to (owner/name), the only ones the board can pick. */
export interface InstallTicket { p: string; u: string; i: number; r: string[] }
export const installTicket = (t: InstallTicket, now?: number) => sign("ticket", t, 5 * 60_000, now);
export const readInstallTicket = (v: string | null | undefined, now?: number) => read<InstallTicket>("ticket", v, now);

export const installUrl = (app: GithubApp, state: string) => `https://github.com/apps/${encodeURIComponent(app.slug)}/installations/new?state=${encodeURIComponent(state)}`;
