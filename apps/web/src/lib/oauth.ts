import { createHash, randomBytes, randomUUID } from "node:crypto";
import { schema, withProject } from "@ozvi/db";
import type { Scope } from "@ozvi/mcp";
import { and, eq, isNull } from "drizzle-orm";
import { logActivity, who } from "./activity";
import { db } from "./db";
import { isTeamRole } from "./domain";
import type { Project, User } from "./project";
import type { ClientMetadata } from "./oauth-cimd";
import { isCimdClientId } from "./oauth-cimd";
import { validRedirectUri } from "./oauth-uri";
import { effectiveScope, hashToken, newToken } from "./tokens";

/**
 * OAuth 2.1 for MCP connectors (Claude.ai, ChatGPT…), per project: each board is its own
 * authorization server (issuer https://host/<slug>), because people sign in per project.
 * Public clients only (PKCE S256, no client secrets). Clients identify themselves with a Client ID
 * Metadata Document URL (preferred, oauth-cimd.ts) or a legacy dynamically registered id; refresh
 * tokens rotate. Access tokens are ordinary API tokens (ozvi_pat_…) that expire in an hour, so
 * /mcp, scopes and revocation work exactly as for personal tokens.
 */

export const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 90 * 86_400_000;
const CODE_TTL_MS = 5 * 60_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

export { validRedirectUri } from "./oauth-uri";

/**
 * Legacy: RFC 7591 dynamic client registration. Deprecated by the MCP authorization spec
 * (2026-07-28) in favour of Client ID Metadata Documents (oauth-cimd.ts); kept so clients that
 * registered before keep working and clients without CIMD can still connect.
 */
export async function registerClient(project: Project, body: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https (or http on localhost), without fragments");
  }
  const name = (typeof body.client_name === "string" ? body.client_name : "AI asistent").replace(/[\u0000-\u001f<>]/g, "").slice(0, 60) || "AI asistent";
  const clientId = `ozvi_client_${randomBytes(16).toString("base64url")}`;
  await withProject(db, project.id, (tx) => tx.insert(schema.oauthClients).values({ projectId: project.id, clientId, name, redirectUris: uris }));
  return { client_id: clientId, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] };
}

export async function findClient(project: Project, clientId: string) {
  return withProject(db, project.id, (tx) => tx.query.oauthClients.findFirst({ where: eq(schema.oauthClients.clientId, clientId) }));
}

/**
 * CIMD clients get a row on first consent (codes and tokens reference it), refreshed from the
 * document on every consent. Names stay as asserted; the host is what we show next to them.
 */
export async function upsertCimdClient(project: Project, meta: ClientMetadata) {
  const [row] = await withProject(db, project.id, (tx) => tx.insert(schema.oauthClients)
    .values({ projectId: project.id, clientId: meta.clientId, name: meta.name, redirectUris: meta.redirectUris })
    .onConflictDoUpdate({ target: [schema.oauthClients.projectId, schema.oauthClients.clientId], set: { name: meta.name, redirectUris: meta.redirectUris } })
    .returning());
  return row!;
}

/** How a client is labelled in "My API tokens": CIMD names carry their verified host. */
export const clientLabel = (client: { clientId: string; name: string }) =>
  isCimdClientId(client.clientId) ? `${client.name} (OAuth, ${new URL(client.clientId).host})` : `${client.name} (OAuth)`;

/** Highest scope this user may grant. */
export const maxScope = (user: User): Scope => (isTeamRole(user.role) ? "triage" : "write");

export async function issueCode(project: Project, user: User, input: { clientDbId: string; redirectUri: string; challenge: string; scope: Scope }) {
  const code = randomBytes(24).toString("base64url");
  await withProject(db, project.id, (tx) => tx.insert(schema.oauthCodes).values({
    projectId: project.id, codeHash: sha(code), clientId: input.clientDbId, userId: user.id, redirectUri: input.redirectUri,
    codeChallenge: input.challenge, scope: effectiveScope(input.scope, user.role), expiresAt: new Date(Date.now() + CODE_TTL_MS),
  }));
  return code;
}

type Tx = Parameters<Parameters<typeof withProject>[2]>[0];

/** Issues an access/refresh pair; `family` ties every rotation of one grant together. */
async function mint(tx: Tx, project: Project, userId: string, clientDbId: string, label: string, scope: Scope, family: string) {
  const access = newToken(project.slug);
  const refresh = `ozvi_rt_${randomBytes(32).toString("base64url")}`;
  await tx.insert(schema.apiTokens).values({
    projectId: project.id, userId, name: label, hash: access.hash, prefix: access.prefix, scope,
    expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000), oauthClientId: clientDbId, refreshHash: sha(refresh), oauthFamily: family,
  });
  return { access_token: access.token, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
}

