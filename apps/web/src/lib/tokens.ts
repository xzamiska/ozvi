import { createHash, randomBytes } from "node:crypto";
import { schema, withProject } from "@ozvi/db";
import type { Lockdown, Scope } from "@ozvi/mcp";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { isTeamRole } from "./domain";
import type { Project, User } from "./project";

/**
 * Personal access tokens: ozvi_pat_<project slug>_<43 chars>. The slug lets us find the project
 * first and then look the hash up inside withProject (RLS stays on, no cross-project lookup).
 */

const PREFIX = "ozvi_pat_";
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function newToken(slug: string) {
  const token = `${PREFIX}${slug}_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token), prefix: token.slice(0, PREFIX.length + slug.length + 5) };
}

export function parseToken(raw: string): { slug: string } | null {
  if (!raw.startsWith(PREFIX)) return null;
  const rest = raw.slice(PREFIX.length);
  // Slugs never contain "_", the random part may: split at the first one.
  const cut = rest.indexOf("_");
  if (cut < 2 || rest.length - cut - 1 !== 43) return null;
  const slug = rest.slice(0, cut);
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) ? { slug } : null;
}

/** Members can never triage, whatever the token says; demoting someone downgrades their tokens at once. */
export function effectiveScope(scope: Scope, role: User["role"]): Scope {
  return scope === "triage" && !isTeamRole(role) ? "write" : scope;
}

export interface TokenAuth {
  project: Project; user: User; scope: Scope; tokenId: string;
  /** Issued by the project's OAuth server: its audience is /<slug>/mcp only (RFC 8707). */
  oauth?: boolean;
  /** Per-connection lockdown asked for by the client (X-Ozvi-Lockdown header or ?lockdown=); the project's setting still applies. */
  lockdown?: Lockdown;
}

/** "1", "true", "on", "verified" → verified; "team" → team; anything else off. Like GitHub MCP's X-MCP-Lockdown. */
export function parseLockdown(v: string | null | undefined): Lockdown {
  const s = (v ?? "").trim().toLowerCase();
  return s === "team" ? "team" : ["1", "true", "on", "yes", "verified"].includes(s) ? "verified" : "off";
}

export async function authenticateToken(authorization: string | null): Promise<TokenAuth | null> {
  const raw = authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const parsed = parseToken(raw);
  if (!parsed) return null;
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.slug, parsed.slug) });
  if (!project) return null;
  return withProject(db, project.id, async (tx) => {
    const [row] = await tx.select({ token: schema.apiTokens, user: schema.users })
      .from(schema.apiTokens).innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
      .where(and(eq(schema.apiTokens.hash, hashToken(raw)), isNull(schema.apiTokens.revokedAt)));
    if (!row || (row.token.expiresAt && row.token.expiresAt < new Date())) return null;
    // Last-used is informational; update at most once a minute.
    if (!row.token.lastUsedAt || Date.now() - row.token.lastUsedAt.getTime() > 60_000) {
      await tx.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.token.id));
    }
    return { project, user: row.user, scope: effectiveScope(row.token.scope, row.user.role), tokenId: row.token.id, oauth: row.token.oauthClientId !== null };
  });
}