export async function exchangeCode(project: Project, p: URLSearchParams) {
  const client = await findClient(project, p.get("client_id") ?? "");
  if (!client) throw new OAuthError("invalid_client", "unknown client", 401);
  // A code is burnt by any attempt (the transaction commits; errors are thrown after it).
  const g = await withProject(db, project.id, async (tx): Promise<{ error: string } | { userId: string; scope: Scope }> => {
    const [row] = await tx.select().from(schema.oauthCodes)
      .where(and(eq(schema.oauthCodes.codeHash, sha(p.get("code") ?? "")), eq(schema.oauthCodes.clientId, client.id))).for("update");
    if (!row || row.usedAt || row.expiresAt < new Date()) return { error: "code is invalid or expired" };
    await tx.update(schema.oauthCodes).set({ usedAt: new Date() }).where(eq(schema.oauthCodes.id, row.id));
    if (row.redirectUri !== p.get("redirect_uri")) return { error: "redirect_uri mismatch" };
    if (s256(p.get("code_verifier") ?? "") !== row.codeChallenge) return { error: "PKCE verification failed" };
    const user = await tx.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
    if (!user) return { error: "user no longer exists" };
    return { userId: user.id, scope: effectiveScope(row.scope, user.role) };
  });
  if ("error" in g) throw new OAuthError("invalid_grant", g.error);
  return withProject(db, project.id, (tx) => mint(tx, project, g.userId, client.id, clientLabel(client), g.scope, randomUUID()));
}

/**
 * Refresh tokens rotate: the old pair is revoked and the new one issued in one transaction. A
 * refresh token that was already rotated means it leaked (or the client is replaying): the whole
 * family from that grant is revoked, so neither the thief nor the client keeps access (RFC 9700
 * §4.14.2), and the workspace activity log records it.
 */
export async function refresh(project: Project, p: URLSearchParams) {
  const client = await findClient(project, p.get("client_id") ?? "");
  if (!client) throw new OAuthError("invalid_client", "unknown client", 401);
  const label = clientLabel(client);
  const out = await withProject(db, project.id, async (tx) => {
    const [row] = await tx.select({ t: schema.apiTokens, user: schema.users }).from(schema.apiTokens)
      .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
      .where(and(eq(schema.apiTokens.refreshHash, sha(p.get("refresh_token") ?? "")), eq(schema.apiTokens.oauthClientId, client.id))).for("update");
    if (!row) return { error: "refresh token is invalid, revoked or expired" } as const;
    const now = new Date();
    if (row.t.refreshUsedAt) {
      const family = row.t.oauthFamily ? eq(schema.apiTokens.oauthFamily, row.t.oauthFamily) : eq(schema.apiTokens.id, row.t.id);
      const revoked = await tx.update(schema.apiTokens).set({ revokedAt: now, refreshHash: null })
        .where(and(family, isNull(schema.apiTokens.revokedAt))).returning({ id: schema.apiTokens.id });
      await tx.update(schema.apiTokens).set({ refreshHash: null }).where(family);
      return { reuse: true, user: row.user, revoked: revoked.length } as const;
    }
    if (row.t.revokedAt || row.t.createdAt < new Date(Date.now() - REFRESH_TTL_MS)) return { error: "refresh token is invalid, revoked or expired" } as const;
    // Keep the hash (now marked used) so a replay is recognised as reuse.
    await tx.update(schema.apiTokens).set({ revokedAt: now, refreshUsedAt: now }).where(eq(schema.apiTokens.id, row.t.id));
    // Grants from before families existed start one now.
    return mint(tx, project, row.user.id, client.id, label, effectiveScope(row.t.scope, row.user.role), row.t.oauthFamily ?? randomUUID());
  });
  if ("reuse" in out) {
    console.warn(`[oauth] refresh token reuse for ${label} on ${project.slug}: revoked ${out.revoked} token(s)`);
    await logActivity({ workspaceId: project.workspaceId, projectId: project.id, actor: who(out.user), action: "token.oauth_reuse", detail: label });
    throw new OAuthError("invalid_grant", "refresh token was already used; this connection has been revoked, connect again");
  }
  if ("error" in out) throw new OAuthError("invalid_grant", out.error);
  return out;
}

export const hashForTests = { sha, s256, hashToken };
